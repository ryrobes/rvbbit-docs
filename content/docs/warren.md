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

Warren is RVBBIT's optional deployment control plane for model, runtime, and
tool sidecars. It handles deployable capability packs, managed sidecars, runtime
nodes, and worker-facing catalog state.

Warren is optional. The database stays the source of truth: a Warren agent runs
on any host with the right resources, polls Postgres for deployment jobs, starts
the requested service, then registers the resulting endpoint back into RVBBIT.
The query engine keeps using the normal backend, operator, and runtime-node
machinery — Warren just stores the catalog rows it already knows how to execute.

Do not confuse Warren with storage acceleration. The
[acceleration registry](/docs/acceleration) is the optional storage layer;
Warren is runtime capability management.

## Capability Packs

A capability pack is a portable bundle that can register model backends,
operators, or runtime services. Built-in operators like `means()`, `about()`,
`classify()`, and `extract_pii()` come from packs, not from the engine itself —
see [Capability Packs](/docs/capability-packs) for the full catalog and operator
provenance.

The `capabilities/tools/rvbbit-capability` CLI operates on pack manifests
(`capability.yaml`). Its subcommands are `render`, `scaffold`, `install`,
`deploy`, `test`, `test-all`, `list`, and `catalog`.

Typical flow:

```bash
capabilities/tools/rvbbit-capability list

capabilities/tools/rvbbit-capability scaffold \
  capabilities/packs/extract/gliner-medium-v2.1 \
  /tmp/rvbbit-gliner
```

Install locally (scaffold, run the sidecar, then apply the generated
`register.sql` / `operator.sql` / `smoke.sql`):

```bash
RVBBIT_DSN=postgresql://postgres:rvbbit@localhost:55433/bench \
capabilities/tools/rvbbit-capability install \
  capabilities/packs/extract/gliner-medium-v2.1 \
  --gpu
```

## SQL Deployment

Queue a capability through Warren by catalog id:

```sql
SELECT rvbbit.deploy_catalog_capability(
  catalog_id => 'runtimes/python-runtime',
  target_selector => '{"docker":true}'::jsonb
);
```

Or queue a manifest directly with
`rvbbit.deploy_capability(capability_manifest, target_selector)`. A Warren agent
registered with matching labels claims the job via `FOR UPDATE SKIP LOCKED`,
builds or pulls the sidecar, probes it, then writes the resulting rows back to
SQL. Model packs call `rvbbit.register_backend(...)` + `rvbbit.create_operator(...)`
+ `rvbbit.reload_backends()`; runtime packs call `rvbbit.register_python_runtime(...)`
or `rvbbit.register_mcp_gateway(...)`.

Lower-level queue functions are available for custom flows:
`rvbbit.enqueue_warren_job(kind, name, manifest, target_selector, desired_state)`,
`rvbbit.claim_warren_job(node_name)`, `rvbbit.complete_warren_job(...)`,
`rvbbit.fail_warren_job(...)`, plus deployment lifecycle requests
(`request_warren_deployment_state` / `_stop` / `_remove` / `_redeploy`).

Warren workers claim jobs, materialize runtimes, and write back status so a UI
can show what is pending, running, failed, or deployed.

### First test

`smoke/warren-echo` is the recommended first Warren deploy. It uses the FastAPI
sidecar template with an `echo` handler and `python:3.12-slim`, so it validates
Warren, Docker, backend registration, probing, and operator wiring without
downloading a model:

```sql
SELECT rvbbit.deploy_catalog_capability(
  catalog_id => 'smoke/warren-echo',
  target_selector => '{"gpu":false}'::jsonb
);

-- after the agent completes the job
SELECT rvbbit.warren_smoke_echo('hello from SQL')->>'echo';
```

## Runtime Nodes

Two system runtime packs (`kind: runtime_sidecar`) unlock workflow node kinds
rather than serving a model. Neither exposes SQL operators of its own.

- **`runtimes/python-runtime`** registers `python_default` in
  `rvbbit.python_runtimes` (endpoint `/run`, base image `python:3.12-slim`). It
  powers `kind: python` operator nodes. Once deployed, define Python workflow
  environments against it entirely from SQL:

  ```sql
  SELECT rvbbit.create_python_env(
    env_name => 'analytics',
    python_version => '3.12',
    requirements => ARRAY['rapidfuzz==3.9.7'],
    runtime_name => 'python_default'
  );
  ```

- **`runtimes/mcp-gateway`** registers `mcp_default` in `rvbbit.mcp_gateways`
  (port `9180`, endpoint `/`). It powers `kind: mcp` operator nodes and SQL MCP
  calls — see [MCP](/docs/mcp).

There is also a lighter runtime registration that Warren does not manage: an
external **n8n** instance can be registered with
`rvbbit.register_n8n_runtime(name, base_url, ...)` so `kind: n8n` operator
steps can invoke its production webhooks (`rvbbit.n8n_runtime_status()` lists
runtimes; `rvbbit.n8n_workflows()` introspects reachable workflows). It is an
integration surface, not a managed sidecar.

A Warren-deployed runtime shows a `runtime_name` (e.g. `python_default`) rather
than a backend name in `rvbbit.warren_inventory`.

## What Warren Exposes

Warren makes its state queryable from SQL through catalog tables and views:

- `rvbbit.warren_nodes` — registered agent hosts, labels, capacity, heartbeat.
- `rvbbit.warren_jobs` — queued/running/completed jobs, with `phase` and
  `progress` for UI-visible install progress.
- `rvbbit.warren_deployments` — materialized deployment records tied to nodes
  and backend/operator/runtime names.
- `rvbbit.warren_inventory` — node plus active-deployment view.
- `rvbbit.warren_backend_status` — backend rows annotated with the latest Warren
  deployment state and a `callable` flag.
- `rvbbit.warren_gpu_capacity`, `rvbbit.warren_node_metrics`,
  `rvbbit.warren_node_latest_metrics`, `rvbbit.warren_node_effective_status` —
  telemetry and placement.

So a UI can show what is pending, running, failed, drifted, or deployed entirely
from these rows. Warren is where RVBBIT starts to feel less like a single
extension function and more like a SQL-native operating surface for capabilities.

