---
title: Pipelines
description: Chain whole-resultset operators after a query with THEN — pivot, enrich, analyze, and your own.
section: SQL Primitives
navOrder: 39
sourceDocs:
  - ../rvbbit-sql/docs/PIPELINE_CASCADES_PLAN.md
---

A pipeline runs a query, then pipes the **whole resultset** through a chain of
operators, each producing a new resultset — possibly with different columns:

```sql
select state, class from bigfoot.sightings_all
then pivot('counts of each class by state')
then analyze('which states have an unusual class mix?');
```

Each stage is a **rowset operator** — a resultset in, a resultset out — dispatched
through the same operator + [receipts](/docs/receipts-costs) machinery as every
other rvbbit operator. They are the table-level cousins of the per-row
[semantic functions](/docs/semantic-functions).

## How it runs: `rvbbit.flow`

`THEN` is not valid SQL, so it never reaches the Postgres parser. The engine is a
function — the `THEN`s live inside its dollar-quoted argument, and rvbbit splits
them itself (it ignores `THEN` inside strings, comments, parentheses, and
`CASE…END`):

```sql
SELECT * FROM rvbbit.flow($$
  select state, class from bigfoot.sightings_all
  then pivot('counts of each class by state')
$$);
```

This works in any client (psql, DataGrip, the SQL Desktop). In the **lens SQL
Desktop** you can drop the wrapper and type the bare `select … then …` form — the
editor detects a top-level `THEN` and wraps it for you.

## The rowset operators

Three kinds ship built in.

**Deterministic builtins** (no model call):

| Stage | Effect |
| --- | --- |
| `pass` | identity (pass the rowset through) |
| `limit(n)` / `head(n)` | first `n` rows |
| `sample(n)` | `n` rows spread evenly across the set (a representative subset) |
| `count` | a single `{ "n": <rowcount> }` row |

**Structural stages** (synth-sql — see below): `pivot`, `group`, `top`, `filter`.

**Generative stages** (the model sees the data): `analyze` (returns a findings
table) and `enrich` (adds computed columns to each row).

```sql
-- limit cost, then let the model add columns
select title from bigfoot.sighting_docs
then sample(20)
then enrich('add a one-word encounter_type column and a scariness integer 1-10');
```

```
{"title": "Large hairy creature crossing a road at night", "encounter_type": "cryptid", "scariness": 8}
{"title": "Loud screams and knocks heard in the forest",   "encounter_type": "ghostly", "scariness": 7}
```

## Structural stages compile to SQL, keyed by shape

`pivot` / `group` / `top` / `filter` don't send your rows to a model. Instead the
model is used as a **compiler**: it sees only the column schema (plus the distinct
values of low-cardinality text columns) and writes one standard PostgreSQL
`SELECT`, which rvbbit validates on a sample and executes natively.

The generated SQL is cached in `rvbbit.synth_cache` keyed by the **structural
shape** of the input (not its contents) plus the prompt. So a `pivot` over a
50-million-row table calls the model once to author the SQL, then every run with
the same shape is pure, deterministic Postgres. The cached snippets are ordinary
rows you can read, edit, and pin:

```sql
SELECT operator, generated_sql, pinned FROM rvbbit.synth_cache;

-- pin a hand-written snippet for a shape (and freeze it):
SELECT rvbbit.synth_put('pivot', 'counts by class',
  '[{"class":"A"}]'::jsonb,
  'SELECT class, count(*) AS n FROM _input GROUP BY class');
```

If a generated statement fails, rvbbit feeds the Postgres error back to the model
and retries (a few attempts) before giving up; a stage that still fails leaves the
surrounding query untouched and returns the prior rowset.

## The same idea on single values: `reshape`

The shape-keyed compiler isn't only for resultsets. `rvbbit.reshape(value, intent)`
is a **scalar** operator that maps each value to its structural shape (every digit
→ `d`, letter → `a`, other characters kept) and has the model author one expression
per shape — so a column of 50 million values in ~50 formats costs ~50 model calls,
then native SQL.

```sql
WITH p(phone) AS (VALUES ('(303) 555-1234'), ('(720) 867-5309'), ('415-555-0100'))
SELECT phone, rvbbit.reshape(phone, 'normalize to E.164 US format like +13035551234')
FROM p;
```

| phone | reshape |
| --- | --- |
| (303) 555-1234 | +13035551234 |
| (720) 867-5309 | +17208675309 |
| 415-555-0100 | +14155550100 |

The two `(ddd) ddd-dddd` numbers share one cached expression; the `ddd-ddd-dddd`
one gets another. Inspect or pin them like any synth snippet:

```sql
SELECT rvbbit.value_shape('(303) 555-1234');          -- (ddd) ddd-dddd
SELECT shape_fingerprint, generated_sql FROM rvbbit.synth_cache WHERE operator = 'reshape';
```

## Inspecting each step

Every stage's resultset is recorded in `rvbbit.flow_steps`, so you can see what the
data looked like at each step (and, for structural stages, the SQL that was run):

```sql
SELECT step_idx, stage, n_rows, generated_sql
FROM rvbbit.flow_steps
WHERE run_id = (SELECT run_id FROM rvbbit.flow_steps ORDER BY created_at DESC LIMIT 1)
ORDER BY step_idx;
```

In the SQL Desktop, a **Steps** tab appears after a pipeline run with a tab per
stage. (Rows are stored capped to a sample; `n_rows` is the true count. Clean up
old runs with `rvbbit.reap_flow_steps(interval)`.)

## Writing your own

A rowset operator is just an operator with `shape => 'rowset'`. Two execution
strategies, chosen by `parser`:

- `parser => 'json'` — **value mode**: the model receives the table (as
  `{{ _table }}`, with `{{ _table_columns }}` / `{{ _table_row_count }}`) and
  returns `{"data": [ …rows… ]}`. This is how `analyze` and `enrich` work.
- `parser => 'sql'` — **synth-sql**: the model receives the schema
  (`{{ _table_schema }}`, `{{ _table_distinct }}`) and returns
  `{"sql": "<SELECT over _input>"}`, which is cached by shape and executed. This is
  how `pivot` / `group` / `top` / `filter` work.

```sql
SELECT rvbbit.create_operator(
  op_name        => 'redact_table',
  op_arg_names   => ARRAY['prompt'],
  op_return_type => 'jsonb',
  op_shape       => 'rowset',
  op_parser      => 'json',
  op_system      => 'Return {"data":[…]} with every original column preserved and any PII values masked.',
  op_user        => 'REQUEST: {{ prompt }}' || E'\n\nTABLE:\n' || '{{ _table }}'
);
-- then: select * from people then redact_table('mask emails and phone numbers')
```

Because pipelines are operators, every stage is logged to
[receipts](/docs/receipts-costs) — cost, latency, and cache hits are queryable,
and a cached structural stage costs nothing to re-run.

For a worked, real-dataset walkthrough see the
[Bigfoot field notebook](/docs/examples/bigfoot-field-notebook).
