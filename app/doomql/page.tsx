import type { Metadata } from "next";
import { SqlCode } from "@/components/SqlCode";
import {
  chartSystems,
  doomql,
  doomqlFormatMs,
  doomqlFormatRows,
  routeGearLabel
} from "@/lib/doomql";

export const metadata: Metadata = {
  title: "DoomQL",
  description:
    "Doom E1M1 rendered by GROUP BY — one analytical SQL query per frame, replayed across engines with byte-identical frame hashes."
};

const FRAME_SQL = `WITH camera_space AS (          -- rotate world into camera space
    SELECT surface_id, depth_scaled, lateral_scaled,
           z_bottom, z_top, surface_kind, material,
           effective_light, sector_id
    FROM doomql_episode1
    WHERE map_name = 'E1M1'
      AND world_x BETWEEN cam.x - draw_dist AND cam.x + draw_dist
      AND world_y BETWEEN cam.y - draw_dist AND cam.y + draw_dist
), visible_space AS (            -- frustum + draw-distance clip
    SELECT * FROM camera_space
    WHERE depth_scaled BETWEEN near AND far
      AND lateral_scaled * focal
          BETWEEN -half_w * depth_scaled
              AND  half_w * depth_scaled
)
SELECT lateral_scaled, depth_scaled, z_bottom, z_top,
       surface_kind, material, sector_id,
       avg(effective_light) AS avg_light,
       count(*) AS samples, surface_id
FROM visible_space               -- reduce observations to visible surfaces
GROUP BY lateral_scaled, depth_scaled, z_bottom, z_top,
         surface_kind, material, sector_id, surface_id
ORDER BY depth_scaled, lateral_scaled, surface_kind, surface_id;`;

const CATCHES = [
  {
    title: "Every Duck query ran twice",
    found: "Frame times were exactly 2× what engine telemetry reported.",
    cause:
      "A root-owned Arrow IPC temp dir made a chmod fail, silently killing the Arrow result path after execution — every sidecar query re-ran through JSON.",
    payoff: "Fixed in the sidecar; every duck-routed query on the box got faster."
  },
  {
    title: "Two ghost fleet workers",
    found: "A fixed per-frame overhead that no engine could explain.",
    cause:
      "Stale fleet_endpoints rows fired a doomed remote dispatch — plus an ORDER BY random() catalog query — on every duck query, during weeks of benchmarks.",
    payoff: "Fleet dispatch now requires a configured token, and failed endpoints retire themselves."
  },
  {
    title: "11µs per output row",
    found: "15.5ms of engine work arrived 103ms later at 8K rows per frame.",
    cause:
      "The Arrow → jsonb → tuple result path taxed every returned row. Aggregate benchmarks return a handful of rows and never noticed; a renderer returns thousands per frame.",
    payoff:
      "rvbbit._engine_rows now decodes Arrow straight to typed Datums. Frames went 111 → 40ms — and ClickBench geomean dropped 46 → 41ms, TPC-DS 278 → 223ms. A Doom benchmark made TPC-DS 20% faster."
  },
  {
    title: "GPU crash cascade",
    found: "Forced-GPU frames didn't get slow — they took the whole database down.",
    cause:
      "In a container where postgres runs as PID 1, a crashing GPU engine process re-parents to the postmaster, which treats it as shared-memory corruption and restarts the cluster.",
    payoff: "Run GQE containers with docker --init, plus stale shared-memory cleanup in the auto-start path."
  }
];

const SHOTS = [
  {
    src: "/doomql/shot-computer-room.png",
    alt: "DoomQL render: wooden pillars and blue carpet walkway in E1M1",
    caption: "124.6ms/frame · queries=189 · hash 678c3204ee1a"
  },
  {
    src: "/doomql/shot-entry-hall.png",
    alt: "DoomQL render: green marble hall with torch sconces in E1M1",
    caption: "133.3ms/frame · queries=207 · hash 52564f60a2c4"
  },
  {
    src: "/doomql/shot-armor-door.png",
    alt: "DoomQL render: blue armor alcove with opened door in E1M1",
    caption: "138.3ms/frame · doors=1 · hash 00cec5fae1c5"
  }
];

// --- chart geometry -------------------------------------------------------

const CHART = { w: 920, h: 440, left: 64, right: 894, top: 18, bottom: 386 };
const X_DOMAIN = [Math.log10(5_000_000), Math.log10(200_000_000)];
const Y_DOMAIN = [Math.log10(30), Math.log10(3200)];
const Y_TICKS = [30, 100, 300, 1000, 3000];

function xPos(rows: number) {
  const t = (Math.log10(rows) - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0]);
  return CHART.left + t * (CHART.right - CHART.left);
}

function yPos(ms: number) {
  const clamped = Math.min(Math.max(ms, 30), 3200);
  const t = (Math.log10(clamped) - Y_DOMAIN[0]) / (Y_DOMAIN[1] - Y_DOMAIN[0]);
  return CHART.bottom - t * (CHART.bottom - CHART.top);
}

