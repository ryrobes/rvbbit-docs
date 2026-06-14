---
title: Bigfoot Field Notebook
description: A runnable SQL notebook over BFRO sightings using RVBBIT retrieval, semantic classification, extraction, KG, and receipts.
section: Examples
navOrder: 26
sourceDocs:
  - ../rvbbit-sql/examples/bigfoot/README.md
  - ../rvbbit-sql/examples/bigfoot/00_load.sql
  - ../rvbbit-sql/examples/bigfoot/01_profile.sql
  - ../rvbbit-sql/examples/bigfoot/02_retrieval.sql
  - ../rvbbit-sql/examples/bigfoot/03_semantic_map.sql
  - ../rvbbit-sql/examples/bigfoot/04_knowledge_graph.sql
  - ../rvbbit-sql/examples/bigfoot/06_capability_operators.sql
  - ../rvbbit-sql/examples/bigfoot/07_live_triples_receipts.sql
  - ../rvbbit-sql/docs/EMBEDDINGS.md
  - ../rvbbit-sql/docs/CAPABILITIES.md
  - ../rvbbit-sql/docs/WARREN.md
  - ../rvbbit-sql/docs/KNOWLEDGE_GRAPH.md
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
  - ../rvbbit-sql/docs/BIGFOOT-DEMO.md
---

This notebook uses the full BFRO Bigfoot sightings CSV as a tangible RVBBIT
walkthrough. The point is not whether the reports are true. The point is that
the dataset has exactly the shape semantic SQL is good at: messy narrative
text, dates, locations, witness context, nearby roads, environmental details,
and repeated motifs that are hard to analyze with keywords alone.

Everything here is SQL-first. The loader uses `psql \copy`; the notebook
scripts do not use Python.

## Run It

```bash
examples/bigfoot/run_all.sh
```

Default run:

- loads all `5,035` CSV rows into `bigfoot.sightings_all`,
- builds a 500-row RVBBIT notebook table at `bigfoot.sighting_docs`,
- exports the notebook table to Parquet,
- materializes embeddings,
- runs retrieval, evidence, classification, clustering, outlier, diff,
  dedupe, extraction, Warren capability operators, and KG examples.

The live model triples and receipt section is opt-in:

```bash
BIGFOOT_LIVE=1 examples/bigfoot/run_all.sh
```

That final section calls the configured provider through
`rvbbit.triples_rows`, so it can make paid model calls.

## 1. Load The Full CSV

The loader keeps every CSV field, then creates a cleaned notebook table with a
single `report_text` column assembled from title, class, season, location,
roads, observations, other witnesses, other stories, time/conditions, and
environment.

```sql
CREATE TABLE bigfoot.sightings_all (
    bfroid text PRIMARY KEY,
    submitted text,
    submitted_date text,
    title text,
    class text,
    month text,
    fixed_month text,
    date text,
    year text,
    fixed_year text,
    season text,
    state text,
    county text,
    locationdetails text,
    nearesttown text,
    nearestroad text,
    observed text,
    alsonoticed text,
    otherwitnesses text,
    otherstories text,
    timeandconditions text,
    environment text,
    url text,
    run_id text,
    run_time text,
    sketch text
) USING rvbbit;
```

The notebook table is intentionally smaller than the full dataset so examples
stay quick while still feeling real.

| Metric | Value |
| --- | ---: |
| Full CSV rows | 5,035 |
| Rows with observations | 4,997 |
| Notebook rows | 500 |
| States | 49 |
| Counties | 1,039 |

Top states in the raw data:

| State | Reports |
| --- | ---: |
| Washington | 604 |
| California | 419 |
| Ohio | 304 |
| Florida | 303 |
| Oregon | 249 |
| Illinois | 236 |
| Texas | 230 |
| Michigan | 218 |

Why it matters: ordinary structured columns remain available, but semantic work
gets a richer narrative field that preserves the surrounding context.

## 2. Semantic Search

First materialize embeddings for the notebook text:

```sql
SELECT rvbbit.materialize_embeddings(
    'bigfoot.sighting_docs'::regclass::oid, -- table to pre-embed
    'report_text'                           -- text column to embed
);
```

Then search by meaning, not exact phrase:

