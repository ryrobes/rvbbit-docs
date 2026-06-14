---
title: Semantic Functions
description: Built-in semantic primitives for retrieval, classification, clustering, extraction, and evidence.
section: SQL Primitives
navOrder: 31
sourceDocs:
  - ../rvbbit-sql/docs/BIGFOOT-DEMO.md
  - ../rvbbit-sql/docs/EMBEDDINGS.md
  - ../rvbbit-sql/docs/LARS_SEMANTIC_OPERATOR_AUDIT.md
  - ../rvbbit-sql/docs/OPERATORS.md
---

Semantic operators are user-defined functions. Semantic functions are the
built-ins that should be useful before you design your own operator.

Most of these functions use the configured embedding backend, local specialist
runtime, or model provider. They are meant to compose with ordinary SQL.

## Retrieval

```sql
SELECT value, score
FROM rvbbit.knn_text(
  'docs'::regclass,
  'body',
  'contract renewal risk after an outage',
  20
);
```

For row identity, join the returned text back to the source table:

```sql
WITH hits AS (
  SELECT value, score
  FROM rvbbit.knn_text('tickets'::regclass, 'body', 'refund after damage', 25)
)
SELECT t.id, t.body, h.score
FROM hits h
JOIN tickets t ON t.body = h.value
ORDER BY h.score DESC;
```

## Branching Without An LLM

```sql
SELECT id,
       rvbbit.semantic_case(
         body,
         ARRAY['billing dispute', 'shipping delay', 'product defect'],
         ARRAY['billing', 'shipping', 'bug'],
         'other',
         0.0
       ) AS bucket
FROM tickets;
```

`semantic_case` embeds the text and candidate labels, then chooses the closest
branch. It is a good first choice for cheap, stable classification.

## Clustering And Outliers

```sql
SELECT cluster_id, count, exemplar
FROM rvbbit.topics('SELECT body FROM tickets', 8);

SELECT text, score
FROM rvbbit.outliers('SELECT body FROM tickets', 10);
```

Use `topics` for exploratory clustering and `outliers` for unusual rows. For
human-readable cluster labels, compose with a summarization operator.

## Deduplication And Novelty

```sql
SELECT *
FROM rvbbit.dedupe_groups('SELECT company_name FROM accounts', 0.82);

SELECT *
FROM rvbbit.diff(
  'SELECT body FROM tickets WHERE created_at >= now() - interval ''1 day''',
  'SELECT body FROM tickets WHERE created_at < now() - interval ''1 day''',
  20
);
```

`dedupe_groups` finds near-duplicate text. `diff` finds rows from one set that
are semantically unlike another set.

## Extraction And Evidence

```sql
SELECT id,
       rvbbit.extract(body, 'customer company name') AS company,
       rvbbit.extract(body, 'renewal date or deadline') AS deadline
FROM tickets
LIMIT 20;
```

For evidence snippets:

```sql
SELECT id,
       rvbbit.text_evidence(body, 'contract cancellation risk', 3) AS evidence
FROM tickets
WHERE account_tier = 'enterprise';
```

These functions are especially useful inside Cascades because later steps can
work from extracted values or evidence spans instead of the full source text.

## Explain A Semantic Call

```sql
SELECT rvbbit.explain_semantic(
  'SELECT rvbbit.review_risk(body, account_tier) FROM tickets LIMIT 10'
);
```

Use semantic explain output alongside receipts when you need to debug how an
operator, backend, cache, or policy is being used.

