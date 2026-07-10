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

[Operators](/docs/semantic-sql) are model-backed SQL functions you define (or
that arrive inside a [capability pack](/docs/capability-packs)). The functions
on this page are different: they ship inside the extension itself, so they are
useful before you design your own operator.

Most of them embed text with the configured embedding backend (set with
`rvbbit.set_default_embedder(...)`, or pass a specialist name as the last
argument) and then do the rest of the work - clustering, nearest-neighbour
search, branching - deterministically in Rust. `rvbbit.extract(...)` is the
exception: it is a seeded LLM-backed operator, and `rvbbit.text_evidence(...)`
is purely lexical (no model at all). All of them compose with ordinary SQL.

Semantic scalar work runs tuple-at-a-time today, so embedding a large result set
inline (for example clustering every row of a big table) is bounded by how fast
the backend can embed each distinct value.

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

`rvbbit.extract(text, what)` is a seeded operator backed by an LLM by default;
it returns the literal value (or `NULL`). For typed entity and PII extraction
backed by a local specialist instead, install the GLiNER
[capability pack](/docs/capability-packs), which provides
`rvbbit.extract_entities(text, labels)`, `rvbbit.extract_pii(text)`, and a
specialist-backed `rvbbit.extract`.

For evidence snippets, `rvbbit.text_evidence` returns the most relevant
sentences (a `text[]`) using keyword coverage - it needs no embedding backend
and runs in microseconds:

```sql
SELECT id,
       rvbbit.text_evidence(body, 'contract cancellation risk', 3) AS evidence
FROM tickets
WHERE account_tier = 'enterprise';
```

These functions are especially useful inside [Cascades](/docs/cascades) because
later steps can work from extracted values or evidence spans instead of the full
source text.

## Explain A Semantic Call

```sql
SELECT * FROM rvbbit.explain_semantic(
  'SELECT rvbbit.review_risk(body, account_tier) FROM tickets LIMIT 10'
);
```

`rvbbit.explain_semantic` sketches the projected semantic execution graph (using
Postgres row estimates plus receipt history) without running the query. To run
the query once and report the actual cache cascade, tokens, latency, and dollar
cost, use `rvbbit.explain_semantic_analyze(...)` with the same argument.

Use semantic explain output alongside [receipts](/docs/receipts-costs) when you
need to debug how an operator, backend, cache, or policy is being used.

