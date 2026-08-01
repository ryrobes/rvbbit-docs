---
title: Warehouse MCP Server
description: Expose your warehouse to Claude (Cowork, Code, Desktop) as an MCP server - semantic data discovery, blessed bitemporal metrics, and a read-only, validated, audited SQL path, all schema-scoped so the assistant never sees rvbbit internals.
section: Operations
navOrder: 86
sourceDocs:
  - ../rvbbit-sql/docs/WAREHOUSE_MCP_PLAN.md
  - ../rvbbit-sql/docs/WAREHOUSE_MCP_PHASE0.md
  - ../rvbbit-sql/docs/MCP.md
---

The [MCP page](/docs/mcp) is about rvbbit calling **out** to MCP servers as
[capabilities](/docs/capability-packs). This is the opposite direction: rvbbit
*becomes* an MCP server so an assistant - Claude Cowork, Claude Code, Claude
Desktop - can safely query **your** warehouse. It's the safe-analyst shape:
**discover → blessed numbers → validate → read-only run**, the ad-hoc SQL path
read-only, schema-filtered to hide rvbbit/`pg_*`/`information_schema` internals,
and logged so every call is auditable and reproducible.

It builds directly on the SQL primitives in these docs - [data search](/docs/catalog),
[metrics](/docs/metrics-kpis), [cubes](/docs/cubes), [alerts](/docs/alerts), and
the [route planner](/docs/routing-training) - and exposes them as a set of
governed tools.

## The Tools

| Tool | Does | Backed by |
| --- | --- | --- |
| `search_data(query, limit?, schema?)` | Semantic discovery - find the right tables/columns/metrics/cubes by what the data is *about*, grounded with live samples + per-column stats + freshness. Curated metrics/cubes outrank raw tables; objects employees actually query climb. | usage-weighted [`data_search`](/docs/catalog) + `pg_stats` + `accel_freshness` |
| `describe_table(table)` | Columns + sample rows + per-column stats + freshness. | `information_schema` + `pg_stats` + [`accel_freshness`](/docs/accelerator-freshness) |
| `list_metrics(category?, search?)` / `get_metric(name)` | Browse the blessed [metric](/docs/metrics-kpis) catalog and read a definition. | `metric_defs` / `metric_sql` |
| `metric(name, params?, as_of?, group_by?)` | A **governed number** - the blessed [metric](/docs/metrics-kpis) value (data-time `as_of` pins the snapshot); `group_by` slices a dimensional metric per segment. | `rvbbit.metric()` / `rvbbit.metric_by()` |
| `cube_pivot(cube, rows?, cols?, measures?)` | Build a grouped table or cross-tab from one or more cube dimensions and aggregated numeric fields; a governed metric definition is optional. | validated read-only aggregation over `cubes.<name>` |
| `validate_sql(sql, as_of?)` | Plan a query *without running it* (the self-correct loop) - returns the chosen engine + `safe_select` flag + referenced tables. | [`route_explain`](/docs/routing-training) |
| `run_sql(sql, as_of?, limit?)` | **Read-only** execute: `route_explain` → `safe_select` gate → read-only run with an enforced `LIMIT`. Rejects anything that isn't a single read-only `SELECT`/CTE. | the [route engine](/docs/routing-training) |

Non-technical roles lean on discovery + blessed metrics (`search_data`,
`list_metrics`/`get_metric`, `metric`) - the numbers are governed, so they can't
be misquoted. `validate_sql`/`run_sql` give analysts free exploration.

Those six are the core; the shipped server wraps a wider surface on top of the
same governed substrate - all thin compositions over functions documented
elsewhere:

- **Cubes** - `list_cubes`/`describe_cube` browse curated subject-area tables;
  `propose_cube`/`propose_metric` draft (and dry-run) candidates into a review
  queue without creating anything; `edit_cube`/`edit_metric` append reversible
  versions. See [cubes](/docs/cubes) and [metrics](/docs/metrics-kpis).
