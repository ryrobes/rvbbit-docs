---
title: MCP Servers
description: Register MCP servers, discover tools, call them from SQL, and use them inside Cascades.
section: SQL Primitives
navOrder: 34
sourceDocs:
  - ../rvbbit-sql/docs/MCP.md
  - ../rvbbit-sql/docs/OPERATORS.md
  - ../rvbbit-sql/docs/WARREN.md
---

MCP brings external tool ecosystems into RVBBIT without adding a separate app
API. The registry, discovery cache, calls, health checks, and audit trail all
live behind SQL.

The practical result is that an MCP tool can be called directly, treated as a
row source, or embedded as a step inside a Cascade.

## How It Runs

RVBBIT talks to an MCP gateway runtime. The gateway manages stdio or HTTP MCP
servers and shares them across Postgres backends. Postgres does not fork tool
subprocesses for every query.

The SQL catalog is still the source of truth:

| Surface | Purpose |
| --- | --- |
| `rvbbit.mcp_servers` | Registered MCP servers. |
| `rvbbit.mcp_gateways` | Ready gateway runtimes and endpoints. |
| `rvbbit.mcp_tools` | Discovered tools and input schemas. |
| `rvbbit.mcp_resources` | Discovered read-only resources. |
| `rvbbit.mcp_invocations` | Per-call audit log. |
| `rvbbit.mcp_usage` | Per-server/tool latency and error rollups. |
| `rvbbit.mcp_health` | Passive server status snapshot. |

## Register And Discover

Register a server once, then refresh it to discover tools and resources:

```sql
SELECT rvbbit.register_mcp_server(
  server_name        => 'github',
  server_transport   => 'stdio',
  server_command     => 'npx',
  server_args        => ARRAY['-y', '@modelcontextprotocol/server-github'],
  server_env         => '{"GITHUB_PERSONAL_ACCESS_TOKEN":"${GITHUB_TOKEN}"}'::jsonb,
  server_timeout_ms  => 60000,
  server_description => 'GitHub repos/issues/PRs via MCP'
);

SELECT rvbbit.refresh_mcp_server('github');
```

Secrets should usually be referenced with `${VAR}` placeholders. The value is
resolved from the gateway runtime environment and is not persisted in the SQL
catalog.

## Call A Tool

Use `mcp_call` when you want the full MCP response envelope:

```sql
SELECT rvbbit.mcp_call(
  'github',
  'search_repositories',
  '{"query":"postgres extension datafusion","perPage":3}'::jsonb
);
```

Use `mcp_rows` when the response is naturally a list and should compose with
SQL:

```sql
SELECT r->>'full_name' AS repo,
       r->>'language' AS language,
       (r->>'stargazers_count')::int AS stars
FROM rvbbit.mcp_rows(
  'github',
  'search_repositories',
  '{"query":"vector database","perPage":10}'::jsonb
) r
WHERE r->>'language' = 'Rust'
ORDER BY stars DESC;
```

## Join Tool Output With Local Data

Because `mcp_rows` is a set-returning SQL function, tool results can join with
ordinary tables:

```sql
SELECT a.account_id,
       a.company_name,
       repo->>'full_name' AS matching_repo,
       (repo->>'stargazers_count')::int AS stars
FROM accounts a
JOIN LATERAL rvbbit.mcp_rows(
  'github',
  'search_repositories',
  jsonb_build_object(
    'query', a.company_name || ' postgres',
    'perPage', 3
  )
) repo ON true
WHERE a.tier = 'strategic'
ORDER BY stars DESC;
```

This is the key design point: external context and local relational data can be
planned, filtered, and inspected in one SQL surface.

## Use MCP Inside Cascades

MCP is also a Cascade step kind alongside `llm`, `specialist`, `code`, and
`sql`:

```sql
SELECT rvbbit.create_operator(
  op_name        => 'summarize_repo',
  op_arg_names   => ARRAY['q'],
  op_return_type => 'text',
  op_steps       => $j$[
    {
      "name": "fetch",
      "kind": "mcp",
      "server": "github",
      "tool": "search_repositories",
      "inputs": {"query": "{{ inputs.q }}", "perPage": 1}
    },
    {
      "name": "summarize",
      "kind": "llm",
      "model": "openai/gpt-5.4-mini",
      "system": "Summarize in one sentence.",
      "user": "Repo: {{ steps.fetch.output.items.0.full_name }}"
    }
  ]$j$::jsonb
);
```

