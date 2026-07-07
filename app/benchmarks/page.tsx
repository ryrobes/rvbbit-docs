import type { Metadata } from "next";
import {
  benchmarks,
  formatDate,
  formatMs,
  getSuiteGroups,
  routeLabel,
  systemClass,
  systemLabel,
  systemOrder
} from "@/lib/benchmarks";

export const metadata: Metadata = {
  title: "Benchmarks",
  description:
    "Work-in-progress acceleration benchmark snapshot from ClickBench and TPC-H."
};

export default function BenchmarksPage() {
  const groups = getSuiteGroups();
  const latestRun = benchmarks.runs.reduce<(typeof benchmarks.runs)[number] | null>(
    (latest, run) => {
      if (!latest) return run;
      return new Date(run.startedAt) > new Date(latest.startedAt) ? run : latest;
    },
    null
  );

  return (
    <main className="benchmark-page">
      <section className="benchmark-hero">
        <p className="eyebrow">Acceleration benchmarks</p>
        <h1>Current WIP performance snapshot.</h1>
        <p>
          These numbers are from <code>{benchmarks.testName}</code>, recorded
          from local benchmark history
          {latestRun ? <> on {formatDate(latestRun.startedAt)}</> : null}.
          RVBBIT is the default auto-router path, not a per-query hand-picked
          best path.
        </p>
        <div className="benchmark-note">
          <strong>Work in progress:</strong> the storage layer, router rules,
          worker transport, and benchmark harness are still being tuned. Treat
          this as a transparent engineering snapshot rather than final marketing
          certification.
        </div>
      </section>

      <section className="benchmark-summary-grid" aria-label="Benchmark summary">
        {groups.map((group) => {
          const rvbbit = group.summaries.find((summary) => summary.system === "rvbbit");
          const clickhouse = group.summaries.find(
            (summary) => summary.system === "clickhouse"
          );
          const alloydb = group.summaries.find((summary) => summary.system === "alloydb");
          if (!rvbbit) return null;

          return (
            <article className="benchmark-summary-card" key={group.key}>
              <span>{group.label}</span>
              <h2>{formatMs(rvbbit.geomeanMs)} geomean</h2>
              <dl>
                <div>
                  <dt>Suite time</dt>
                  <dd>{formatMs(rvbbit.suiteMs)}</dd>
                </div>
                <div>
                  <dt>Wins</dt>
                  <dd>
                    {rvbbit.wins}/{rvbbit.queries}
                  </dd>
                </div>
                <div>
                  <dt>vs ClickHouse</dt>
                  <dd>
                    {clickhouse
                      ? `${(clickhouse.geomeanMs / rvbbit.geomeanMs).toFixed(2)}x`
                      : "n/a"}
                  </dd>
                </div>
                <div>
                  <dt>vs AlloyDB</dt>
                  <dd>
                    {alloydb
                      ? `${(alloydb.geomeanMs / rvbbit.geomeanMs).toFixed(2)}x`
                      : "n/a"}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>

      {groups.map((group) => (
        <section className="benchmark-suite" key={group.key}>
          <div className="benchmark-suite-heading">
            <div>
              <p>{group.label}</p>
              <h2>Suite Summary</h2>
            </div>
            <span>
              {group.run
                ? `${group.run.queryCount} queries, ${group.run.repeats} runs, ${formatDate(group.run.startedAt)}`
                : "benchmark run"}
            </span>
          </div>

          <div className="benchmark-table-wrap">
            <table className="benchmark-table summary-table">
              <thead>
                <tr>
                  <th>System</th>
                  <th>Geomean</th>
                  <th>Suite time</th>
                  <th>p95 query</th>
                  <th>Max query</th>
                  <th>Within 5%</th>
                  <th>Wins</th>
                  <th>Failures</th>
                </tr>
              </thead>
              <tbody>
                {group.summaries.map((summary) => (
                  <tr
                    className={summary.system === "rvbbit" ? "highlight-row" : ""}
                    key={summary.system}
                  >
                    <th>
                      <span className={`system-pill ${systemClass(summary.system)}`}>
                        {systemLabel(summary.system)}
                      </span>
                    </th>
                    <td>{formatMs(summary.geomeanMs)}</td>
                    <td>{formatMs(summary.suiteMs)}</td>
                    <td>{formatMs(summary.p95Ms)}</td>
                    <td>{formatMs(summary.maxMs)}</td>
                    <td>{summary.within5Pct}</td>
                    <td>
                      {summary.wins}/{summary.queries}
                    </td>
                    <td>{summary.failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="route-strip" aria-label={`${group.label} route mix`}>
            {group.routes.map((route) => (
              <div key={`${route.route}-${route.routeSource}`}>
                <span>{routeLabel(route.route)}</span>
                <strong>{route.queries}</strong>
                <small>{route.routeSource.replaceAll("-", " ")}</small>
              </div>
            ))}
          </div>

          <div className="benchmark-suite-heading query-heading">
            <div>
              <p>{group.label}</p>
              <h2>Query Detail</h2>
            </div>
            <span>Median latency in milliseconds; lower is better.</span>
          </div>

          <div className="benchmark-table-wrap">
            <table className="benchmark-table query-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Description</th>
                  <th>RVBBIT route</th>
                  {systemOrder.map((system) => (
                    <th key={system}>{systemLabel(system)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.queries.map((query) => (
                  <tr key={`${query.suite}-${query.qid}`}>
                    <th>{query.qid}</th>
                    <td>{query.description}</td>
                    <td>
                      <span className="route-pill">{routeLabel(query.rvbbitRoute)}</span>
                    </td>
                    {systemOrder.map((system) => {
                      const measurement = query.measurements[system];
                      const isBest = query.bestSystem === system;
                      return (
                        <td className={isBest ? "best-cell" : ""} key={system}>
                          <span>{formatMs(measurement?.medianMs)}</span>
                          {measurement?.status !== "ok" ? (
                            <small>{measurement?.status ?? "missing"}</small>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="benchmark-methodology">
        <h2>Methodology Notes</h2>
        <ul>
          <li>
            Source: <code>{benchmarks.sourceQuery}</code>.
          </li>
          <li>
            RVBBIT numbers use the default router. The route column shows which
            accelerated/native path was selected for each query.
          </li>
          <li>
            Median latency is from the benchmark harness with three repeats in
            this snapshot.
          </li>
          <li>
            Missing or failed rows are included in failure counts and shown as
            failed cells in the query table.
          </li>
        </ul>
      </section>
    </main>
  );
}
