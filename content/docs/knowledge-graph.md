---
title: Knowledge Graph
description: Store semantic memory as nodes, edges, evidence, triples, and graph-backed retrieval.
section: SQL Primitives
navOrder: 36
sourceDocs:
  - ../rvbbit-sql/docs/KNOWLEDGE_GRAPH.md
  - ../rvbbit-sql/docs/EMBEDDINGS.md
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
---

The RVBBIT knowledge graph is a SQL-visible memory layer for semantic systems.
It stores canonical nodes, aliases, edges, evidence, extraction runs, and merge
history.

It does not hide a graph database behind Postgres. It makes model-derived facts
inspectable, queryable, mergeable, and tied to receipts.

## Core Tables

| Table | Purpose |
| --- | --- |
| `rvbbit.kg_nodes` | Canonical entities and concepts. |
| `rvbbit.kg_aliases` | Alternate labels for nodes. |
| `rvbbit.kg_edges` | Directed facts between nodes. |
| `rvbbit.kg_evidence` | Provenance for nodes or edges. |
| `rvbbit.kg_merge_candidates` | Review queue for possible duplicate nodes. |
| `rvbbit.kg_extraction_runs` | Bulk extraction audit trail. |
| `rvbbit.kg_extraction_errors` | Per-row extraction failures. |

Evidence rows can record `query_id`, which lets a UI connect KG facts to
semantic receipts and MCP invocations.

## Assert Facts

```sql
SELECT rvbbit.kg_assert_node('customer', 'Acme Corp');
SELECT rvbbit.kg_assert_node('issue', 'late shipment');

SELECT rvbbit.kg_assert_edge(
  'customer',
  'Acme Corp',
  'reported',
  'issue',
  'late shipment',
  confidence => 0.92,
  evidence => '{"text":"Acme reported late shipments after the warehouse move.",
                "source":"support_ticket"}'::jsonb
);
```

## Read Context

```sql
SELECT *
FROM rvbbit.kg_context(
  'customer',
  'Acme Corp',
  max_depth => 2,
  include_evidence => true
);
```

`kg_context` is the main read primitive for graph-backed RAG and UI panels. Use
`kg_neighbors` for local traversal and `kg_paths` when the user asks how two
entities are connected.

## Extract Triples

```sql
SELECT *
FROM rvbbit.triples_rows(
  'Acme delayed renewal after repeated fulfillment misses.',
  'customer risk'
);
```

Ingest any triple-shaped query:

```sql
SELECT rvbbit.kg_ingest_triples($$
  SELECT *
  FROM rvbbit.triples_rows(
    'Acme delayed renewal after repeated fulfillment misses.',
    'customer risk'
  )
$$);
```

Or extract from a table:

```sql
SELECT *
FROM rvbbit.kg_ingest_table(
  'support_tickets'::regclass,
  pk_col => 'ticket_id',
  text_col => 'body',
  graph => 'support'
);
```

Extraction runs and errors are stored so bulk ingestion can be retried or
reviewed.

## Merge And Resolve

```sql
SELECT *
FROM rvbbit.kg_suggest_merges('customer', threshold => 0.86, limit_count => 100);

SELECT rvbbit.kg_accept_merge(42);
SELECT rvbbit.kg_reject_merge(43);
```

For fuzzy resolution, enable a Lance index per graph/kind:

```sql
SELECT rvbbit.kg_lance_enable('customer', graph => 'support', specialist => 'embed');
SELECT rvbbit.kg_lance_refresh('customer', graph => 'support');
```

Resolution order is exact alias, ready Lance index, then slower embedding scan.

## Trust Model

The KG preserves provenance when you write evidence and `query_id` as facts come
from model calls or tool output. That makes it possible to explain where graph
context came from instead of treating it as an unreviewable memory blob.

