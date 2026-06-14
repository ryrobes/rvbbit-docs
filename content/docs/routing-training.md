---
title: Routing And Training
description: How RVBBIT chooses heap, native, DataFusion, Duck, Vortex, and trained paths.
section: Execution
navOrder: 50
sourceDocs:
  - ../rvbbit-sql/docs/RVBBIT_ROUTING_UI.md
  - ../rvbbit-sql/docs/RVBBIT_ROUTE_TRAINING_UI.md
  - ../rvbbit-sql/docs/RVBBIT_ROUTING_V1_RUNBOOK.md
  - ../rvbbit-sql/docs/RVBBIT_ROUTING_PRODUCTION_GOAL.md
---

Routing decides how a normal SQL query should run. The goal is not to be clever
for its own sake. The goal is to choose the fastest correct path cheaply enough
that routing does not become the bottleneck.

## Candidate Paths

Common candidates:

| Candidate | Typical use |
| --- | --- |
| Heap | Always-correct fallback and unsupported SQL. |
| Native | Fast in-process path for some simple aggregates, filters, and narrow scans. |
| DataFusion | Strong general columnar path for Parquet and Arrow execution. |
| Duck | DuckDB over file-backed accelerator data. |
| Duck + Vortex | High-performing large-table path where Vortex files exist. |
| Duck + Hive | Partitioned layout path for filter-friendly workloads. |
| DataFusion memory | Decoded hot-cache path for small hot tables. |

The route label stays technical. Storage-backed candidates are grouped under
Beaverdam.

## No-Profile Rules

When no trained profile matches, the router uses cheap query-shape rules:

- referenced Beaverdam tables are fresh enough,
- query features are supported by a candidate,
- row estimates are within candidate bounds,
- special cases such as time travel or semantic calls are routed to known-safe
  paths,
- Vortex/Duck is favored for large analytical scans where it has proven strong.

Rules describe query shape rather than matching specific queries.

## Training

Training is SQL-native:

1. Run one query.
2. Execute it through eligible candidates.
3. Record timings, status, result compatibility, and route details.
4. Attach the observation to a named profile.
5. Let the router use that profile later.

Example:

```sql
SELECT rvbbit.route_train_query(
  profile_name => 'nightly_reporting',
  query_sql => $$
    SELECT region_id, count(*)
    FROM hits
    WHERE event_date >= DATE '2013-07-01'
    GROUP BY region_id
    ORDER BY count(*) DESC
    LIMIT 10
  $$,
  candidates => ARRAY['native', 'datafusion', 'duck_vortex', 'duck']
);
```

Profiles are SQL tables you can inspect, edit, prune, and audit.

## Observability

The routing surface answers:

- What route did this query choose?
- Which candidates were eligible?
- Which candidates were rejected and why?
- Was this decision from deterministic rules or a trained profile?
- How did the chosen route perform compared with historical alternatives?

The benchmark harness writes route details into history tables. Those records
are useful calibration data, but they are not a substitute for production route
telemetry.

## Correctness

Fast paths are optional. The router refuses a candidate when:

- the SQL feature is unsupported,
- accelerator files are missing or stale,
- pending deletes cannot be respected,
- a table has a heap tail that the candidate cannot merge,
- time-travel generation state cannot be represented,
- a semantic/operator path would change evaluation semantics.

When in doubt, use heap or another known-correct path.

