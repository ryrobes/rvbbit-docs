---
title: Operations
description: Observability, benchmarks, e2e tests, release checks, and production defaults.
section: Operations
navOrder: 80
sourceDocs:
  - ../rvbbit-sql/docs/ACCEPTANCE_HARNESS.md
  - ../rvbbit-sql/docs/RVBBIT_PRODUCTION_SHAPE.md
  - ../rvbbit-sql/docs/DIAGNOSTICS.md
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
---

RVBBIT has several subsystems, and operations are SQL-visible. Shell access is
not needed to know whether Beaverdam is fresh, the worker is healthy, routes are
sane, or semantic costs are accumulating.

## Health Surfaces

| Surface | Purpose |
| --- | --- |
| Beaverdam status | Table refresh state, layout availability, file counts, rows. |
| Beaverdam operation phases | Refresh/rebuild/compact timing and failures. |
| Worker telemetry | Broker/per-call status, query events, fallback events. |
| Route logs | Chosen engine, rejected candidates, profile/rule source. |
| Receipts and cost events | Semantic/operator spend and audit. |
| E2E harness | User-perspective coverage of semantic SQL, Warren, storage, and restore paths. |

## Benchmark History

Benchmark runs write raw results into SQL tables, not just text reports. That
makes it possible to compare scale curves, route changes, and regressions over
time.

Minimum fields:

- suite,
- scale or row count,
- test name,
- run id,
- system,
- query id,
- status,
- median latency,
- detail JSON with route/engine/layout metadata.

Useful query:

```sql
SELECT suite,
       scale,
       system,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY median_ms) AS p95_query,
       sum(median_ms) AS suite_time_ms
FROM bench_history.query_results
WHERE test_name = 'baseline'
GROUP BY suite, scale, system
ORDER BY suite, scale::float, suite_time_ms;
```

Substitute `'baseline'` with a baseline you've recorded.

## Release Checks

Run compiler and unit checks:

```bash
cargo fmt
cargo check -p pg_rvbbit
cargo test -p pg_rvbbit --lib
cargo check --manifest-path crates/rvbbit_duck/Cargo.toml
cargo test --manifest-path crates/rvbbit_duck/Cargo.toml
```

Run user-perspective e2e suites, including live LLM calls before release.

Benchmark smoke:

- ClickBench small and medium auto-router.
- ClickBench forced paths including Duck/Vortex.
- TPC-H tiny and one normal scale.
- TPC-DS tiny and one normal scale.
- Sidecar load harness with and without shared worker mode.

## Production Defaults

Conservative defaults favor correctness and easy installation:

- heap fallback stays available,
- Beaverdam is explicit where write patterns are unclear,
- Vortex can be built when enabled but fails closed on unsupported types,
- shared worker mode is optional,
- per-call worker fallback remains available,
- route profiles are observable and removable,
- semantic costs are recorded by default.

## Failure Handling

A failed fast path produces a reason you can surface:

- missing files,
- stale watermark,
- pending deletes,
- unsupported SQL feature,
- worker unavailable,
- result transport failure,
- semantic call blocked by policy,
- model/backend unavailable.

Silent fallback is useful for availability, but silent fallback without
telemetry makes tuning impossible.