Tool output becomes addressable by later steps. If the tool returns JSON, RVBBIT
parses it when possible so downstream nodes can reference paths such as
`{{ steps.fetch.output.items.0.full_name }}`.

## Ship It As A Capability

A registered server works on one database. To make it portable — browsable,
installable on any database, even baked into the extension — publish it into the
same capability catalog that holds model and runtime capabilities:

```sql
-- Scan a working server into a kind='mcp' catalog entry (id: mcp/<server>).
SELECT rvbbit.publish_mcp_capability(
  'firecrawl',
  'Firecrawl (MCP)',
  ARRAY['mcp','web','scrape'],
  true
);
```

The entry now appears in the Capabilities window. Its manifest records the
connection, the tool and resource surface, one operator definition per tool, and
the **declared secrets** — the `${VAR}` names an installer must supply. No key
values are stored.

Installing an entry supplies those keys and generates the operators:

```sql
SELECT rvbbit.install_mcp_register('mcp/firecrawl');   -- register from the manifest
-- the UI pushes your key to the gateway's encrypted store here (never Postgres)
SELECT rvbbit.install_mcp_finalize('mcp/firecrawl');   -- refresh + generate operators
```

The Capabilities window renders the declared secrets as key inputs — you install
an MCP server by pasting its API key, exactly like installing a model.

### Tools Become Operators

`install_mcp_finalize` (or `rvbbit.generate_mcp_operators('<server>')`) creates
one scalar SQL operator per tool, named `<server>_<tool>`, with typed arguments
lifted from the tool's input schema:

```sql
SELECT rvbbit.iplocate_lookup_ip_address_location(ip => '1.1.1.1');  -- Sydney, AU
```

These compose with the rest of RVBBIT — pair a web search with `classify`, or a
scrape with `embed` for retrieval. High-arity tools (some have 20+ optional
arguments) are easiest to call via `mcp_call(...)`; low-arity tools call cleanly
by name.

### The Secret Model

Keys never touch Postgres. `rvbbit.mcp_servers.env` and the published manifest
store only `${VAR}` references; the gateway resolves them at spawn time from a
per-server encrypted store (Fernet) or its own environment. Install-time keys go
straight from the UI to the gateway's store. A published or shipped catalog entry
is therefore commit-safe — it carries no credential material.

### Servers That Ship By Default

`github`, `firecrawl`, `time`, `iplocate`, `tavily`, `exa`, `apollo`, and `ipgeo`
are baked into the catalog seed and browsable out of the box. `time` and
`iplocate` are keyless; the rest declare a single API key you provide at install.

## Observability

The UI should read the catalog instead of talking to the gateway directly:

```sql
SELECT name, endpoint_url, status, health, updated_at
FROM rvbbit.mcp_gateways
ORDER BY (status = 'ready') DESC, updated_at DESC
LIMIT 1;

SELECT *
FROM rvbbit.mcp_health
ORDER BY name;

SELECT server, tool, n_calls, n_errors, avg_latency_ms, p95_latency_ms
FROM rvbbit.mcp_usage
ORDER BY n_calls DESC;
```

Individual calls are auditable:

```sql
SELECT server, tool, latency_ms, cache_hit, error, invocation_at
FROM rvbbit.mcp_invocations
ORDER BY invocation_at DESC
LIMIT 50;
```

Transport-level failures raise SQL errors and may roll back the audit insert.
Tool-level errors return an MCP envelope with `isError=true` and are recorded in
`rvbbit.mcp_invocations`.

## Useful Extras

For idempotent tools, cache results by tool:

```sql
SELECT rvbbit.set_mcp_tool_caching('github', 'search_repositories', 300);
SELECT rvbbit.purge_mcp_cache('github', 'search_repositories');
```

For nicer SQL ergonomics, generate typed wrapper functions in a schema named
after the server:

```sql
SELECT rvbbit.generate_mcp_wrappers('github');

SELECT r->>'full_name'
FROM github.search_repositories(query => 'rust', perpage => 5) r;
```

Wrappers still return `SETOF jsonb`, so they remain easy to join and filter.
