---
title: Semantic Materialized Views
description: Cache per-row semantic-operator results as an ordinary table, refreshed incrementally by anti-join.
section: SQL Primitives
navOrder: 44.5
sourceDocs:
  - ../rvbbit-sql/docs/OPERATORS.md
---

Semantic operators are priced per call, so classifying the same million rows
twice is a bug. A **semantic materialized view** caches an operator's per-row
results as an ordinary Postgres table — source primary key plus one computed
column — and refreshes by computing **only the rows it hasn't seen yet**.

## Create

```sql
SELECT rvbbit.semantic_mv_create(
  mv_name         => 'ticket_triage',
  source_rel      => 'tickets'::regclass,
  pk_col          => 'id',
  projection_sql  => 'rvbbit.classify(body, ''support,bug,sales,spam'')',
  projection_col  => 'triage',
  projection_type => 'text'
);
```

That builds `rvbbit.ticket_triage(id, triage)`, records the definition in
`rvbbit.semantic_mvs`, and populates it once. Query it with a plain join:

```sql
SELECT t.*, tt.triage
FROM tickets t
JOIN rvbbit.ticket_triage tt USING (id);
```

## Refresh

```sql
SELECT rvbbit.semantic_mv_refresh('ticket_triage');   -- returns rows added
```

Refresh anti-joins the source against the cache and computes the projection
only for new primary keys. When the projection is a plain
`rvbbit.<operator>(...)` call, refresh pre-warms through the concurrent
operator engine first, so a large catch-up batch runs at full backend
concurrency (and still writes [receipts](/docs/receipts-costs)).

There is no built-in scheduler — call `semantic_mv_refresh` from pg_cron,
right where you schedule the other [maintenance
entrypoints](/docs/accelerator-freshness#scheduled-maintenance-entrypoints).

## Limits (By Design)

- **Insert-only.** Updates and deletes on source rows are not detected — a
  cached value is computed once and kept. For a full re-evaluation (say,
  after editing the operator's prompt), drop and recreate:

  ```sql
  SELECT rvbbit.semantic_mv_drop('ticket_triage');
  ```

- One projection column per MV; compose richer shapes by chaining MVs or
  joining several.
- `pk_col` must be unique in the source.

For whole-resultset transformations (pivot/enrich/analyze) with shape-keyed
caching, see [Pipelines](/docs/pipelines); for row-at-a-time primitives, see
[Semantic Functions](/docs/semantic-functions).