```sql
WITH hits AS (
    SELECT value, score
    FROM rvbbit.knn_text(
        'bigfoot.sighting_docs'::regclass::oid,             -- table to search
        'report_text',                                      -- text column
        'large hairy creature crossing a road at night in headlights', -- query text
        5                                                   -- top-k matches
    )
)
SELECT d.bfroid,
       d.state,
       round(h.score::numeric, 3) AS score,
       d.title,
       rvbbit.text_evidence(
         d.report_text,                           -- source text
         'road crossing at night in headlights',  -- evidence target
         1                                        -- snippets to return
       ) AS evidence
FROM hits h
JOIN bigfoot.sighting_docs d ON d.report_text = h.value
ORDER BY h.score DESC;
```

Sample output:

| BFRO ID | State | Score | Title | Evidence Preview |
| --- | --- | ---: | --- | --- |
| 1031 | Oregon | 0.727 | Large Bipedal Animal Seen Crossing Rural Road and Climbing Cutbank | Around 03:30, raining, the witness saw the back of a large animal crossing the roadway. |
| 976 | South Carolina | 0.720 | A man witnesses a Large, dark, manlike creature cross the highway | Something big, dark, and shaggy leaped across the highway into the woods. |
| 1167 | Maryland | 0.718 | Large, dark creature seen crossing the road. | The report centers on a single-lane road and a dark creature crossing it. |
| 495 | Washington | 0.715 | Passing motorist observes a tall, hairy animal in headlights | A motorist turned off the Orting-Kapowsin Highway and saw a tall animal. |
| 1205 | West Virginia | 0.708 | Witness sees a large creature crossing the road | A winter road sighting near Route 55. |

The same query shape works for another concept:

```sql
SELECT value, score
FROM rvbbit.knn_text(
  'bigfoot.sighting_docs'::regclass::oid, -- table to search
  'report_text',                          -- text column
  'loud screams whoops vocalizations heard in the forest', -- query text
  5                                       -- top-k matches
);
```

| BFRO ID | State | Score | Title |
| --- | --- | ---: | --- |
| 1427 | New Jersey | 0.751 | High pitched screams heard by hikers in the Pine Barrens |
| 703 | Oregon | 0.747 | Loud vocalizations heard on logging road 15 miles west of Yamhill |
| 701 | Oregon | 0.747 | Area residents hear repeated loud vocalizations |
| 1363 | Colorado | 0.747 | Strange loud howls heard by retired wildlife biologist |
| 937 | Washington | 0.736 | Witnesses hear odd, loud vocalization on a logging road |

Why it matters: the user asks in natural language, `knn_text` returns rows, and
`text_evidence` gives inspectable snippets for why a result matched.

## 3. Semantic Classification

`semantic_case` is useful when you want branch-like classification without a
full LLM call:

```sql
CREATE TABLE bigfoot.encounter_map AS
SELECT
    bfroid,
    state,
    county,
    season,
    class,
    title,
    rvbbit.semantic_case(
        report_text, -- text to classify
        ARRAY[
            'visual sighting where witnesses saw the creature',
            'auditory experience with screams howls knocks or vocalizations',
            'physical evidence such as tracks footprints hair or structures',
            'roadside or vehicle encounter with headlights cars trucks or roads',
            'camping hiking hunting or wilderness presence without clear sighting'
        ], -- semantic descriptions, in decision order
        ARRAY['visual', 'auditory', 'physical_evidence', 'road_vehicle', 'woods_presence'], -- returned labels
        'unclear', -- fallback label
        0.0        -- minimum score threshold
    ) AS encounter_type
FROM bigfoot.sighting_docs
LIMIT 250;
```

Output distribution:

| Encounter Type | Reports |
| --- | ---: |
| visual | 98 |
| woods_presence | 98 |
| auditory | 24 |
| road_vehicle | 19 |
| physical_evidence | 11 |

Why it matters: this gives you a derived analytical dimension from free text,
but it is still just SQL and can be grouped, joined, or materialized.

## 4. Topics, Outliers, Diff, And Dedupe

Topic discovery:

```sql
SELECT cluster_id, count, exemplar
FROM rvbbit.topics(
  'SELECT report_text FROM bigfoot.sighting_docs ORDER BY bfroid LIMIT 250', -- text-row SQL
  7                                                                         -- cluster count
);
```

Example clusters included road crossings, high-pitched screams, tracks in snow,
pond/wilderness encounters, and multi-witness reports.

Outliers:

```sql
SELECT text, score
FROM rvbbit.outliers(
  'SELECT report_text FROM bigfoot.sighting_docs ORDER BY bfroid LIMIT 250', -- text-row SQL
  8                                                                         -- outliers to return
);
```

