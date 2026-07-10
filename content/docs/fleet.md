---
title: The Read Fleet
description: Distribute analytical reads across disposable workers over published artifacts — one brain, many muscles.
section: Execution
navOrder: 54
sourceDocs:
  - ../rvbbit-sql/docs/READ_FLEET_PLAN.md
---

The read fleet lets one Postgres — **the brain** — offload analytical queries
to lightweight worker processes on other machines — **the muscles** — without
replicating Postgres, without a distributed query planner, and without ever
risking a wrong answer.

The trick is that RVBBIT's acceleration layer is already **immutable files
governed by a catalog**. Publish those files to shared object storage and any
machine can serve scans over them; the brain keeps the heap (source of truth),
the catalog, and the router. Workers hold no state worth mourning: kill one
mid-query and the router falls back to local execution — the query gets
slower, never wrong.

Think of it as a lakehouse turned upside down: instead of starting with files
on S3 and bolting on a database to keep them consistent, you start with the
database and publish the files outward.

## The rules that keep it simple

- **Whole queries only.** A query is routed to exactly one place. If its
  tables span placements, the brain serves it. There is no distributed join
  executor, and there never will be.
- **Fail open.** A dead or unreachable worker means a warning in the log and
  local execution — no user-visible error. Removing a live worker from the
  fleet is an anticlimax by design.
- **Workers earn queries by passing probes.** The dispatcher only considers
  registered, enabled endpoints whose last health probe succeeded.
- **Declared staleness.** Workers read published generations. Freshness is
  bounded by publication cadence — the same *stale-is-slow-not-wrong* contract
  as the rest of the acceleration layer.

## 1 · Configure a publish store

```sql
-- Non-secret config lives in the catalog; credentials NEVER do.
SELECT rvbbit.set_publish_store('s3://my-bucket/fleet');

-- Verify: canary write / head / delete with timings.
SELECT rvbbit.publish_store_doctor();
```

