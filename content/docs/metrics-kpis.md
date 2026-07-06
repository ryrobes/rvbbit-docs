---
title: Metrics And KPIs
description: Versioned SQL metrics with KPI checks, a bitemporal run model, rolling baselines, and a durable verdict-stamped history — built into every rvbbit table.
section: SQL Primitives
navOrder: 41
sourceDocs:
  - ../rvbbit-sql/docs/METRICS.md
  - ../rvbbit-sql/docs/TIME_TRAVEL.md
---

Metrics are a small BI layer that comes with rvbbit tables — and you never have
to use it. A metric is a row in a plain table and a `SELECT`. A KPI is that plus
one more `SELECT` that returns a boolean. There is no separate metric store, no
metric DSL, and no service to run. If you define one, you get systematic,
versioned reporting (with experimental time-travel queries) over the rvbbit
tables you already have. If
you drop the extension, you keep every definition and every recorded observation
as ordinary Postgres rows. **All your data, no lock-in.**

## Two Time Axes

Classic metrics tools struggle with three things: latency, "as of now vs. as of
then," and the metric *definition* shifting over time. The metrics layer's core
contribution is the third axis: it stores definitions as **plain, append-versioned
rows**, so every run is parameterized by two *independent* axes:

| Axis | Controlled by | Means |
| --- | --- | --- |
| **def-time** | `p_def_as_of` (a `created_at` filter) | which version of the definition |
| **data-time** | `p_data_as_of` (rvbbit AS OF) | the data as of which moment |

The **def-time** axis is stable: definitions are immutable, versioned rows, so
"which definition" is always exact. The **data-time** axis rides on rvbbit
[time travel](/docs/time-travel), which is experimental and intended primarily
for audit and reproducibility — treat data-time results as best-effort and
validate them before relying on them. Def-time alone (over live data) is the
solid, everyday path.

```sql
SELECT * FROM rvbbit.metric('revenue', '{}'::jsonb,
    p_def_as_of  => '2025-01-01',   -- the metric as we defined it then
    p_data_as_of => now());         -- over the data as it is now
```

"Today's definition over last quarter's data" and "last quarter's definition over
today's data" are both one call. The def-time direction is exact; the data-time
direction (`data_as_of` in the past) is best-effort and still being validated.

## Define A Metric

`define_metric` appends a **new version** each time; definitions are never
mutated. Templates use `{param}` for a safe literal, `{param!}` for raw text, and
`{metric:NAME}` to inline another metric as a subquery.

```sql
SELECT rvbbit.define_metric(
  'revenue_by_region',
  $$SELECT region, sum(amount) AS revenue
    FROM orders
    WHERE amount >= {min}
    GROUP BY region$$,
  '{"min": 0}'::jsonb,    -- default params
  'region', 'Revenue per region', 'analytics');
```

```sql
SELECT * FROM rvbbit.metric('revenue_by_region', '{"min": 50}'::jsonb);
SELECT rvbbit.metric_sql('revenue_by_region', '{"min": 50}'::jsonb);  -- the exact SQL, no run
SELECT * FROM rvbbit.metric_catalog;                                   -- latest of each
SELECT * FROM rvbbit.metric_versions('revenue_by_region');            -- history
```

## KPIs: The Check Is Part Of The Definition

A metric becomes a KPI when its definition carries a check (the 8th argument to
`define_metric`). The check runs against the metric's result — exposed to it as a
CTE named `metric` — and must reduce to **one row** with an `ok` boolean (plus
optional `status` / `value` / `target`). Thresholds are `{param}` tokens, so they
have versioned defaults and are overridable per call.

```sql
SELECT rvbbit.define_metric(
  'daily_revenue',
  'SELECT sum(amount) AS total FROM orders',
  '{"target": 1000000}'::jsonb, 'all', 'Revenue must clear target', 'analytics',
  '{}'::jsonb,
  'SELECT total >= {target} AS ok, total AS value FROM metric');

SELECT rvbbit.check_metric('daily_revenue');
-- → {"ok": true, "value": 1250000, "status": "pass"}
```

Because the check lives on the **versioned** definition, moving a threshold makes
a new version — so the verdict is auditable across def-time. Over the *same* data,
yesterday's threshold and today's threshold can disagree, and both answers are
real:

