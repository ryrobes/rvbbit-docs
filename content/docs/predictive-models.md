---
title: Predictive Models
description: Train scikit-learn models from a SELECT, serve them as operators, and evaluate them — all from SQL.
section: SQL Primitives
navOrder: 38
sourceDocs:
  - ../rvbbit-sql/docs/MODELS_UNIFIED_PLAN.md
  - ../rvbbit-sql/docs/MODEL_STUDIO_PLAN.md
---

A trained model in RVBBIT is just another operator with a receipt. You define it
from a `SELECT`, a worker fits it, and the result is a `predict_<model>(row jsonb)`
function you can call from ordinary SQL. The same shape that backs
[semantic functions](/docs/semantic-functions) and
[capability packs](/docs/capability-packs) also backs classical supervised
models: tabular classifiers and regressors trained with scikit-learn.

Nothing here is UI-only. Every step below is a SQL call you can run from `psql`
or DataGrip. The lens Model Studio window is observability sugar on top of these
exact statements.

## Train From A SELECT

`train_model` registers a model and queues a training run. The training data is
whatever your query returns: the listed feature columns plus the target column.

```sql
SELECT rvbbit.train_model(
  model_name    => 'churn_risk',
  source_sql    => $$
    SELECT tenure_months, monthly_charges, plan_tier, region,
           support_tickets, churned AS label
    FROM analytics.customers
    WHERE signup_at < now() - interval '90 days'
  $$,
  target_column => 'label',
  task          => 'classification',
  feature_schema => $$[
    {"name":"tenure_months","type":"float8"},
    {"name":"monthly_charges","type":"float8"},
    {"name":"plan_tier","type":"text"},
    {"name":"region","type":"text"},
    {"name":"support_tickets","type":"float8"}
  ]$$::jsonb,
  training_opts => $$ {"estimator":"random_forest","n_estimators":200,"test_size":0.25} $$::jsonb,
  description   => 'Predict 90-day churn from account features.'
);
```

`train_model` returns the run id. It does not block on training — it enqueues a
run into `rvbbit.ml_training_runs` and returns immediately.

Numeric columns (`float8`, `int`) are treated as numeric features; `text`
columns are one-hot encoded. `task` is `classification` or `regression` (the
schema also reserves `forecasting`, `anomaly`, and others for future workers).
`training_opts.estimator` accepts `random_forest` (default), `extra_trees`,
`logistic` (classification), or `ridge` (regression).

Not sure of the schema? Let RVBBIT infer it, and pre-flight the query first:

```sql
SELECT rvbbit.validate_training_sql(
  'SELECT tenure_months, plan_tier, churned AS label FROM analytics.customers',
  'label');

SELECT rvbbit.infer_feature_schema(
  'SELECT tenure_months, plan_tier, churned AS label FROM analytics.customers',
  'label');
```

## The Trainer Worker

Training is done by a SQL-bound worker, not inside the backend. The worker claims
a queued run with `SKIP LOCKED`, fits the model with scikit-learn, registers a
serving backend and a `predict_<model>` operator, then marks the run complete.

```bash
rvbbit-trainer watch --include-unmanaged --serve-local --serve-host db-host
```

`watch` polls for queued runs, fits each one, and (`--serve-local`) launches the
serving sidecar so predictions go live without any further steps. By default it
only claims managed runs (see below); `--include-unmanaged` tells it to also pick
up plain `train_model` runs. To process one specific run instead of polling, use
`rvbbit-trainer train-run <run_id>`.

You can watch a run move through the queue entirely in SQL:

```sql
SELECT name, status, latest_run_status, operator_name, trained_at
FROM rvbbit.ml_model_status
WHERE name = 'churn_risk';
```

## Predict

Once the worker registers the model, calling it is one function. The operator
takes a `jsonb` row of features and returns a `jsonb` result.

```sql
SELECT rvbbit.predict_churn_risk(jsonb_build_object(
  'tenure_months', 4,
  'monthly_charges', 89.0,
  'plan_tier', 'pro',
  'region', 'us-west',
  'support_tickets', 3
));
-- {"label":"churned","score":0.78,"scores":[...],"prediction":"churned"}
```

Score a whole table by building the feature row per record:

```sql
SELECT id,
       rvbbit.predict_churn_risk(jsonb_build_object(
         'tenure_months', tenure_months,
         'monthly_charges', monthly_charges,
         'plan_tier', plan_tier,
         'region', region,
         'support_tickets', support_tickets)) ->> 'label' AS predicted
FROM analytics.customers
WHERE churned IS NULL;
```

A regression model returns a numeric `prediction` instead of a label. Like every
operator, each prediction is recorded in [receipts](/docs/receipts-costs) — and
reused when the same input row recurs — so scoring is auditable and idempotent.

## Evaluate

`evaluate_model` runs the predict operator over a labeled query and records the
result as a first-class, re-runnable evaluation. Classification yields accuracy
and a confusion matrix; regression yields RMSE, MAE, R², and residuals.

```sql
SELECT rvbbit.evaluate_model(
  model_name   => 'churn_risk',
  eval_sql     => $$
    SELECT tenure_months, monthly_charges, plan_tier, region,
           support_tickets, churned AS label
    FROM analytics.customers
    WHERE signup_at >= now() - interval '30 days'   -- held-out, recent accounts
  $$,
  label_column => 'label',
  eval_name    => 'churn_last_30d'
);

SELECT n_rows, metrics
FROM rvbbit.ml_evaluations
WHERE model_name = 'churn_risk'
ORDER BY created_at DESC
LIMIT 1;
```

