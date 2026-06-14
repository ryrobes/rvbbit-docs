---
title: Capability Packs
description: Portable bundles for installing operators, model backends, specialists, and runtime services.
section: Operations
navOrder: 72
sourceDocs:
  - ../rvbbit-sql/docs/CAPABILITIES.md
  - ../rvbbit-sql/docs/WARREN.md
  - ../rvbbit-sql/docs/WARREN_UI_CONTRACT.md
  - ../rvbbit-sql/docs/LARS_SEMANTIC_OPERATOR_AUDIT.md
  - ../rvbbit-sql/crates/pg_rvbbit/src/capability_catalog_seed.json
---

Capability packs are how RVBBIT moves beyond a pile of SQL functions. A pack
can install operators, backends, specialist runtimes, model metadata, smoke
tests, or Warren deployment jobs.

Use packs when a feature needs assets and runtime shape, not only a single SQL
function.

## Local Pack Workflow

```bash
capabilities/tools/rvbbit-capability list

capabilities/tools/rvbbit-capability scaffold \
  capabilities/packs/extract/gliner-medium-v2.1 \
  /tmp/rvbbit-gliner
```

Install a pack from the shell during development:

```bash
RVBBIT_DSN=postgresql://postgres:rvbbit@localhost:55433/bench \
capabilities/tools/rvbbit-capability install \
  capabilities/packs/extract/gliner-medium-v2.1 \
  --gpu
```

The command-line path is useful for development and repeatable installs.

## SQL Deployment Through Warren

Fresh extension installs seed `rvbbit.capability_catalog`, so a SQL client or UI
can queue a catalog install without reading files from the server:

```sql
SELECT rvbbit.deploy_catalog_capability(
  catalog_id => 'extract/gliner-medium-v2.1',
  target_selector => '{}'::jsonb
);
```

For runtime capabilities, use a target selector that matches the Warren worker
labels:

```sql
SELECT rvbbit.deploy_catalog_capability(
  catalog_id => 'runtimes/python-runtime',
  target_selector => '{"docker":true}'::jsonb
);
```

Warren workers claim jobs, materialize runtimes or model backends, and write
status back to SQL. Queued jobs, target selection, logs, errors, smoke-test
state, and generated SQL are all queryable.

Browse the static docs catalog at `/capabilities`, or query the live database:

```sql
SELECT id, title, operators
FROM rvbbit.capability_catalog
WHERE active
ORDER BY title;
```

## What A Pack Can Include

| Asset | Example |
| --- | --- |
| Backend rows | A local embedding server or OpenAI-compatible local model. |
| Operators | Extraction, sentiment, classification, summarization. |
| Runtime manifests | Docker/Python/Rust sidecars needed by a specialist. |
| Cost policy | Free local GPU, fixed per-call, or model-rate estimate. |
| Smoke tests | SQL calls that prove the pack is usable. |
| UI metadata | Description, labels, requirements, and target compatibility. |

## When To Use A Pack

Good pack candidates:

- extractors such as GLiNER,
- local embedding models,
- domain-specific operator sets,
- MCP gateway bundles,
- specialist runtimes that need a worker process.

Avoid packs for one-off prompt experiments. Put those in normal operator
catalog rows until the workflow is stable enough to distribute.

## Observability

```sql
SELECT *
FROM rvbbit.warren_jobs
ORDER BY created_at DESC
LIMIT 20;

SELECT *
FROM rvbbit.warren_worker_heartbeats
ORDER BY observed_at DESC
LIMIT 20;
```

Warren is a runtime inventory: what can be installed, where it can run, what is
currently deployed, and what failed.