- **Metric monitoring + opinionated views** - `materialize_metric`,
  `metric_history`, `breaching_kpis`, `metric_dimensions`, plus pre-shaped
  `scoreboard` / `pivot` / `compare` (each returns data already shaped, since the
  MCP can't render UI).
- **Alerts** - read state (`list_alerts`, `breaching_alerts`, `alert_events`) and
  operate the controls (`mute_alert`, `set_alert_cadence`, `set_alerts_enabled`,
  manual sweep/worker). Authoring whole rules stays a human bless path. See
  [alerts](/docs/alerts).
- **Dashboards + document brain** - `dashboard_template`/`publish_dashboard` let a
  Cowork artifact persist as a shareable page; the role-gated document brain
  (`ask_brain`, `brain_*`) filters to the caller's permitted docs *before* the
  vector search.

### Agent ergonomics (no local glue needed)

The tool surface is designed so a remote agent never needs shell or Python
glue around it:

- **Publish by handle.** `upload_artifact(content)` stages a large HTML/source
  payload server-side (chunkable with `append=true`, `sha256` echoed back for
  integrity) and returns an `artifact_id`; `publish_dashboard`,
  `update_dashboard`, `create_live_app`, and `update_live_app` all accept
  `source_artifact_id` instead of inline `html` - no re-transmitting a large
  document through every call, and no reading files off the agent's machine.
  Artifacts expire after ~48 hours; they're a staging area, not storage.
- **Validate without hauling rows.** `run_sql_multi(queries,
  result_mode='summary', preview_rows?)` returns per-query row counts, column
  names, truncation, timing, and a tiny preview - instead of hundreds of KB of
  rowsets - with per-query errors still isolated under their name.
- **Captures you can actually see.** `capture_live_app(slug,
  return_image=true)` returns the PNG as MCP image content (the saved path is
  on the server host, useless to a remote agent), and every HTML capture runs
  the app against the **live** query bridge and reports `bridge` health:
  queries run/failed (with per-query timing), console errors, and page errors
  - one call verifies the page renders *and* its data layer works.
- **A richer chart primitive without a framework lock-in.** The optional
  `tanstack_chart_template` returns a complete framework-free dashboard using
  the bundled TanStack Charts runtime, with interactive marks and exact
  query/row metadata for Artifact Lens. The ordinary dashboard template and
  existing Chart.js artifacts remain supported and unchanged.
- **One bad tool never benches the server.** Unexpected tool exceptions come
  back as the same structured `{"error": ...}` shape every tool uses, not
  protocol-level failures that trip client-side circuit breakers.

## Why It's Safe

- **Read-only execution.** `run_sql` runs in a read-only session
  (`default_transaction_read_only = on`) with a `statement_timeout`, gated first
  by the `safe_select` parser check (single `SELECT`/CTE, no DML/DDL) - belt
  *and* suspenders. Point the server's connection at a role with no write grants
  to make it air-tight; today the server uses one shared connection (per-user
  role mapping is still planned).
- **Schema-scoped.** rvbbit lives in one database; the serve layer filters
  `rvbbit` / `pg_*` / `information_schema` out of every discovery and describe
  result. The assistant sees your business schemas, nothing else.
- **Blessed numbers.** `metric(...)` returns a value the way *you* defined it -
  versioned definition, bitemporal `as_of`, KPI verdict - so a headline figure is
  reproducible, not re-derived ad hoc.
- **Audited + reproducible.** Every tool call is logged to `rvbbit.mcp_activity`
  (caller, tool, args incl. the SQL/query, objects touched, rows, engine,
  `elapsed_ms`, `as_of`, a compact result summary) - the audit trail and the raw
  material for usage-weighted ranking. `as_of` flows through the engine's
  [time-travel](/docs/time-travel) path, so answers can generally be replayed;
  historical replay rides the time-travel path and is still maturing - treat it
  as best-effort.

The same `metric` and `search_data` you'd call in SQL are what the tools wrap:

```sql
-- what get_metric / metric expose, governed + bitemporal
-- (positional args: name, params, def-time, data-time):
SELECT * FROM rvbbit.metric('daily_revenue', '{}'::jsonb, now(), now());

-- what search_data wraps (the MCP uses the usage-weighted variant;
-- the underlying ranked discovery is data_search, curated results first):
SELECT kind, schema_name, rel_name, col_name, score
FROM   rvbbit.data_search('customers who churned in europe', k => 8);
```

## Run It

The `4.2.6` server ships as its own Docker image, wired into the opt-in `warehouse`
compose profile, speaking remote **streamable-HTTP**. Auth is either a single
shared key (`WAREHOUSE_MCP_KEY`) or a self-contained OAuth flow
(`WAREHOUSE_PUBLIC_URL` + `WAREHOUSE_LOGIN_PASSWORD` + `WAREHOUSE_JWT_SECRET`,
for native connectors):

```bash
make warehouse-up          # start warehouse-mcp ('warehouse' profile)
make warehouse-tunnel-up   # optional: add a Cloudflare quick-tunnel for instant HTTPS
make warehouse-url         # print the current tunnel URL (changes per restart)
```

With the downloadable Compose file:

```bash
export RVBBIT_VERSION=4.2.6
export WAREHOUSE_PUBLIC_URL="https://warehouse.example.com"
export WAREHOUSE_LOGIN_PASSWORD="$(openssl rand -hex 16)"
export WAREHOUSE_JWT_SECRET="$(openssl rand -hex 32)"
export WAREHOUSE_MCP_KEY="$(openssl rand -hex 24)"
docker compose --profile warehouse up -d
```

Point a client at it:

- **Claude Desktop / Code** - add it as a remote MCP server (URL + the
  `Authorization: Bearer <key>` header). Note for hand-rolled clients: the server speaks
  streamable-HTTP MCP - after `initialize`, echo the returned
  `mcp-session-id` header on every subsequent request (MCP client libraries
  do this automatically).
- **Claude Cowork** - register the URL; artifacts call tools via
  `window.cowork.callMcpTool('mcp__<id>__run_sql', { sql })` (see the dashboard
  template the server ships).

## Published Hub, Artifact Lens, And Calliope

OAuth mode also serves a browser-facing artifact hub at `/` (or `/gallery`
behind a unified Data Rabbit origin). It lists published dashboards, apps, and
decks with cached captures, while the MCP and browser surfaces share the same
authenticated identity. Artifact visibility is currently company-wide;
Calliope session history is private to the OAuth email.

Hosted native dashboard routes inject **Artifact Lens** at the serving layer,
without adding framework boilerplate to the dashboard itself. When all query
sources support retained RVBBIT history, its Data Time view applies a debounced
AS-OF snapshot across the dashboard. Trace mode inventories selectable rendered
objects, binds a value or chart mark to its exact query evidence where possible,
and can run that read-only SQL in an inspection drawer. **Analyze with
Calliope** creates a fresh exploration session pinned to the artifact version,
selected object, SQL, execution metadata, and a bounded result preview. The
dashboard remains a normal full-page HTML/JavaScript artifact.

Newly published HTML artifacts are also queued for a non-blocking semantic
compiler. It inventories rendered business values, validates independently
replayable read-only SQL for the values it can prove, and stores the result as
an enriched manifest overlay. Publication never waits for that agent run and
the artifact source is never rewritten. Set `WAREHOUSE_SEMANTIC_ENRICHMENT=0`
to disable it, or override `WAREHOUSE_SEMANTIC_ENRICH_MODEL` when the default
`openai/gpt-5.6-sol` route is not available in your provider configuration.

Calliope is optional and disappears completely unless both Hermes settings are
present:

```bash
# Hermes runs on the Docker host; Linux host-gateway support is in the Compose file.
export WAREHOUSE_HERMES_URL="http://host.docker.internal:8642"
export WAREHOUSE_HERMES_API_KEY="..."       # Hermes API_SERVER_KEY
export WAREHOUSE_HERMES_MEMORY_KEY="company" # optional shared company memory

# Shared file handoff for documents/data created by Hermes.
export WAREHOUSE_CALLIOPE_EXPORT_DIR="/tmp/rvbbit-hermes-exports"
mkdir -p "$WAREHOUSE_CALLIOPE_EXPORT_DIR"

docker compose --profile warehouse up -d
```

Hermes keeps its normal/default agent profile and shared memory. Warehouse keeps
the email-owned session index, mirrored turn prose, attachments, and immutable
artifact projections. Configure that Hermes profile with this Warehouse
server's `/mcp` URL and `WAREHOUSE_MCP_KEY`, then enable its API server:

```bash
hermes config set platforms.api_server.enabled true
hermes config set platforms.api_server.extra.host 127.0.0.1
hermes config set platforms.api_server.extra.port 8642
hermes config set platforms.api_server.extra.model_name openai/gpt-5.6-sol
hermes config set platforms.api_server.extra.key "$WAREHOUSE_HERMES_API_KEY"
hermes gateway run --accept-hooks
```

Calliope separates chat from a newest-first, versioned artifact history. Query
results, charts, dashboards, captures, annotated images, and generated files
become stage surfaces linked to the message that created them. Cube surfaces
include an auto-refreshing multi-dimension pivot builder. Design Profiles turn
reference images, a URL capture, an existing artifact, and editable Markdown
into reusable, versioned dashboard style contracts.

The scratchpad header includes a company evidence resolver that searches the
caller's ACL-filtered Document Brain, published artifacts and their enriched
dashboard objects, and warehouse semantics in one pass. Search sets become
durable scratchpad surfaces rather than chat noise. Select individual results
for precise grounding, or press **Ask Calliope** with nothing selected to attach
the whole search as one compact query/count/gist/provenance index. Warehouse
rehydrates every handle from the email-owned session before it reaches Hermes;
the browser cannot forge evidence text.

For a fixed schema scope, set `WAREHOUSE_SCHEMAS` to a CSV allowlist of the
schemas you want exposed (on top of the always-on `rvbbit`/`pg_*`/
`information_schema` filter); everything else stays invisible.

## Notes

- **Ad-hoc SQL is read-only.** `run_sql`/`validate_sql` accept only a single
  read-only `SELECT`/CTE - no writes, no DDL. (Governed write paths do exist, but
  only through the structured tools - `propose_*`/`edit_*`, `publish_dashboard`,
  `brain_ingest` - which call blessed rvbbit functions, not raw SQL.) Shared mode
  uses one connection; Postgres-role/Burrow deployments can map verified email
  identities to database roles. PII masking on samples and per-role cost caps
  remain deployment concerns.
- The server runs as a standalone service built on FastMCP (foldable into the
  MCP gateway later); the backing functions are the ordinary rvbbit SQL surfaces
  documented elsewhere, so anything you can do in SQL the warehouse can expose
  (and gate) through MCP.
