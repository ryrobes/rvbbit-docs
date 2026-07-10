---
title: GPU Execution (NVIDIA GQE)
description: The gpu_gqe route - running accelerated scans on NVIDIA GPUs through the RAPIDS GQE engine, with soft fallback everywhere.
section: Execution
navOrder: 52
sourceDocs:
  - ../rvbbit-sql/docker/Dockerfile.rvbbit-gqe
  - ../rvbbit-sql/crates/rvbbit_duck
---

RVBBIT can execute accelerated analytical queries on an NVIDIA GPU through
[GQE](https://github.com/rapidsai/gqe), the RAPIDS GPU Query Engine built on
libcudf. NVIDIA's post
[Designing GPU-Accelerated Query Engines with NVIDIA GQE](https://developer.nvidia.com/blog/designing-gpu-accelerated-query-engines-with-nvidia-gqe/)
is the reference for the engine itself - the three-layer query/data/execution
design on cuDF, nvCOMP, and NVSHMEM - and is what RVBBIT's `gpu_gqe` bridge
is built against. In routing terms it is simply one more candidate -
`gpu_gqe` - beside Duck/Vortex, DataFusion, native, and the Postgres
rowstore. The same contract applies: the heap stays the source of truth, and
the route is only taken when it can preserve SQL semantics.

The design goal is that GPU support is **inert everywhere it can't run**. On a
box without a GPU (or without the GQE build), the candidate self-gates as
unavailable and the router behaves exactly like the plain image. You do not
need to configure anything to *not* use GQE.

## What Runs On The GPU

`gpu_gqe` serves SELECTs over accelerated (Parquet-backed) tables - large
scans, filters, and aggregations are the shapes where a GPU wins. The bridge
gates unsupported query shapes and falls back rather than guessing; shapes
that are legal but historically risky can be force-enabled with
`rvbbit.gqe_allow_risky_shapes` if you want to experiment.

Requirements:

- an NVIDIA GPU with a current driver,
- `nvidia-container-toolkit` on the Docker host (the `nvidia` runtime),
- a GQE build available to the container (see [Deployment](#deployment)).

## How The Pieces Fit

The extension launches a small binary chain, every link of which fails soft:

1. `pg_rvbbit` invokes `/usr/local/bin/rvbbit-gqe` - a shim that probes for a
   GPU (`nvidia-smi`, `/dev/nvidia*`). No GPU or no GQE install → it reports
   `{"status": "unavailable"}` and the router skips the candidate.
2. The shim `exec`s the real bridge, `rvbbit-gqe-bridge` (the same codebase as
   the `rvbbit-duck` worker, compiled for GQE). It prepares a Parquet-backed
   catalog for the referenced tables and talks to the GQE server over Arrow
   Flight (default `http://127.0.0.1:50051`), auto-starting it on first use.
3. Results come back as Arrow and land in the normal executor path, with the
   same telemetry as any other route.

Availability is probed and cached (`rvbbit.gqe_probe_cache_ttl_ms`, default
10s), so an unavailable GQE costs almost nothing per query.

## Routing And Warm Priors

Both the backend and its routing gate default **on** precisely because they
self-gate on runtime availability:

| Setting | Env fallback | Default | Meaning |
| --- | --- | --- | --- |
| `rvbbit.gpu_gqe_backend` | `RVBBIT_GPU_GQE_BACKEND` | `true` | Enable the GQE backend at all. |
| `rvbbit.route_gpu_gqe` | `RVBBIT_ROUTE_GPU_GQE` | `true` | Let the router consider the `gpu_gqe` candidate. |
| `rvbbit.route_gpu_gqe_prior` | - | `off` | Warm-prior routing (below). |
| `rvbbit.route_gpu_gqe_prior_min_rows` | - | - | Minimum table size before the prior applies. |

Set `RVBBIT_ROUTE_GPU_GQE=0` to force the route off on a GPU host.

A GPU engine has a cold-start problem: the first query pays for server
startup, which poisons naive routing decisions. The **warm prior** solves
this: when `rvbbit.route_gpu_gqe_prior` is enabled, the freshness heartbeat
([`accel_tick`](/docs/accelerator-freshness)) periodically calls
`rvbbit.warm_gpu_gqe()`, which runs a trivial forced-GQE query and records
success in `rvbbit.gqe_warm_state`. The router's GQE prior only fires while
that warm state is fresh - so no user query ever pays the cold start.

```sql
SELECT rvbbit.warm_gpu_gqe();          -- best-effort warm probe (no-op when prior is off)
SELECT * FROM rvbbit.gqe_warm_state;   -- singleton: last confirmed-warm timestamp
```

Like every candidate, `gpu_gqe` participates in
[route training](/docs/routing-training): force it per-session with
`SET rvbbit.route_force_candidate = 'gpu_gqe'`, include it in
`route_train_query(...)` candidate lists, and inspect decisions with
`rvbbit.route_explain(...)`.

## Direct Passthrough

For debugging, the raw entry point the router uses is callable directly:

```sql
SELECT rvbbit.gpu_gqe_query_json(
  'SELECT count(*) FROM events',
  '["count"]'::jsonb,
  1000
);
```

## Observability

`rvbbit.doctor(false)` includes a `gpu_gqe` block in its `accelerator /
runtime` row - binary path, config state, probe result, and what happens if
the route is unavailable:

```sql
SELECT detail->'gpu_gqe'
FROM rvbbit.doctor(false)
WHERE name = 'runtime';
```

Route-level decisions land in the same `rvbbit.route_decisions` /
`rvbbit.route_executions` telemetry as every other engine, and
`rvbbit.route_explain('<query>')` shows whether `gpu_gqe` was eligible and why
or why not.

## Deployment

The GPU image is **prebuilt and published** -
`ghcr.io/ryrobes/rvbbit-postgres-gqe` (~9GB) - so a GPU deployment is a pull,
not a compile. It is the standard image plus the GQE runtime, and one image
covers every CUDA compute-capability 8.0+ GPU:

| GPU | Covered by |
| --- | --- |
| A100, RTX 30-series, RTX 40-series, Jetson Orin | `sm_80` SASS (8.x cards run it natively) |
| H100 / H200 | `sm_90` SASS |
| B100 / B200 / GB200 | `sm_100` SASS |
| RTX 50-series, RTX PRO Blackwell, DGX Spark | `sm_120` SASS + PTX (forward-compatible) |

Turing (RTX 20-series) and older are not supported - cudf 26.x dropped them.
On such hosts the plain image behaves identically (the route self-gates).

Start it with the GPU overlay on top of the standard compose:

```bash
curl -fsSL https://rvbbit.ai/docker-compose.yml -o docker-compose.yml
curl -fsSL https://rvbbit.ai/docker-compose.gqe.yml -o docker-compose.gqe.yml
docker compose -f docker-compose.yml -f docker-compose.gqe.yml up -d
```

The overlay sets the GPU-specific runtime pieces (`gpus: all`, shared memory
and memlock limits, `NVIDIA_VISIBLE_DEVICES`). Everything else - the
ensemble, ports, volumes - matches the standard
[quickstart](/docs/quickstart) stack.

Building from source instead (custom GQE/cudf refs or arch lists) remains
supported: `Dockerfile.rvbbit-gqe` builds the full toolchain image on the GPU
box (one-time, ~2h on 48 cores), and `Dockerfile.rvbbit-gqe-runtime` extracts
the slim runtime image from it. The dev overlays
(`docker-compose.gqe-image.yml`, `docker-compose.gqe-host.yml`) cover
build-from-source and host-mounted GQE trees.

### GPU host preflight

Before first start, make sure the *host* is actually GPU-ready -
"GPU instance" does not mean drivers are installed:

```bash
nvidia-smi -L   # if missing: install the driver, then REBOOT
                # (modprobe alone leaves "Driver/library version mismatch")
docker info --format '{{json .Runtimes}}' | grep nvidia   # nvidia-container-toolkit
docker run --rm --gpus all ghcr.io/ryrobes/rvbbit-postgres:latest nvidia-smi -L
```

### Hardware notes

- **Blackwell-class GPUs (compute capability 12.x)**: set
  `NVSHMEM_DISABLE_CUDA_VMM=0` for the GQE service. The default (`1`) makes
  NVSHMEM initialization fail on these cards and every GPU-routed query
  burns the sidecar timeout before falling back to a CPU engine.
- **Very large scans on cloud block storage**: GQE reads parquet with
  GPU-direct I/O (KvikIO); on VMs without GPUDirect Storage this can fail at
  large row-group counts. The router's fallback (and its learned latency
  models) handle this automatically - CPU engines serve those queries.

Advanced env knobs for nonstandard layouts: `RVBBIT_GQE_BIN`,
`RVBBIT_GQE_BRIDGE_BIN`, `RVBBIT_GQE_CLI`, `RVBBIT_GQE_SERVER_URL`,
`RVBBIT_GQE_AUTO_START`, `RVBBIT_GQE_NUM_GPUS`, `RVBBIT_GQE_CLIENT_MODE`,
`RVBBIT_GQE_FLIGHT_FALLBACK`, and `RVBBIT_GQE_ASSUME_GPU` (skip the GPU probe
in unusual container setups).

## Fallback Behavior

Failure at any layer degrades to the next-best route, never to an error:

- no GPU / no GQE build → shim reports unavailable, candidate skipped,
- GQE server unreachable → probe fails, candidate skipped (cached briefly),
- unsupported query shape → bridge refuses, router uses Duck/DataFusion/native,
- mid-query failure → normal route fallback with telemetry.

A non-GPU deployment behaves identically to one where GQE was never built.
