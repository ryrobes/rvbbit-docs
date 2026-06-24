---
title: Cubes
description: Wide, documented, accelerated analytical tables built from a SELECT — the curated middle between raw tables and blessed metrics, with a semantic layer, freshness tracking, and one-call promotion to metrics.
section: SQL Primitives
navOrder: 42
sourceDocs:
  - ../rvbbit-sql/docs/CUBES_PLAN.md
  - ../rvbbit-sql/docs/METRICS.md
---

A **cube** is a wide analytical table you define with one `SELECT` — usually a
join across raw or rvbbit tables — that rvbbit materializes into the `cubes`
schema, accelerates, documents, and refreshes on demand. It is the curated
middle between two extremes: thousands of cryptic raw tables on one side, and
narrow blessed [metrics](/docs/metrics-kpis) on the other. Instead of searching
2,000 source tables, you search ~15 documented cubes by subject ("Salesforce
opportunities", "support tickets"), read clear column semantics, and query an
accelerated table. And because a cube is just a `USING rvbbit` table, it gets
[drift detection](/docs/catalog) and columnar acceleration for free, plus
experimental [time travel](/docs/time-travel).

## Define A Cube

`define_cube` upserts a versioned definition, materializes `cubes.<name>`,
compacts it to build the [acceleration files](/docs/beaverdam), and
registers it in the catalog. Declare the **grain** — what one row means — every
time; a cube with a fuzzy grain is a footgun.

```sql
SELECT rvbbit.define_cube(
    p_name        => 'opportunities',
    p_sql         => $$
        SELECT o.id, o.name, o.stage_name, o.amount, o.close_date,
               a.name AS account_name, a.industry
        FROM   salesforce.opportunity o
        LEFT JOIN salesforce.account a ON a.id = o.account_id
        WHERE  o.is_deleted = false
    $$,
    p_grain       => 'one row per opportunity',
    p_description => 'Salesforce opportunities joined to their accounts.',
    p_owner       => 'analytics',
    p_category    => 'Sales'
);
```

The full signature (everything after `p_sql` is optional):

```sql
rvbbit.define_cube(
    p_name        text,
    p_sql         text,
    p_grain       text    DEFAULT NULL,
    p_description text    DEFAULT NULL,
    p_owner       text    DEFAULT NULL,
    p_refresh_cron text   DEFAULT NULL,   -- documents a cadence (you still schedule it)
    p_category    text    DEFAULT NULL,
    p_labels      jsonb   DEFAULT '{}'    -- e.g. {"cube_source": "..."} markers
) RETURNS integer                        -- the new definition version
```

Each call appends a **new version** — definitions are never mutated. Redefining
with the same column shape reloads in place; a *shape change* (new/renamed/
dropped columns) needs `drop_cube` first.

## Refresh

`refresh_cube` re-runs the cube's stored `SELECT` and rebuilds its acceleration
files. Internally it uses `snapshot_load`: `TRUNCATE` → `INSERT … <the SELECT>` →
`compact()`. Each refresh is a snapshot, so old generations can be queried via
[`AS OF`](/docs/time-travel) (experimental).

```sql
SELECT rvbbit.refresh_cube('opportunities');   -- returns the new row count
```

To refresh **every** cube — the cube analog of
[`materialize_all_metrics`](/docs/metrics-kpis#materialize-everything) — use the
bulk procedure. It commits after each cube (so partial progress survives) and
sleeps briefly between cubes so dashboards keep breathing:

```sql
CALL rvbbit.refresh_all_cubes();                       -- all cubes, 0.5s pacing
CALL rvbbit.refresh_all_cubes(p_category => 'Sales');  -- just one category
CALL rvbbit.refresh_all_cubes(p_sleep_seconds => 2);   -- gentler pacing
```

```sql
rvbbit.refresh_all_cubes(
    p_category      text    DEFAULT NULL,
    p_subcategory   text    DEFAULT NULL,
    p_sleep_seconds numeric DEFAULT 0.5    -- pause between cubes; 0 = none
)
```

A failing cube is recorded (in `cube_control.last_error`) and skipped — the batch
never aborts. It's a procedure, so it's pg_cron-ready:

```sql
SELECT cron.schedule('rvbbit_refresh_cubes', '0 */2 * * *',
                     $$CALL rvbbit.refresh_all_cubes()$$);
```

> Cubes are excluded from the [accelerator freshness heartbeat](/docs/accelerator-freshness)
> (`accel_tick`) by default — they're fully rebuilt by `refresh_cube`, so the
> heartbeat has nothing to maintain. See `rvbbit.accel_exclude_schemas`.

## The Semantic Layer

Cubes carry per-column documentation. `enrich_cube` uses an LLM to draft a
description, grain, and per-column docs from a small sample plus the source
tables' catalog docs — and **preserves any human edits**:

```sql
SELECT rvbbit.enrich_cube('opportunities', p_sample_rows => 20);
```

```sql
rvbbit.enrich_cube(
    p_name            text,
    p_sample_rows     integer DEFAULT 12,
    p_overwrite_edited boolean DEFAULT false   -- true = clobber human edits
) RETURNS jsonb   -- { cube, columns_enriched, description, grain, source_tables }
```

Correct a single column by hand (and it survives future enrichment):

```sql
SELECT rvbbit.set_cube_column_doc(
    p_cube      => 'opportunities',
    p_column    => 'amount',
    p_doc       => 'Deal value in USD at the current exchange rate.',
    p_semantics => 'currency',
    p_editor    => 'human'
);
```

## Inspect

`describe_cube` returns everything about a cube as one JSON object — definition,
grain, category, lineage (source tables), per-column docs, a sample, and health:

```sql
SELECT jsonb_pretty(rvbbit.describe_cube('opportunities'));
```

`cube_health` is the freshness/drift summary Data Rabbit reads:

```sql
SELECT jsonb_pretty(rvbbit.cube_health('opportunities'));
-- { "freshness": { "status": "fresh", "seconds_since_refresh": 312 },
--   "drift": { "drift_rows": 0, "recommendation": "skip" }, ... }
```

`cubes()` lists them all with freshness:

```sql
SELECT name, grain, category, refreshed_at, rows
FROM   rvbbit.cubes()
ORDER  BY refreshed_at DESC;
```

## Categorize

Cubes share the same category taxonomy as metrics and alerts. Categories drive
the `p_category` filter on `refresh_all_cubes` and organize the cube views in
Data Rabbit:

```sql
SELECT rvbbit.set_category('cube', 'opportunities', 'Sales', 'Pipeline');
SELECT * FROM rvbbit.category_options('cube');
```

## Promote A Cube To A Metric

A cube is often the perfect base for a metric. `promote_cube_to_metric` defines
a zero-copy metric (`SELECT * FROM cubes.<name>`); the cube's acceleration flows
straight through, as does `AS OF` where supported (experimental):

```sql
SELECT rvbbit.promote_cube_to_metric(
    p_cube_name   => 'opportunities',
    p_metric_name => 'pipeline',
    p_description => 'Open + won pipeline, one row per opportunity.'
);
```

From there it's an ordinary [metric](/docs/metrics-kpis): versioned, checkable,
and materializable. Derived/aggregated metrics are still hand-written
with `define_metric` over the cube.

## Dimensional Metrics Over Cubes

A metric defined over a cube can be **sliced** by any of the cube's groupable
dimensions without redefining it — see
[Dimensional Metrics](/docs/metrics-kpis#dimensional-metrics). To see what a
cube exposes:

```sql
SELECT column_name, kind, groupable
FROM   rvbbit.cube_dimensions('cubes.opportunities')
WHERE  groupable;
```

## Tables

| Object | Holds |
| --- | --- |
| `rvbbit.cube_defs` | Append-only versioned definitions: `name, version, sql, grain, description, owner, refresh_cron, category, labels, created_at`. |
| `rvbbit.cube_catalog` | View: the latest definition per cube (+ category/subcategory from the shared taxonomy). |
| `rvbbit.cube_control` | One mutable row per cube: `refreshed_at, last_rows, last_error, enabled`, plus auto-enrichment state. |
| `rvbbit.cube_columns` | The semantic layer: per-column `doc, semantics, source_ref, confidence, edited_by`. |
| `cubes.<name>` | The materialized `USING rvbbit` table — accelerated and drift-tracked (with experimental time-travel). |

## Manage

```sql
SELECT rvbbit.drop_cube('opportunities');   -- table + definition + docs + catalog node
```

## Notes

- **Refreshes are full** currently (`TRUNCATE` + reload). `cube_health` already
  emits a `skip` / `delta` / `full rebuild` recommendation from drift (or
  `unknown` when there's no drift estimate yet), but that recommendation is
  advisory only today — incremental/delta refresh is not yet implemented, so
  every refresh rebuilds the whole cube regardless of the hint.
- **Lineage is best-effort** — derived by `EXPLAIN`-ing the cube SQL; if it won't
  plan, lineage is empty.
- **The LLM model** for `enrich_cube` is runtime-configurable via
  `rvbbit.set_cube_model(...)` — no rebuild.
