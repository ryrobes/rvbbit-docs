---
title: Sync Mirror
description: Mirror remote Postgres tables over FDW into local accelerated tables, snapshot by snapshot.
section: Storage
navOrder: 50
sourceDocs:
  - ../rvbbit-sql/docs/TIME_TRAVEL.md
---

The sync mirror pulls remote Postgres tables (over `postgres_fdw`) into local
[accelerated](/docs/acceleration) tables. Each sync is a snapshot that lands
as a new generation, so the mirror gets [time travel](/docs/time-travel) for
free: you can query the warehouse copy *as of* any previous sync.

It is a **mirror, not a system of record** - the remote stays authoritative.
Unsupported column types are coerced conservatively (`numeric` → `double
precision`, exotic types → `text`), and remote schema drift is tolerated by
re-importing the foreign tables.

## One Table

```sql
-- Set up the FDW server + user mapping (idempotent).
SELECT rvbbit.fdw_setup_server(
  'warehouse', 'wh.internal', 5432, 'analytics', 'reader', 'secret'
);

-- Import the remote schema's foreign tables locally.
SELECT rvbbit.fdw_import('warehouse', 'public', 'rvbbit_fdw');

-- Mirror one of them into an accelerated local table.
SELECT * FROM rvbbit.sync_table(
  'rvbbit_fdw.orders'::regclass, 'mirror', 'orders'
);
-- generation | rows_loaded | action
```

`sync_table` creates `mirror.orders` as a registered accelerated table if
missing (adapting DDL, adding new columns), then snapshots the foreign
table's rows into it - one new generation per sync.

## Jobs

For recurring syncs, define a job row in `rvbbit.sync_jobs` (the `spec` jsonb
holds the server, schemas, and an optional table list - omit `tables` to
mirror the whole schema), then run the executor:

```sql
CALL rvbbit.run_sync('warehouse_nightly');
```

`run_sync` is a procedure (call it outside an explicit transaction - it
commits per table so progress is durable and visible mid-run). It:

- takes a self-healing singleton lock, so overlapping calls are safe - a
  second concurrent call logs "already running" and exits,
- fingerprints the remote schema and skips the expensive
  `IMPORT FOREIGN SCHEMA` when nothing changed
  (`SET rvbbit.sync_force_reimport = on` to override, or
  `rvbbit.reset_sync_fingerprint(job)` to clear),
- syncs each table, recording one row per table in `rvbbit.sync_runs`
  (`action` ∈ `import` / `snapshot` / `empty` / `error`) and emitting
  `pg_notify('rvbbit_sync_error', ...)` on failures,
- leaves heavy columnar-variant builds off the critical path - the
  [freshness heartbeat](/docs/accelerator-freshness) picks those up.

There is no embedded scheduler; `run_sync` is built to be a pg_cron job. In
[Data Rabbit](/docs/data-rabbit), the **Temporal Mirror / Sync** window shows
jobs, runs, and errors.

## Time Travel On The Mirror

```sql
-- Newest first: one row per sync.
SELECT * FROM rvbbit.list_generations('mirror.orders'::regclass);

/* rvbbit: as_of = '2026-07-01 00:00:00+00' */
SELECT count(*) FROM mirror.orders;
```

Retention is yours to schedule:
`rvbbit.reap_generations(NULL, keep_days => 30)` ages out old snapshot
generations across eligible tables.

## Security Note

Job specs in `rvbbit.sync_jobs` store the remote password inside the `spec`
jsonb. Restrict access to that table the way you would any credential store,
and prefer a scoped, read-only remote role for the mirror user.
