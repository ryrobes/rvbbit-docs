---
title: Overview
description: What RVBBIT is, where Beaverdam fits, and how to read the docs.
section: Start
navOrder: 10
sourceDocs:
  - ../rvbbit-sql/docs/RVBBIT_V1_RELEASE_PLAN.md
  - ../rvbbit-sql/docs/BEAVERDAM_RENAME_PLAN.md
---

RVBBIT is a Postgres extension for SQL-native semantic work. It lets you keep
ordinary tables, queries, and operational habits while adding model-backed
operators, embeddings, knowledge graph workflows, adaptive routing, and optional
storage acceleration.

The extension is not only a columnar table experiment. The storage layer is
useful, but the center of gravity is SQL as the control plane for AI and
workflow execution.

## Mental Model

Think about RVBBIT in four layers:

| Layer | Job |
| --- | --- |
| Postgres heap | The durable source of truth and universal fallback. |
| Semantic SQL | Operators, embeddings, KG helpers, MCP calls, model costs, and receipts. |
| Beaverdam | Optional storage acceleration beside heap: Parquet, Vortex, Lance, hot memory, layout variants, and time travel. |
| Warren | Capability/runtime nodes for managed sidecars and workflow execution. |

You can use semantic SQL without Beaverdam. You can use Beaverdam without
semantic operators. The pieces are designed to compose, not to force one
deployment shape.

## What Is Novel

The center of the system is not "an LLM function in SQL." The more interesting
piece is that model calls, tools, workflow steps, graph memory, retrieval, and
cost accounting can share one SQL-visible control plane:

- Cascades keep multi-step model workflows behind typed SQL functions.
- MCP tools can be called directly, joined as row sources, or used as Cascade
  steps.
- Built-in semantic functions cover retrieval, clustering, classification,
  deduplication, novelty detection, extraction, and evidence snippets.
- Receipts and cost ledgers make semantic calls inspectable after the fact.
- Beaverdam can accelerate analytical tables without changing the heap fallback
  contract.

## What The Docs Optimize For

Each topic starts with the path you should use first, usually a short SQL
example. The same page then goes deeper into catalog tables, knobs,
observability, and edge cases.

This is deliberate. RVBBIT has a lot of sharp, interesting machinery, but most
users should only need the first screen of a page to get moving.

## Good First Reads

1. [Positioning](/docs/positioning) for the product shape and mental model.
2. [Quickstart](/docs/quickstart) for the shortest path through extension
   setup, semantic SQL, and a Beaverdam table.
3. [Examples](/docs/examples) for compact SQL snippets across the system.
4. [Semantic SQL](/docs/semantic-sql) for user-defined model-backed operators.
5. [Semantic Functions](/docs/semantic-functions) for built-in retrieval,
   classification, clustering, extraction, and evidence primitives.
6. [Cascades](/docs/cascades) for multi-step operator workflows with gates,
   takes, validation, retries, and receipts.
7. [MCP Servers](/docs/mcp) for bringing external tool ecosystems into SQL.
8. [Receipts And Costs](/docs/receipts-costs) for audit and cost accounting.
9. [Beaverdam Storage](/docs/beaverdam) for file-backed acceleration and the
   heap fallback contract.
10. [Routing And Training](/docs/routing-training) for how RVBBIT picks an
   execution path.
11. [Operations](/docs/operations) for test, benchmark, and observability habits.
