# Lens screenshots

Drop PNGs here to fill the landing-page screenshot slots. Each slot renders a
labeled placeholder until its file exists, then swaps to the image automatically
(see `components/Screenshot.tsx`). Wide shots want a ~16:9-ish crop; the rest are
flexible. Dark UI on a dark site looks best with a thin frame already applied by
the `.shot` style — just export the window/desktop cleanly.

| File | Slot | Should show |
| --- | --- | --- |
| `lens-desktop.png` | Hero proof (wide) | The Lens desktop — a few windows open (routing, metrics, KG, an operator) over a live DB. The "wow, it's a whole environment" shot. |
| `operator-lens.png` | Cascades section | One operator's cascade: its steps (guard → model call → validator → retry → tool call) and a live receipt for a row. Replaces the old animation. |
| `routing-cockpit.png` | Lens showcase | The Adaptive Routing cockpit — the planner choosing native / DataFusion / Duck / heap per query, with live timings. |
| `model-studio.png` | Lens showcase | Model Studio — spinning up a HuggingFace specialist / fine-tune and wiring it to a SQL operator. |
| `scry.png` | Lens showcase | Scry — the graph explorer spidering from a table to its columns / related entities. |
| `data-search.png` | Lens showcase | Data Search — free-text semantic search over the catalog, ranking tables/columns by what their data is about. |
