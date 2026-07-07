---
title: Receipts And Costs
description: Audit semantic calls, sub-calls, token counts, latency, errors, and provider cost coverage.
section: SQL Primitives
navOrder: 37
sourceDocs:
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
  - ../rvbbit-sql/docs/COSTS_UI_CONTRACT.md
  - ../rvbbit-sql/docs/OPERATORS.md
  - ../rvbbit-sql/docs/MCP.md
---

Receipts are the operational trust layer for semantic SQL. A semantic function
can be useful in a demo without receipts; it is not production-shaped until a
user can inspect what happened, what it cost, and whether anything failed.

![Receipts and costs in Data Rabbit, showing operator and model rollups with calls, tokens, cost, latency, errors, and recent activity.](/shots/receipts-costs.png)

## Two Layers

| Layer | Purpose |
| --- | --- |
| `rvbbit.receipts` | One operator invocation, input hash, output, latency, `query_id`, error, and `sub_calls`. |
| `rvbbit.cost_events` | Append-only cost facts for model, specialist, and MCP calls inside receipts. |

Derived views roll those facts up by receipt and query:

```sql
SELECT * FROM rvbbit.cost_latest ORDER BY created_at DESC;
SELECT * FROM rvbbit.query_costs ORDER BY last_event_at DESC;
SELECT * FROM rvbbit.receipt_costs ORDER BY last_event_at DESC;
```

## Inspect Recent Calls

```sql
SELECT receipt_id,
       query_id,
       operator,
       model,
       latency_ms,
       error,
       invocation_at
FROM rvbbit.receipts
ORDER BY invocation_at DESC
LIMIT 50;
```

For richer detail:

```sql
SELECT receipt_id,
       operator,
       output,
       sub_calls
FROM rvbbit.receipts
WHERE receipt_id = $1::uuid;
```

`sub_calls` is where Cascades expose their internal steps — model (`llm`)
calls, specialist calls, MCP calls, and code/python steps. The `llm`,
`specialist`, and `mcp` entries are the chargeable ones the cost audit
reconciles against the ledger. Retried attempts accumulate into the same array,
so a retry shows up as repeated sub-call entries on the one receipt.

The `operator` column holds the operator name — `means`, `about`, a `classify`,
or any user- or pack-defined operator. Built-ins like `means()` and `about()`
ship from the BGE reranker [capability packs](/docs/capability-packs), so their
receipts only appear once the relevant pack is installed.

## Per-Operator Rollups

`rvbbit.judgment_stats(op_name)` aggregates `rvbbit.receipts` for a single
operator — invocation counts, unique inputs (distinct input hashes), token and
cost totals, latency, and the first/last call timestamps:

```sql
SELECT *
FROM rvbbit.judgment_stats('about');
```

It returns `op_name`, `n_invocations`, `n_unique_inputs`, `total_tokens_in`,
`total_tokens_out`, `total_cost_usd`, `total_latency_ms`, `first_at`, and
`last_at`. Because each successful call writes one receipt, `n_invocations`
relative to `n_unique_inputs` shows how much repeat work the content-addressed
cache has spared.

## Correlating One User Query

All receipts (and KG evidence and cost events) spawned by the same SQL query
share a `query_id`. Start a fresh trace group with `rvbbit.reset_query_id()` and
read the current one with `rvbbit.current_query_id()`; queued receipts may carry
`query_id = NULL` if the originating context could not safely create one.

## Audit Cost Coverage

```sql
SELECT rvbbit.cost_audit_summary();

SELECT *
FROM rvbbit.cost_audit_gaps
ORDER BY invocation_at DESC;
```

`rvbbit.receipt_cost_audit.audit_status` is the main status for a UI:

| Status | Meaning |
| --- | --- |
| `ok` | Chargeable sub-calls have cost coverage. |
| `no_chargeable_sub_calls` | Local/free path or no model/tool call was needed. |
| `missing_cost_events` | Receipt has chargeable sub-calls but no cost rows. |
| `pending` | Provider has a request id but final cost has not settled. |
| `stale_pending` | Pending cost has waited too long. |
| `uncosted` | Call was seen but no pricing policy was available. |
| `errors` | Underlying semantic/tool call errored. |

## Policies

```sql
SELECT rvbbit.set_cost_policy(
  target_kind => 'backend',
  target_name => 'local-vllm',
  policy => 'free',
  notes => 'Local GPU worker'
);

SELECT rvbbit.set_cost_policy(
  target_kind => 'mcp_tool',
  target_name => 'vendor.extract_entities',
  policy => 'fixed',
  fixed_cost_usd => 0.0025
);
```

Policies can mark local workers free, assign fixed tool costs, estimate from
model rates, or wait for provider settlement.

## Maintenance

```sql
SELECT rvbbit.receipt_queue_pending();
SELECT rvbbit.flush_receipt_queue(1000);
SELECT rvbbit.backfill_cost_events_from_receipts(10000);
SELECT rvbbit.maintain_cost_audit();
```

Queued receipts exist because some Postgres execution contexts cannot safely
write audit rows immediately. The queue preserves the receipt for a later safe
flush instead of dropping it.

## What to surface

Everything you need to observe receipts is queryable from SQL:

- recent receipts and errors,
- `query_id` rollups,
- token and latency totals,
- the sub-call timeline,
- missing or pending cost rows,
- maintenance actions for queue flush and backfill.

Treat receipts as audit records — read and aggregate them, but don't mutate them.
