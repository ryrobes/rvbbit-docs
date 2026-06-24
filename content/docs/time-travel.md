---
title: Time Travel
description: Query previous Beaverdam generations with timestamp-oriented syntax and timeline helpers.
section: Storage
navOrder: 60
sourceDocs:
  - ../rvbbit-sql/docs/TIME_TRAVEL.md
  - ../rvbbit-sql/docs/BEAVERDAM_RENAME_PLAN.md
---

Time travel is generation-based. Each successful acceleration refresh writes
immutable parquet row groups and stamps them with a monotonic generation number
per table (the optional Beaverdam storage layer). Historical reads resolve a
timestamp or generation, and the scan then ignores row groups newer than that
generation. It is intended primarily for audit, debugging, and reproducibility;
it does not need to be the fastest route in the system.

The heap stays the source of truth for latest reads, `pg_dump`, and rebuilds.
Time-travel reads are over the accelerated parquet layer, so a table needs at
least one successful `rvbbit.refresh_acceleration(...)` or `rvbbit.compact(...)`
before it has historical generations to read.

## Query-Level Shorthand

The preferred user-facing shorthand is a leading SQL comment, which scopes the
whole statement without exposing generation numbers:

```sql
/* rvbbit: as_of = '2026-05-31 14:30:00-04' */
SELECT account_id, count(*)
FROM events
GROUP BY account_id;
```

Line comments work too:

```sql
-- rvbbit: as_of = '2026-05-31 14:30:00-04'
SELECT count(*) FROM events;
```

The comment is whole-query scope, similar to `SET LOCAL`: every rvbbit table in
the statement is resolved against the same timestamp, and each table resolves
that timestamp to its own generation internally.

A parser-level table clause (`SELECT * FROM events AS OF TIMESTAMP '...'`) is
not supported today — PostgreSQL rejects that syntax before extension hooks run,
so use the comment form, `rvbbit.set_as_of(...)`, or the GUC instead.

## Session Form

For a timestamp-based read that several statements should share, use the
`rvbbit.set_as_of(rel, ts)` helper. It finds the newest generation committed at
or before the timestamp, sets the `rvbbit.as_of_generation` GUC at session
scope, and returns the generation it selected. Always pair it with
`rvbbit.set_as_of_reset()`:

```sql
SELECT rvbbit.set_as_of('events'::regclass, '2026-05-31 14:30:00-04'::timestamptz);

SELECT *
FROM events
WHERE account_id = 42;

SELECT rvbbit.set_as_of_reset();
```

The lowest-level control is the `rvbbit.as_of_generation` GUC, which takes an
integer generation rather than a timestamp. Use `SET LOCAL` inside a transaction
to scope it to one read; a positive value means "read row groups with
`generation <= value`", and unset/empty/zero/negative means "latest":

```sql
BEGIN;
SET LOCAL rvbbit.as_of_generation = '3';

SELECT *
FROM events
WHERE account_id = 42;

COMMIT;
```

## Timeline Discovery

To inspect a table's generations, newest first:

```sql
SELECT *
FROM rvbbit.list_generations('events'::regclass);
```

That returns `generation`, `committed_at`, `n_rows`, and `n_row_groups`. For
just the latest generation, use `rvbbit.current_generation('events'::regclass)`.

UIs need a cheap way to show available snapshot ticks without scanning files.
The metadata-only helper `rvbbit.time_travel_timeline(...)` reads the generation
log, row-group catalog, and delete log — it never scans the heap or parquet:

```sql
SELECT *
FROM rvbbit.time_travel_timeline('events'::regclass);
```

It returns one row per generation (newest first) with:

- `generation` — the generation identifier,
- `committed_at` — when the generation committed,
- `rows_written` / `row_groups_written` — the delta written at that tick,
- `visible_rows_estimate` — approximate rows visible at that tick, derived from
  row-group metadata minus generation-aware tombstones,
- `visible_row_groups`,
- `tombstones_visible`.

## Routing

Time-travel queries favor correctness over speed. The router may use a narrower
set of Beaverdam layouts, and falls back when a candidate cannot prove it can
represent the requested generation.

What to expect: a historical query aims to return the correct result for that
generation, not necessarily the fastest one. The timeline helper stays cheap,
fallback is explicit when files are unavailable, and time-travel runs are kept
out of the normal route-calibration data.

## Retention

Time travel gets more expensive the more generations you retain. Use the
`rvbbit.reap_generations(reloid regclass DEFAULT NULL, keep_days integer
DEFAULT 30)` reaper to age out old generations — it deletes catalog rows and
unlinks the parquet files for generations strictly below the live snapshot whose
`committed_at` is older than `keep_days`. Passing `NULL` reaps every eligible
table, which makes it convenient to schedule:

```sql
-- Drop generations older than 14 days across all eligible tables.
SELECT * FROM rvbbit.reap_generations(NULL, 14);
```

The reaper only touches snapshot tables (those with a positive
`min_visible_generation`) and never the current generation. Append tables are
skipped, because their generations are cumulative and reaping an old one would
drop live rows. There is no automatic retention schedule today — when and how
aggressively to reap is your call.