Examples surfaced footprint photographs, logging crew reports, collision
reports, and stalked-jogger narratives.

Semantic diff:

```sql
SELECT *
FROM rvbbit.diff(
  'SELECT report_text FROM bigfoot.sighting_docs WHERE state = ''Washington'' LIMIT 120', -- candidate set
  'SELECT report_text FROM bigfoot.sighting_docs WHERE state = ''California'' LIMIT 120', -- comparison set
  8                                                                                      -- novel rows to return
);
```

This returns Washington reports that are least like the California comparison
set.

Near-duplicate grouping works best here on shorter report shapes:

```sql
SELECT group_id, size, representative
FROM rvbbit.dedupe_groups(
  'SELECT concat_ws('' '', state, county, title)
   FROM bigfoot.sighting_docs
   ORDER BY bfroid
   LIMIT 500', -- text-row SQL
  0.84         -- similarity threshold
)
WHERE size > 1
ORDER BY size DESC, group_id
LIMIT 8;
```

| Group | Size | Representative |
| ---: | ---: | --- |
| 0 | 5 | Oregon Yamhill County Loud vocalizations heard on logging road |
| 1 | 4 | Washington Klickitat County Hunters observed creature before vocalization screams |
| 2 | 3 | Michigan Iosco County couple sees tall ape-like creature |
| 3 | 3 | New Jersey Burlington County bowhunters hear high pitched screams |
| 4 | 2 | California El Dorado County hikers in Desolation Wilderness |
| 5 | 2 | California Fresno County fisherman near Huntington Lake |
| 6 | 2 | California Modoc County hunter sees footprints near Alturas |
| 7 | 2 | California Tuolumne County daytime sighting near Strawberry |

Why it matters: these are not one feature. They are a small semantic analytics
toolkit that can be mixed into normal exploratory SQL.

## 5. Extraction

The extraction pass uses the configured `extract` specialist to pull structured
facts from a small row sample:

```sql
CREATE TABLE bigfoot.extracted_facts AS
SELECT
    bfroid,
    state,
    county,
    rvbbit.extract(
      report_text,                       -- source text
      'specific location or place name'  -- entity description
    ) AS place,
    rvbbit.extract(
      report_text,  -- source text
      'time of day' -- entity description
    ) AS time_of_day,
    rvbbit.extract(
      report_text,                  -- source text
      'animal color or hair color'  -- entity description
    ) AS color_or_hair,
    rvbbit.extract(
      report_text,           -- source text
      'number of witnesses'  -- entity description
    ) AS witness_count
FROM bigfoot.sighting_docs
WHERE state IN ('Washington', 'California', 'Oregon', 'Texas')
LIMIT 12;
```

Sample output:

| BFRO ID | State | County | Place | Time | Color / Hair | Witnesses |
| --- | --- | --- | --- | --- | --- | --- |
| 102 | Oregon | Tillamook County | Tillamook County | Summer |  |  |
| 109 | Oregon | Multnomah County | Cascade Locks | Summer |  |  |
| 116 | Oregon | Morrow County | Boardman | Spring | red colored hair |  |
| 147 | California | El Dorado County | South Lake Tahoe | Summer |  |  |
| 60 | Washington | Skagit County | Skagit County | evening |  |  |
| 80 | Oregon | Lane County | Lane County | Summer |  | 3 persons total |
| 83 | California | Madera County | Bass Lake | Early dawn | black |  |

Why it matters: unstructured text starts becoming typed columns that can be
reviewed, corrected, joined, or fed into later Cascades.

## 6. Warren Capability Operators

The previous sections use core semantic SQL functions. RVBBIT can also
install capability packs into Warren and expose them as ordinary SQL operators.
This section uses four installed capability families:

| Pack | Operators Used |
| --- | --- |
| `extract/gliner-medium-v2.1` | `extract_entities`, `contains_entity`, `has_pii` |
| `rerank/ms-marco-minilm-l6-v2` | `semantic_score` |
| `classify/deberta-v3-zero-shot` | `classify` |
| `classify/emotion-distilroberta`, `classify/twitter-roberta-sentiment` | `emotion`, `sentiment` |

If the catalog is already seeded, a SQL client can queue capability installs
directly through Warren:

```sql
SELECT rvbbit.deploy_catalog_capability(
  catalog_id => 'extract/gliner-medium-v2.1',
  target_selector => '{}'::jsonb
);

SELECT rvbbit.deploy_catalog_capability(
  catalog_id => 'rerank/ms-marco-minilm-l6-v2',
  target_selector => '{}'::jsonb
);
```

