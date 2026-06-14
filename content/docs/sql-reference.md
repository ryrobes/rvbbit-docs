---
title: SQL Reference
description: A compact map of the SQL surfaces most users and UIs need first.
section: Reference
navOrder: 90
sourceDocs:
  - ../rvbbit-sql/docs/CALLABLE_SURFACES.md
  - ../rvbbit-sql/docs/OPERATORS.md
  - ../rvbbit-sql/docs/RVBBIT_DUCK_UI_CONTRACT.md
  - ../rvbbit-sql/docs/WARREN_UI_CONTRACT.md
  - ../rvbbit-sql/docs/COSTS_UI_CONTRACT.md
  - ../rvbbit-sql/docs/PROVIDER_CATALOGS.md
  - ../rvbbit-sql/docs/DIAGNOSTICS.md
---

This page is a compact map of the SQL surface — names and shapes at a glance.
The linked guides for each area go deeper into arguments and behavior.

## Semantic Operators

```sql
SELECT rvbbit.create_operator(...);
SELECT * FROM rvbbit.operators ORDER BY name;
SELECT rvbbit.<operator_name>(...);
```

Cascade inspection:

```sql
SELECT name,
       steps IS NOT NULL AS has_steps,
       retry IS NOT NULL AS has_retry,
       wards IS NOT NULL AS has_gates,
       takes IS NOT NULL AS has_takes,
       tests IS NOT NULL AS has_tests
FROM rvbbit.operators
ORDER BY name;
```

## Embeddings

```sql
SELECT rvbbit.embed('text to embed');
SELECT rvbbit.similarity('text a', 'text b');

SELECT *
FROM rvbbit.knn_text('docs'::regclass, 'body', 'query text', 10);
```

## Semantic Functions

```sql
SELECT * FROM rvbbit.topics('SELECT body FROM docs', 8);
SELECT * FROM rvbbit.outliers('SELECT body FROM docs', 10);
SELECT * FROM rvbbit.dedupe_groups('SELECT company_name FROM accounts', 0.82);
SELECT * FROM rvbbit.diff('SELECT body FROM new_docs', 'SELECT body FROM old_docs', 20);

SELECT rvbbit.semantic_case(
  body,
  ARRAY['billing problem', 'shipping delay', 'product bug'],
  ARRAY['billing', 'shipping', 'bug'],
  'other',
  0.0
)
FROM tickets;

SELECT rvbbit.extract(body, 'customer company name') FROM tickets;
SELECT rvbbit.text_evidence(body, 'renewal risk', 3) FROM tickets;
SELECT rvbbit.explain_semantic('SELECT rvbbit.review_risk(body) FROM tickets');
```

## Knowledge Graph

```sql
SELECT rvbbit.kg_assert_node('customer', 'Acme Corp');
SELECT rvbbit.kg_assert_edge(...);
SELECT * FROM rvbbit.kg_context('customer', 'Acme Corp', max_depth => 2);
SELECT * FROM rvbbit.kg_neighbors('customer', 'Acme Corp');
```

## MCP

```sql
SELECT rvbbit.register_mcp_server(...);
SELECT rvbbit.refresh_mcp_server('github');
SELECT rvbbit.mcp_call('github', 'tool_name', '{"arg":"value"}'::jsonb);
SELECT * FROM rvbbit.mcp_rows('github', 'tool_name', '{}'::jsonb);
```

## Beaverdam

```sql
SELECT rvbbit.refresh_acceleration('events'::regclass);
SELECT rvbbit.refresh_acceleration('events'::regclass, refresh_variants => true);
SELECT rvbbit.compact('events'::regclass);

SELECT * FROM rvbbit.acceleration_status;
SELECT * FROM rvbbit.layout_variant_status;
SELECT * FROM rvbbit.acceleration_operations ORDER BY started_at DESC LIMIT 20;
SELECT * FROM rvbbit.acceleration_operation_phases ORDER BY started_at DESC LIMIT 50;
```

Hot cache:

```sql
SELECT rvbbit.hot_load('events'::regclass);
SELECT rvbbit.hot_status();
SELECT rvbbit.hot_evict('events'::regclass);
```

## Time Travel

```sql
/* rvbbit.as_of: 2026-05-31 14:30:00-04 */
SELECT count(*) FROM events;

SELECT *
FROM rvbbit.time_travel_timeline('events'::regclass);
```

## Worker Telemetry

```sql
SELECT * FROM rvbbit.duck_sidecar_latest;
SELECT * FROM rvbbit.duck_sidecar_query_events ORDER BY observed_at DESC LIMIT 100;
SELECT * FROM rvbbit.duck_sidecar_fallback_events ORDER BY observed_at DESC LIMIT 50;
SELECT * FROM rvbbit.duck_sidecar_query_summary ORDER BY bucket DESC LIMIT 100;
```

## Costs

```sql
SELECT receipt_id, operator, model, latency_ms, error, invocation_at
FROM rvbbit.receipts
ORDER BY invocation_at DESC
LIMIT 20;

SELECT * FROM rvbbit.cost_latest ORDER BY created_at DESC;
SELECT * FROM rvbbit.query_costs ORDER BY last_event_at DESC;
SELECT * FROM rvbbit.cost_audit_gaps ORDER BY invocation_at DESC;

SELECT rvbbit.receipt_queue_pending();
SELECT rvbbit.flush_receipt_queue(1000);
SELECT rvbbit.backfill_cost_events_from_receipts(10000);
SELECT rvbbit.cost_audit_summary();
```

## Providers And Diagnostics

```sql
SELECT * FROM rvbbit.doctor(false);
SELECT * FROM rvbbit.provider_doctor(false);
SELECT * FROM rvbbit.provider_doctor(true);

SELECT * FROM rvbbit.refresh_provider_catalogs();
SELECT rvbbit.provider_catalog_summary();

SELECT provider, model, family, context_window, available
FROM rvbbit.provider_model_catalog
ORDER BY provider, model;

SELECT rvbbit.register_self_hosted_model(...);
SELECT rvbbit.set_default_provider('local-vllm');
SELECT rvbbit.default_provider();
```

## Warren

```sql
SELECT rvbbit.deploy_catalog_capability(...);
SELECT * FROM rvbbit.warren_jobs ORDER BY created_at DESC LIMIT 20;
SELECT * FROM rvbbit.warren_worker_heartbeats ORDER BY observed_at DESC LIMIT 20;
```