Evaluate on data the model has not seen. Scoring the training rows will look
perfect because the model has memorized them — the honest signal comes from a
holdout. The confusion matrix is often more informative than the headline
accuracy: a model that just predicts the majority class will post a respectable
accuracy while the matrix shows every row landing in one column.

## Managed Training (No Terminal Required)

The basic path above needs a worker process to fit each queued run. The managed
path removes that step from your hands: an operator deploys the standing
[Warren](/docs/warren) agent once, as a service (like Postgres itself), and from
then on you just run one SQL statement per model. The same always-on daemon that
deploys serving sidecars claims the job, trains the model, serves it, and
registers the `predict_<model>` operator. There is no per-model command to run in
a terminal.

`train_model_managed` enqueues the run **and** a Warren `model_training` job with
a target selector. An agent only claims a job its node is eligible for: the
selector is matched against the node's labels, so a job aimed at a GPU box is
picked up by a GPU node and nothing else.

```sql
SELECT rvbbit.train_model_managed(
  model_name    => 'churn_risk',
  source_sql    => $$ SELECT ... FROM analytics.customers $$,
  target_column => 'label',
  task          => 'classification',
  deploy        => true,                          -- also stand up serving
  target        => '{"gpu": true}'::jsonb         -- placement: a GPU node
);
```

That returns immediately with the run and job ids. Watch the whole lifecycle —
queued, which node claimed it, training, completed, active — from SQL:

```sql
-- the full queue: each run with its Warren placement and serving state
-- (the view also exposes task, job_phase, run_id, operator_name, metrics, ...)
SELECT model_name, run_status, job_status, node, deploy
FROM rvbbit.training_queue
ORDER BY created_at DESC;

-- the quick "is it ready?" for one model
SELECT model_status, run_status, job_status, node, operator_name
FROM rvbbit.training_status('churn_risk');
```

When `training_status` shows `model_status = active`, the `predict_churn_risk`
operator is live — no different from a model you trained by hand.

The operator that runs this is the Warren agent (`warren-agent`); an operator
starts it once as a service, exactly like Postgres itself. Running the basic
`train_model` + `rvbbit-trainer` flow by hand is still supported — it's the
"bring your own worker" option — but managed training is the SQL-only default.

To deploy serving for an already-trained model, or to move it to a new host:

```sql
SELECT rvbbit.deploy_model_serving('churn_risk', '{"host":"gpu-1"}'::jsonb);
```

## Training-Free Tabular Prediction

Sometimes you do not want to train and register a model at all — you have a small
labeled support set and want predictions for new rows right now. `predict_tabular`
fits in context against a foundation operator and returns predictions in one call.

```sql
SELECT *
FROM rvbbit.predict_tabular(
  support_sql => $$ SELECT feat_a, feat_b, label FROM training_examples $$,
  predict_sql => $$ SELECT id, feat_a, feat_b FROM rows_to_score $$,
  target_column => 'label',
  task => 'classification',
  dry_run => true   -- preview the plan without calling the backend
);
```

This routes through a tabular foundation [capability pack](/docs/capability-packs)
rather than producing a persistent operator. It is the right tool for small,
ad-hoc problems; `train_model` is better when you want a named, versioned,
re-evaluable model.

## Distillation

`distill_model` turns an expensive labeler into a cheap model. It labels a sample
of unlabeled rows with any operator or SQL expression (an LLM call, a semantic
function, a heuristic), materializes the labels, and trains a tabular model on
them.

```sql
SELECT rvbbit.distill_model(
  model_name    => 'ticket_priority',
  unlabeled_sql => $$ SELECT id, subject, channel, account_tier FROM tickets $$,
  label_expr    => $$ rvbbit.classify(subject, ARRAY['p0','p1','p2']) $$,
  n_label       => 500,
  task          => 'classification'
);
```

The labeling step is just operators, so it lands in receipts with its own cost.
You pay the LLM once for the sample, then serve predictions from the distilled
model for free.

## Lifecycle And Monitoring

Models are managed entirely in SQL.

```sql
-- pause / resume serving without dropping the model
SELECT rvbbit.disable_model('churn_risk');
SELECT rvbbit.enable_model('churn_risk');

-- retire a model (optionally drop its predict operator too)
SELECT rvbbit.drop_model('churn_risk', drop_operator => true);

-- clean up runs that died mid-flight
SELECT rvbbit.reap_stale_training_runs(interval '1 hour');
```

Three read surfaces answer the common questions:

| View | Answers |
| --- | --- |
| `rvbbit.ml_model_status` | What is each model's state, operator, backend, and latest run? |
| `rvbbit.ml_model_versions` | Which trained revisions exist, and when were they trained? |
| `rvbbit.ml_accuracy_series` | How has evaluated accuracy moved over time? |

## Model Studio

The lens **Model Studio** window is a view over everything above: a model list
with Overview, Evaluate, Predict, Train, and Monitor tabs. It auto-builds a
prediction form from the feature schema, renders the confusion matrix and
residual scatter from `ml_evaluations`, and shows per-prediction receipts. Every
action surfaces the SQL it runs, so anything you do in the UI you can copy into
`psql` or DataGrip unchanged.

## Are These Still Worth Training?

Yes — and they pair well with the rest of RVBBIT. Large models and LLM calls are
strong at messy text and reasoning, but a small tabular model is faster, cheaper,
auditable, and deterministic on structured columns. The interesting move is to
combine them: use [semantic functions](/docs/semantic-functions) to turn free
text into structured features (a `semantic_case` bucket, an extracted field, an
embedding-derived label), then feed those features into a classical model — or
use `distill_model` to bake an expensive labeler down into a cheap operator. The
[Bigfoot field notebook](/docs/examples/bigfoot-field-notebook) walks through a
worked classifier on a real dataset, including an honest look at when the
features simply do not carry the signal.