The CLI is still useful for pack development, local compose workflows, and
publishing catalog changes, but normal UI-driven installs should use
`rvbbit.capability_catalog` plus `rvbbit.deploy_catalog_capability(...)`.

GLiNER can extract arbitrary labels and return scored spans instead of only the
first matching value:

```sql
CREATE TABLE bigfoot.capability_entity_spans AS
WITH sample AS (
    SELECT bfroid, state, county, title, report_text
    FROM bigfoot.sighting_docs
    WHERE report_text IS NOT NULL
    ORDER BY bfroid
    LIMIT 8
),
spans AS (
    SELECT s.bfroid,
           s.state,
           s.county,
           s.title,
           span
    FROM sample s
    CROSS JOIN LATERAL jsonb_array_elements(
        rvbbit.extract_entities(
            s.report_text, -- source text
            'location,time of day,animal color,witness,animal,water body' -- labels
        )
    ) AS e(span)
)
SELECT bfroid,
       state,
       title,
       span->>'label' AS label,
       span->>'text' AS value,
       (span->>'score')::float8 AS score
FROM spans
WHERE (span->>'score')::float8 >= 0.35;
```

Entity distribution from the sample:

| Label | Spans | Avg Score |
| --- | ---: | ---: |
| location | 48 | 0.618 |
| animal | 27 | 0.679 |
| water body | 14 | 0.860 |
| time of day | 13 | 0.661 |
| witness | 8 | 0.551 |
| animal color | 6 | 0.801 |

Selected spans:

| BFRO ID | State | Label | Value | Score |
| --- | --- | --- | --- | ---: |
| 60 | Washington | animal | cattle | 0.708 |
| 60 | Washington | animal color | Old growth Douglas Fir | 0.753 |
| 60 | Washington | location | Skagit County | 0.743 |
| 60 | Washington | time of day | evening | 0.465 |
| 60 | Washington | water body | creeks | 0.794 |
| 70 | New York | animal | Coy-dogs | 0.816 |
| 70 | New York | location | Shelving Rock Road | 0.757 |

Boolean wrappers work as row-level filters:

```sql
SELECT bfroid,
       state,
       rvbbit.contains_entity(
           report_text, -- source text
           'water body' -- label to detect
       ) AS has_water_body,
       rvbbit.has_pii(
           report_text -- source text
       ) AS has_pii
FROM bigfoot.sighting_docs
LIMIT 6;
```

The retrieval pipeline can also be two-phase: vector recall first, then a
cross-encoder reranker over candidates:

```sql
CREATE TABLE bigfoot.capability_reranked_hits AS
WITH candidates AS MATERIALIZED (
    SELECT row_number() OVER (ORDER BY score DESC) AS knn_rank,
           value,
           score AS knn_score
    FROM rvbbit.knn_text(
        'bigfoot.sighting_docs'::regclass::oid, -- table to search
        'report_text',                          -- text column
        'road crossing at night with headlights', -- recall query text
        24                                      -- candidate count
    )
),
scored AS (
    SELECT c.knn_rank,
           c.knn_score,
           d.bfroid,
           d.state,
           d.title,
           rvbbit.semantic_score(
               d.report_text, -- source text
               'road crossing at night with headlights' -- semantic criterion
           ) AS rerank_score
    FROM candidates c
    JOIN bigfoot.sighting_docs d ON d.report_text = c.value
)
SELECT row_number() OVER (ORDER BY rerank_score DESC, knn_score DESC) AS rerank_rank,
       *
FROM scored;
```

The reranker can change the result order materially:

| KNN Rank | Rerank Rank | BFRO ID | State | KNN | Rerank | Title |
| ---: | ---: | --- | --- | ---: | ---: | --- |
| 14 | 1 | 353 | California | 0.638 | 0.133 | Night sighting by two motorists near Lake Tahoe |
| 5 | 2 | 667 | Oregon | 0.660 | 0.063 | Witnesses saw a large, light reddish brown, hairy man standing in the road |
| 12 | 3 | 1114 | California | 0.643 | 0.033 | Three motorists have late night sighting near Manton |
| 1 | 4 | 1077 | Washington | 0.685 | 0.017 | Motorist has a daytime sighting of bigfoot crossing a road |
| 3 | 6 | 495 | Washington | 0.664 | 0.017 | Passing motorist observes a tall, hairy animal in the headlights |

