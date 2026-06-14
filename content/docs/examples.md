---
title: Examples
description: Short SQL examples that show the main RVBBIT ideas without setup noise.
section: Start
navOrder: 25
sourceDocs:
  - ../rvbbit-sql/docs/BIGFOOT-DEMO.md
  - ../rvbbit-sql/docs/LARS_SEMANTIC_OPERATOR_AUDIT.md
  - ../rvbbit-sql/docs/OPERATORS.md
  - ../rvbbit-sql/docs/MCP.md
---

These examples are intentionally small. They are meant to show the shape of the
SQL surface before you open the deeper reference pages.

For a longer, runnable walkthrough, use the
[Bigfoot Field Notebook](/docs/examples/bigfoot-field-notebook). It loads the
full BFRO sightings CSV and walks through retrieval, evidence, classification,
extraction, knowledge graph construction, live triples, and receipts.

## Semantic Search

```sql
SELECT *
FROM rvbbit.knn_text(
  'support_tickets'::regclass,
  'body',
  'renewal risk after late shipments',
  10
);
```

Use this when exact keywords miss the shape of the question. For repeated
workloads, materialize embeddings first.

## Fast Semantic Classification

```sql
SELECT id,
       rvbbit.semantic_case(
         body,
         ARRAY[
           'billing problem',
           'shipping delay',
           'product defect',
           'contract renewal risk'
         ],
         ARRAY['billing', 'shipping', 'bug', 'renewal'],
         'other',
         0.0
       ) AS bucket
FROM support_tickets;
```

`semantic_case` is useful when you want branch-like classification without a
full LLM call.

## Build A Model-Backed Operator

```sql
SELECT rvbbit.create_operator(
  op_name        => 'review_risk',
  op_arg_names   => ARRAY['message', 'tier'],
  op_arg_types   => ARRAY['text', 'text'],
  op_return_type => 'text',
  op_system      => 'Classify renewal risk as low, medium, or high.',
  op_user        => E'Tier: {{ tier }}\nMessage: {{ message }}\nRisk:',
  op_model       => 'openai/gpt-5.4-mini',
  op_max_tokens  => 8,
  op_temperature => 0.0
);

SELECT ticket_id, rvbbit.review_risk(body, account_tier) AS risk
FROM support_tickets;
```

The operator is a SQL function, but the prompt, model, parser, tests, retries,
and receipts are catalog-visible.

## Use Tool Results As Rows

```sql
SELECT a.account_id,
       repo->>'full_name' AS repo,
       (repo->>'stargazers_count')::int AS stars
FROM accounts a
JOIN LATERAL rvbbit.mcp_rows(
  'github',
  'search_repositories',
  jsonb_build_object('query', a.company_name || ' postgres', 'perPage', 3)
) repo ON true
WHERE a.tier = 'strategic'
ORDER BY stars DESC;
```

MCP is useful when external tool results should join with real relational data.

## Extract Facts Into The KG

```sql
SELECT *
FROM rvbbit.triples_rows(
  'Acme reported late shipments after the May warehouse migration.',
  'customer operations'
);
```

Then ingest triples into the knowledge graph and retrieve context later with
`kg_context`.

## Inspect What Happened

```sql
SELECT receipt_id,
       operator,
       model,
       latency_ms,
       error,
       invocation_at
FROM rvbbit.receipts
ORDER BY invocation_at DESC
LIMIT 20;

SELECT rvbbit.cost_audit_summary();
```

Receipts are the trust artifact for semantic SQL. They let users inspect model
calls, sub-calls, latency, errors, and cost coverage.
