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

The core extension seeds LLM-backed operators (`means`, `about`, `classify`,
`extract`, `summarize`, `sentiment`, `triples`, …). Reranker-backed `means` /
`about` and pack-only operators like `extract_pii` arrive when you install the
matching [capability pack](/docs/capability-packs#where-the-familiar-operators-come-from).
Trained scikit-learn models register as `predict_<model>` operators the same way
— see [Predictive Models](/docs/predictive-models).

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

A Cascade is just an operator with non-null `steps` (created via
`create_operator(..., op_steps => ...)`); there is no separate `create_cascade`.
See [Cascades](/docs/cascades).

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

The registration function is `register_mcp_server` and the rediscovery function
is `refresh_mcp_server` (probe a server with `rvbbit.mcp_probe(server)`). See
[MCP Servers](/docs/mcp).

## Acceleration Registry

Acceleration is the optional columnar tier — a registry that ordinary heap
tables are added to; the heap stays the source of truth. See
[Storage Acceleration](/docs/acceleration).

```sql
SELECT rvbbit.enable_table('events'::regclass);    -- add to the registry
SELECT rvbbit.disable_table('events'::regclass);   -- remove (detach_table is an alias)
SELECT rvbbit.is_rvbbit_table('events'::regclass);
SELECT * FROM rvbbit.list_tables();

-- CREATE TABLE ... USING rvbbit is sugar: a plain heap table, auto-registered.

SELECT rvbbit.refresh_acceleration('events'::regclass);
SELECT rvbbit.refresh_acceleration('events'::regclass, refresh_variants => false);
SELECT rvbbit.rebuild_acceleration('events'::regclass);
SELECT rvbbit.compact('events'::regclass);

SELECT * FROM rvbbit.acceleration_status;
SELECT * FROM rvbbit.accel_freshness;
SELECT * FROM rvbbit.layout_variant_status;
SELECT * FROM rvbbit.acceleration_operations ORDER BY started_at DESC LIMIT 20;
SELECT * FROM rvbbit.acceleration_operation_phases ORDER BY started_at DESC LIMIT 50;
```

Freshness policy plane (see [Accelerator Freshness](/docs/accelerator-freshness)):

```sql
SELECT rvbbit.set_accel_policy('events'::regclass, strategy => 'target',
                               freshness_target_secs => 300);
SELECT * FROM rvbbit.accel_tick(budget => 10, dry_run => true);
```

Hot cache:

```sql
SELECT rvbbit.hot_load('events'::regclass);
SELECT rvbbit.hot_status();
SELECT rvbbit.hot_evict('events'::regclass);
```

## Time Travel

```sql
/* rvbbit: as_of = '2026-05-31 14:30:00-04' */
SELECT count(*) FROM events;

SELECT rvbbit.set_as_of('events'::regclass, '2026-05-31 14:30:00-04');

SELECT *
FROM rvbbit.time_travel_timeline('events'::regclass);
```

The comment directive (`/* rvbbit: as_of = '...' */`) pins one statement; the
GUC `rvbbit.as_of_timestamp` (or `rvbbit.set_as_of`) pins a session. See
[Time Travel](/docs/time-travel).

## Routing And GPU

```sql
SELECT rvbbit.route_status();
SELECT rvbbit.route_explain('SELECT count(*) FROM events');

-- NVIDIA GQE (GPU) — see /docs/gqe
SELECT rvbbit.warm_gpu_gqe();
SELECT detail->'gpu_gqe' FROM rvbbit.doctor(false) WHERE name = 'runtime';
```

## Worker Telemetry

```sql
SELECT * FROM rvbbit.duck_sidecar_latest;
SELECT * FROM rvbbit.duck_sidecar_query_events ORDER BY observed_at DESC LIMIT 100;
SELECT * FROM rvbbit.duck_sidecar_fallback_events ORDER BY observed_at DESC LIMIT 50;
SELECT * FROM rvbbit.duck_sidecar_query_summary ORDER BY minute DESC LIMIT 100;
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

Each operator call writes one row to `rvbbit.receipts`. See
[Receipts And Costs](/docs/receipts-costs).

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
SELECT name, status, last_heartbeat FROM rvbbit.warren_nodes ORDER BY last_heartbeat DESC;
```

See [Warren](/docs/warren) for node registration and the deploy flow.