Finally, the capability catalog exposes plain scalar classifiers that can be
grouped like normal columns. The notebook bounds the input text so the example
stays responsive:

```sql
CREATE TABLE bigfoot.capability_report_labels AS
WITH sample AS (
    SELECT bfroid,
           state,
           county,
           title,
           substring(report_text, 1, 1200) AS operator_text
    FROM bigfoot.sighting_docs
    WHERE report_text IS NOT NULL
    ORDER BY bfroid
    LIMIT 8
)
SELECT bfroid,
       state,
       title,
       rvbbit.classify(
           operator_text, -- bounded text to classify
           'road encounter,vocalization,tracks or footprints,water encounter,woods sighting,other' -- labels
       ) AS capability_class,
       rvbbit.emotion(
           operator_text -- bounded text to classify
       ) AS emotion,
       rvbbit.sentiment(
           operator_text -- bounded text to classify
       ) AS sentiment
FROM sample;
```

Sample rows:

| BFRO ID | State | Capability Class | Emotion | Sentiment |
| --- | --- | --- | --- | --- |
| 60 | Washington | tracks or footprints | neutral | neutral |
| 70 | New York | vocalization | fear | neutral |
| 76 | Arkansas | vocalization | fear | neutral |
| 77 | Washington | vocalization | neutral | neutral |
| 80 | Oregon | vocalization | fear | neutral |
| 81 | Tennessee | road encounter | fear | neutral |
| 83 | California | road encounter | neutral | neutral |
| 85 | Oregon | woods sighting | fear | neutral |

Why it matters: a Warren capability is not a separate application integration.
Once installed, it becomes a SQL operator with types, receipts, backend health,
and catalog metadata.

## 7. Knowledge Graph

The deterministic KG section avoids live model calls. It derives facts from
metadata and lexical clue patterns, then writes nodes, edges, and evidence into
the RVBBIT KG.

```sql
SELECT rvbbit.kg_assert_edge(
  f.subject_kind, -- subject node kind
  f.subject,      -- subject label
  f.predicate,    -- edge label
  f.object_kind,  -- object node kind
  f.object,       -- object label
  f.confidence,   -- 0..1 edge confidence
  '{}'::jsonb,    -- subject properties
  f.properties,   -- edge/object properties
  '',             -- embedding specialist; blank = default
  0.0,            -- fuzzy match threshold
  'bigfoot_notebook' -- graph id
);
```

Run result:

| Metric | Value |
| --- | ---: |
| Sampled reports | 250 |
| Derived facts | 1,958 |
| Asserted edges | 1,958 |
| Evidence rows | 1,958 |

Graph node shape:

| Kind | Nodes |
| --- | ---: |
| `bf_report` | 250 |
| `bf_county` | 179 |
| `bf_state` | 39 |
| `bf_clue` | 9 |
| `bf_season` | 5 |

Clue nodes:

| Clue | Reports |
| --- | ---: |
| road crossing | 214 |
| water nearby | 188 |
| multiple witnesses | 172 |
| night encounter | 169 |
| vehicle nearby | 161 |
| tracks or footprints | 122 |
| vocalization | 111 |
| foul smell | 64 |
| red eyes | 7 |

Then query context with evidence:

```sql
SELECT context_rank,
       depth,
       predicate,
       from_kind,
       from_label,
       to_kind,
       to_label,
       evidence_count
FROM rvbbit.kg_context(
    'bf_clue',                 -- start node kind
    'red eyes',                -- start node label
    2,                         -- max traversal depth
    15,                        -- max context rows
    'both',                    -- edge direction
    true,                      -- include evidence
    '',                        -- embedding specialist; blank = default
    0.0,                       -- fuzzy match threshold
    'bigfoot_notebook',        -- graph id
    '{"depth_decay":0.6}'::jsonb -- ranking options
);
```

Why it matters: the KG is not a hidden vector memory. It is a reviewable graph
with source table, source primary key, source column, evidence text, confidence,
and query correlation.

## 8. Optional Live Triples

The optional live section uses `rvbbit.triples_rows` to extract graph-shaped
facts from full report text:

```sql
CREATE TABLE bigfoot.live_triples AS
WITH sample AS (
    SELECT bfroid, state, county, report_text
    FROM bigfoot.sighting_docs
    ORDER BY bfroid
    LIMIT 3
)
SELECT s.bfroid,
       s.state,
       s.county,
       tr.*
FROM sample s
CROSS JOIN LATERAL rvbbit.triples_rows(
    s.report_text, -- source text
    'wildlife field report with locations, witnesses, clues, dates, and observations', -- extraction focus
    '{}'::jsonb    -- options
) tr;
```

