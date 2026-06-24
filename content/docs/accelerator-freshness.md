---
title: Accelerator Freshness & Maintenance
description: rvbbit tables keep a heap plus columnar acceleration files — staleness makes queries slow, never wrong. A per-table policy plane decides when to rebuild as a value-vs-cost decision, and a handful of pg_cron entrypoints keep catalogs, metrics, and cubes current.
section: Operations
navOrder: 74
sourceDocs:
  - ../rvbbit-sql/docs/ACCELERATOR_FRESHNESS_PLAN.md
  - ../rvbbit-sql/docs/PER_TABLE_ENGINE_POLICY_PLAN.md
  - ../rvbbit-sql/docs/TUNING.md
---

A `USING rvbbit` table has two layers: a live heap for writes, and columnar
[acceleration files](/docs/beaverdam) (parquet / vortex / lance) for fast
analytical scans. Writes make the acceleration stale — but **stale never means
wrong**. If a table's columnar copy isn't authoritative, the planner simply falls
back to a correct heap scan (the slow path). That turns freshness from a
correctness protocol into a **value-vs-cost policy**: not "must we rebuild?" but
"is it worth the CPU/IO to keep this table fresh, given how fast it changes and
how often it's queried?"

Three pieces implement it: a **freshness view** (`accel_freshness`) that makes the
signals legible, a **per-table policy** (`accel_policy`) that sets the SLO and
budget, and an **executor** (`accel_tick`) that pg_cron drives on a heartbeat.

## See Freshness

`rvbbit.accel_freshness` is one row per rvbbit table — supply signals (drift,
parquet rows, rebuild cost) fused with demand (slow-path scans). It's all catalog
lookups, no heap scans:

```sql
SELECT table_name, shadow_heap_dirty, seconds_dirty,
       drift_rows, drift_ratio, heap_seq_scans, parquet_authoritative
FROM   rvbbit.accel_freshness
WHERE  shadow_heap_dirty
ORDER  BY drift_rows * (1 + heap_seq_scans) DESC;   -- "dirty AND in demand" first
```

| Column | Means |
| --- | --- |
| `parquet_authoritative` | Can the planner use acceleration (clean), or must it heap-scan? |
| `shadow_heap_dirty` / `seconds_dirty` | Is the columnar copy stale, and for how long? |
| `drift_rows` / `drift_ratio` | Un-mirrored inserts + tombstones — how far the heap has drifted past the files. Drives the delta-vs-full choice. |
| `heap_seq_scans` | Slow-path queries on this table — the "eligible-but-unused" demand signal. |
| `last_rebuild_ms` / `last_rebuild_rows` | What the last rebuild cost. |

## Set A Policy

Without a policy a table is `manual` (never auto-refreshed). `set_accel_policy`
declares a strategy and its guards:

```sql
-- Keep sales.orders within ~5 minutes of fresh, but never thrash.
SELECT rvbbit.set_accel_policy(
    rel                   => 'sales.orders'::regclass,
    strategy              => 'target',
    freshness_target_secs => 300,    -- refresh once it's been stale > 5 min
    min_interval_secs     => 60,     -- but at most once a minute
    daily_refresh_budget  => 200     -- and at most 200 times in a rolling 24h
);
```

```sql
rvbbit.set_accel_policy(
    rel                      regclass,
    strategy                 text    DEFAULT 'target',
    freshness_target_secs    integer DEFAULT NULL,
    min_interval_secs        integer DEFAULT 60,
    daily_refresh_budget     integer DEFAULT NULL,   -- NULL = unlimited
    full_rebuild_drift_ratio double precision DEFAULT 0.5,  -- drift ≥ this → full rebuild
    lance_separate           boolean DEFAULT true,
    active                   boolean DEFAULT true,
    note                     text    DEFAULT NULL
) RETURNS jsonb
```

| Strategy | Refreshes when… |
| --- | --- |
| `manual` | Never (explicit calls only). The default. |
| `scheduled` | The table is dirty (subject to `min_interval_secs`). |
| `target` | It's been dirty longer than `freshness_target_secs` — a freshness SLO. |
| `demand` | It's dirty **and** slow-path scans are climbing — warm-on-miss. |
| `continuous` | Every tick while dirty — strongest guarantee, highest cost. |

`clear_accel_policy('sales.orders'::regclass)` resets a table to the `manual`
default.

## The Heartbeat

`accel_tick` is the executor. It ranks dirty tables by value, then for each picks
the cheapest legal action — a delta `refresh_acceleration` over a full
`rebuild_acceleration` — within budget. Preview it first (lock-free, safe):

```sql
SELECT table_name, strategy, action, reason, drift_rows, seconds_dirty, status
FROM   rvbbit.accel_tick(budget => 10, dry_run => true)
ORDER  BY seconds_dirty DESC NULLS LAST;
```

