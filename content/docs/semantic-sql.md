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
inside an operator. There is no separate cascade object: a Cascade is just an
operator whose `steps` (set via `create_operator(... op_steps => …)`) are
non-null. Each step has a `kind` — `llm`, `specialist`, `python`, `code`, `sql`,
or `mcp` — and later steps can reference earlier ones with
`{{ steps.<name>.<field> }}`.

A Cascade can chain those steps with gates, validators, retries, and ensembles
while still looking like a typed SQL function to the query:

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

The core extension seeds LLM-backed versions of `means`, `about`, `classify`,
`extract`, `summarize`, and a few others as editable rows, so they work before
you install anything. [Capability packs](/docs/capability-packs) add
local-specialist-backed versions of some of those same names (a reranker behind
`means`/`about`, DeBERTa behind `classify`, GLiNER behind `extract`) plus
pack-only names like `extract_pii()` and `semantic_score()` that exist only after
the pack is installed. See
[Capability Packs](/docs/capability-packs#where-the-familiar-operators-come-from)
for which name comes from where. The default `op_model` literal is
`'openai/gpt-5.4-mini'`.

## Flow Control

Operators can add guardrails without leaving SQL. Flow control is attached
separately from `create_operator`, with one call per concern (pass `NULL` to
clear, then run `rvbbit.judgment_purge('<op>')`):

- `rvbbit.set_operator_retry(op_name, retry_config)` — re-run on model failures
  or invalid outputs,
- `rvbbit.set_operator_wards(op_name, wards_config)` — pre/post validation gates,
- `rvbbit.set_operator_takes(op_name, takes_config)` — multi-take ensembles for
  higher confidence,
- `op_tests` stored with the operator definition (run with `rvbbit.run_tests`).

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

The optional Lance vector tier (part of Beaverdam storage acceleration) can speed
up some table-local vector paths, but embeddings remain a semantic SQL feature
first; the heap stays the source of truth. See
[Semantic Functions](/docs/semantic-functions) for the full set of retrieval,
clustering, and extraction primitives.

## Knowledge Graph

The KG gives semantic work a durable memory surface:

```sql
SELECT rvbbit.kg_assert_node('customer', 'Acme Corp');
SELECT rvbbit.kg_assert_edge(
  subject_kind  => 'customer',
  subject_label => 'Acme Corp',
  predicate     => 'reported',
  object_kind   => 'issue',
  object_label  => 'late shipment'
);
```

Then retrieve context:

```sql
SELECT *
FROM rvbbit.kg_context(
  node_kind  => 'customer',
  node_label => 'Acme Corp',
  max_depth  => 2
);
```

See [Knowledge Graph](/docs/knowledge-graph) for entity resolution, triple
extraction, and the full helper set.

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

MCP servers run through the `mcp-gateway` Warren runtime. See [MCP](/docs/mcp)
for registration, gateway setup, and generating per-tool SQL wrappers.

## Costs And Receipts

Semantic SQL needs production accounting. RVBBIT records receipts and cost
events so operators are observable:

```sql
SELECT rvbbit.receipt_queue_pending();
SELECT rvbbit.flush_receipt_queue(1000);
SELECT rvbbit.cost_audit_summary();
```

Every operator call writes a row to `rvbbit.receipts` (one receipt can span
several sub-calls); cost facts land in `rvbbit.cost_events`. Per-operator
rollups are available via `rvbbit.judgment_stats('<op>')`. See
[Receipts & Costs](/docs/receipts-costs) for the full ledger, views, and rate
configuration.

Cost policy belongs near operator design. A powerful operator that is cheap on
one model can become dangerous if a backend default changes silently.
