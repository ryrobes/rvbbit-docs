---
title: Beaverdam Worker
description: Duck/Vortex worker modes, fallback behavior, telemetry, and deployment shape.
section: Operations
navOrder: 70
sourceDocs:
  - ../rvbbit-sql/docs/DUCK_SIDECAR.md
  - ../rvbbit-sql/docs/RVBBIT_DUCK_UI_CONTRACT.md
---

The Beaverdam worker is the process path that serves DuckDB-backed queries,
including Duck over Vortex files. The binary is named `rvbbit-duck`; the public
concept is the Beaverdam worker.

## Modes

| Mode | Shape | Use |
| --- | --- | --- |
| Local per-call | Postgres launches the binary for a query. | Easiest "try the extension" path. |
| Shared broker | A long-running worker pool handles requests. | Better production shape and lower process churn. |
| Fallback | If broker is unavailable, use local per-call mode when allowed. | Keeps the extension usable. |

For first-time users, the only requirement is that the worker binary is
installed somewhere Postgres can execute it.

## Why Keep It Out Of Process

Out-of-process execution is not free, but it is pragmatic:

- Vortex/Duck dependencies are isolated from Postgres backend stability.
- Panics or extension crashes are less likely to take down the server process.
- Shared worker mode can evolve toward pooling, remote workers, or object-store
  locality.
- Local per-call mode keeps installation simple.

The transport avoids waste. Arrow IPC carries large result sets; JSON is used
only for simple control and smaller payloads.

## Telemetry

The worker writes SQL-visible telemetry:

```sql
SELECT *
FROM rvbbit.duck_sidecar_latest
ORDER BY last_heartbeat_at DESC;
```

Recent query events:

```sql
SELECT observed_at,
       hostname,
       mode,
       engine,
       layout,
       query_hash,
       status,
       elapsed_ms,
       rows_returned
FROM rvbbit.duck_sidecar_query_events
ORDER BY observed_at DESC
LIMIT 100;
```

Fallbacks:

```sql
SELECT *
FROM rvbbit.duck_sidecar_fallback_events
ORDER BY observed_at DESC
LIMIT 50;
```

Telemetry includes `hostname` and `node_id` so the schema supports multiple
worker nodes over shared storage.

## Load Testing

The sidecar load harness exists to answer operational questions:

- How many workers are spawned?
- Does memory grow with concurrent clients?
- Does the broker hit Postgres `max_connections`?
- What is the knee point for throughput?
- Which Duck thread count gives the best concurrency profile?

Use it before changing default worker mode or thread settings.

```bash
SIDECAR_LOAD_DUCK_THREADS=4 \
SIDECAR_LOAD_CLIENTS=1,2,4,8,16,32 \
SIDECAR_LOAD_DURATION_S=60 \
./bench/sidecar_load/run_offline.sh
```