```sql
SELECT rvbbit.check_metric('daily_revenue', '{}'::jsonb, p_def_as_of => v1_time);  -- pass
SELECT rvbbit.check_metric('daily_revenue', '{}'::jsonb, p_def_as_of => now());    -- fail
```

A `NULL` `ok` is never treated as "pass" — a KPI over missing data does not read
as healthy.

## Rolling Baselines In One Line

`{metric:self.OFFSET}` resolves to the metric's scalar value at a shifted
data-time, so rolling, delta, and week-over-week become single tokens:

```sql
-- check: "must not shrink vs the prior snapshot"
'SELECT total >= {metric:self.-1day} AS ok, total AS value FROM metric'

-- metric body: week-over-week
'SELECT total::numeric / {metric:revenue.-7days} - 1 AS wow FROM {metric:revenue} r'
```

`OFFSET` is a signed amount + unit (`-1day`, `-12hours`, `+1week`, `-1month`) or
an alias (`yesterday`, `lastweek`). Only the data-time shifts; the definition
stays current. Because the shifted value is reconstructed by re-reading earlier
generations via AS OF, treat these rolling/delta figures as best-effort
(experimental) — they depend on the data-time path that is still being hardened.

## A Durable, Verdict-Stamped History

Live reads stay live, and earlier generations can be re-read with AS OF to
*approximate* a historical value (experimental — see
[time travel](/docs/time-travel)). Rather than lean on that for the record of
record, rvbbit materializes a durable **log of what was reported**: `(value,
verdict, threshold-version, def-time, data-time, generation, trigger)`. It
outlives generation reaping and records the KPI verdict *as decided* — so the
authoritative history is the materialized log, not a replayed reconstruction.

The default cadence is not a clock — **compaction is the trigger.** A new
generation enqueues itself (if a metric depends on the table) and
`materialize_tick()` (a `pg_cron` heartbeat) drains it, materializing each
dependent metric at the generation's commit time. One observation per
`(metric, generation)`, aligned to the data's own heartbeat. With the Temporal
Mirror, each sync run becomes one observation automatically.

```sql
SELECT data_generation, value->0->>'total' AS total, status, trigger
FROM rvbbit.metric_history('daily_revenue');

SELECT rvbbit.set_materialize('daily_revenue', p_on_compaction => true);
SELECT rvbbit.schedule_materialize_tick('* * * * *');   -- or call materialize_tick() yourself
```

Observations are **immutable** — they are the record of what you reported.
"What it *would* have been under a newer definition" stays a live query.

## Materialize Everything

`materialize_tick()` only touches metrics whose tables just compacted. To take
**one timestamped snapshot of every metric on demand** — the natural shape for a
scheduled batch — use `materialize_all_metrics`. It records one observation per
metric at a single captured `def`/`data` timestamp (a consistent snapshot), and a
failing metric is reported, never aborting the rest:

```sql
SELECT * FROM rvbbit.materialize_all_metrics();                  -- everything, now
SELECT * FROM rvbbit.materialize_all_metrics(p_category => 'Finance');
-- → one row per metric: (metric_name, observation_id, status, error)
```

```sql
rvbbit.materialize_all_metrics(
    p_category    text DEFAULT NULL,
    p_subcategory text DEFAULT NULL,
    p_def_as_of   timestamptz DEFAULT NULL,   -- NULL = now()
    p_data_as_of  timestamptz DEFAULT NULL,   -- NULL = now(); set for a backfill
    p_trigger     text DEFAULT 'bulk'
) RETURNS TABLE(metric_name text, observation_id bigint, status text, error text)
```

