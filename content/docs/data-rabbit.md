---
title: Data Rabbit
description: The desktop UI — a local-first SQL desktop for any Postgres that lights up on an RVBBIT database.
section: Data Rabbit
navOrder: 64
sourceDocs:
  - ../rvbbit-lens/README.md
  - ../rvbbit-lens/docs/HOMEBASE.md
  - ../rvbbit-lens/docs/sql-viz-shorthand.md
  - ../rvbbit-lens/docs/canonical-viz-blocks.md
---

Data Rabbit is RVBBIT's desktop: a fast, local-first SQL client for Postgres
built around a windowed canvas instead of tabs. It works against **any**
Postgres — browse, query, chart, monitor — and when it detects the `pg_rvbbit`
extension on a connection, the whole rvbbit surface lights up: operator
studios, receipts and costs, adaptive routing, the knowledge graph, cubes,
metrics, capability deployment, and more.

It ships as part of the [Docker ensemble](/docs/quickstart) and serves on
port `3000`. It is a pure web app (Next.js) — no Electron shell — so "install"
is just opening `http://localhost:3000`. The container image is currently
published as `ghcr.io/ryrobes/rvbbit-lens` (the project's earlier name; the
image name follows the rename later).

![Data Rabbit — a desktop over any Postgres, lit up on an RVBBIT database: adaptive routing, model deploys, the operator canvas, the knowledge graph, and live receipts.](/shots/data-rabbit-desktop.png)

## Connections

Connections are managed in the **Connections** window (Database menu →
`Connections…`). Data Rabbit connects server-side through a pooled `pg`
driver, so credentials never reach the browser; they are stored in a config
file on the server (`connections.json` under the app's data directory — a
Docker volume in the ensemble, `~/.config/rvbbit-lens/` on a bare install)
with passwords redacted from every API response.

- Discrete fields (host, port, database, user, password, SSL mode) or a full
  `postgres://` connection string.
- Per-connection **SSH tunnel** support (bastion host, private key or
  password) for reaching databases behind a jump box.
- A **Test connection** action that reports schema/table counts before you
  save.
- The connection picker in the menu bar shows `label · database`; an `æ`
  badge marks rvbbit-enabled connections.

Two pool lanes keep the UI responsive: interactive queries get the main pool
while monitors and schema fan-out use a small isolated `meta` pool, so a
runaway dashboard can't starve your query.

## The Desktop

Windows live on an infinite pan/zoom canvas. Each window is draggable,
resizable, and minimizable, and the desktop itself is a first-class object:

- **Workspaces** — five scratch workspaces plus a Scene slot, switched with
  `Alt+1…5` and `Alt+6`. Occupancy dots in the menu bar show which are in use.
- **Scenes** — named, saveable desktops (Save / Save As / Open / Rename /
  Delete from the Scene tray). Scenes can be shared and forked between
  "homes".
- **Persistence** — the desktop persists locally first (browser storage) with
  a server-side shadow (SQLite), so state survives restarts and can follow a
  shareable home URL.
- **Present mode** — a read-only toggle that strips window chrome and editor
  rails and fits the canvas to the screen, for demos and wall dashboards.
- **Theming** — light/dark themes, a full **Palette editor** (Desktop menu →
  `Palette…`) over the OKLCH design tokens, and wallpaper support that can
  derive an accent palette from the image — including an optional
  vision-model path that themes the whole desktop from your wallpaper.
- **Fonts** — Desktop menu → Font: sans family, mono family, and UI size.
- **Dependency lines** — an optional overlay that draws curves between SQL
  windows that reference each other, so the reactive graph is visible.

## SQL Windows

`⌘N` (File → New SQL window) opens the core surface: a CodeMirror SQL editor
with completion and formatting over a virtualized result grid.

- **Run** with `⌘↩`; transaction controls (`BEGIN` / `COMMIT` / `ROLLBACK`);
  per-window query history; open a `.sql` file from disk.
- **Body tabs**: `rows` (grid), `profile` (column profiling), `chart`,
  `sql`, `explain` (visual plan graph), `steps` (semantic-operator step
  trace after a Cascade runs), and `app` (SQL-authored dashboard artifacts).
- **Export**: CSV, JSON, copy as `INSERT`s, plus "Save as view" and "Save as
  canonical viz block" on rvbbit connections. Large results page in with
  "Fetch 5000 more rows".
- **Ask mode** — type plain English; the window generates SQL through
  [`rvbbit.synth_sql`](/docs/text-to-sql) and shows the query before running
  it.
- **HTML Block mode** — chat-author an HTML app backed by named SQL queries
  (`rvbbit.html_block_turn`), rendered live in the `app` tab.

### Reactive Blocks And Params

Every SQL window has a **block name**, and any other window can reference it
as `{block_name}` — rewritten at run time as an inline subquery. Clicking a
cell in a grid (or a mark in a chart) emits a **filter param** onto the
workspace; windows subscribed to that param re-run automatically, and
filtering an upstream block cascades into every downstream reference. Block
chips are draggable: drop one on the canvas to spawn `SELECT * FROM {block}`,
or onto a rollup tile to pipeline it.

This is the desktop's quiet superpower: a handful of small SQL windows
compose into a live, cross-filtered dashboard without a dashboard builder.

### Charts

The `chart` tab auto-infers a Vega-Lite spec from your result columns, themed
from the active palette. Two editors sit on top:

- **Chart shelf** — a Tableau-style drag-and-drop shelf editor (fields onto
  x/y/color/size shelves, aggregate and time-unit pickers) that round-trips
  with the underlying Vega-Lite spec; an "Edit spec" YAML pane is always
  available for full control.
