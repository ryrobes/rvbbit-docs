# Lens screenshots

Drop PNGs here for the docs and landing-page screenshot slots. Homepage slots
render a labeled placeholder until the file exists, then swap to the image
automatically (see `components/Screenshot.tsx`). Most current screenshots use a
1440x900 desktop capture so they work in both markdown docs and framed homepage
slots.

| File | Slot | Should show |
| --- | --- | --- |
| `data-rabbit-desktop.png` | Data Rabbit hero / docs overview | The Data Rabbit desktop with real SQL rows, Finder, Data Search, and Adaptive Routing over a live RVBBIT database. |
| `operator-canvas.png` | Cascades / Operator Studio | One operator's editable graph, prompts, trust metadata, and execution rail. |
| `routing-cockpit.png` | Lens showcase | The Adaptive Routing cockpit — the planner choosing native / DataFusion / Duck / heap per query, with live timings. |
| `model-studio.png` | Lens showcase | Model Studio — the SQL-to-model authoring form, task selection, training options, and queue controls. |
| `scry.png` | Lens showcase | Scry — the graph explorer spidering from a table to its columns / related entities. |
| `data-search.png` | Lens showcase | Data Search — free-text semantic search over the catalog, ranking tables/columns by what their data is about. |
| `capabilities.png` | Capability packs docs / showcase | The curated capability catalog, pack metadata, operator names, test counts, and deploy controls. |
| `connections.png` | Data Rabbit docs | The connection manager with pooled DB connections and RVBBIT status. |
| `desktop-canvas.png` | Data Rabbit docs | Multiple SQL/chart windows on the desktop canvas. |
| `sql-window.png` | Data Rabbit docs | SQL editor plus virtualized result grid. |
| `reactive-blocks.png` | Data Rabbit docs | Reactive SQL blocks with `{block}` references and lineage. |
| `chart-shelf.png` | Data Rabbit docs | Chart shelf controls over real query results. |
| `receipts-costs.png` | Receipts and costs docs / homepage | Receipts and costs cockpit with operator/model rollups, calls, tokens, cost, latency, errors, and recent activity. |
| `time-travel-scrubber.png` | Data Rabbit docs | Table time-travel controls over an accelerated table. |
| `finder.png` | Data Rabbit docs | Schema browser and object tree. |
| `csv-import.png` | Data Rabbit docs | CSV import inspector with inferred columns and generated target table. |
| `sql-dashboard.png` | Data Rabbit docs | SQL-authored dashboard artifact rows rendered in the app surface. |
