---
title: Catalog & Data Search
description: rvbbit crawls your own database, fingerprints every table and column, builds a knowledge graph plus embeddings, and gives you hybrid free-text search over your data's structure - and run-over-run drift detection - all with zero LLM calls in the base build.
section: SQL Primitives
navOrder: 44
sourceDocs:
  - ../rvbbit-sql/docs/CATALOG_KG_PLAN.md
  - ../rvbbit-sql/docs/CATALOG_KG_PHASE4_PLUS.md
  - ../rvbbit-sql/docs/KNOWLEDGE_GRAPH.md
---

`catalog_crawl` turns your database into a searchable map of itself. It walks
your tables, **fingerprints** each one (structural stats + example values),
materializes a `db_catalog` [knowledge graph](/docs/knowledge-graph) of schemas →
tables → columns (with foreign-key edges), and embeds a deterministic document
per object. On top of that you get `data_search` - hybrid (dense + lexical)
free-text search over your data's structure - and **drift detection** that diffs
fingerprint snapshots run-over-run. It works on ordinary heap tables, not just
rvbbit-managed ones, and the base build makes **no LLM calls** - the fingerprint
documents are deterministic.

## Crawl

The all-in-one form fingerprints every user table (or just the schemas you name)
in a single transaction and returns a summary:

```sql
SELECT rvbbit.catalog_crawl();                            -- everything
SELECT rvbbit.catalog_crawl(schemas => ARRAY['sales']);  -- one schema
-- → {"run_id": 42, "tables": 127, "columns": 1543, "edges": 2015, "docs_embedded": 1543}
```

```sql
rvbbit.catalog_crawl(
    schemas          text[]  DEFAULT NULL,         -- NULL = all non-system schemas
    graph            text    DEFAULT 'db_catalog',
    sample_rows      integer DEFAULT 50000,        -- TABLESAMPLE above this size
    examples_k       integer DEFAULT 12,           -- example values kept per column
    do_embed         boolean DEFAULT true,         -- false = structure only, no embeddings
    embed_specialist text    DEFAULT ''            -- which embedder (default config)
) RETURNS jsonb
```

For large databases, prefer the **durable** procedure: it commits after each
table and writes live progress, so a long crawl survives interruption with
partial results intact.

```sql
CALL rvbbit.catalog_crawl_run(schemas => ARRAY['sales']);

-- Watch it, table-by-table, from another session:
SELECT ordinal || '/' || total AS pos, schema_name, rel_name, status, n_rows, n_columns
FROM   rvbbit.catalog_crawl_progress
WHERE  run_id = (SELECT max(run_id) FROM rvbbit.catalog_runs)
ORDER  BY ordinal;
```

And the **parallel** form fans tables across N background workers (via dblink),
joining on a shared progress queue. Same progress/results interface - just faster
when the embedder can keep up:

```sql
CALL rvbbit.catalog_crawl_run_parallel(parallelism => 4);
```

All three are pg_cron-friendly (a nightly crawl gives you drift history):

```sql
SELECT cron.schedule('rvbbit_catalog', '0 2 * * *',
                     $$CALL rvbbit.catalog_crawl_run_parallel()$$);
```

## Search Your Data

`data_search` is hybrid search over the fingerprint documents: it embeds your
query once, runs a dense (mean-centered cosine) ranker **and** a lexical ranker,
and fuses them with Reciprocal Rank Fusion. It degrades gracefully to lexical-only
if no embedder is configured.

```sql
SELECT kind, schema_name, rel_name, col_name, round(score::numeric, 3) AS score, doc
FROM   rvbbit.data_search('customer contact info', k => 10);
```

```sql
rvbbit.data_search(
    query text,
    k     integer DEFAULT 20,
    kinds text[]  DEFAULT NULL,        -- e.g. ARRAY['db_table'] or ['db_column']
    graph text    DEFAULT 'db_catalog'
) RETURNS TABLE(node_id bigint, kind text, schema_name text, rel_name text,
                col_name text, score double precision, doc text)
```

Returns the top-k objects scored `[0,1]`. An exact identifier (`customer_id`)
ranks via the lexical side; a fuzzy concept (`"who pays us"`) via the dense side.
Restrict to tables only with `kinds => ARRAY['db_table']`.

![Data Search in Data Rabbit - a live `orders` search over the crawled catalog, ranking the `public.orders` table and its columns.](/shots/data-search.png)

## Drift

