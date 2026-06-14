---
title: Semantic SQL
description: Model-backed operators, embeddings, KG helpers, MCP tools, and cost receipts.
section: SQL Primitives
navOrder: 30
sourceDocs:
  - ../rvbbit-sql/docs/OPERATORS.md
  - ../rvbbit-sql/docs/EMBEDDINGS.md
  - ../rvbbit-sql/docs/KNOWLEDGE_GRAPH.md
  - ../rvbbit-sql/docs/MCP.md
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
---

Semantic SQL is the RVBBIT feature that should feel useful even when you never
enable Beaverdam storage. It makes model calls, embeddings, tool calls, and
workflow nodes visible as SQL functions with catalog-backed configuration.

## Cascades

Operators are the SQL surface. **Cascades** are the multi-step execution logic
inside an operator.

A Cascade can combine gates, takes, validators, retries, reducers, tool calls,
and receipts while still looking like a typed SQL function to the query:

```sql
SELECT ticket_id,
       rvbbit.review_risk(body, account_tier) AS risk
FROM support_tickets
WHERE created_at >= now() - interval '1 day';
```

That is the key database-person hook: application-style model orchestration can
be catalog-backed, audited, and called from SQL.

## Operators

A semantic operator is a typed SQL function backed by a catalog row in
`rvbbit.operators`. The row contains prompts, return type, model selection,
parser, tests, and optional flow control.

```sql
SELECT rvbbit.create_operator(
    op_name        => 'is_escalation',
    op_arg_names   => ARRAY['message'],
    op_arg_types   => ARRAY['text'],
    op_return_type => 'bool',
    op_system      => 'Reply YES if this support message needs escalation.',
    op_user        => '{{ message }}',
    op_parser      => 'yes_no',
    op_model       => 'openai/gpt-5.4-mini',
    op_max_tokens  => 4
);
```

Call it directly:

```sql
SELECT ticket_id
FROM support_tickets
WHERE rvbbit.is_escalation(body);
```

## Flow Control

Operators can add guardrails without leaving SQL:

- retries for model failures or invalid outputs,
- wards for pre/post validation,
- multi-take ensembles for higher confidence,
- tests stored with the operator definition.

The important operational idea is that prompts are not hidden in application
code. They are inspectable and editable in Postgres.

```sql
SELECT name,
       return_type,
       model,
       retry IS NOT NULL AS has_retry,
       wards IS NOT NULL AS has_wards,
       takes IS NOT NULL AS has_takes
FROM rvbbit.operators
ORDER BY name;
```

## Embeddings

Use embeddings directly:

```sql
SELECT rvbbit.embed('customer asks for cancellation after outage');
```

Or search table text:

```sql
SELECT *
FROM rvbbit.knn_text(
  'support_tickets'::regclass,
  'body',
  'renewal risk after outage',
  10
);
```

Beaverdam/Lance can accelerate some table-local vector paths, but embeddings
remain a semantic SQL feature first.

## Knowledge Graph

The KG gives semantic work a durable memory surface:

```sql
SELECT rvbbit.kg_assert_node('customer', 'Acme Corp');
SELECT rvbbit.kg_assert_edge(
  src_kind => 'customer',
  src_label => 'Acme Corp',
  edge_type => 'reported',
  dst_kind => 'issue',
  dst_label => 'late shipment'
);
```

Then retrieve context:

```sql
SELECT *
FROM rvbbit.kg_context('customer', 'Acme Corp', max_depth => 2);
```

## MCP Tools

MCP servers can be registered and called from SQL:

```sql
SELECT rvbbit.register_mcp_server(
  server_name => 'github',
  server_transport => 'stdio',
  server_command => 'npx',
  server_args => ARRAY['-y', '@modelcontextprotocol/server-github']
);

SELECT rvbbit.refresh_mcp_server('github');
```

Call a tool:

```sql
SELECT rvbbit.mcp_call(
  'github',
  'search_repositories',
  '{"query":"postgres extension datafusion"}'::jsonb
);
```

## Costs And Receipts

Semantic SQL needs production accounting. RVBBIT records receipts and cost
events so operators are observable:

```sql
SELECT rvbbit.receipt_queue_pending();
SELECT rvbbit.flush_receipt_queue(1000);
SELECT rvbbit.cost_audit_summary();
```

Cost policy belongs near operator design. A powerful operator that is cheap on
one model can become dangerous if a backend default changes silently.