Schedule it as a [maintenance job](/docs/accelerator-freshness#scheduled-maintenance-entrypoints):

```sql
SELECT cron.schedule('rvbbit_materialize_all', '0 * * * *',
                     $$SELECT rvbbit.materialize_all_metrics()$$);
```

A broken metric or check (e.g. an unbound `{param}`) is **isolated** — that one
metric comes back as its own result row with `status = 'error'` and the error
message in `error` (and no observation written for it), while every other metric
in the batch still materializes. One typo never wedges a batch. Give every
`{param}` a default in the metric's `params` to be safe.

## Categories

Metrics, [cubes](/docs/cubes), and [alerts](/docs/alerts) share one optional
two-level taxonomy. Categories organize the catalog and drive the `p_category`
filter on `materialize_all_metrics`:

```sql
SELECT rvbbit.set_category('metric', 'daily_revenue', 'Finance', 'Revenue');
SELECT name, category, subcategory FROM rvbbit.metric_catalog WHERE category = 'Finance';
```

## Dimensional Metrics

A metric defined over a [cube](/docs/cubes) can be **sliced** by the cube's
dimensions without redefining it — declare the source in `labels`, then call
`metric_by`:

```sql
-- A scalar headline over a cube.
SELECT rvbbit.define_metric('pipeline_value',
    'SELECT sum(amount) AS pipeline_value FROM cubes.opportunities',
    '{}', 'scalar', 'Total open + won pipeline', 'sales',
    '{"cube_source": "cubes.opportunities"}'::jsonb);

SELECT * FROM rvbbit.metric('pipeline_value');     -- [{"pipeline_value": 5000000}]
SELECT * FROM rvbbit.metric_by('pipeline_value', ARRAY['stage_name', 'region']);
-- [{"stage_name": "Closed Won", "region": "AMER", "pipeline_value": 2000000}, ...]
```

What can you slice by?

```sql
SELECT * FROM rvbbit.metric_dimensions('pipeline_value');   -- groupable columns + semantics
SELECT * FROM rvbbit.cube_dimensions('cubes.opportunities') WHERE groupable;
```

## Boards & Monitoring

`metric_board` pivots the observation log into a time-bucketed grid for trend
charts; `breaching_kpis` lists the KPIs failing right now; `metric_lineage` shows
which tables a metric reads (impact analysis):

```sql
SELECT * FROM rvbbit.metric_board(p_metrics => ARRAY['daily_revenue'], p_bucket => 'day');

SELECT metric_name, status, verdict, observed_at FROM rvbbit.breaching_kpis();

SELECT rvbbit.metric_lineage('pipeline_value');   -- {"cubes.opportunities"}
```

A breaching KPI is the natural trigger for an [alert](/docs/alerts)
(`{"kind": "metric", "metric": "daily_revenue"}`).

## Function Reference

| Function | |
| --- | --- |
| `define_metric(name, sql, params, grain, description, owner, labels, check)` → `int` | append a version (KPI if `check` set) |
| `metric(name, params, def_as_of, data_as_of)` → `SETOF jsonb` | run across both axes |
| `metric_sql(name, params, def_as_of)` → `text` | the composed SQL, no run |
| `preview_metric_sql(draft_sql, params, def_as_of)` → `text` | compose an unsaved draft |
| `check_metric(name, params, def_as_of, data_as_of)` → `jsonb` | the KPI verdict (`NULL` if not a KPI) |
| `materialize_metric(name, params, def_as_of, data_as_of, generation, trigger)` → `bigint` | append one observation |
| `materialize_all_metrics(category, subcategory, def_as_of, data_as_of, trigger)` → `TABLE` | snapshot every metric, now |
| `materialize_tick(max)` → `int` | drain the compaction queue (pg_cron) |
| `metric_history(name, limit)` → `TABLE` | the durable series |
| `metric_board(metrics, from, to, bucket)` → `SETOF jsonb` | time-bucketed grid for trends |
| `metric_by(name, slice[], params, def_as_of, data_as_of)` → `SETOF jsonb` | slice a cube-backed metric |
| `metric_dimensions(name)` / `cube_dimensions(cube)` → `TABLE` | groupable dimensions |
| `breaching_kpis()` → `TABLE` | KPIs currently failing |
| `metric_lineage(name)` → `text[]` | tables the metric reads |
| `set_materialize(name, on_compaction, cron, enabled)` → `void` | per-metric materialize policy |
| `set_category('metric', name, category, subcategory)` → `void` | tag for organization + filtering |

Tables and views — all plain and `SELECT`-able: `rvbbit.metric_defs`,
`rvbbit.metric_catalog` (latest def per metric + `category`/`subcategory`),
`rvbbit.metric_observations` (the immutable log: `value`, `verdict`, `metric_version`,
`def_as_of`, `data_as_of`, `data_generation`, `trigger`), `rvbbit.metric_materialize`,
`rvbbit.metric_dependencies`.

In [Data Rabbit](/docs/data-rabbit), a **Metrics** folder adds three apps — a
Catalog, a Creator (with a live resolved-SQL preview and verdict badge), and an
Inspector that runs a metric across both axes with a results grid, a pass/fail
verdict, and a materialized **Trend**.