Every crawl appends a fingerprint **snapshot** per object to
`rvbbit.catalog_snapshots`. `catalog_drift` diffs two runs and scores each change
- schema changes, row-count/ndv/null-fraction deltas, new/lost categorical
values (PSI), range shifts, even embedding drift - with a `severity` in `[0,1]`.

```sql
-- Which runs do I have?
SELECT * FROM rvbbit.catalog_runs_list(limit_n => 10);

-- What changed between run 41 and run 42, most severe first?
SELECT obj_key, kind, change_type, round(severity::numeric, 2) AS severity, flags, diff
FROM   rvbbit.catalog_drift(run_a => 41, run_b => 42)
ORDER  BY severity DESC;
```

```sql
rvbbit.catalog_drift(
    run_a bigint, run_b bigint,
    graph text DEFAULT 'db_catalog',
    only_changed boolean DEFAULT true
) RETURNS TABLE(obj_key text, kind text, schema_name text, rel_name text,
                col_name text, change_type text, severity double precision,
                flags text[], diff jsonb)
```

The `flags` array names what tripped - `rows_up`, `null_spike`, `new_values`,
`dist_shift`, `type_change`, `embed_drift`, … Filter to one kind of change:

```sql
-- Columns whose null-fraction spiked >= 10%.
SELECT obj_key, severity, diff->'null_frac' AS null_frac
FROM   rvbbit.catalog_drift(41, 42)
WHERE  'null_spike' = ANY(flags)
ORDER  BY severity DESC;

-- Low-cardinality columns that gained new categorical values.
SELECT obj_key, diff->'values'->'new_values' AS new_values
FROM   rvbbit.catalog_drift(41, 42)
WHERE  'new_values' = ANY(flags);
```

A one-line rollup for a header, and a per-object time series for a sparkline:

```sql
SELECT jsonb_pretty(rvbbit.catalog_drift_summary(41, 42));
-- { "total": 5, "added": 1, "changed": 4, "max_severity": 0.8, "flags": {...} }

SELECT run_id, captured_at, n_rows, ndv, null_frac
FROM   rvbbit.catalog_object_history('db_catalog', 'sales.orders.status')
ORDER  BY run_id;
```

## What Got Built

The crawl populates the `db_catalog` [knowledge graph](/docs/knowledge-graph), so
you can query it directly:

```sql
-- Biggest tables in the catalog.
SELECT label, (properties->>'n_rows')::bigint AS rows
FROM   rvbbit.kg_nodes
WHERE  graph_id = 'db_catalog' AND kind = 'db_table'
ORDER  BY rows DESC NULLS LAST;

-- The deterministic document used for search/embedding.
SELECT label, d.doc
FROM   rvbbit.kg_nodes n
JOIN   rvbbit.catalog_docs d ON d.node_id = n.node_id
WHERE  n.graph_id = 'db_catalog' AND n.label = 'sales.orders.email';
```

| Object | Holds |
| --- | --- |
| `rvbbit.catalog_runs` | One row per crawl: `status`, `tables_seen`, `columns_seen`, `docs_embedded`, timings. |
| `rvbbit.catalog_crawl_progress` | Live per-table progress for the durable/parallel crawlers (`ordinal/total`, status). |
| `rvbbit.catalog_docs` | The fingerprint document + embedding per object (table or column). |
| `rvbbit.catalog_snapshots` | Append-only fingerprint history - one row per object per run. The drift layer. |
| `rvbbit.kg_nodes` / `rvbbit.kg_edges` | The `db_catalog` graph: `db_schema` / `db_table` / `db_column` nodes; `has_table` / `has_column` / `references` edges. |

## Notes

- **No embedder?** Crawl with `do_embed => false` (faster) - `data_search` still
  works lexical-only. With an embedder, embeddings are
  [cached](/docs/retrieval), so re-crawling unchanged tables is cheap.
- **Sampling noise** - on tables larger than `sample_rows`, stats come from
  `TABLESAMPLE`, so small run-to-run drift may be noise. Snapshots record
  `n_sampled` vs `n_rows` so you can judge confidence; crawl with a high
  `sample_rows` for an exact baseline.
- **Tuning** (session GUCs): `rvbbit.search_query_prefix` (an instruction prefix
  for BGE/Nomic-style models), `rvbbit.search_dense_floor` (raise to be stricter),
  `rvbbit.crawl_dblink_conninfo` (the worker connection for the parallel crawler).
- The crawl is also the engine behind **Data Search**, the **Scry** graph
  explorer, and **Drift** views in Data Rabbit.
