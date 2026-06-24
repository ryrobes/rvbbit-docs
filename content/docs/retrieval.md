---
title: Retrieval
description: Embeddings, KNN search, materialization, Lance, and SQL patterns for RAG.
section: SQL Primitives
navOrder: 33
sourceDocs:
  - ../rvbbit-sql/docs/EMBEDDINGS.md
  - ../rvbbit-sql/docs/LOCAL_EMBEDDINGS.md
  - ../rvbbit-sql/docs/KNOWLEDGE_GRAPH.md
  - ../rvbbit-sql/docs/LAKEHOUSE.md
---

RVBBIT treats embeddings as SQL primitives. You can embed text, compare text,
search a table column semantically, and combine retrieval with KG context or
model-backed operators.

## Start With The Default Backend

Fresh installs seed an `embed` backend that runs the `local_embed` transport
(in-process CPU embeddings via FastEmbed/ONNX, default model
`bge-small-en-v1.5`). SQL resolves to that backend unless you pass another
specialist name.

```sql
SELECT name, transport, endpoint_url, batch_size, transport_opts
FROM rvbbit.backends
WHERE name = 'embed';

SELECT rvbbit.embed('refund request after damaged shipment');
```

The local default is meant to make development and demos work without a paid
embedding API. Production deployments can replace the `embed` backend without
changing application SQL.

## Table Search

```sql
SELECT *
FROM rvbbit.knn_text(
  'tickets'::regclass,
  'body',
  'contract cancellation risk',
  20
);
```

For repeated search, precompute distinct column values:

```sql
SELECT rvbbit.materialize_embeddings('tickets'::regclass, 'body');
```

Then use the same `knn_text` call. The cache and materialized rows are shared
SQL-visible state rather than per-application memory.

## Join Back To Rows

`knn_text` returns matching text values and scores. Join back when the source
column has row identities you need:

```sql
WITH hits AS (
  SELECT value, score
  FROM rvbbit.knn_text('tickets'::regclass, 'body', 'late shipment refund', 25)
)
SELECT t.ticket_id, t.account_id, hits.score, t.body
FROM hits
JOIN tickets t ON t.body = hits.value
ORDER BY hits.score DESC;
```

If a column has duplicates, this intentionally returns every matching row after
the join-back.

## Retrieval Plus KG Context

```sql
WITH semantic_hits AS (
  SELECT value, score
  FROM rvbbit.knn_text('tickets'::regclass, 'body', 'renewal risk', 20)
),
matched_accounts AS (
  SELECT t.account_name, h.value, h.score
  FROM semantic_hits h
  JOIN tickets t ON t.body = h.value
)
SELECT a.account_name,
       a.score,
       k.predicate,
       k.to_label,
       k.evidence
FROM matched_accounts a
CROSS JOIN LATERAL rvbbit.kg_context(
  'customer',
  a.account_name,
  max_depth => 2,
  include_evidence => true
) k;
```

This is the core RAG shape: vector retrieval finds relevant rows, graph context
adds durable memory, and SQL controls the join.

## Lance And Beaverdam

Lance is used where an ANN file/index is a better fit than scanning cached
vectors. The KG can enable Lance for fuzzy node resolution, and Beaverdam can
build Lance assets for some accelerated table paths.

The contract remains the same: if a Lance path is not ready, SQL should still
have a correct slower fallback.

## Observability

```sql
SELECT * FROM rvbbit.embedding_cache_stats();

SELECT graph_id, kind, status, n_values, refreshed_at
FROM rvbbit.kg_lance_indexes
ORDER BY refreshed_at DESC;
```

Use these surfaces in a UI to show whether retrieval is cold, materialized, or
using an accelerated index.

