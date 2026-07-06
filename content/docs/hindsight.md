---
title: Agent Memory (Hindsight)
description: Long-term agent memory as SQL — retain, recall, and reflect against a registered Hindsight service.
section: SQL Primitives
navOrder: 46
sourceDocs:
  - ../rvbbit-sql/capabilities/packs/memory/hindsight-slim/capability.yaml
---

Agents need memory that outlives a session. RVBBIT integrates
[Hindsight](https://github.com/vectorize-io/hindsight) — an external
long-term-memory service — as a registered *memory service*, with thin SQL
wrappers so retain/recall/reflect are just function calls inside your queries
and Cascades.

RVBBIT stores only the service registration (endpoint, status, auth env);
the memory engine itself runs as a sidecar. The `memory/hindsight-slim`
[capability pack](/docs/capability-packs) deploys it through
[Warren](/docs/warren) (container port `8888`, health-checked, backed by its
own Postgres schema), or you can run it yourself and register the endpoint.

## Register A Service

```sql
SELECT rvbbit.register_memory_service(
  service_name    => 'hindsight_default',
  endpoint_url    => 'http://127.0.0.1:8888',
  auth_header_env => 'HINDSIGHT_TOKEN'   -- optional bearer token env var
);

SELECT rvbbit.memory_service();          -- resolve the default service
SELECT rvbbit.hindsight_status();        -- GET /health on it
```

Registration requires a superuser or membership in the `rvbbit_warren` role,
same as other runtime registrations. The default service is tracked in
`rvbbit.settings`; the registry table is `rvbbit.memory_services`.

## Retain, Recall, Reflect

Memories live in named **banks** — one per agent, tenant, or workflow:

```sql
-- Store a memory (async by default).
SELECT rvbbit.hindsight_retain(
  'agent_hermes',
  'The Q3 dashboard shipped with the blue theme.',
  '{"source": "chat", "document_tags": {"tenant": "acme"}}'::jsonb
);

-- Retrieve matching memories.
SELECT rvbbit.hindsight_recall(
  'agent_hermes',
  'what theme did the Q3 dashboard use?',
  '{"top_k": 5}'::jsonb
);

-- Ask the service to synthesize an answer from the bank.
SELECT rvbbit.hindsight_reflect(
  'agent_hermes',
  'summarize what you know about the Q3 dashboard'
);
```

`recall` returns matched memories; `reflect` goes one step further and has
Hindsight compose an answer from the bank's contents. All three accept an
optional trailing `service_name` to target a non-default service, and all
return `jsonb` you can join, filter, and log like any other value.

Because these are ordinary functions, they compose with the rest of the
system — a [Cascade](/docs/cascades) step can recall context before an LLM
step, and an MCP-facing agent can persist what it learned before the session
ends. In [Data Rabbit](/docs/data-rabbit), the **Hindsight** desktop icon
lights up ("detected") when a service is registered and reachable.

## Notes

- The `hindsight-api:latest-slim` image expects an externally-provided
  embedder (OpenAI/OpenRouter-compatible transports). Use
  `rvbbit.hindsight_embedding_env('embed')` to check whether the configured
  rvbbit embedder can be piggybacked; incompatible transports report
  `compatible: false`.
- Treat memory contents like any other audit-sensitive data: the service
  stores what your agents tell it, so apply the same retention and access
  thinking you would to [receipts](/docs/receipts-costs).
