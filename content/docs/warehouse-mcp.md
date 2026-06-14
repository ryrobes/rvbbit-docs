---
title: Warehouse MCP Server
description: Expose your warehouse to Claude (Cowork, Code, Desktop) as an MCP server — semantic data discovery, blessed bitemporal metrics, and a read-only, validated, audited SQL path, all schema-scoped so the assistant never sees rvbbit internals.
section: Operations
navOrder: 86
sourceDocs:
  - ../rvbbit-sql/docs/WAREHOUSE_MCP_PLAN.md
  - ../rvbbit-sql/docs/WAREHOUSE_MCP_PHASE0.md
  - ../rvbbit-sql/docs/MCP.md
---

The [MCP page](/docs/mcp) is about rvbbit calling **out** to MCP servers as
[capabilities](/docs/capability-packs). This is the opposite direction: rvbbit
*becomes* an MCP server so an assistant — Claude Cowork, Claude Code, Claude
Desktop — can safely query **your** warehouse. It's the safe-analyst shape:
**discover → blessed numbers → validate → read-only run**, every call scoped to a
read-only role, schema-filtered to hide rvbbit/`pg_*`/`information_schema`
internals, and written to a receipt so every read is auditable and reproducible.

It builds directly on the SQL primitives in these docs — [data search](/docs/catalog),
[metrics](/docs/metrics-kpis), [cubes](/docs/cubes), and the
[route planner](/docs/routing-training) — and exposes them as a small set of
tools.

## The Tools

| Tool | Does | Backed by |
| --- | --- | --- |
| `search_data(query, limit?, schema?)` | Semantic discovery — find the right tables/columns/metrics/cubes by what the data is *about*, grounded with samples + stats. Curated metrics/cubes outrank raw tables. | [`data_search`](/docs/catalog) + `catalog_docs` |
| `describe_table(table)` | Columns + sample rows + per-column stats + freshness. | `information_schema` + `pg_stats` + [`accel_freshness`](/docs/accelerator-freshness) |
| `list_metrics(category?, search?)` / `get_metric(name)` | Browse the blessed [metric](/docs/metrics-kpis) catalog and read a definition. | `metric_defs` / `metric_sql` |
| `metric(name, params?, as_of?, def_as_of?)` | A **governed number** — the bitemporal metric value + KPI verdict. | `rvbbit.metric()` + `check_metric` |
| `validate_sql(sql, as_of?)` | Plan a query *without running it* (the self-correct loop). | [`route_explain`](/docs/routing-training) |
| `run_sql(sql, as_of?, limit?)` | **Read-only** execute: `route_explain` → `safe_select` gate → run. Rejects anything that isn't a single read-only `SELECT`/CTE. | the [route engine](/docs/routing-training) |

Non-technical roles get discovery + blessed metrics (`search_data`,
`list_metrics`/`get_metric`, `metric`) — the numbers are governed, so they can't
be misquoted. `validate_sql`/`run_sql` (free exploration) are analyst+.

## Why It's Safe

- **Read-only role.** Every call runs on a scoped `warehouse_reader` role inside
  `BEGIN READ ONLY` with a `statement_timeout`. The role has no write grants —
  belt *and* suspenders with the `safe_select` parser gate.
- **Schema-scoped.** rvbbit lives in one database; the serve layer filters
  `rvbbit` / `pg_*` / `information_schema` out of every discovery and describe
  result. The assistant sees your business schemas, nothing else.
- **Blessed numbers.** `metric(...)` returns a value the way *you* defined it —
  versioned definition, bitemporal `as_of`, KPI verdict — so a headline figure is
  reproducible, not re-derived ad hoc.
- **Audited + reproducible.** Each call writes a receipt
  (`{caller, tool, sql, engine, rows, elapsed_ms, ts}`); `as_of` flows through the
  engine's [time-travel](/docs/time-travel) path, so answers can generally be
  replayed. Historical (`as_of`) replay rides the experimental time-travel path
  and is still maturing — treat it as best-effort.

The same `metric` and `search_data` you'd call in SQL are what the tools wrap:

```sql
-- what get_metric / metric expose, governed + bitemporal:
SELECT * FROM rvbbit.metric('daily_revenue', '{}'::jsonb, def_as_of => now(), data_as_of => now());

-- what search_data wraps (curated results rank first):
SELECT kind, schema_name, rel_name, col_name, score
FROM   rvbbit.data_search('customers who churned in europe', k => 8);
```

## Run It

The server ships as its own Docker image, wired into the opt-in `warehouse`
compose profile, speaking remote **streamable-HTTP**. Auth is either a single
shared key (`WAREHOUSE_MCP_KEY`) or a self-contained OAuth flow
(`WAREHOUSE_PUBLIC_URL` + `WAREHOUSE_LOGIN_PASSWORD` + `WAREHOUSE_JWT_SECRET`,
for native connectors):

```bash
make warehouse-up          # start warehouse-mcp ('warehouse' profile)
make warehouse-tunnel-up   # optional: add a Cloudflare quick-tunnel for instant HTTPS
make warehouse-url         # print the current tunnel URL (changes per restart)
```

Point a client at it:

- **Claude Desktop / Code** — add it as a remote MCP server (URL + the
  `Authorization: Bearer <key>` header).
- **Claude Cowork** — register the URL; artifacts call tools via
  `window.cowork.callMcpTool('mcp__<id>__run_sql', { sql })` (see the dashboard
  template the server ships).

For a fixed schema scope, point the server's read-only role at the schemas you
want exposed; everything else stays invisible.

## Notes

- **Deliberately read-only today** — no writes, no DDL, and a single scoped
  role. Per-user roles, PII redaction, an `ask`/text-to-SQL tool, and a richer
  bitemporal demo are not yet available.
- The serve layer extends `rvbbit-mcp-gateway`; the backing functions are the
  ordinary rvbbit SQL surfaces documented elsewhere, so anything you can do in
  SQL the warehouse can expose (and gate) through MCP.
