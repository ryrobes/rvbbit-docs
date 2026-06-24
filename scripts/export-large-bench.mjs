import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dsn =
  process.env.BENCHMARK_DSN ??
  process.env.RVBBIT_DSN ??
  "postgresql://postgres:rvbbit@localhost:55433/bench";

const testName = process.env.BENCHMARK_TEST_NAME ?? "large_bench2";
const testNameLiteral = `'${testName.replaceAll("'", "''")}'`;
const outputPath = path.join(
  process.cwd(),
  "content",
  "benchmarks",
  `${testName}.json`
);

const sql = String.raw`
WITH base AS (
    SELECT
        run_id,
        test_name,
        suite,
        scale,
        row_count,
        started_at,
        qid,
        description,
        system,
        median_ms,
        status,
        detail
    FROM bench_history.query_results
    WHERE test_name = ${testNameLiteral}
),
best AS (
    SELECT
        suite,
        scale,
        qid,
        min(median_ms) FILTER (
            WHERE status = 'ok' AND median_ms IS NOT NULL
        ) AS best_ms
    FROM base
    GROUP BY 1, 2, 3
),
summary AS (
    SELECT
        b.suite,
        b.scale,
        b.system,
        count(*) AS queries,
        count(*) FILTER (WHERE b.status = 'ok') AS ok,
        round(exp(avg(ln(b.median_ms)) FILTER (
            WHERE b.status = 'ok' AND b.median_ms > 0
        ))::numeric, 3)::float8 AS geomean_ms,
        round(sum(b.median_ms) FILTER (WHERE b.status = 'ok')::numeric, 3)::float8 AS suite_ms,
        round((percentile_cont(0.95) WITHIN GROUP (ORDER BY b.median_ms) FILTER (
            WHERE b.status = 'ok'
        ))::numeric, 3)::float8 AS p95_ms,
        round(max(b.median_ms) FILTER (WHERE b.status = 'ok')::numeric, 3)::float8 AS max_ms,
        count(*) FILTER (
            WHERE b.status = 'ok' AND b.median_ms <= best.best_ms * 1.05
        ) AS within_5pct,
        count(*) FILTER (
            WHERE b.status = 'ok' AND b.median_ms = best.best_ms
        ) AS wins,
        count(*) FILTER (WHERE b.status <> 'ok') AS failures
    FROM base b
    JOIN best USING (suite, scale, qid)
    GROUP BY 1, 2, 3
),
routes AS (
    SELECT
        suite,
        scale,
        coalesce(detail #>> '{route,route}', 'unknown') AS route,
        coalesce(detail #>> '{route,route_source}', 'unknown') AS route_source,
        count(*) AS queries,
        round(exp(avg(ln(median_ms)))::numeric, 3)::float8 AS geomean_ms,
        round(sum(median_ms)::numeric, 3)::float8 AS suite_ms
    FROM base
    WHERE system = 'rvbbit' AND status = 'ok' AND median_ms > 0
    GROUP BY 1, 2, 3, 4
),
query_rows AS (
    SELECT
        b.suite,
        b.scale,
        max(b.row_count) AS row_count,
        b.qid,
        min(b.description) AS description,
        min(b.median_ms) FILTER (WHERE b.status = 'ok') AS best_ms,
        (array_agg(b.system ORDER BY b.median_ms) FILTER (
            WHERE b.status = 'ok' AND b.median_ms IS NOT NULL
        ))[1] AS best_system,
        max(b.detail #>> '{route,route}') FILTER (WHERE b.system = 'rvbbit') AS rvbbit_route,
        max(b.detail #>> '{route,route_source}') FILTER (WHERE b.system = 'rvbbit') AS rvbbit_route_source,
        max(b.detail #>> '{route,reason}') FILTER (WHERE b.system = 'rvbbit') AS rvbbit_route_reason,
        jsonb_object_agg(
            b.system,
            jsonb_build_object(
                'medianMs', CASE
                    WHEN b.median_ms IS NULL THEN NULL
                    ELSE round(b.median_ms::numeric, 3)::float8
                END,
                'status', b.status
            )
            ORDER BY b.system
        ) AS measurements
    FROM base b
    GROUP BY 1, 2, 4
),
runs AS (
    SELECT DISTINCT
        r.run_id,
        r.suite,
        r.scale,
        r.row_count,
        r.started_at,
        r.recorded_at,
        r.systems,
        r.repeats,
        r.query_count,
        r.git_commit,
        r.git_dirty,
        r.host,
        r.results_path,
        r.report_path
    FROM bench_history.runs r
    JOIN base b USING (run_id)
)
SELECT jsonb_build_object(
    'testName', ${testNameLiteral},
    'exportedAt', now(),
    'sourceQuery', format('select * from bench_history.query_results where test_name = %L', ${testNameLiteral}),
    'note', 'Work-in-progress benchmark snapshot from local bench_history. Median latency in milliseconds; lower is better.',
    'systems', jsonb_build_array('rvbbit', 'clickhouse', 'alloydb', 'pg_baseline', 'hydra', 'citus'),
    'runs', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'runId', run_id,
                'suite', suite,
                'scale', scale,
                'rowCount', row_count,
                'startedAt', started_at,
                'recordedAt', recorded_at,
                'systems', systems,
                'repeats', repeats,
                'queryCount', query_count,
                'gitCommit', git_commit,
                'gitDirty', git_dirty,
                'host', host,
                'resultsPath', results_path,
                'reportPath', report_path
            )
            ORDER BY started_at, suite, scale
        )
        FROM runs
    ),
    'summaries', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'suite', suite,
                'scale', scale,
                'system', system,
                'queries', queries,
                'ok', ok,
                'geomeanMs', geomean_ms,
                'suiteMs', suite_ms,
                'p95Ms', p95_ms,
                'maxMs', max_ms,
                'within5Pct', within_5pct,
                'wins', wins,
                'failures', failures
            )
            ORDER BY
                suite,
                nullif(scale, '')::float8 NULLS LAST,
                CASE system
                    WHEN 'rvbbit' THEN 0
                    WHEN 'clickhouse' THEN 1
                    WHEN 'alloydb' THEN 2
                    WHEN 'pg_baseline' THEN 3
                    WHEN 'hydra' THEN 4
                    WHEN 'citus' THEN 5
                    ELSE 9
                END
        )
        FROM summary
    ),
    'routes', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'suite', suite,
                'scale', scale,
                'route', route,
                'routeSource', route_source,
                'queries', queries,
                'geomeanMs', geomean_ms,
                'suiteMs', suite_ms
            )
            ORDER BY suite, nullif(scale, '')::float8 NULLS LAST, queries DESC, route
        )
        FROM routes
    ),
    'queries', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'suite', suite,
                'scale', scale,
                'rowCount', row_count,
                'qid', qid,
                'description', description,
                'bestMs', round(best_ms::numeric, 3)::float8,
                'bestSystem', best_system,
                'rvbbitRoute', rvbbit_route,
                'rvbbitRouteSource', rvbbit_route_source,
                'rvbbitRouteReason', rvbbit_route_reason,
                'measurements', measurements
            )
            ORDER BY suite, nullif(scale, '')::float8 NULLS LAST, regexp_replace(qid, '[^0-9]', '', 'g')::int
        )
        FROM query_rows
    )
)::text;
`;

const result = spawnSync(
  "psql",
  [dsn, "-Atq", "-P", "pager=off", "-c", sql],
  { encoding: "utf8" }
);

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const raw = result.stdout.trim();
if (!raw) {
  console.error(`No benchmark data found for ${testName}`);
  process.exit(1);
}

const parsed = JSON.parse(raw);
const missingData =
  !Array.isArray(parsed.runs) ||
  parsed.runs.length === 0 ||
  !Array.isArray(parsed.summaries) ||
  parsed.summaries.length === 0 ||
  !Array.isArray(parsed.queries) ||
  parsed.queries.length === 0;

if (missingData) {
  console.error(`No benchmark data found for ${testName}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