Sample triples:

| Subject Kind | Subject | Predicate | Object Kind | Object | Confidence |
| --- | --- | --- | --- | --- | ---: |
| calf | killed calf | cause_of_death | concept | broken neck | 0.98 |
| calf | killed calf | had_injury | concept | deep bruise mark across rib cage | 0.96 |
| cattle_ranch | brothers' cattle ranch | has_environment | place | 200 acres of old growth Douglas Fir | 0.94 |
| clue | bone fragments | found_in | concept | droppings still warm | 0.93 |
| herd | cattle herd | has_size | value | over 200 head | 0.92 |
| report | Missing Cattle and large footprints found | located_in | place | Skagit County, Washington | 0.96 |

Recent receipt rollup from the run:

| Operator | Model | Calls | Avg Latency | Max Latency |
| --- | --- | ---: | ---: | ---: |
| extract | extract_gliner | 129 | 401 ms | 595 ms |
| triples | openai/gpt-5.4-mini | 5 | 5,674 ms | 10,619 ms |

Cost audit is still SQL:

```sql
-- No arguments; returns receipt and cost health JSON.
SELECT rvbbit.cost_audit_summary();
```

Why it matters: live model calls are not opaque side effects. They create rows,
triples, receipts, cost events, and graph evidence that can be inspected later.

## 9. Predict The Sighting Class

Everything so far has been retrieval, classification by meaning, and extraction.
The same table can also train an ordinary supervised model. BFRO grades each
report: Class A is a clear first-hand sighting, Class B is an indirect encounter
(sounds, tracks, something glimpsed). Can the structured columns alone — year,
season, and location — predict that grade? RVBBIT lets us ask in SQL.

A trained model is just another operator. We define it from a `SELECT`, a worker
fits it with scikit-learn, and we get a `predict_*` function. See
[Predictive Models](/docs/predictive-models) for the full surface; here is the
notebook version.

First, train on three quarters of the Class A/B reports, holding back the rest by
a stable hash so we can evaluate honestly later:

```sql
SELECT rvbbit.train_model(
  model_name    => 'bigfoot_class',
  source_sql    => $$
    SELECT
      report_year::float8           AS report_year,
      NULLIF(btrim(season),'')      AS season,
      NULLIF(btrim(state),'')       AS state,
      NULLIF(btrim(county),'')      AS county,
      NULLIF(btrim(nearesttown),'') AS nearesttown,
      NULLIF(btrim(nearestroad),'') AS nearestroad,
      NULLIF(btrim(environment),'') AS environment,
      class                         AS class_label
    FROM bigfoot.sighting_docs
    WHERE class IN ('Class A', 'Class B')
      AND mod(abs(hashtext(bfroid)), 4) < 3   -- ~75% train split
  $$,
  target_column => 'class_label',
  task          => 'classification',
  feature_schema => $$[
    {"name":"report_year","type":"float8"},
    {"name":"season","type":"text"},
    {"name":"state","type":"text"},
    {"name":"county","type":"text"},
    {"name":"nearesttown","type":"text"},
    {"name":"nearestroad","type":"text"},
    {"name":"environment","type":"text"}
  ]$$::jsonb,
  training_opts => $$ {"estimator":"random_forest","n_estimators":64,"random_state":13,"test_size":0.25} $$::jsonb,
  description   => 'Predict BFRO report class (A vs B) from location/time columns.'
);
```

