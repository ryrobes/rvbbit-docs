import doomqlData from "@/content/benchmarks/doomql_scale_curves.json";

export type DoomqlResult = {
  status: string;
  route: string | null;
  first_ms: number | null;
  median_ms: number | null;
  p95_ms: number | null;
  fps: number | null;
  parity_ok: boolean | null;
  error: string | null;
};

export type DoomqlPoint = {
  rows: number;
  table: string;
  generated_at: string;
  source: string;
  results: Record<string, DoomqlResult>;
};

export type DoomqlData = {
  format: string;
  generated_at: string;
  benchmark: string;
  scales: number[];
  systems: { id: string; label: string }[];
  all_parity_ok: boolean;
  points: DoomqlPoint[];
};

export const doomql = doomqlData as unknown as DoomqlData;

/** Systems drawn on the scale-curve chart, in draw order (last = on top). */
export const chartSystems: { id: string; label: string; color: string; width: number }[] = [
  { id: "postgres", label: "PostgreSQL heap", color: "#ff9f9f", width: 1.5 },
  { id: "hydra", label: "Hydra", color: "#aaa49a", width: 1.5 },
  { id: "clickhouse", label: "ClickHouse", color: "#f6c7d7", width: 1.5 },
  { id: "duckdb", label: "DuckDB (in-process)", color: "#f3df9b", width: 1.5 },
  { id: "duck_vortex", label: "RVBBIT Duck/Vortex (forced)", color: "#b6cdfa", width: 1.5 },
  { id: "auto", label: "RVBBIT auto-router", color: "#a8f0d4", width: 3 }
];

export function doomqlFormatMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 100) return `${Math.round(ms)}ms`;
  return `${ms.toFixed(1)}ms`;
}

export function doomqlFormatRows(rows: number) {
  if (rows >= 1_000_000) return `${rows / 1_000_000}M`;
  return `${rows}`;
}

export function routeGearLabel(route: string | null) {
  const labels: Record<string, string> = {
    duck_vortex: "Duck / Vortex",
    duck_vector: "Duck / Vector",
    rvbbit_native: "Native scan",
    gpu_gqe: "GPU GQE",
    postgres_rowstore: "Postgres rowstore"
  };
  if (!route) return "unknown";
  return labels[route] ?? route.replaceAll("_", " ");
}
