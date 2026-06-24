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

Routing is an optional accelerator. The Postgres heap stays the source of truth,
and the default route is conservative: without an active profile, queries stay on
the native PostgreSQL/RVBBIT path unless cheap shape rules promote them. The
adaptive part is rule- and profile-based. A learned router exists only in shadow
mode today — it observes and explains decisions, it does not take over default
routing.

## Candidate Paths

Common candidates:

| Candidate (route label) | Typical use |
| --- | --- |
| `rvbbit_native` | Always-correct native PostgreSQL/RVBBIT baseline; also the fallback for unsupported SQL. Always eligible. |
| `datafusion_vector` | In-process DataFusion over authoritative Parquet row groups. |
| `duck_vector` | DuckDB sidecar over authoritative Parquet row groups. |
| `duck_vortex` | DuckDB over Vortex-encoded files where they exist. |
| `datafusion_hive` / `duck_hive` | Hive-style partitioned Parquet variants for filter-friendly workloads. |
| `datafusion_mem` | Decoded hot-cache path for small hot tables. |
| `pg_rowstore` | Retained shadow heap rowstore path. |

The candidate names above are the exact route labels the SQL API uses (the
short aliases `native`, `datafusion`, `duck` also resolve). These storage-backed
candidates are the optional acceleration layer — conceptually "Beaverdam" — that
sits beside the heap. The heap remains the source of truth.

## No-Profile Rules

When no trained profile matches, the router uses cheap query-shape rules:

- the referenced accelerator data is authoritative and fresh enough,
- query features are supported by a candidate,
- row estimates are within candidate bounds,
- special cases such as time travel or semantic calls are routed to known-safe
  paths,
- larger analytical scans favor vector or Hive variant paths once the Parquet
  catalog is authoritative.

Rules describe query shape rather than matching specific queries. The small/simple
native cutoff defaults to 500,000 rows (tune via the `RVBBIT_ROUTE_NO_PROFILE_NATIVE_MAX_ROWS`
env var or the `rvbbit.route_no_profile_native_max_rows` session setting); the
variant-first threshold defaults to 250,000 rows. Inspect the live state with
`rvbbit.route_status()` and a single query's decision with
`rvbbit.route_explain(...)` or `rvbbit.route_explain_text(...)`.

## Training

Training is SQL-native. One call to `rvbbit.route_train_query(...)`:

1. Runs your SELECT once per candidate per repeat, forcing each candidate via a
   transaction-local `rvbbit.route_force_candidate` setting.
2. Digests and validates each candidate's result against the `rvbbit_native`
   baseline (row count and an order-aware hash).
3. Records timings, status, validation status, and the route document for each
   candidate into `rvbbit.route_training_queries`, `rvbbit.route_training_runs`,
   and `rvbbit.route_training_results`.
4. Rebuilds the named profile from those validated medians, optionally
   activating it.

The function signature is:

```sql
rvbbit.route_train_query(
  profile_name text,
  query        text,
  repeats      int     DEFAULT 3,
  min_gain_pct float8  DEFAULT 0.05,
  activate     bool    DEFAULT true,
  candidates   text    DEFAULT 'all',
  label        text    DEFAULT ''
) RETURNS jsonb
```

`candidates` is a single text value: `'all'`, or a comma-separated list of
candidate names (`rvbbit_native`, `datafusion_vector`, `duck_vector`,
`duck_vortex`, `duck_hive`, `datafusion_hive`, `pg_rowstore`, `datafusion_mem`;
short aliases like `native`, `datafusion`, `duck` also resolve). It is not a SQL
array, and `rvbbit_native` is always included because it is the correctness
baseline.

Example:

```sql
SELECT jsonb_pretty(rvbbit.route_train_query(
  profile_name => 'nightly_reporting',
  query => $$
    SELECT region_id, count(*)
    FROM hits
    WHERE event_date >= DATE '2013-07-01'
    GROUP BY region_id
    ORDER BY count(*) DESC
    LIMIT 10
  $$,
  repeats => 3,
  min_gain_pct => 0.05,
  activate => false,
  candidates => 'datafusion_vector,duck_vector,duck_vortex'
));
```

Training accepts only read-only `SELECT`/`WITH` workloads that reference at least
one RVBBIT table, and rejects volatile/time-varying functions (`random`, `now`,
`generate_series`, …) so repeated runs and result validation stay meaningful.

You can rebuild a profile separately with
`rvbbit.route_profile_rebuild(profile_name, min_gain_pct, activate)`, override the
profile for a session with `rvbbit.route_use_profile(...)`, and publish or retire
with `rvbbit.route_activate_profile(...)` / `rvbbit.route_retire_profile(...)`.
Profiles and their training corpus are ordinary SQL tables
(`rvbbit.route_profiles`, the `rvbbit.route_training_*` family, and the
`rvbbit.route_profile_summary` / `rvbbit.route_training_summary` views) that you
can inspect, edit, prune, and audit.

## Observability

The routing surface answers:

- What route did this query choose? (`rvbbit.route_explain(query)` /
  `rvbbit.route_explain_text(query)`)
- Which candidates were eligible, and which were rejected and why?
- Was this decision from deterministic rules or a trained profile? The route
  document's `route_source` distinguishes cases like `no-profile-native`,
  `no-profile-datafusion`, `no-profile-variant`, and `eligibility`.
- How did the chosen route perform compared with historical alternatives?

Online routing telemetry is written best-effort and asynchronously into
`rvbbit.route_decisions` and `rvbbit.route_executions`, rolled up in
`rvbbit.route_runtime_summary`. Training results, by contrast, live in the
`rvbbit.route_training_*` tables. The benchmark harness writes route details into
the training tables; those records are useful calibration data, but they are not
a substitute for production route telemetry.

## Correctness

Fast paths are optional. The router refuses a candidate when:

- the SQL feature is unsupported,
- accelerator files are missing or stale,
- pending deletes cannot be respected,
- a table has a heap tail that the candidate cannot merge,
- time-travel generation state cannot be represented,
- a semantic/operator path would change evaluation semantics.

When in doubt, use heap or another known-correct path.

