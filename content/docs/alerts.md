---
title: Alerts
description: A durable, async, edge-triggered alert engine — a SQL or metric condition over your tables drives an action (SQL, MCP tool, or flow), swept by pg_cron tiers and drained by a paced worker, with full state and firing history as plain rows.
section: SQL Primitives
navOrder: 43
sourceDocs:
  - ../rvbbit-sql/docs/ALERTS_PLAN.md
  - ../rvbbit-sql/docs/MCP.md
---

An **alert** watches a condition over your rvbbit tables and runs an action when
that condition trips. It is **edge-triggered** (fires on the `pass → fail`
transition, not while sustained), **durable** (every rule, state, and firing is a
plain Postgres row), and **async** (a pg_cron *sweep* reconciles conditions and
enqueues; a separate *worker* drains the queue at a paced rate, so a flood of
breaches never blocks your database or a slow external call). The condition can
be raw SQL or a [metric](/docs/metrics-kpis) verdict; the action can be SQL, an
[MCP tool](/docs/mcp) call, or a [flow](/docs/pipelines).

## Define An Alert

`define_alert` appends a versioned rule. The **condition** and **action** are
JSONB specs; everything else has a default:

```sql
rvbbit.define_alert(
    p_name        text,
    p_condition   jsonb,
    p_action      jsonb,
    p_fire_policy jsonb    DEFAULT '{}',          -- e.g. {"consecutive_n": 2}
    p_cardinality text     DEFAULT 'per_entity',  -- or 'aggregate'
    p_fan_out_cap integer  DEFAULT 100,           -- max transitions enqueued per sweep
    p_cadence     text     DEFAULT 'normal',      -- 'fast' | 'normal' | 'slow'
    p_description text     DEFAULT NULL,
    p_owner       text     DEFAULT NULL,
    p_labels      jsonb    DEFAULT '{}'
) RETURNS integer                                 -- the new version
```

### Condition: from a metric

