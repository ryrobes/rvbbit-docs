---
title: Text-to-SQL
description: Turn a natural-language intent into a grounded, read-only SELECT with rvbbit.synth - generate it, or run it.
section: SQL Primitives
navOrder: 40
sourceDocs:
  - ../rvbbit-sql/docs/PIPELINE_CASCADES_PLAN.md
---

`rvbbit.synth` turns a natural-language request into **one read-only PostgreSQL
SELECT over your actual database**, grounded by the crawled
[catalog](/docs/retrieval). It's the widest scope of the same model-as-compiler
idea behind [`reshape`](/docs/pipelines#the-same-idea-on-single-values-reshape)
and the [pipeline](/docs/pipelines) stages: the model authors SQL once, the result
is cached, and execution is plain Postgres.

Two entry points - one that hands you the SQL, one that runs it:

```sql
-- Generate the SQL (never executes it):
SELECT rvbbit.synth_sql('bigfoot sightings in California since 1990');

  SELECT s.id, s.state, s.classification, s.reported, s.season, s.observed
  FROM bigfoot.sightings AS s
  WHERE s.state = 'California' AND s.reported >= DATE '1990-01-01'
  ORDER BY s.reported DESC
  LIMIT 100

-- Run it and get rows back (opt-in; see Safety below):
SET rvbbit.synth_enabled = on;
SELECT value FROM rvbbit.synth('number of sightings per region');

  {"region": "West", "sighting_count": 8}
  {"region": "South", "sighting_count": 4}
  …
```

Text-to-SQL is tame in 2026 - what's interesting is that it's the *same machinery*
as everything else in rvbbit (the operator + [receipts](/docs/receipts-costs)
system), so the generated SQL is cached, inspectable, pinnable, and composes with
the rest of the engine.

## Grounding: it sees your schema, not a guess

Before generating, `synth` retrieves the **most relevant tables and columns** for
the intent from the crawled catalog via [`data_search`](/docs/retrieval) (KNN over
column/table fingerprints), and injects their descriptions - types, example
values, and foreign keys - into the prompt. So a request like *"sightings per
region"* discovers that `sightings.state` references `regions.state` and writes the
join, rather than hallucinating columns:

```sql
SET rvbbit.synth_enabled = on;
SELECT value FROM rvbbit.synth('number of sightings per region');
-- → SELECT r.region, count(s.id) AS sightings_count
--   FROM bigfoot.regions r LEFT JOIN bigfoot.sightings s ON s.state = r.state
--   GROUP BY r.region ORDER BY sightings_count DESC
```

Grounding is best after a [`catalog_crawl()`](/docs/retrieval) (which adds example
values and FK hints). With no catalog it falls back to `information_schema` - table
and column names + types - so `synth` works out of the box on a small database,
just less richly.

## Safety: read-only by construction

Running model-authored SQL is **opt-in**. `rvbbit.synth_sql` (generate only) is
always available; the executing `rvbbit.synth` is gated behind a GUC, off by
default:

```sql
SET rvbbit.synth_enabled = on;        -- session
ALTER DATABASE mydb SET rvbbit.synth_enabled = on;   -- or per database
```

Generated SQL passes through two gates before it can ever run:

- **Validation** - the statement is `PREPARE`-d (parse + analyze, so a hallucinated
  column/table is caught) and then its plan is inspected; anything that writes (a
  `ModifyTable` node, including data-modifying CTEs like `WITH x AS (DELETE …)`) is
  rejected. Only a single read-only `SELECT` passes. Validated SQL is cached.
- **Execution** - `rvbbit.synth` runs the SQL inside a **read-only transaction**
  with a statement timeout and a row cap, so even a function with side effects can't
  write. The guards are scoped so your surrounding transaction stays read-write.

A destructive request just yields a harmless SELECT (the model is told read-only,
and the validator enforces it):

```sql
SELECT count(*) FROM rvbbit.synth('delete every sighting permanently');  -- returns rows; deletes nothing
```

## Caching: one model call per intent

`synth` caches the validated SQL in `rvbbit.synth_cache`, keyed by the intent plus
the retrieved schema. Re-running the same intent is a **cache hit - no model call**;
if the schema changes, the retrieved context changes and it regenerates. The cached
snippets are ordinary rows you can read, edit, and pin - and they show up in
Data Rabbit's **Cache** view (the *Synth* tab), alongside the per-call audit in
*Receipts*:

```sql
SELECT operator, generated_sql, pinned FROM rvbbit.synth_cache WHERE operator = 'synth';
```

## It's just an operator - write your own

`synth` is the built-in operator of a new shape, `query` (`shape => 'query',
parser => 'sql'`) - the table-scoped sibling of the per-row `scalar` and pipeline
`rowset` synth operators. You can create your own house-style generators the same
way you create any operator, and point `synth`/`synth_sql` at them:

```sql
SELECT rvbbit.create_operator(
  op_name        => 'report',
  op_arg_names   => ARRAY['intent'],
  op_return_type => 'text',
  op_shape       => 'query',
  op_parser      => 'sql',
  op_system      => 'Write ONE read-only PostgreSQL SELECT. Only use the analytics schema. Always add LIMIT 1000.',
  op_user        => 'REQUEST: {{ intent }}' || E'\n\nRELEVANT SCHEMA:\n' || '{{ _schema_context }}'
);

SELECT rvbbit.synth_sql('weekly active users by plan', operator => 'report');   -- the SQL
SELECT *      FROM rvbbit.synth('weekly active users by plan', operator => 'report');  -- run it
```

The `query` shape fills `{{ _schema_context }}` from `data_search`; everything else
(prompt, validation, caching, the read-only execution) is shared.

## Composing in plain SQL

`rvbbit.synth(intent)` returns `SETOF jsonb` (one `value` object per row), because
the result columns aren't known until runtime - Postgres can't reference dynamic
columns from a function in a CTE (it needs the shape at parse time). Two ways to
work with it in psql:

```sql
-- 1. Project the jsonb yourself (you know the keys you asked for):
SELECT value->>'region' AS region, (value->>'sighting_count')::int AS n
FROM rvbbit.synth('number of sightings per region');

-- 2. Use synth_sql and run the generated SELECT - it has real columns:
SELECT rvbbit.synth_sql('number of sightings per region') \gexec
```

Think of `synth` as the convenience form ("just give me rows") and `synth_sql` as
the composable form ("give me a real query I can build on"). In **Data Rabbit**
the jsonb is expanded into real, typed columns automatically - so `select * from
rvbbit.synth(…)` renders as a normal grid, and you can drag a field out to
post-aggregate it like any other result.

## Where it fits

| Scope | Operator | Input | Generates |
| --- | --- | --- | --- |
| per value | [`reshape`](/docs/pipelines#the-same-idea-on-single-values-reshape) | one text value | an expression |
| per resultset | [`pivot` / `group` / …](/docs/pipelines) | `_input` rows | a `SELECT` over `_input` |
| **whole DB** | **`synth`** | a natural-language intent | a `SELECT` over real tables |

All three: the model compiles once per shape, the result is cached, and execution
is native Postgres. See [Pipelines](/docs/pipelines) for the resultset stages and
[Retrieval](/docs/retrieval) for the catalog that grounds generation.
