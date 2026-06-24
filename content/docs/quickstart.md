---
title: Quickstart
description: Install the extension, create an operator, and refresh a Beaverdam table.
section: Start
navOrder: 20
sourceDocs:
  - ../rvbbit-sql/docs/OPERATORS.md
  - ../rvbbit-sql/docs/RVBBIT_PRODUCTION_SHAPE.md
  - ../rvbbit-sql/docs/TUNING.md
  - ../rvbbit-sql/docs/DIAGNOSTICS.md
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
---

This page shows the shape of the system from SQL. It intentionally avoids every
knob until the end.

## Install

```sql
CREATE EXTENSION IF NOT EXISTS pg_rvbbit;
```

Most local stacks also need model/backend configuration. In the development
containers this is normally preloaded; in production, register the model
backends and cost policy before exposing semantic operators to users.

## Check The Install

Cheap diagnostics should work before you run paid or live-provider calls:

```sql
SELECT * FROM rvbbit.doctor(false);
SELECT * FROM rvbbit.provider_doctor(false);
```

Use live mode only when you intentionally want active provider probes:

```sql
SELECT * FROM rvbbit.provider_doctor(true);
```

## Create A Semantic Operator

Semantic operators are SQL functions backed by model calls or other capability
nodes. They are stored as catalog rows (`rvbbit.operators`) and can be edited at
runtime.

You don't have to write every operator from scratch. The core extension already
seeds LLM-backed `means()`, `about()`, `classify()`, and `extract()`, and
installing a capability pack adds local-specialist versions of those names plus
pack-only operators — for example reranker-backed `means()` / `about()` from the
BGE reranker packs and `extract_pii()` from the GLiNER pack. See
[Capability Packs](/docs/capability-packs#where-the-familiar-operators-come-from)
for which name comes from where. The example below defines your own LLM-backed
operator.

```sql
SELECT rvbbit.create_operator(
    op_name        => 'tone',
    op_arg_names   => ARRAY['text'],
    op_return_type => 'text',
    op_system      => 'Classify the tone. Reply with one lowercase word.',
    op_user        => E'MESSAGE: {{ text }}\n\nTone:',
    op_model       => 'openai/gpt-5.4-mini',
    op_max_tokens  => 8,
    op_temperature => 0.0,
    op_description => 'Classify message tone.'
);
```

Then call it like any other function:

```sql
SELECT id, rvbbit.tone(body) AS tone
FROM support_tickets
LIMIT 20;
```

Inspect the receipt trail:

```sql
SELECT receipt_id,
       operator,
       model,
       latency_ms,
       error,
       invocation_at
FROM rvbbit.receipts
ORDER BY invocation_at DESC
LIMIT 10;

SELECT rvbbit.cost_audit_summary();
```

## Use Embeddings

```sql
SELECT rvbbit.embed('refund request from angry customer');
```

For table search:

```sql
SELECT *
FROM rvbbit.knn_text(
  'support_tickets'::regclass,
  'body',
  'renewal risk after shipping failures',
  10
);
```

## Add Beaverdam Storage

Beaverdam keeps Postgres heap as the source of truth and builds accelerator
files beside it. To accelerate a table:

```sql
SELECT rvbbit.refresh_acceleration('support_tickets'::regclass);
```

That refresh:

- scans rows that are newer than the stored watermark,
- writes accelerator files,
- updates the acceleration metadata,
- leaves the heap intact for fallback, dump, and restore.

`refresh_acceleration` also refreshes layout variants by default. To skip that
work on a fast incremental refresh, pass `refresh_variants => false`:

```sql
SELECT rvbbit.refresh_acceleration(
  'support_tickets'::regclass,
  refresh_variants => false
);
```

For a from-scratch rebuild (drop and re-derive every row group), use
`rvbbit.rebuild_acceleration(...)` instead.

## Query Normally

The point is that ordinary SQL remains ordinary SQL:

```sql
SELECT account_id, count(*)
FROM support_tickets
WHERE created_at >= now() - interval '30 days'
GROUP BY account_id
ORDER BY count(*) DESC
LIMIT 20;
```

The heap stays the source of truth. When acceleration is enabled, conservative,
rule-based routing decides whether that query should use heap, native execution,
DataFusion, Duck/Vortex, hot memory, or another available path. Learned routing
runs in shadow/observation mode only — it does not take over default routing.
See [Routing And Training](/docs/routing-training) for the details.

## Check Status

```sql
SELECT *
FROM rvbbit.acceleration_status
ORDER BY table_schema, table_name;
```

Worker path:

```sql
SELECT *
FROM rvbbit.duck_sidecar_latest
ORDER BY last_heartbeat_at DESC;
```

Costs:

```sql
SELECT rvbbit.cost_audit_summary();
```

## Next Steps

- Use [Semantic SQL](/docs/semantic-sql) to design robust model-backed
  operators.
- Use [Semantic Functions](/docs/semantic-functions) for retrieval,
  classification, clustering, extraction, and evidence snippets.
- Use [Retrieval](/docs/retrieval) and [Knowledge Graph](/docs/knowledge-graph)
  for SQL-native RAG and durable semantic memory.
- Use [Receipts And Costs](/docs/receipts-costs) before exposing paid model
  calls to users.
- Use [MCP Servers](/docs/mcp) when external tool results should join with SQL.
- Use [Beaverdam Storage](/docs/beaverdam) before enabling storage acceleration
  for larger reporting tables.
- Use [Routing And Training](/docs/routing-training) before adding trained
  profiles or forced engine paths.