The simplest condition reads a [KPI](/docs/metrics-kpis#kpis-the-check-is-part-of-the-definition)'s latest verdict —
the alert fires when the metric's check goes from `pass` to `fail`:

```sql
SELECT rvbbit.define_alert(
    p_name      => 'high_error_rate',
    p_condition => '{"kind": "metric", "metric": "daily_error_rate"}',
    p_action    => '{"operator": "noop"}',              -- a test action
    p_fire_policy => '{"consecutive_n": 2}',            -- require 2 consecutive fails
    p_cadence   => 'normal',
    p_description => 'Page when the daily error-rate KPI breaches twice in a row.'
);
```

### Condition: from SQL

A `sql` condition runs a query that returns an `entity_key` plus either a
`status` (`'pass'`/`'fail'`) or a numeric `score` you compare to a `threshold`:

```sql
-- Fire per region whose packet-drop rate exceeds 15%.
SELECT rvbbit.define_alert(
    p_name      => 'regional_packet_loss',
    p_condition => $$ {
        "kind":  "sql",
        "query": "SELECT region AS entity_key, drop_pct FROM monitoring.network_health",
        "expr":  "drop_pct > 0.15"
    } $$,
    p_action    => $$ {
        "operator": "sql",
        "sql": "INSERT INTO ops.incidents(region, opened_at) VALUES ($1->>'entity', now())"
    } $$,
    p_cardinality => 'per_entity'   -- one independent alert per region
);
```

A **scored** condition uses `threshold` + `compare` (`gte` / `lte`) instead of
`expr`:

```sql
"condition": {
    "kind":      "sql",
    "query":     "SELECT service AS entity_key, anomaly_score AS score FROM ml.detections",
    "threshold": 0.85,
    "compare":   "gte"
}
```

### Action: SQL, MCP, or flow

| `operator` | Spec keys | Does |
| --- | --- | --- |
| `noop` | — | Nothing (testing / dry runs). Still logged. |
| `sql` | `sql` | Runs the SQL; `$1` is the alert context JSONB. |
| `mcp_call` | `server`, `tool`, `args_template` | Calls an [MCP](/docs/mcp) tool; `{{entity}}`/`{{rule}}` interpolate. |
| `flow` | a flow spec | Runs a [pipeline](/docs/pipelines). |

```sql
-- Page on-call via an MCP server when an anomaly trips.
"action": {
    "operator": "mcp_call",
    "server":   "pagerduty",
    "tool":     "page_on_call",
    "args_template": { "title": "Anomaly in {{entity}}", "severity": "high" }
}
```

## Edge-Triggering

State lives in `rvbbit.alert_state`, one row per `(rule, entity_key)`:

- **`pass → fail`** — enqueue the action (the only transition that fires in v1).
- **`fail → fail`** — nothing (sustained breach does *not* re-fire).
- **`fail → pass`** — re-arm (so the next breach fires again).

`fire_policy.consecutive_n` adds hysteresis: require N consecutive failing sweeps
before firing — useful to denoise fuzzy or semantic conditions.

## Run It (and schedule it)

The sweep reconciles conditions and enqueues; the worker executes the queue. You
can run them by hand:

```sql
SELECT rvbbit.alert_sweep('normal');     -- evaluate the 'normal'-tier rules now
SELECT rvbbit.alert_worker_tick(50);     -- execute up to 50 queued actions
```

In production, install the four pg_cron jobs (three sweep tiers + the worker) in
one call:

```sql
SELECT rvbbit.alerts_install_cron();   -- fast */1m, normal */15m, slow hourly, worker */1m
-- customize:  rvbbit.alerts_install_cron(p_fast => '*/2 * * * *', p_worker_max => 100)
```

A rule's `cadence` (`fast`/`normal`/`slow`) picks which sweep tier evaluates it.

## Control & Mute

Runtime flags live in `rvbbit.alert_control` and survive redefinition:

```sql
SELECT rvbbit.disable_alert('high_error_rate');             -- stop evaluating
SELECT rvbbit.enable_alert('high_error_rate');
SELECT rvbbit.mute_alert('high_error_rate', interval '1 hour');  -- evaluate but don't fire
SELECT rvbbit.unmute_alert('high_error_rate');
SELECT rvbbit.set_alert_cadence('high_error_rate', 'fast');  -- move to the fast tier

SELECT rvbbit.set_alerts_enabled(false);   -- global kill switch (sweep + worker)
```

Categorize like metrics and cubes:

```sql
SELECT rvbbit.set_category('alert', 'regional_packet_loss', 'Infrastructure', 'Networking');
```

## Inspect

```sql
-- The rule catalog (latest version + control + category) — the UI's read surface.
SELECT name, version, enabled, muted, cadence_tier, category
FROM   rvbbit.alert_catalog
WHERE  name = 'high_error_rate';

-- What is breaching right now?
SELECT rule_name, entity_key, last_status, consecutive, last_fired_at
FROM   rvbbit.alert_state
WHERE  last_status = 'fail';

-- Recent firings (the action log).
SELECT rule_name, entity_key, transition, status, action_output, ts
FROM   rvbbit.alert_events
WHERE  ts > now() - interval '24 hours'
ORDER  BY ts DESC;

-- Pending actions (what the next worker tick will run).
SELECT rule_name, entity_key, status, attempts, enqueued_at
FROM   rvbbit.alert_queue
WHERE  status IN ('pending', 'failed');

-- Sweep heartbeat — did each tier run, and what did it see?
SELECT tier, started_at, finished_at, rules_evaluated, transitions, enqueued, errors
FROM   rvbbit.alert_sweep_runs
ORDER  BY started_at DESC LIMIT 3;
```

## Tables

| Object | Holds |
| --- | --- |
| `rvbbit.alert_rules` | Append-only versioned definitions (`condition_spec`, `action_spec`, `fire_policy`, `cardinality`, `fan_out_cap`, …). |
| `rvbbit.alert_control` | One mutable row per rule: `enabled`, `muted_until`, `cadence_tier`. |
| `rvbbit.alert_state` | Reconciler memory: `last_status`, `score`, `consecutive`, `last_fired_at` per `(rule, entity)`. |
| `rvbbit.alert_queue` | Pending actions enqueued by the sweep, drained by the worker. |
| `rvbbit.alert_events` | The firing log — one row per executed action (with output / error). |
| `rvbbit.alert_sweep_runs` | Per-sweep heartbeat for observability. |
| `rvbbit.alert_catalog` | View: `alert_rules` (latest) ⋈ `alert_control` ⋈ category. |

## Notes

- **`per_entity` vs `aggregate`** — `per_entity` tracks each `entity_key` from the
  condition independently (one fire per region); `aggregate` collapses to a single
  alert per rule. `fan_out_cap` bounds how many transitions a single sweep enqueues.
- **Metric conditions don't re-run the metric** — they read the latest verdict
  already in `metric_observations`, so they follow the metric's own materialization
  cadence. Pair an alert with [`materialize_all_metrics`](/docs/metrics-kpis#materialize-everything).
- **Fire-and-forget (v1)** — actions are executed and logged, but their downstream
  outcome isn't tracked for auto-remediation yet.
- **Drop it all** with `rvbbit.delete_alert('name')` (rule + state + queue + events).
