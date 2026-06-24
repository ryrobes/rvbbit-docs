---
title: Providers And Diagnostics
description: Provider catalogs, model rates, self-hosted models, doctor checks, and maintenance.
section: Operations
navOrder: 73
sourceDocs:
  - ../rvbbit-sql/docs/PROVIDER_CATALOGS.md
  - ../rvbbit-sql/docs/DIAGNOSTICS.md
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
  - ../rvbbit-sql/docs/EMBEDDINGS.md
---

Provider setup is a production surface, not a hidden environment detail.
RVBBIT keeps model availability, rate coverage, default providers, and
diagnostics visible through SQL.

## Catalog Tables

| Surface | Purpose |
| --- | --- |
| `rvbbit.provider_catalog` | One row per provider refresh target and auth/status state. |
| `rvbbit.provider_models` | Provider/model metadata, capabilities, context windows, availability. |
| `rvbbit.model_rate_cards` | Provider-specific rate data with confidence. |
| `rvbbit.provider_model_catalog` | Convenience view joining model metadata and rates. |
| `rvbbit.model_rates` | Compatibility table used by cost estimation. |

## Refresh Providers

```sql
SELECT * FROM rvbbit.refresh_provider_catalogs();
SELECT * FROM rvbbit.refresh_provider_catalogs('openrouter,gemini');

SELECT rvbbit.provider_catalog_summary();
```

Missing provider keys do not have to fail setup. They produce skipped provider
rows so a UI can show exactly what remains unconfigured.

## Default LLM Provider

A fresh install seeds `openrouter` as the default LLM provider (a chat backend
with transport `openai_chat`, auth env `OPENROUTER_API_KEY`), and
`rvbbit.default_provider()` returns `'openrouter'`. With just
`OPENROUTER_API_KEY` set, LLM operators work immediately — no extra
registration. `RVBBIT_DEFAULT_PROVIDER` overrides the SQL setting when present
in the Postgres process environment.

## Self-Hosted Models

Register the backend:

```sql
SELECT rvbbit.register_backend(
  backend_name => 'local-vllm',
  backend_endpoint => 'http://vllm:8000/v1/chat/completions',
  backend_transport => 'openai_chat',
  backend_max_concur => 2,
  backend_opts => '{"model":"nvidia/Gemma-4-31B-IT-NVFP4"}'::jsonb
);
```

Register catalog and cost metadata:

```sql
SELECT rvbbit.register_self_hosted_model(
  provider       => 'local-vllm',
  model          => 'nvidia/Gemma-4-31B-IT-NVFP4',
  backend_name   => 'local-vllm',
  display_name   => 'Gemma 4 31B on local vLLM',
  family         => 'gemma',
  capabilities   => '["chat"]'::jsonb,
  context_window => 32768,
  cost_policy    => 'free'
);
```

Then choose it as the SQL default:

```sql
SELECT rvbbit.set_default_provider('local-vllm');
SELECT rvbbit.default_provider();
```

## Doctor Checks

Cheap checks:

```sql
SELECT * FROM rvbbit.doctor(false);
SELECT * FROM rvbbit.provider_doctor(false);
```

Live probes:

```sql
SELECT * FROM rvbbit.doctor(true);
SELECT * FROM rvbbit.provider_doctor(true);
```

Live mode can call model providers. Use it for setup, support, release checks,
and explicit UI health actions.

## Secret Presence

```sql
SELECT rvbbit.env_present('OPENAI_API_KEY');
```

This only returns a boolean. It should never expose the secret value.

## Maintenance

```sql
SELECT rvbbit.maintain();
```

Maintenance performs bounded idempotent work: receipt queue flush, cost
backfill, delayed settlement, and provider catalog refresh. Storage maintenance
is opt-in:

```sql
SELECT rvbbit.maintain(storage_tables => 2);
```

For UIs, combine `doctor`, provider summary, cost audit, and recent receipts
into a single setup/health screen. See [Receipts and Costs](/docs/receipts-costs)
for the audit and per-call cost surfaces this screen draws from.

