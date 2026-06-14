---
title: Cascades
description: Multi-step operator workflows with gates, takes, validators, retries, reducers, and receipts.
section: SQL Primitives
navOrder: 32
sourceDocs:
  - ../rvbbit-sql/docs/OPERATORS.md
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
---

Operators are the SQL surface. Cascades are the multi-step execution logic
inside an operator.

The term is useful because "chain", "flow", and "pipeline" are overloaded.
A Cascade is specifically a SQL-callable operator plan that can branch, validate,
retry, reduce, and record receipts while still behaving like a typed Postgres
function from the caller's perspective.

## Vocabulary

| Word | Meaning |
| --- | --- |
| Operator | The SQL function users call, such as `rvbbit.review_risk(text)`. |
| Cascade | The internal multi-step execution plan behind an operator. |
| Step | One execution unit: LLM, specialist, Python, MCP tool, SQL, or code. |
| Gate | A pre/post validation boundary. In the catalog, gates are stored in the `wards` column. |
| Take | One model attempt in an ensemble. Multiple takes can run to improve confidence. |
| Repair | Retry logic that asks the model or another step to fix an invalid result. |
| Reducer | Logic that turns several takes or step outputs into one typed SQL result. |
| Receipt | Cost, trace, and audit record for the call. |

This gives the system a cleaner story:

```text
SQL operator -> Cascade -> steps/gates/takes/repair/reducer -> typed result + receipt
```

## Why Cascades Matter

Most AI application stacks move orchestration out of the database:

- fetch rows,
- call a service,
- branch in application code,
- validate elsewhere,
- write a result back,
- reconstruct cost and trace later.

RVBBIT's hook is that the orchestration can remain SQL-native:

```sql
SELECT ticket_id,
       rvbbit.review_risk(body, account_tier) AS risk
FROM support_tickets
WHERE created_at >= now() - interval '1 day';
```

The query sees one typed function. The operator can still run a Cascade with
policy gates, parallel takes, retries, tool calls, and receipts.

## Shape

```text
input row
  -> gate
  -> step: classify intent
  -> takes: ask multiple models or prompts
  -> validate JSON
  -> repair invalid outputs
  -> reducer: choose or combine result
  -> post gate
  -> typed SQL value
  -> receipt
```

## Current SQL Surface

The current implementation stores much of this on `rvbbit.operators`:

```sql
SELECT name,
       shape,
       return_type,
       steps IS NOT NULL AS has_steps,
       retry IS NOT NULL AS has_retry,
       wards IS NOT NULL AS has_gates,
       takes IS NOT NULL AS has_takes,
       tests IS NOT NULL AS has_tests
FROM rvbbit.operators
ORDER BY name;
```

In the catalog, gates are stored in the `wards` column.

## Design Guidance

Use a Cascade when the operator needs at least one of these:

- multiple model/tool steps,
- validation before or after a model call,
- structured JSON repair,
- ensemble or voting behavior,
- cost-aware fallback,
- provenance that must be inspectable from SQL.

Do not use a Cascade when a single deterministic SQL expression or a simple
operator call is enough. The point is to make complex semantic behavior
observable, not to make every prompt look sophisticated.

