---
title: Warren
description: Capability packs, runtime nodes, and deployable sidecars.
section: SQL Primitives
navOrder: 35
sourceDocs:
  - ../rvbbit-sql/docs/WARREN.md
  - ../rvbbit-sql/docs/WARREN_UI_CONTRACT.md
  - ../rvbbit-sql/docs/CAPABILITIES.md
---

Warren is RVBBIT's capability/runtime subsystem. It handles deployable
capability packs, managed sidecars, runtime nodes, and worker-facing catalog
state.

Do not confuse Warren with Beaverdam. Beaverdam is storage acceleration. Warren
is runtime capability management.

## Capability Packs

A capability pack is a portable bundle that can register model backends,
operators, or runtime services.

Typical flow:

```bash
capabilities/tools/rvbbit-capability list

capabilities/tools/rvbbit-capability scaffold \
  capabilities/packs/extract/gliner-medium-v2.1 \
  /tmp/rvbbit-gliner
```

Install locally:

```bash
RVBBIT_DSN=postgresql://postgres:rvbbit@localhost:55433/bench \
capabilities/tools/rvbbit-capability install \
  capabilities/packs/extract/gliner-medium-v2.1 \
  --gpu
```

## SQL Deployment

Queue a capability through Warren:

```sql
SELECT rvbbit.deploy_catalog_capability(
  catalog_id => 'runtimes/python-runtime',
  target_selector => '{"docker":true}'::jsonb
);
```

Warren workers claim jobs, materialize runtimes, and write back status so a UI
can show what is pending, running, failed, or deployed.

## What Warren Exposes

Warren makes the following surfaces queryable from SQL:

- catalog capabilities,
- deploy targets,
- queued jobs,
- worker heartbeats,
- per-job logs/errors,
- generated SQL or runtime assets,
- smoke-test status.

Warren is where RVBBIT starts to feel less like a single extension function and
more like a SQL-native operating surface for capabilities.