- **Rollup shelf** — drag column chips onto group-by / measure / pivot /
  top-N tiles to generate aggregation SQL, including semantic-operator
  measures on rvbbit connections.

Chart marks participate in the param system — clicking a bar filters
downstream windows, same as clicking a grid cell.

### Time Travel Scrubber

On an rvbbit connection, tables registered for
[acceleration](/docs/acceleration) get a **time-travel scrubber**: a
strata-style timeline of the table's generations (built from
`rvbbit.time_travel_timeline`, so it never scans data). Drag the handle to
pin the window to an `AS OF` moment — the editor is rewritten with the
`-- rvbbit: as_of = '…'` comment and re-run — hover ticks for snapshot cards,
or type an exact datetime. See [Time Travel](/docs/time-travel).

## Finding Things

- **Command palette** (`⌘P`) — fuzzy quick-open over tables, saved views,
  windows, and tools.
- **Scry** (`⌘K`) — a full-screen semantic search canvas. Each search stage
  scopes *within* the previous stage's results ("tables about shipping …
  within those, columns about delay"), and editing an upstream stage re-flows
  everything downstream. Results spawn into data windows.
- **Finder** (`⌘F`) — a schema tree grouped by namespace with search, DDL
  view, and inline table-activity sparklines.
- **Data Search** — free-text semantic search over the
  [catalog](/docs/catalog), ranking tables and columns by what their data is
  about.

## The RVBBIT Cockpits

On an rvbbit connection the Database menu grows a full set of windows, each a
thin, live view over the SQL surfaces documented elsewhere in these docs:

| Window | Over | Docs |
| --- | --- | --- |
| Receipts / Costs / Cache | `rvbbit.receipts`, cost ledgers, embedding/result caches | [Receipts And Costs](/docs/receipts-costs) |
| Operator Studio | `rvbbit.operators` — author, inspect, and try operators on a canvas, with step graphs and receipt timelines | [Semantic SQL](/docs/semantic-sql), [Cascades](/docs/cascades) |
| Specialists / Model Studio | model backends, training runs, evaluations | [Providers](/docs/providers), [Predictive Models](/docs/predictive-models) |
| Adaptive Routing | route decisions, training, profiles, workload layouts, freshness | [Routing And Training](/docs/routing-training) |
| MCP Servers / MCP Incoming | server registry, tools, invocations; incoming agent traffic | [MCP Servers](/docs/mcp) |
| Capabilities | the capability catalog, install graphs, and a Hugging Face deploy flow | [Capability Packs](/docs/capability-packs) |
| Warren | nodes, jobs, deployments | [Warren](/docs/warren) |
| Duck Monitor | Duck/Vortex worker telemetry | [Duck/Vortex Worker](/docs/duck-vortex-worker) |
| Knowledge Graph (browser, graph explorer, extraction runs, merge review) | `rvbbit.kg_*`, with a force-directed graph canvas | [Knowledge Graph](/docs/knowledge-graph) |
| Metrics (catalog, creator, inspector, board) | metric definitions, bitemporal history | [Metrics And KPIs](/docs/metrics-kpis) |
| Cube Studio (catalog, creator, inspector, proposals) | cube definitions, health, enrichment | [Cubes](/docs/cubes) |
| Alerts | alert rules, state, queue, firing history | [Alerts](/docs/alerts) |
| Drift | catalog drift detection | [Catalog](/docs/catalog) |
| Query Lens | per-query drill-down: receipts, lineage, cost | [Receipts And Costs](/docs/receipts-costs) |
| Scheduler tray | pg_cron jobs, with one-click presets for the maintenance entrypoints | [Accelerator Freshness](/docs/accelerator-freshness) |

The Metric Inspector is a nice example of the house style: a definition-time
version picker on one axis and a data-time time-travel scrubber on the other,
so "what did this KPI say, under which rule, over which data" is one window.

![The Adaptive Routing cockpit — the planner choosing among native, DataFusion, Duck, and heap per query shape, with live timings.](/shots/routing-cockpit.png)

## Postgres Tools

The non-rvbbit toolset works on any connection:

- **Postgres Monitor** — live activity (polling stands down when its
  workspace is parked).
- **Postgres Admin** — object management (roles, grants, tables).
- **System Objects** and **Extensions** browsers.
- **Notification Center** — `LISTEN`/`NOTIFY` streamed to toasts and a feed.
- **CSV Import** — streaming multi-gigabyte CSV import with dialect and date
  format inference and generated DDL.
- **View Apps** — save any SQL statement as a launchable desktop "app" with
  its own icon.

## SQL-Authored Dashboards

Results can *be* UI: a statement that returns `rvbbit_artifact = 'ui'` rows
renders as dashboard tiles — charts, metric cards, KPI gauges, sparklines,
tables, filter controls, action buttons — laid out by weight. Filter controls
bind back into the same param system as everything else. **Viz Blocks** makes
these reusable: versioned SQL templates stored in `rvbbit.viz_block_defs`
(`rvbbit.define_viz_block`, `rvbbit.preview_viz_block`) that can be linked to
tables and shipped with the database rather than the client. Published
dashboards render in a sandboxed **Dashboards** window with a read-only query
bridge.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘N` / `Ctrl+N` | New SQL window |
| `⌘↩` | Run the focused SQL editor |
| `⌘P` / `Ctrl+P` | Command palette |
| `⌘K` / `Ctrl+K` | Scry semantic search canvas |
| `⌘F` / `Ctrl+F` | Finder (schema browser) |
| `⌘Z` / `⇧⌘Z` | Undo / redo desktop actions |
| `Alt+1…5`, `Alt+6` | Switch workspace / Scene slot |
