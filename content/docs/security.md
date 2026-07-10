---
title: Security And Deployment
description: Practical guardrails for model calls, MCP tools, sidecars, secrets, and audit data.
section: Operations
navOrder: 85
sourceDocs:
  - ../rvbbit-sql/docs/MCP.md
  - ../rvbbit-sql/docs/DUCK_SIDECAR.md
  - ../rvbbit-sql/docs/WARREN.md
  - ../rvbbit-sql/docs/WARREN_UI_CONTRACT.md
  - ../rvbbit-sql/docs/COSTS_UI_CONTRACT.md
  - ../rvbbit-sql/docs/DIAGNOSTICS.md
---

RVBBIT puts model calls, external tools, sidecars, and accelerator files near
the database. That is powerful, and it deserves boring operational boundaries.

This page is a deployment checklist, not a replacement for your normal Postgres
security model.

## Keep SQL Permissions Explicit

Treat RVBBIT functions like other privileged database capabilities:

- separate operator authors from ordinary query users,
- restrict functions that register backends, MCP servers, or sidecars,
- expose read-only observability views more broadly than mutation functions,
- keep production secrets in the runtime environment, not in SQL literals.

MCP and provider registration are especially sensitive because they can connect
Postgres-visible SQL to external systems.

The extension already enforces a baseline here. Writing an MCP server registration
(`rvbbit.register_mcp_server`, `rvbbit.register_mcp_gateway`) calls
`rvbbit.require_mcp_gateway_admin()`, which requires a superuser or membership in
the `rvbbit_warren` role - because a registered server's command and args are
spawned on the gateway host. Changing the capability catalog calls
`rvbbit.require_capability_catalog_admin()`, which requires a superuser. Layer
your own grants on top of these, rather than relying on them alone.

## Secrets

Prefer environment-variable references:

```sql
SELECT rvbbit.register_mcp_server(
  server_name       => 'github',
  server_transport  => 'stdio',
  server_command    => 'npx',
  server_args       => ARRAY['-y', '@modelcontextprotocol/server-github'],
  server_env        => '{"GITHUB_PERSONAL_ACCESS_TOKEN":"${GITHUB_TOKEN}"}'::jsonb
);
```

The gateway resolves `${VAR}` from its runtime environment. Use
`rvbbit.env_present('NAME')` to check presence without exposing values.

Model and embedding backends follow the same rule: a backend stores the *name*
of an auth env var (`auth_header_env`), never the literal token, so the secret
lives in the process environment and never lands in a catalog table or
`pg_dump`.

## Tool And Model Boundaries

Good defaults:

- register only the MCP servers you intend to expose,
- prefer fixed or allowlisted tool arguments in Cascades,
- set backend concurrency caps to match provider limits,
- record cost policies for local, paid, and unknown paths,
- inspect receipts and MCP invocations for unexpected tool usage.

Useful SQL:

```sql
SELECT * FROM rvbbit.provider_doctor(false);
SELECT server, tool, n_calls, n_errors, p95_latency_ms
FROM rvbbit.mcp_usage
ORDER BY n_calls DESC;
```

## Sidecars

The Duck/Vortex worker and Warren runtimes are intentionally outside the main
Postgres process. That makes crashes easier to isolate, but it also means
operators need process supervision, resource limits, and telemetry.

For the simple try-it path, RVBBIT can launch a per-call helper binary when it
is available in `PATH`. For heavier concurrent workloads, run the worker/broker
explicitly and monitor its queue, process, and error telemetry.

## Audit Data

Receipts, cost events, MCP invocations, KG evidence, and worker telemetry can
contain sensitive user data or derived model output. Apply the same retention,
backup, and access rules you apply to application tables.

```sql
SELECT receipt_id, operator, error, invocation_at
FROM rvbbit.receipts
ORDER BY invocation_at DESC
LIMIT 20;

SELECT server, tool, latency_ms, error, invocation_at
FROM rvbbit.mcp_invocations
ORDER BY invocation_at DESC
LIMIT 20;
```

## Deployment Checklist

- Run `rvbbit.doctor(false)` in setup and release checks.
- Run live provider checks only when paid calls are expected.
- Keep backend and MCP mutation functions restricted.
- Put the `rvbbit-duck` binary in a controlled path if Duck/Vortex is enabled.
- Supervise long-running workers in production.
- Monitor receipt queue, cost audit gaps, and worker health.
- Keep the Postgres heap as the source of truth for accelerated tables - accelerator files are rebuildable, the heap is authoritative.

