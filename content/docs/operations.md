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
not needed to know whether acceleration is fresh, providers are healthy, routes
are sane, or semantic costs are accumulating.

## Health Surfaces

The fastest install/health check is `rvbbit.doctor(false)`, which returns one
row per check across areas (`core`, `storage`, `accelerator`, `routing`,
`backend`, `provider`, `costs`, `mcp`, `warren`) with a `status` of `ok`,
`warn`, or `error` and a JSONB `detail`. Pass `live => true` to allow active
backend probes:

```sql
SELECT * FROM rvbbit.doctor(false);
SELECT * FROM rvbbit.doctor(true);       -- may make provider/model calls
SELECT * FROM rvbbit.provider_doctor(false);
```

The underlying SQL surfaces behind those checks:

| Surface | SQL | Purpose |
| --- | --- | --- |
| Acceleration status | `rvbbit.acceleration_status` (view) | Per-table refresh state, watermark, row/row-group counts. |
| Acceleration operations | `rvbbit.acceleration_operations` (table) | Refresh/rebuild/maintenance timing, row counts, settings, and errors. |
| Heap authority | `rvbbit.shadow_heap_status(rel)` | Heap vs Parquet sizes and whether Parquet is authoritative. |
| Provider health | `rvbbit.provider_doctor(false)`, `rvbbit.env_present('KEY')` | Default provider, auth-env presence, model/cost coverage. |
| Route status | `rvbbit.route_status()`, `rvbbit.route_explain(query)` | Chosen engine, candidates, profile/rule source (optional accelerator). |
| Receipts and cost events | `rvbbit.receipts`, `rvbbit.cost_events`, `rvbbit.cost_audit_gaps` | Semantic/operator spend and audit. See [Receipts and Costs](/docs/receipts-costs). |
| Warren / MCP | `rvbbit.warren_inventory`, `rvbbit.mcp_health` | Runtime node and MCP server health. |
| E2E harness | `rvbbit_e2e.runs`, `rvbbit_e2e.events` | User-perspective coverage of semantic SQL, Warren, storage, and restore paths. |

Acceleration is the optional columnar layer, driven by the
[registry](/docs/acceleration); the heap stays the source of truth. On GPU
hosts, the `accelerator / runtime` doctor row also reports the
[GQE](/docs/gqe) probe state (`detail->'gpu_gqe'`).

## Benchmark History

The offline benchmark scripts persist completed runs into the `bench_history`
schema, not just text reports. This is benchmark-owned state (not extension-owned
`rvbbit` state), so it survives benchmark table reloads and
`ALTER EXTENSION pg_rvbbit UPDATE`. Set `BENCH_PERSIST_RESULTS=0` to skip
recording a run.

Tables and views:

- `bench_history.runs` — one row per benchmark run (run id, suite, scale, row
  count, settings, report path, git state, summary JSON).
- `bench_history.query_results` — one row per query/system result. Columns:
  `run_id, test_name, suite, scale, row_count, started_at, qid, description,
  system, median_ms, status, detail jsonb`.
- `bench_history.run_system_summary` — aggregate view for charting scale curves.
- `bench_history.tatp_system_summary` — TATP-specific view (TPS, p95, p99).

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
ORDER BY suite, scale, suite_time_ms;
```

Substitute `'baseline'` with a test name you've recorded (`--test-name <name>`
or `BENCH_TEST_NAME=<name>` group runs in charts).

## Release Checks

Run compiler and unit checks:

```bash
cargo fmt
cargo check -p pg_rvbbit
cargo test -p pg_rvbbit --lib
cargo check --manifest-path crates/rvbbit_duck/Cargo.toml
cargo test --manifest-path crates/rvbbit_duck/Cargo.toml
```

Run the user-perspective acceptance harness (`bench/e2e_realworld.py`). It is
deterministic by default and writes a full debug trail. Common targets:

```bash
make e2e-realworld         # core stack + deterministic sidecars, non-destructive reload
make e2e-realworld-fresh   # deletes Docker volumes first (release-style install check)
make e2e-realworld-live    # RVBBIT_E2E_LIVE_LLM=1 — allows paid provider calls
make e2e-realworld-warren  # heavier host-Docker Warren sidecar lifecycle smoke
```

The harness covers `catalog`, `imports`, `storage`, `persistence`, `routing`,
`ml`, `semantic`, `embeddings`, `python`, `mcp`, `kg`, `warren`, `costs`, and
`diagnostics` phases (plus an optional `live_llm` phase). It also sweeps the
selected capability catalog:

```bash
make capability-test-all   # deploys each selected pack via Warren and runs its acceptance SQL
```

Each run writes artifacts under `results/e2e/` and persistent rows into the
benchmark-side `rvbbit_e2e.runs` / `rvbbit_e2e.events` tables (kept separate
from the extension schema so history survives reloads).

Benchmark smoke:

- ClickBench small and medium auto-router.
- ClickBench forced paths (native, Duck, DataFusion). DataFusion-Hive is
  experimental and disabled from the default fallback (the validated Duck-Hive
  and Vortex layout routes are the shipped ones).
- TPC-H tiny and one normal scale.
- TPC-DS tiny and one normal scale.
- Sidecar load harness with and without shared worker mode.

## Production Defaults

Conservative defaults favor correctness and easy installation:

- the Postgres heap stays the source of truth; `INSERT`/`COPY` land in the heap
  first, and `rvbbit.refresh_acceleration(rel)` derives disposable Parquet/Lance
  layers from it,
- if acceleration files are absent or stale, routing falls back to heap,
- `rvbbit.compact(rel)` is now a wrapper around `refresh_acceleration` and does
  not truncate the heap,
- routing defaults to conservative rules/profiles; the learned router is
  observation-only (`route_shadow_explain`), not active by default,
- the DataFusion-Hive layout path is experimental and not in the default
  fallback (Duck-Hive is the validated variant route),
- `rvbbit.synth(...)` execution is opt-in (GUC `rvbbit.synth_enabled`, default
  off); `rvbbit.synth_sql(...)` generation is always available,
- route profiles are observable and removable,
- semantic costs are recorded by default (toggle per session with
  `rvbbit.set_skip_receipts(true)`).

## Cost Audit Maintenance

For a production-ish install, schedule the cost-audit maintenance entrypoints.
The all-in-one form also refreshes provider model/rate catalogs (which keeps
model-picker UIs and cost estimation current):

```sql
SELECT rvbbit.maintain_cost_audit();
SELECT rvbbit.maintain();              -- broader: also refreshes provider catalogs
```

The expanded form lets you set per-phase limits:

```sql
SELECT rvbbit.flush_receipt_queue(10000);
SELECT rvbbit.backfill_cost_events_from_receipts(10000);
SELECT rvbbit.reconcile_openrouter_costs(1000);
```

These are idempotent for normal operation, so `pg_cron` or any external job
runner is enough (`rvbbit.install_maintenance_jobs(...)` installs the pg_cron
jobs). Watch `rvbbit.cost_audit_gaps` and `rvbbit.cost_audit_summary()` for
receipts that never settled. Full detail is in
[Receipts and Costs](/docs/receipts-costs).

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

