---
title: Time Travel
description: Query previous Beaverdam generations with timestamp-oriented syntax and timeline helpers.
section: Storage
navOrder: 60
sourceDocs:
  - ../rvbbit-sql/docs/TIME_TRAVEL.md
  - ../rvbbit-sql/docs/BEAVERDAM_RENAME_PLAN.md
---

Time travel uses Beaverdam generation metadata to query previous accelerator
snapshots. It is intended primarily for audit, debugging, and reproducibility;
it does not need to be the fastest route in the system.

> **Experimental.** Snapshot reconstruction is still being hardened. Treat
> historical (`AS OF`) results as best-effort and validate them before relying on
> them in production. The everyday live-query path is unaffected — this caveat
> applies only to querying the past.

## Query-Level Shorthand

The preferred user-facing shorthand is query-level rather than table-level:

```sql
/* rvbbit.as_of: 2026-05-31 14:30:00-04 */
SELECT account_id, count(*)
FROM events
GROUP BY account_id;
```

That mirrors the mental model of a session setting without adding table-local
syntax to every relation.

## Session Form

The explicit form is useful in scripts:

```sql
BEGIN;
SET LOCAL rvbbit.as_of = '2026-05-31 14:30:00-04';

SELECT *
FROM events
WHERE account_id = 42;

COMMIT;
```

## Timeline Discovery

UIs need a cheap way to show available timestamps without scanning files:

```sql
SELECT *
FROM rvbbit.time_travel_timeline('events'::regclass)
ORDER BY captured_at DESC;
```

The timeline includes:

- generation identifier,
- timestamp,
- row estimate or row count,
- file/layout availability,
- whether the generation is current,
- any retention or pruning status.

## Routing

Time-travel queries favor correctness over speed. The router may use a narrower
set of Beaverdam layouts, and falls back when a candidate cannot prove it can
represent the requested generation.

What to expect: a historical query aims to return the correct result for that
generation, not necessarily the fastest one. The timeline helper stays cheap,
fallback is explicit when files are unavailable, and time-travel runs are kept
out of the normal route-calibration data.

## Retention

Time travel gets more expensive the more generations you retain. There is no
built-in retention policy engine today — retention is the operator's
responsibility (prune generations to suit your storage and audit needs). A
policy API may come later.

