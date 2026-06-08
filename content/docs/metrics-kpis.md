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
versioned, time-travelable reporting over the rvbbit tables you already have. If
you drop the extension, you keep every definition and every recorded observation
as ordinary Postgres rows. **All your data, no lock-in.**

## Two Time Axes

Classic metrics tools struggle with three things: latency, "as of now vs. as of
then," and the metric *definition* shifting over time. rvbbit already handles the
first two with its OLAP layer and [time travel](/docs/time-travel). The metrics
layer handles the third by storing definitions as **plain, append-versioned
rows** — so every run is parameterized by two *independent* axes:

| Axis | Controlled by | Means |
| --- | --- | --- |
| **def-time** | `def_as_of` (a `created_at` filter) | which version of the definition |
| **data-time** | `data_as_of` (rvbbit AS OF) | the data as of which moment |

```sql
SELECT * FROM rvbbit.metric('revenue', '{}'::jsonb,
    def_as_of  => '2025-01-01',   -- the metric as we defined it then
    data_as_of => now());         -- over the data as it is now
```

"Today's definition over last quarter's data" and "last quarter's definition over
today's data" are both one call.

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
SELECT rvbbit.check_metric('daily_revenue', '{}'::jsonb, def_as_of => v1_time);  -- pass
SELECT rvbbit.check_metric('daily_revenue', '{}'::jsonb, def_as_of => now());    -- fail
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
stays current.

## A Durable, Verdict-Stamped History

Live reads stay live — the past is reconstructable by re-running AS OF, because
the generations *are* the history. So rvbbit materializes not to *have* a history,
but as a durable **log of what was reported**: `(value, verdict, threshold-version,
def-time, data-time, generation, trigger)`. It outlives generation reaping and
records the KPI verdict *as decided*.

The default cadence is not a clock — **compaction is the trigger.** A new
generation enqueues itself (if a metric depends on the table) and
`materialize_tick()` (a `pg_cron` heartbeat) drains it, materializing each
dependent metric at the generation's commit time. One observation per
`(metric, generation)`, aligned to the data's own heartbeat. With the Temporal
Mirror, each sync run becomes one observation automatically.

```sql
SELECT data_generation, value->0->>'total' AS total, status, trigger
FROM rvbbit.metric_history('daily_revenue');

SELECT rvbbit.set_materialize('daily_revenue', on_compaction => true);
SELECT rvbbit.schedule_materialize_tick('* * * * *');   -- or call materialize_tick() yourself
```

Observations are **immutable** — they are the record of what you reported.
"What it *would* have been under a newer definition" stays a live query.

## Function Reference

| Function | |
| --- | --- |
| `define_metric(name, sql, params, grain, description, owner, labels, check)` → `int` | append a version (KPI if `check` set) |
| `metric(name, params, def_as_of, data_as_of)` → `SETOF jsonb` | run across both axes |
| `metric_sql(name, params, def_as_of)` → `text` | the composed SQL, no run |
| `preview_metric_sql(draft_sql, params, def_as_of)` → `text` | compose an unsaved draft |
| `check_metric(name, params, def_as_of, data_as_of)` → `jsonb` | the KPI verdict (`NULL` if not a KPI) |
| `materialize_metric(name, params, def_as_of, data_as_of, generation, trigger)` → `bigint` | append one observation |
| `metric_history(name, limit)` → `TABLE` | the durable series |
| `set_materialize(name, on_compaction, cron, enabled)` → `void` | per-metric policy |
| `materialize_tick(max)` → `int` | drain the compaction queue (pg_cron) |

Tables and views — all plain and `SELECT`-able: `rvbbit.metric_defs`,
`rvbbit.metric_catalog`, `rvbbit.metric_observations`, `rvbbit.metric_materialize`,
`rvbbit.metric_dependencies`.

In the [lens](/docs/overview), a **Metrics** desktop folder adds three apps — a
Catalog, a Creator (with a live resolved-SQL preview and verdict badge), and an
Inspector that runs a metric across both axes with a results grid, a pass/fail
verdict, and a materialized **Trend**.