`train_model` queues a run and returns its id. A worker fits it and brings the
model online (`--include-unmanaged` lets the watcher claim a plain `train_model`
run; `--serve-host` is the hostname Postgres uses to reach the worker — `bench`
is this dev stack's host name, so substitute your own):

```bash
rvbbit-trainer watch --include-unmanaged --serve-local --serve-host <your-host>
```

That command is the bring-your-own-worker form — handy for running this notebook
from `psql`. In production you run no worker at all: with a standing
[Warren](/docs/warren) agent deployed, `train_model_managed` does the whole thing
from SQL. It queues the job, the agent claims it (placed by node labels), trains,
serves, and registers the operator — and you watch it with `training_status`, no
terminal:

```sql
SELECT rvbbit.train_model_managed(
  model_name    => 'bigfoot_class',
  source_sql    => $$ -- paste the SELECT from the train_model call above here $$,
  target_column => 'class_label',
  task          => 'classification'
);

-- queued -> running -> active, entirely in SQL
SELECT model_status, run_status, job_status, node
FROM rvbbit.training_status('bigfoot_class');
```

See [Predictive Models](/docs/predictive-models) for the managed path in full.

Either way you end up with a registered `predict_bigfoot_class(row jsonb)`
operator. Score a new report by passing its columns:

```sql
SELECT rvbbit.predict_bigfoot_class(jsonb_build_object(
  'report_year', 1998,
  'season', 'Summer',
  'state', 'Ohio',
  'county', 'Athens County',
  'nearesttown', 'Athens',
  'nearestroad', 'US-33',
  'environment', 'Forested hills and creek bottoms'));
-- {"label": "Class A", "score": 0.8125, "prediction": "Class A", "scores": [...]}
```

Now the honest part. Evaluate on the held-out quarter the model never trained on:

```sql
SELECT rvbbit.evaluate_model(
  model_name   => 'bigfoot_class',
  eval_sql     => $$
    SELECT
      report_year::float8           AS report_year,
      NULLIF(btrim(season),'')      AS season,
      NULLIF(btrim(state),'')       AS state,
      NULLIF(btrim(county),'')      AS county,
      NULLIF(btrim(nearesttown),'') AS nearesttown,
      NULLIF(btrim(nearestroad),'') AS nearestroad,
      NULLIF(btrim(environment),'') AS environment,
      class                         AS class_label
    FROM bigfoot.sighting_docs
    WHERE class IN ('Class A', 'Class B')
      AND mod(abs(hashtext(bfroid)), 4) = 3   -- the held-out 25%
  $$,
  label_column => 'class_label',
  eval_name    => 'bigfoot_class_holdout');

SELECT n_rows, metrics
FROM rvbbit.ml_evaluations
WHERE model_name = 'bigfoot_class'
ORDER BY created_at DESC
LIMIT 1;
```

The confusion matrix over the 129 held-out reports:

| Actual | Predicted Class A | Predicted Class B |
| --- | ---: | ---: |
| Class A | 79 | 2 |
| Class B | 47 | 1 |

Holdout accuracy is 0.62. That sounds fine until you notice the base rate: 81 of
the 129 reports are Class A, so always guessing "Class A" already scores 0.63.
The matrix makes the truth obvious — the model calls almost everything Class A.
Year, season, and location simply do not tell you whether a witness got a clear
look at the animal.

Why it matters: that is a real finding, not a failure of the tooling.
`evaluate_model` and the confusion matrix make a weak model legible immediately,
instead of letting a respectable-looking accuracy hide it. The signal that
actually separates Class A from Class B lives in the **report text** — exactly
what the semantic sections above work with. The natural next step is to engineer
features from that text (a `semantic_case` encounter type, an extracted detail,
an embedding-derived label) and feed them into the same `train_model` call. That
pairing — classical models over semantically derived features — is the point of
[Predictive Models](/docs/predictive-models).

To run this section end to end, start an `rvbbit-trainer` worker and use the
training-enabled run: `BIGFOOT_TRAIN=1 examples/bigfoot/run_all.sh` (the SQL lives
in `examples/bigfoot/08_predict_class.sql`).

## 10. Pipelines

Everything so far ran a query and looked at the rows. A pipeline keeps going: it
pipes the whole resultset through a chain of operators with `THEN`, each producing
a new resultset. See [Pipelines](/docs/pipelines) for the full surface; here it is
on the BFRO data.

A structural stage like `pivot` is compiled to SQL once (the model writes standard
PostgreSQL keyed by the input's shape) and then runs natively:

```sql
select state, class
from bigfoot.sightings_all
where class in ('Class A', 'Class B')
  and state in ('Washington', 'California', 'Ohio', 'Florida')
then pivot('count of each class for each state');
```

| class | washington | california | ohio | florida |
| --- | ---: | ---: | ---: | ---: |
| Class A | 244 | 181 | 160 | 154 |
| Class B | 357 | 233 | 143 | 149 |

A generative stage like `enrich` sends the rows to the model and gets them back
with new columns, the originals preserved:

```sql
select title
from bigfoot.sighting_docs
order by bfroid
limit 4
then enrich('add a one-word terrain column and an encounter_type column (visual, auditory, or track)');
```

| title | terrain | encounter_type |
| --- | --- | --- |
| Two horseback riders see hairy creature | rural | visual |
| Hunter sees creature through rifle scope | wooded | visual |
| A man driving stops to watch a hair covered creature walk across a cornfield | farmland | visual |
| Couple hears unknown howl, later finds possible deformed track | forest | track |

Stages chain. Here we take a representative `sample` of the reports (to bound the
model cost), then `analyze` the whole sample into a findings table:

```sql
select report_text
from bigfoot.sighting_docs
order by bfroid
then sample(25)
then analyze('what are the most common kinds of encounters and settings? give 4 findings');
```

| finding | detail |
| --- | --- |
| Roads and road crossings are one of the most common encounter settings. | Several reports happened on highways, dirt roads, logging roads, or while crossing roads. |
| Forested wilderness is the dominant environment. | Many encounters occurred in thick woods, timber, or brushy forest, often remote with limited visibility. |
| Encounters often involve vehicles or people traveling between places. | Witnesses are frequently driving or riding when the creature is noticed suddenly from a vehicle. |
| Hunting, fishing, and camping are frequent encounter contexts. | Many reports involve hunters, fishermen, scouts, or campers near campsites, rivers, ridges, and ponds. |

Every step is recorded, so you can inspect the rowset at each stage (and the SQL a
structural stage generated):

```sql
SELECT step_idx, stage, n_rows
FROM rvbbit.flow_steps
WHERE run_id = (SELECT run_id FROM rvbbit.flow_steps ORDER BY created_at DESC LIMIT 1)
ORDER BY step_idx;
```

| step_idx | stage | n_rows |
| ---: | --- | ---: |
| 0 | base | 500 |
| 1 | sample | 25 |
| 2 | analyze | 4 |

Why it matters: the same operator + receipts system that powers per-row semantic
functions also works at the resultset level, and the structural stages keep the
heavy lifting in native SQL — the model writes the query once, then your data
flows through deterministic Postgres.

## 11. Text-To-SQL

The widest scope of the same idea: ask a question in English and let the model
write a grounded `SELECT` over the actual schema. Generation is always available;
running the result is opt-in.

```sql
-- See the SQL (never runs it) — grounded by the crawled catalog:
SELECT rvbbit.synth_sql('count of sightings by classification, most common first');
```

```
SELECT classification, count(*) AS sighting_count
FROM bigfoot.sightings
GROUP BY classification
ORDER BY sighting_count DESC, classification ASC
```

Enable execution and get rows back. The model discovers the `sightings.state →
regions.state` foreign key from the catalog and writes the join itself:

```sql
SET rvbbit.synth_enabled = on;
SELECT value FROM rvbbit.synth('number of sightings per region');
```

```
{"region": "West", "sighting_count": 8}
{"region": "South", "sighting_count": 4}
{"region": "Midwest", "sighting_count": 3}
{"region": "Northeast", "sighting_count": 2}
```

The generated SQL is validated read-only (`PREPARE` + plan check — any write is
rejected), executed inside a read-only transaction, and cached in
`rvbbit.synth_cache`, so re-asking the same question costs no model call. A
destructive request is harmless — the validator only lets a single read-only
`SELECT` through:

```sql
SELECT count(*) FROM rvbbit.synth('delete every sighting');  -- returns rows; deletes nothing
```

See [Text-to-SQL](/docs/text-to-sql) for grounding, safety, and writing your own
`query`-shape operators.

## What This Demonstrates

This notebook touches the main RVBBIT story in one realistic dataset:

- RVBBIT table storage and Parquet export through Beaverdam.
- Local embeddings and semantic KNN search.
- Evidence snippets for result explainability.
- Classification without LLM calls.
- Topics, outliers, semantic diff, and dedupe groups.
- Specialist extraction into structured columns.
- Warren capability operators for entity spans, rerank, classification, emotion,
  and sentiment.
- Deterministic KG construction with source evidence.
- Optional live model triples with receipt/cost observability.
- A tabular classifier trained from a SQL `SELECT`, served as a `predict_*`
  operator, with an honest held-out evaluation.
- Resultset pipelines (`THEN pivot / enrich / sample / analyze`) — chained rowset
  operators with per-step inspection, structural stages compiled to native SQL.
- Grounded text-to-SQL (`rvbbit.synth` / `synth_sql`) — a natural-language intent
  compiled to a read-only `SELECT` over the real schema, validated and cached.

That makes the system easier to evaluate than a feature checklist. You can run
the SQL, inspect the tables, change the prompts or labels, and watch the
receipts and graph change.