```sql
rvbbit.accel_tick(
    budget       integer DEFAULT NULL,   -- max tables this tick; NULL = all eligible
    dry_run      boolean DEFAULT false,  -- plan only, write no history
    lance_budget integer DEFAULT 1       -- separate (stricter) cap for full lance rebuilds
) RETURNS SETOF (...)   -- one row per table: action (delta|full|skip), reason, status, ...
```

Schedule it on a short interval (a real run holds a singleton advisory lock, so
overlapping ticks are safe):

```sql
SELECT rvbbit.schedule_accel_tick(cron_schedule => '*/2 * * * *', budget => 4);
-- equivalently: SELECT cron.schedule('rvbbit_accel_tick', '*/2 * * * *',
--                                    $$SELECT rvbbit.accel_tick(4)$$);
```

You can always force a rebuild by hand, bypassing policy:

```sql
SELECT rvbbit.refresh_acceleration('sales.orders'::regclass);  -- cheap delta
SELECT rvbbit.rebuild_acceleration('sales.orders'::regclass);  -- full rebuild
SELECT rvbbit.compact('sales.orders'::regclass, keep_heap => true);
```

## Per-Table Engine & Layout Policy

The same policy row gates which [execution engines and layouts](/docs/routing-training)
a table may use. `set_table_engine` adds/removes a target from the deny-set:

```sql
SELECT rvbbit.set_table_engine('sales.orders'::regclass, 'duck',   false); -- never route to DuckDB
SELECT rvbbit.set_table_engine('sales.orders'::regclass, 'vortex', false); -- parquet only, no vortex files
SELECT rvbbit.set_table_engine('sales.orders'::regclass, 'vortex', true);  -- re-enable
```

Denied engines/layouts are removed from routing **and** from rebuild (no files
written). `native` and `pg_rowstore` are the correctness floor and can't be
denied. For a multi-table query, the most-restrictive deny-set wins. Inspect the
effective policy:

```sql
SELECT table_name, strategy, explicit, denied_engines, denied_layouts
FROM   rvbbit.accel_policy_effective
WHERE  table_name = 'sales.orders';
```

## Exclude A Schema

Some tables are maintained elsewhere and shouldn't be touched by the heartbeat —
[cubes](/docs/cubes), for instance, are fully rebuilt by `refresh_cube`. The
`rvbbit.accel_exclude_schemas` GUC (default `cubes`) forces every table in those
schemas to `manual`, so `accel_tick` skips them:

```sql
SET rvbbit.accel_exclude_schemas = 'cubes,staging';  -- exclude more
SET rvbbit.accel_exclude_schemas = '';               -- exclude nothing
```

## Scheduled Maintenance Entrypoints

Beyond the accelerator heartbeat, rvbbit ships a handful of "do all of X now"
procedures, each category-filterable and built to be a pg_cron job. The
**Scheduler** tray in Data Rabbit has one-click presets for each.

| Job | Call | What it does |
| --- | --- | --- |
| Accelerator heartbeat | `SELECT rvbbit.accel_tick(4)` | Policy-driven per-table refresh. |
| Metric materialize tick | `SELECT rvbbit.materialize_tick(200)` | Drains the compaction-triggered metric queue. |
| Metrics snapshot | `SELECT rvbbit.materialize_all_metrics()` | One timestamped snapshot of **every** [metric](/docs/metrics-kpis#materialize-everything). |
| Cube refresh | `CALL rvbbit.refresh_all_cubes()` | Reload + re-accelerate every [cube](/docs/cubes). |
| Catalog crawl | `CALL rvbbit.catalog_crawl_run_parallel()` | Re-fingerprint + embed the [catalog](/docs/catalog). |

```sql
-- A typical maintenance schedule.
SELECT cron.schedule('rvbbit_accel_tick',       '*/2 * * * *', $$SELECT rvbbit.accel_tick(4)$$);
SELECT cron.schedule('rvbbit_materialize_all',  '0 * * * *',   $$SELECT rvbbit.materialize_all_metrics()$$);
SELECT cron.schedule('rvbbit_refresh_cubes',    '0 */2 * * *', $$CALL rvbbit.refresh_all_cubes()$$);
SELECT cron.schedule('rvbbit_catalog',          '0 2 * * *',   $$CALL rvbbit.catalog_crawl_run_parallel()$$);
```

> pg_cron's `cron.*` functions live only in its home database (often `postgres`,
> per `cron.database_name`). If that differs from your working database, use
> `cron.schedule_in_database(name, schedule, command, 'your_db')`, or the
> Scheduler tray in Data Rabbit, which routes for you.

## Notes

- **Why it's safe to be lazy** — a stale table is never wrong; the planner heap-scans
  it. So you tune freshness for cost, not correctness.
- **delta ≫ full** — `accel_tick` prefers cheap delta refreshes; it escalates to a
  full rebuild only when drift crosses `full_rebuild_drift_ratio` (an LSM
  major-compaction trigger).
- **Lance** datasets are full-overwrite and expensive, so they get a separate,
  stricter `lance_budget` per tick.
- **History** — every tick's decisions are logged (table, action, reason, status)
  for the cockpit and the rolling daily-budget counter.
