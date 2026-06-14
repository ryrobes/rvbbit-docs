import benchmarkData from "@/content/benchmarks/large_bench2.json";

export type BenchmarkSystem =
  | "rvbbit"
  | "clickhouse"
  | "alloydb"
  | "pg_baseline"
  | "hydra"
  | "citus";

export type BenchmarkSummary = {
  suite: string;
  scale: string;
  system: BenchmarkSystem;
  queries: number;
  ok: number;
  geomeanMs: number;
  suiteMs: number;
  p95Ms: number;
  maxMs: number;
  within5Pct: number;
  wins: number;
  failures: number;
};

export type BenchmarkRoute = {
  suite: string;
  scale: string;
  route: string;
  routeSource: string;
  queries: number;
  geomeanMs: number;
  suiteMs: number;
};

export type BenchmarkQuery = {
  suite: string;
  scale: string;
  rowCount: number | null;
  qid: string;
  description: string;
  bestMs: number;
  bestSystem: BenchmarkSystem;
  rvbbitRoute: string | null;
  rvbbitRouteSource: string | null;
  rvbbitRouteReason: string | null;
  measurements: Record<
    BenchmarkSystem,
    {
      medianMs: number | null;
      status: string;
    }
  >;
};

export type BenchmarkRun = {
  runId: string;
  suite: string;
  scale: string;
  rowCount: number | null;
  startedAt: string;
  recordedAt: string;
  systems: BenchmarkSystem[];
  repeats: number;
  queryCount: number;
  gitCommit: string | null;
  gitDirty: boolean | null;
  host: string | null;
  resultsPath: string | null;
  reportPath: string | null;
};

export type BenchmarkData = {
  testName: string;
  exportedAt: string;
  sourceQuery: string;
  note: string;
  systems: BenchmarkSystem[];
  runs: BenchmarkRun[];
  summaries: BenchmarkSummary[];
  routes: BenchmarkRoute[];
  queries: BenchmarkQuery[];
};

export const benchmarks = benchmarkData as BenchmarkData;

export const systemLabels: Record<BenchmarkSystem, string> = {
  rvbbit: "RVBBIT",
  clickhouse: "ClickHouse",
  alloydb: "AlloyDB",
  pg_baseline: "Postgres",
  hydra: "Hydra",
  citus: "Citus"
};

export const systemOrder = benchmarks.systems;

export function suiteKey(suite: string, scale: string) {
  return `${suite}::${scale}`;
}

export function suiteLabel(suite: string, scale: string) {
  if (suite === "ClickBench") return `${suite} ${formatRows(Number(scale))}`;
  if (suite === "TPC-H") return `${suite} SF${scale}`;
  return `${suite} ${scale}`;
}

export function getSuiteGroups() {
  const keys = Array.from(
    new Set(benchmarks.summaries.map((summary) => suiteKey(summary.suite, summary.scale)))
  );

  return keys.map((key) => {
    const [suite, scale] = key.split("::");
    return {
      key,
      suite,
      scale,
      label: suiteLabel(suite, scale),
      summaries: benchmarks.summaries.filter(
        (summary) => summary.suite === suite && summary.scale === scale
      ),
      queries: benchmarks.queries.filter(
        (query) => query.suite === suite && query.scale === scale
      ),
      routes: benchmarks.routes.filter(
        (route) => route.suite === suite && route.scale === scale
      ),
      run: benchmarks.runs.find((run) => run.suite === suite && run.scale === scale)
    };
  });
}

export function getRvbbitSummary(suite: string, scale: string) {
  return benchmarks.summaries.find(
    (summary) =>
      summary.suite === suite && summary.scale === scale && summary.system === "rvbbit"
  );
}

export function getSystemSummary(
  suite: string,
  scale: string,
  system: BenchmarkSystem
) {
  return benchmarks.summaries.find(
    (summary) =>
      summary.suite === suite && summary.scale === scale && summary.system === system
  );
}

export function routeLabel(route: string | null) {
  if (!route) return "unknown";
  return route
    .replace("duck_vortex", "Duck/Vortex")
    .replace("duck_hive", "Duck/Hive")
    .replace("datafusion", "DataFusion")
    .replace("native", "Native");
}

export function formatMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "FAIL";
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`;
  if (ms >= 100) return `${Math.round(ms)}ms`;
  if (ms >= 10) return `${ms.toFixed(1)}ms`;
  return `${ms.toFixed(2)}ms`;
}

export function formatRows(rows: number | null | undefined) {
  if (!rows) return "";
  if (rows >= 1_000_000) return `${Number(rows / 1_000_000).toFixed(0)}M rows`;
  if (rows >= 1_000) return `${Number(rows / 1_000).toFixed(0)}K rows`;
  return `${rows} rows`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(new Date(iso));
}

export function systemClass(system: string) {
  return `system-${system.replaceAll("_", "-")}`;
}

