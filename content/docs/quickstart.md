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
nodes. They are stored as catalog rows and can be edited at runtime.

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

- scan rows that are newer than the stored watermark,
- write accelerator files,
- update Beaverdam metadata,
- leave the heap intact for fallback, dump, and restore.

For a full rebuild, including layout variants:

```sql
SELECT rvbbit.refresh_acceleration(
  'support_tickets'::regclass,
  refresh_variants => true
);
```

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

The router decides whether that query should use heap, native execution,
DataFusion, Duck/Vortex, hot memory, or another available path.

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
