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

## Where The Familiar Operators Come From

Some friendly names exist out of the box and some arrive with a pack — and a few
exist in *both* forms. The core extension seeds **LLM-backed** `means`, `about`,
`classify`, `extract`, `summarize`, `sentiment`, and `triples` as editable rows
in `rvbbit.operators`, so they work before you install anything. Installing a
capability pack adds **local-specialist-backed** operators that reuse some of
those same names (a reranker model behind `means`/`about`, DeBERTa behind
`classify`, GLiNER behind `extract`) and also adds names that are **pack-only**
and never core-seeded (`extract_pii`, `has_pii`, `semantic_score`,
`semantic_matches`, `similar_to`). When a name is exported by more than one
competing pack, whichever you install (or install last) provides that backing.

| Operator | Returns | Backing |
| --- | --- | --- |
| `means(text, criterion)` (infix `~~?` / `MEANS`) | bool | core seeds an LLM version; the BGE/MS-MARCO reranker packs (`rerank/bge-reranker-base`, `rerank/bge-reranker-v2-m3`, `rerank/ms-marco-minilm-l6-v2`) add a local reranker version |
| `about(text, topic)` (infix `~~%` / `ABOUT`) | float8 | core seeds an LLM version; same three rerank packs add a local reranker version |
| `semantic_score`, `semantic_matches` | float8 / bool | pack-only — the same three rerank packs (no infix form) |
| `classify(text, categories)`, `semantic_classify` | text | core seeds an LLM `classify`; `classify/deberta-v3-zero-shot` and `classify/deberta-v3-base-zero-shot` add local zero-shot versions |
| `extract(text, what)` | text | core seeds an LLM version; `extract/gliner-medium-v2.1` (GLiNER) adds a specialist version |
| `extract_entities`, `extract_pii`, `has_pii` | jsonb / text / bool | pack-only — `extract/gliner-medium-v2.1` (GLiNER) |
| `semantic_embed(text)`, `similar_to(left, right)` | jsonb / float8 | pack-only — local embedding packs (`embeddings/bge-small-en-v1.5`, `embeddings/bge-m3`, `embeddings/e5-small-v2`) |

Only `about` and `means` declare infix forms; `semantic_score` and
`semantic_matches` are plain functions. The per-pack raw wrappers (for example
`rerank_bge_base_score`, `embed_bge_small`, `summarize_bart`) keep their own
prefixed names — the pack's friendly operators above are the multi-step Cascades
built on top of them. For canonical retrieval, prefer `rvbbit.embed` /
`rvbbit.set_default_embedder(...)` over the exploratory `embed_*` raw wrappers.
See [/docs/semantic-functions](/docs/semantic-functions) for the extension's own
semantic primitives, [/docs/predictive-models](/docs/predictive-models) for the
trained-model and tabular-foundation packs, and [/docs/cascades](/docs/cascades)
for how multi-step operators are defined.

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

SELECT name, effective_status, heartbeat_age, inventory
FROM rvbbit.warren_node_effective_status
ORDER BY last_heartbeat DESC NULLS LAST
LIMIT 20;
```

`rvbbit.warren_node_effective_status` is a view over `rvbbit.warren_nodes` that
folds the reported status together with heartbeat freshness. Backend health for
individual specialists comes from `rvbbit.backends` and
`rvbbit.backend_probe(backend_name)`; runtime registration lives in
`rvbbit.python_runtimes` and `rvbbit.mcp_gateways`.

Warren is a runtime inventory: what can be installed, where it can run, what is
currently deployed, and what failed.