export default function DoomqlPage() {
  const points = doomql.points;
  const auto5m = points[0]?.results.auto;

  return (
    <main className="benchmark-page doomql-page">
      <section className="benchmark-hero">
        <p className="eyebrow">A deliberately weird benchmark</p>
        <h1>DoomQL</h1>
        <p>
          Doom E1M1, rendered by <code>GROUP BY</code>. Every frame is one
          analytical SQL query — scan millions of voxel-surface observations,
          clip them to the camera frustum, reduce to the nearest visible
          surface per ray, shade the result in a terminal. Same query, same
          WAD geometry, replayed across every engine.
        </p>
        <div className="benchmark-note">
          <strong>This is not a claim that databases should be game
          engines.</strong> It is a latency-shaped, row-returning workload —
          the exact inverse of ClickBench — built to expose fixed per-query
          overhead that aggregate benchmarks structurally cannot see. It
          works: see “what the weird benchmark caught” below.
        </div>
      </section>

      <section className="doomql-video-wrap" aria-label="DoomQL live capture">
        <video
          src="/doomql/doomql-loop.mp4"
          poster="/doomql/doomql-poster.jpg"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        />
        <div className="doomql-stat-chips">
          <div>
            <strong>{auto5m?.fps ? `${auto5m.fps.toFixed(1)} fps` : "—"}</strong>
            <span>auto-router, 5M-row world</span>
          </div>
          <div>
            <strong>5M → 200M</strong>
            <span>world sizes, same tour</span>
          </div>
          <div>
            <strong>{doomql.all_parity_ok ? "byte-identical" : "—"}</strong>
            <span>frame hash on every engine</span>
          </div>
        </div>
      </section>

      <section className="doomql-how">
        <div className="benchmark-suite-heading">
          <div>
            <p>DoomQL</p>
            <h2>How a frame happens</h2>
          </div>
          <span>120×40 terminal frame, one query each</span>
        </div>
        <div className="doomql-how-grid">
          <div>
            <strong>1 · The world is a table</strong>
            <p>
              Real Episode 1 geometry from the shareware WAD, expanded into
              repeated observations of a 256×256×16 voxel volume — 1,048,576
              rows per complete observation. 5M to 200M rows total.
            </p>
          </div>
          <div>
            <strong>2 · Each frame is a query</strong>
            <p>
              Fixed-point camera vectors rotate the world into camera space;
              a frustum clip keeps what is visible; a <code>GROUP BY</code>{" "}
              reduces observations to the nearest surface per ray. Camera
              position changes selectivity every frame.
            </p>
          </div>
          <div>
            <strong>3 · The terminal shades it</strong>
            <p>
              Returned surface strips become shaded wall slices. Every engine
              must produce the same frame hash — the HUD prints it live, and
              parity is checked on every run.
            </p>
          </div>
        </div>
        <div className="doomql-sql">
          <SqlCode ariaLabel="Abridged DoomQL frame query">{FRAME_SQL}</SqlCode>
        </div>
      </section>

      <section className="doomql-curves">
        <div className="benchmark-suite-heading">
          <div>
            <p>Episode 1 replay tour</p>
            <h2>Frame time vs world size</h2>
          </div>
          <span>median ms per frame, log–log; lower is better</span>
        </div>

        <div className="doomql-chart-wrap">
          <svg
            viewBox={`0 0 ${CHART.w} ${CHART.h}`}
            role="img"
            aria-label="Median frame time by world size for each engine"
          >
            {Y_TICKS.map((ms) => (
              <g key={ms}>
                <line
                  x1={CHART.left}
                  x2={CHART.right}
                  y1={yPos(ms)}
                  y2={yPos(ms)}
                  stroke="#252525"
                  strokeWidth={1}
                />
                <text x={CHART.left - 10} y={yPos(ms) + 4} textAnchor="end">
                  {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                </text>
              </g>
            ))}
            {doomql.scales.map((rows) => (
              <text
                key={rows}
                x={xPos(rows)}
                y={CHART.bottom + 26}
                textAnchor="middle"
              >
                {doomqlFormatRows(rows)}
              </text>
            ))}
            {chartSystems.map((system) => {
              const coords = points
                .map((p) => {
                  const r = p.results[system.id];
                  if (!r || r.median_ms === null) return null;
                  return `${xPos(p.rows)},${yPos(r.median_ms)}`;
                })
                .filter(Boolean)
                .join(" ");
              return (
                <polyline
                  key={system.id}
                  points={coords}
                  fill="none"
                  stroke={system.color}
                  strokeWidth={system.width}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={system.id === "auto" ? 1 : 0.82}
                />
              );
            })}
            {chartSystems.map((system) =>
              points.map((p) => {
                const r = p.results[system.id];
                if (!r || r.median_ms === null) return null;
                return (
                  <circle
                    key={`${system.id}-${p.rows}`}
                    cx={xPos(p.rows)}
                    cy={yPos(r.median_ms)}
                    r={system.id === "auto" ? 4.5 : 3}
                    fill={system.color}
                  >
                    <title>
                      {`${system.label} · ${doomqlFormatRows(p.rows)} rows · ${doomqlFormatMs(r.median_ms)}/frame`}
                    </title>
                  </circle>
                );
              })
            )}
          </svg>
          <div className="doomql-legend">
            {[...chartSystems].reverse().map((system) => (
              <span key={system.id}>
                <i style={{ background: system.color }} />
                {system.label}
              </span>
            ))}
          </div>
        </div>

        <div className="doomql-gears" aria-label="Auto-router route per world size">
          {points.map((p) => {
            const auto = p.results.auto;
            return (
              <div key={p.rows}>
                <span>{doomqlFormatRows(p.rows)} rows</span>
                <strong>{routeGearLabel(auto?.route ?? null)}</strong>
                <small>
                  {doomqlFormatMs(auto?.median_ms)} ·{" "}
                  {auto?.fps ? `${auto.fps.toFixed(1)} fps` : "—"}
                </small>
              </div>
            );
          })}
        </div>
        <p className="doomql-gears-caption">
          The router shifting gears: nobody told it the world grew. It moves
          from the Vortex layout to the vector path as scan cost overtakes
          per-query overhead — each frame is routed like any other query.
        </p>

        <div className="benchmark-table-wrap">
          <table className="benchmark-table summary-table">
            <thead>
              <tr>
                <th>System</th>
                {doomql.scales.map((rows) => (
                  <th key={rows}>{doomqlFormatRows(rows)} rows</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doomql.systems.map((system) => {
                const best = doomql.points.map((p) => {
                  const vals = Object.values(p.results)
                    .map((r) => r.median_ms)
                    .filter((v): v is number => v !== null);
                  return Math.min(...vals);
                });
                return (
                  <tr
                    key={system.id}
                    className={
                      system.id === "auto" || system.id === "duck_vortex"
                        ? "highlight-row"
                        : ""
                    }
                  >
                    <th>{system.label}</th>
                    {doomql.points.map((p, i) => {
                      const r = p.results[system.id];
                      const isBest =
                        r?.median_ms !== null &&
                        r?.median_ms !== undefined &&
                        r.median_ms === best[i];
                      return (
                        <td className={isBest ? "best-cell" : ""} key={p.rows}>
                          {doomqlFormatMs(r?.median_ms)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="doomql-footnote">
          Standalone DuckDB reads the exact source Parquet in-process — the
          most favorable possible setup, kept as an honest baseline. AlloyDB
          numbers at 100M+ exceed its 4GB columnar pool and degrade toward its
          row store. Full per-run JSON lives in{" "}
          <code>bench/doomql/results/</code>.
        </p>
      </section>

      <section className="doomql-catches">
        <div className="benchmark-suite-heading">
          <div>
            <p>Why it exists</p>
            <h2>What the weird benchmark caught</h2>
          </div>
          <span>four real engine bugs in one week</span>
        </div>
        <div className="doomql-catch-grid">
          {CATCHES.map((c) => (
            <article key={c.title}>
              <h3>{c.title}</h3>
              <p>
                <strong>Symptom:</strong> {c.found}
              </p>
              <p>
                <strong>Cause:</strong> {c.cause}
              </p>
              <p className="doomql-payoff">{c.payoff}</p>
            </article>
          ))}
        </div>
        <div className="benchmark-note">
          <strong>The thesis:</strong> aggregate benchmarks measure throughput
          and return a handful of rows, so fixed per-query costs vanish into
          the noise. A renderer chasing a frame budget measures everything
          else — dispatch overhead, result materialization, transport, route
          quality — thirty times a second, with a hash check on every frame.
        </div>
      </section>

      <section className="doomql-gallery">
        <div className="benchmark-suite-heading">
          <div>
            <p>Frames</p>
            <h2>Straight from the terminal</h2>
          </div>
          <span>HUD shows live frame time, query count, and frame hash</span>
        </div>
        <div className="doomql-shot-grid">
          {SHOTS.map((shot) => (
            <figure key={shot.src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot.src} alt={shot.alt} loading="lazy" />
              <figcaption>{shot.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="benchmark-methodology">
        <h2>Methodology Notes</h2>
        <ul>
          <li>
            Real Doom Episode 1 geometry (shareware WAD). Not the 16×16
            recursive-CTE demo — DoomQL stores repeated observations of a
            256×256×16 voxel volume, sized to exercise an OLAP storage layer.
          </li>
          <li>
            Deterministic replay tours: recorded keypresses, fixed-point
            camera math, identical frames across engines — every frame hash
            is compared, every run.
          </li>
          <li>
            RVBBIT auto uses the default learned router; forced rows pin one
            engine/layout. PostgreSQL, ClickHouse, and Hydra receive the same
            SQL over their own connections.
          </li>
          <li>
            Run it yourself: <code>python3 bench/doomql/load.py --rows
            5000000</code> then <code>python3 bench/doomql/run.py</code> in
            the rvbbit repository — interactive WASD mode included.
          </li>
        </ul>
      </section>
    </main>
  );
}
