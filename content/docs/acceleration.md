---
title: Storage Acceleration
description: The acceleration registry — ordinary heap tables with rebuildable columnar files beside them.
section: Storage
navOrder: 40
sourceDocs:
  - ../rvbbit-sql/docs/RVBBIT_PRODUCTION_SHAPE.md
  - ../rvbbit-sql/docs/LAKEHOUSE.md
  - ../rvbbit-sql/docs/TUNING.md
---

Acceleration in RVBBIT is a **registry, not a table type**. Every accelerated
table is an ordinary Postgres heap table; adding it to the acceleration
registry tells RVBBIT to maintain additional representations of its data
beside the heap, so analytical queries can take faster paths while ordinary
Postgres remains correct and available.

The contract is simple:

- heap is the source of truth,
- accelerator files are rebuildable,
- missing or stale files do not make normal SQL incorrect,
- the router chooses a faster path only when it can preserve SQL semantics.

## Add A Table To The Registry

`rvbbit.enable_table` registers an existing heap table for acceleration and
installs the dirty-tracking triggers. A refresh then builds the first files:

```sql
SELECT rvbbit.enable_table('events'::regclass);
SELECT rvbbit.refresh_acceleration('events'::regclass);
```

```sql
rvbbit.enable_table(
    reloid          regclass,
    convert_to_heap boolean DEFAULT true   -- normalize an AM-bound table back to heap
) RETURNS jsonb
```

The registry itself is the `rvbbit.tables` catalog table (one row per
registered table, with an `acceleration_enabled` flag). Membership checks and
listing:

```sql
SELECT rvbbit.is_rvbbit_table('events'::regclass);

SELECT * FROM rvbbit.list_tables();
-- table_oid | table_name | n_row_groups | n_deletes
```

### `USING rvbbit` Sugar

`CREATE TABLE ... USING rvbbit` still works, and it is deliberately just
sugar: a DDL event trigger registers the new table in the acceleration
registry and immediately normalizes it to a **plain heap table**. The `rvbbit`
access method is a compatibility alias for heap — the registry row is the
acceleration contract, not the access method.

```sql
CREATE TABLE events (
  id         bigint,
  account_id bigint,
  created_at timestamptz,
  payload    jsonb
) USING rvbbit;   -- heap table + registry row, in one statement
```

This matters operationally: because accelerated tables are real heap tables,
`pg_dump`, restore, logical replication, and `DROP EXTENSION` all behave the
way they would on any Postgres database.

## Remove A Table

`rvbbit.disable_table` unregisters a table: it disables acceleration, drops
the dirty-tracking triggers, and leaves the heap untouched
(`rvbbit.detach_table` is a compatibility alias for the same thing):

```sql
SELECT rvbbit.disable_table('events'::regclass);
```

## What It Builds

| Structure | Purpose |
| --- | --- |
| Canonical Parquet | General columnar scan layer. |
| Vortex layout | Newer columnar format that can be served through DuckDB. |
| Hive layouts | Partitioned/segmented variants for pruning-friendly workloads. |
| Lance datasets | Vector/text acceleration where Lance is a better fit. |
| Hot memory cache | Decoded Arrow batches for small hot tables. |
| Metadata tables | Watermarks, row groups, stats, generations, operations, phases. |

Most Postgres column types map straight to Arrow (numbers, text, timestamps,
`date`, `jsonb`, `bytea`, `real[]` vectors). Types without a native Arrow form —
`uuid`, `numeric`, `inet`/`cidr`/`macaddr`, `time`/`interval`, and enums — are
stored as canonical text and reconstructed to the real type on read, so a `uuid`
column (Salesforce keys, say) stays a `uuid` to SQL with comparisons, joins, and
`ORDER BY` intact. Genuinely unsupported types (ranges, composites, geometry)
simply keep the table on the [heap path](#heap-fallback).

## Refresh, Rebuild, Compact

Use these words precisely:

| Term | Meaning |
| --- | --- |
| Refresh | Incrementally write accelerator files for rows after the watermark. |
| Rebuild | Recreate accelerator state from heap. |
| Compact | Rewrite/coalesce accelerator files and tombstones. This is maintenance, not the normal write path. |

API:

```sql
-- Refresh: incrementally write accelerator files after the watermark.
-- Layout variants are (re)built by default; pass refresh_variants => false to skip them.
SELECT rvbbit.refresh_acceleration('events'::regclass);

-- Rebuild: recreate accelerator state from heap (full heap re-scan).
SELECT rvbbit.rebuild_acceleration('events'::regclass);

-- Compact: rewrite/coalesce accelerator files and tombstones.
SELECT rvbbit.compact('events'::regclass);
```

To automate *when* these run — as a value-vs-cost policy with per-table SLOs,
budgets, and the `accel_tick` heartbeat — see
[Accelerator Freshness](/docs/accelerator-freshness).

## Observability

Acceleration operations are visible from SQL:

```sql
SELECT *
FROM rvbbit.acceleration_status
ORDER BY table_name;
```

Inspect recent work:

```sql
SELECT *
FROM rvbbit.acceleration_operations
ORDER BY started_at DESC
LIMIT 20;
```

Phase-level timings:

```sql
SELECT *
FROM rvbbit.acceleration_operation_phases
ORDER BY started_at DESC
LIMIT 50;
```

For a per-table freshness/demand summary (drift, dirty time, slow-path scans),
read `rvbbit.accel_freshness` — see
[Accelerator Freshness](/docs/accelerator-freshness). For runtime health of
the execution engines themselves (Duck, DataFusion, [GPU GQE](/docs/gqe)),
call `rvbbit.accelerator_runtime_status(false)` or the broader
`rvbbit.doctor(false)`.

## Layouts

A table can have more than one physical layout. The router prefers the
layout that matches the query shape, available files, and correctness state.

```sql
SELECT *
FROM rvbbit.layout_variant_status
WHERE table_oid = 'events'::regclass;
```

Vortex plus Duck has been the strongest large-table path in benchmark runs, but
DataFusion/native paths still win edge cases, and on GPU hosts the
[NVIDIA GQE route](/docs/gqe) competes for large scans. The registry exposes
those paths as first-class candidates so the router can pick the best engine
per query.

## Heap Fallback

Acceleration never requires truncating the heap. Keeping heap as gold source
matters for:

- ordinary Postgres reads and writes,
- pg_dump and pg_restore,
- extension upgrades,
- rebuild after file loss,
- correctness fallback when an accelerator layer is stale or unsupported.

This means refresh latency is operationally important, but not correctness
critical. Reporting tables can refresh in the background, and transactional
tables can fall back to heap until the accelerator catches up.

## Knobs

Common knobs:

| Knob | Purpose |
| --- | --- |
| `rvbbit.compact_vortex_layout` | Build Vortex files. |
| `rvbbit.compact_hive_layout` | Build Hive-style segmented layouts. |
| `rvbbit.hot_store_budget_mb` | Per-backend memory budget for hot decoded batches. |
| `rvbbit.hot_store_route_max_rows` | Maximum rows for automatic hot-memory routing. |

Layout variants are (re)built after a canonical refresh by default
(`refresh_variants` defaults to `true` on both `rvbbit.refresh_acceleration`
and `rvbbit.rebuild_acceleration`); pass `refresh_variants => false` to skip
them. You can also (re)build them on their own with
`rvbbit.refresh_layout_variants('events'::regclass)`.

Keep variant builds bounded. Hive can be useful, but poor key choices can
increase file count and load time without helping query plans.
