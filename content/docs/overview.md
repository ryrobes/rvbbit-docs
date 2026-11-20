---
title: Overview
description: What RVBBIT is, how the pieces fit, and how to read the docs.
section: Start
navOrder: 10
sourceDocs:
  - ../rvbbit-sql/docs/RVBBIT_V1_RELEASE_PLAN.md
---

RVBBIT is a Postgres extension for SQL-native semantic work. It lets you keep
ordinary tables, queries, and operational habits while adding model-backed
operators, embeddings, knowledge graph workflows, and optional storage
acceleration and routing.

The extension is not only a columnar acceleration experiment. The storage
layer is useful, but the center of gravity is SQL as the control plane for AI
and workflow execution.

## Mental Model

Think about RVBBIT in four layers:

| Layer | Job |
| --- | --- |
| Postgres heap | The durable source of truth and universal fallback. |
| Semantic SQL | Operators, embeddings, KG helpers, MCP calls, model costs, and receipts. |
| Acceleration registry | Optional: registered heap tables get rebuildable columnar files beside them - Parquet, Vortex, Lance, hot memory, layout variants, and time travel - plus multi-engine routing (DataFusion, Duck). The old [GPU GQE](/docs/gqe) image is archived and is not in Calliope 1.2.1. |
| Warren | Capability/runtime nodes for managed sidecars and workflow execution. |

You can use semantic SQL without registering a single table for acceleration.
You can accelerate tables without using a single semantic operator. The pieces
are designed to compose, not to force one deployment shape.

Two more pieces round out the product:

- **Calliope.** RVBBIT ships as the SQL engine inside Calliope 1.2.1, one
  Compose project (Postgres 18 with the extension, the Duck worker, Data
  Rabbit, Warren, and the Hutch / Clover gateway). See
  [Quickstart](/docs/quickstart). There is no separate hosted Clover.
- **[Data Rabbit](/docs/data-rabbit)**, the SQL desktop in that install
  (`calliope-datarabbit`). It lights up on an rvbbit database: operators,
  receipts, routing, the knowledge graph, cubes, metrics.

## What Is Novel

The center of the system is not "an LLM function in SQL." The more interesting
piece is that model calls, tools, workflow steps, graph memory, retrieval, and
cost accounting can share one SQL-visible control plane:

- Cascades keep multi-step model workflows behind typed SQL functions.
- MCP tools can be called directly, joined as row sources, or used as Cascade
  steps.
- Semantic operators cover retrieval, clustering, classification, deduplication,
  novelty detection, extraction, and evidence snippets. The core extension seeds
  LLM-backed `means()`, `about()`, `classify()`, and `extract()`, while
  [capability packs](/docs/capability-packs) add local-specialist versions of
  those names. `extract_pii()` is not a core function. PII spans, when the
  optional GLiNER worker is enabled, are `clover_pii`. Reranker-backed
  `means()` / `about()` still come from the BGE reranker packs, which you
  deploy; they are not a substitute for the seeded LLM operators.
- Receipts and cost ledgers make semantic calls inspectable after the fact.
- The acceleration registry can accelerate analytical tables without changing
  the heap fallback contract.

## What The Docs Optimize For

Each topic starts with the path you should use first, usually a short SQL
example. The same page then goes deeper into catalog tables, knobs,
observability, and edge cases.

This is deliberate. RVBBIT has a lot of sharp, interesting machinery, but most
users should only need the first screen of a page to get moving.

## Good First Reads

1. [Positioning](/docs/positioning) for the product shape and mental model.
2. [Quickstart](/docs/quickstart) for the Calliope install, semantic SQL, and
   your first accelerated table.
3. [Examples](/docs/examples) for compact SQL snippets across the system.
4. [Semantic SQL](/docs/semantic-sql) for user-defined model-backed operators.
5. [Semantic Functions](/docs/semantic-functions) for built-in retrieval,
   classification, clustering, extraction, and evidence primitives.
6. [Cascades](/docs/cascades) for multi-step operator workflows with gates,
   takes, validation, retries, and receipts.
7. [MCP Servers](/docs/mcp) for bringing external tool ecosystems into SQL.
8. [Receipts And Costs](/docs/receipts-costs) for audit and cost accounting.
9. [Storage Acceleration](/docs/acceleration) for the acceleration registry
   and the heap fallback contract.
10. [Routing And Training](/docs/routing-training) for how RVBBIT chooses an
   execution path (rules and shadow observation today) and trains models.
11. [Data Rabbit](/docs/data-rabbit) for the desktop UI over all of it.
12. [Operations](/docs/operations) for test, benchmark, and observability habits.
