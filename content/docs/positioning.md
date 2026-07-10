---
title: Positioning
description: What RVBBIT is for, what acceleration adds, and where the system should stay boring.
section: Start
navOrder: 15
sourceDocs:
  - ../rvbbit-sql/docs/RVBBIT_V1_RELEASE_PLAN.md
  - ../rvbbit-sql/docs/DOCS_MARKETING_GAP_PLAN.md
  - ../rvbbit-sql/docs/RVBBIT_PRODUCTION_SHAPE.md
---

RVBBIT is not trying to replace Postgres. It makes Postgres a better control
plane for semantic work, model-backed workflows, retrieval, tool calls, audit
receipts, and optional analytical acceleration.

The sharpest message is simple: keep the relational contract, then add AI and
multi-engine execution where they make sense.

## The Product Shape

| Subsystem | What it does | Required? |
| --- | --- | --- |
| Semantic SQL | Operators, Cascades, embeddings, KG, MCP, receipts, providers. | Yes, for the main RVBBIT value. |
| Acceleration registry | Optional storage acceleration with heap fallback. | No. Use it for analytical/reporting tables. |
| Warren | Capability packs and runtime nodes. | No. Use it when a capability needs a managed worker. |
| Routing | Chooses execution paths from query shape, profile data, and available files. | Only for accelerated tables. |
| Data Rabbit | The desktop UI over any Postgres, with cockpits for the rvbbit surface. | No, but it is the fastest way to see the system. |

This split matters for users. A team can adopt semantic SQL against ordinary
heap tables without registering anything for acceleration. A team can
accelerate fast read-heavy tables without putting model calls in those
queries.

One deployment note: for v1, RVBBIT ships as a single Docker ensemble
(Postgres + extension + workers + UI) rather than as separately installable
pieces - see [Quickstart](/docs/quickstart). The subsystems above are still
opt-in at the SQL level; the ensemble just removes install friction.

## Why SQL-Native AI

Most AI data stacks move context out of the database, run logic somewhere else,
then write a result back. RVBBIT makes a different bet:

- prompts and workflows should be catalog-visible,
- tool calls should be joinable and auditable,
- embeddings and KG context should compose with ordinary SQL,
- every expensive or external call should leave a receipt,
- heap should remain the durable fallback.

That keeps AI work closer to the operational system that already owns identity,
access, backups, transactions, and data modeling.

## Where Acceleration Fits

Acceleration is a registry beside the heap, not a table type: registered
tables stay ordinary heap tables while RVBBIT maintains Parquet, Vortex,
Lance, hot memory, and layout variants for them - with Postgres heap as the
source of truth throughout.

Use it for:

- wide reporting tables,
- analytical workloads that scan, aggregate, or sort,
- read-heavy materialized datasets,
- vector and time-travel workflows that benefit from sidecar files.

Be careful with:

- high-churn OLTP tables,
- workloads where rebuild latency matters more than read latency,
- tables where heap indexes already answer the workload cheaply.

## What Should Stay Boring

RVBBIT's novelty should not leak into the durability contract. Ordinary SQL
should keep working. `pg_dump` and restore should keep working. If an accelerator
file is absent, dirty, or unhealthy, heap remains the reliable path.

The release direction is to make the interesting parts observable rather than
mystical: catalogs for models and providers, receipts for calls, phase logs for
acceleration, routing decisions in query history, and worker telemetry for
sidecars.

## Elevator Pitch

RVBBIT turns Postgres into a SQL-native AI runtime: semantic functions,
multi-step Cascades, MCP tools, embeddings, knowledge graphs, receipts,
provider catalogs, and optional storage acceleration across CPU and
[GPU](/docs/gqe) engines, all while keeping heap as the source of truth.