Credentials come from the **server environment** (`AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, optional `AWS_ENDPOINT`) — an
env file or compose `environment:` block on the Postgres container. Google
Cloud Storage works through its S3-interoperability endpoint: create HMAC keys
for a service account and set `AWS_ENDPOINT=https://storage.googleapis.com`.

## 2 · Publish artifacts

Once a store is configured, every compaction publishes its new row groups
automatically — **keeping the local files** (the brain never depends on the
network for its own reads). Backfill or re-publish by hand:

```sql
SELECT rvbbit.publish_row_groups('my_table');  -- backfill one table
SELECT * FROM rvbbit.publish_state;            -- water level per table
SELECT rvbbit.republish();                     -- after changing the store URL
```

Per-table opt-out (for data that must not leave the box):

```sql
INSERT INTO rvbbit.publish_policy (table_oid, enabled)
VALUES ('sensitive_table'::regclass::oid, false);
```

## 3 · Start a worker

A worker is the `rvbbit-duck` engine from the standard image, listening on
TCP. It holds **no Postgres credentials beyond a read-only catalog DSN**, and
object-store credentials scoped to reading artifacts:

```bash
docker run -d --name rvbbit-duck-worker --restart unless-stopped \
  -p 9464:9464 \
  -v /etc/ssl/certs:/etc/ssl/certs:ro \
  -e RVBBIT_SIDECAR_REMOTE=1 \
  -e RVBBIT_ENGINE_TOKEN='<shared-token>' \
  -e AWS_ACCESS_KEY_ID=... -e AWS_SECRET_ACCESS_KEY=... \
  -e AWS_ENDPOINT=https://storage.googleapis.com \
  --entrypoint /usr/local/bin/rvbbit-duck \
  ghcr.io/ryrobes/rvbbit-postgres:latest \
  --serve-tcp 0.0.0.0:9464 --workers 4 \
  --dsn "host=<brain-host> port=5432 user=... dbname=..." --engine duck
```

Notes:

- `RVBBIT_ENGINE_TOKEN` is **fail-closed**: the worker refuses to start
  without it, and every request must carry a matching token. Run workers on a
  private network (VPC, WireGuard); TLS between brain and worker is on the
  roadmap (Arrow Flight + mTLS).
- The `/etc/ssl/certs` mount supplies CA certificates for object-store TLS
  (needed on current images).
- `RVBBIT_SIDECAR_REMOTE=1` makes the worker resolve row groups via their
  **published** URLs instead of brain-local paths.

## 4 · Register it with the brain

```sql
SELECT rvbbit.fleet_add('cpu-1', '10.0.0.19:9464');
SELECT rvbbit.fleet_probe('cpu-1');   -- health check with teeth (see below)
SELECT * FROM rvbbit.fleet;           -- the registry, at a glance
```

The brain needs the same `RVBBIT_ENGINE_TOKEN` in **its** environment — it
authenticates to workers, never the reverse.

`fleet_probe` is not a TCP ping: it asks the worker to prewarm, which proves
the transport, the token, the worker's DSN back to the catalog, *and* that the
published artifacts are visible from that machine. A failed probe removes the
node from the dispatch rotation until a later probe succeeds:

```sql
SELECT * FROM rvbbit.fleet_doctor();  -- probe every enabled worker
SELECT rvbbit.fleet_set_enabled('cpu-1', false);  -- drain by hand
SELECT rvbbit.fleet_remove('cpu-1');
```

## 5 · Routing

With a healthy registered worker, engine-eligible queries dispatch to it
automatically. To pin a session (testing, or forcing a specific node):

```sql
SET rvbbit.duck_fleet_endpoint = '10.0.0.19:9464';  -- session-level pin
SET rvbbit.route_force_candidate = 'duck_vector';    -- force the engine too
```

Every decision and execution records **which node served it** in
`route_decisions.node` / `route_executions.node` (`NULL` = the brain's local
engines):

```sql
SELECT coalesce(node, 'local') AS node, count(*)
FROM rvbbit.route_decisions
WHERE decided_at > now() - interval '1 hour'
GROUP BY 1;
```

In Data Rabbit, the **Fleet** window (System folder) is the live topology —
click a worker to probe it — and the **Adaptive Routing** window grows
per-node filter pills so you can see exactly what ran where.

## Disk lifecycle: the local cache escape hatch

Published tables can release their local copies — reads transparently shift
to the published objects (slower, never wrong), reclaiming the brain's disk:

```sql
SELECT rvbbit.evict_local('big_archive_table');  -- verify, flip reads, reclaim
```

Eviction verifies the published object byte-for-byte before releasing
anything, and the local file goes through the same deferred-unlink grace
window as every other artifact (`reap_grace_minutes` in `rvbbit.settings` —
size it beyond your longest remote query).

## Reference

| Surface | Purpose |
| --- | --- |
| `rvbbit.set_publish_store(url, enabled)` | Configure the shared store (non-secret half) |
| `rvbbit.publish_store_doctor()` | Canary write/head/delete with timings |
| `rvbbit.publish_row_groups(rel)` | Publish a table's unpublished row groups |
| `rvbbit.republish(rel?)` | Re-home artifacts after a store change |
| `rvbbit.evict_local(rel)` | Release local copies of published artifacts |
| `rvbbit.publish_state` | View: published / evicted per table |
| `rvbbit.publish_policy` | Per-table publication opt-out |
| `rvbbit.fleet_add / fleet_remove / fleet_set_enabled` | Registry management |
| `rvbbit.fleet_probe(name)` / `rvbbit.fleet_doctor()` | Health checks (recorded on the registry row) |
| `rvbbit.fleet` | View: the registry with probe state |
| `rvbbit.duck_fleet_endpoint` (GUC) | Session-level endpoint pin |
| `route_decisions.node` / `route_executions.node` | Which node served each query |
| `rvbbit-duck --serve-tcp HOST:PORT` | Run a fleet worker |
| `RVBBIT_ENGINE_TOKEN` | Shared auth token (worker fail-closed; brain env) |
| `RVBBIT_SIDECAR_REMOTE=1` | Worker resolves published URLs, not local paths |

## What this is not

There is no consensus protocol, no shard rebalancing, no replica lag to
reason about, and no distributed transaction anywhere in this design. The
brain remains a single ordinary Postgres with ordinary Postgres HA options.
The fleet scales *reads over immutable data* — which, in an accelerated
RVBBIT warehouse, is most of the expensive work — and protects the writer's
buffer cache and I/O from analytical bursts while doing it.
