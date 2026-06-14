import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Cable,
  Database,
  FileSearch,
  GitBranch,
  Layers3,
  ListChecks,
  Network,
  PlugZap,
  ReceiptText,
  Route,
  Rows3,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow
} from "lucide-react";
import { RabbitHero } from "@/components/RabbitHero";
import { CascadeDiagram } from "@/components/CascadeDiagram";
import { SqlCode } from "@/components/SqlCode";
import {
  formatMs,
  getSuiteGroups,
  routeLabel,
  systemLabels
} from "@/lib/benchmarks";
import { getAllDocs } from "@/lib/docs";

const capabilities = [
  {
    icon: BrainCircuit,
    title: "Semantic SQL",
    text: "Call models, embeddings, MCP tools, and capability nodes from ordinary SQL."
  },
  {
    icon: Layers3,
    title: "Beaverdam Storage",
    text: "Optional Parquet, Vortex, Lance, and memory-backed acceleration beside heap."
  },
  {
    icon: Route,
    title: "Adaptive Routing",
    text: "Profiles and deterministic rules choose among native, DataFusion, Duck, and heap paths."
  },
  {
    icon: ShieldCheck,
    title: "Postgres Contract",
    text: "Heap remains the source of truth, with fallbacks for correctness and pg_dump/restore."
  }
];

const semanticPillars = [
  {
    icon: Search,
    title: "Semantic retrieval",
    text: "Use embeddings, KNN, evidence snippets, and join-back patterns without leaving SQL."
  },
  {
    icon: ListChecks,
    title: "Built-in primitives",
    text: "Classify, cluster, dedupe, diff, extract, and score text before you write custom operators."
  },
  {
    icon: Network,
    title: "Graph memory",
    text: "Extract triples, preserve evidence, merge aliases, and retrieve KG context for RAG."
  },
  {
    icon: ReceiptText,
    title: "Receipts and costs",
    text: "Every serious model/tool path can leave an audit record with sub-calls, latency, errors, and cost state."
  }
];

const architecture = [
  ["Heap", "Authoritative Postgres tables and fallback execution."],
  ["Beaverdam", "Columnar files, layout variants, time travel, hot cache, Lance."],
  ["Route", "Cheap query-shape decisions plus optional trained profiles."],
  ["Warren", "Capability nodes for semantic and workflow execution."]
];

const metricsFeatures = [
  {
    icon: GitBranch,
    title: "Versioned definitions",
    text: "Every metric is an append-versioned row. The definition — including the KPI threshold — is part of the record, so you can run today's metric over old data, or last quarter's definition over today's."
  },
  {
    icon: ShieldCheck,
    title: "KPIs that audit themselves",
    text: "A check is one SELECT returning a boolean. Because the threshold is versioned too, you can ask: was this green under the rule we believed in then?"
  },
  {
    icon: Database,
    title: "Durable, verdict-stamped history",
    text: "Observations are written when the data changes — compaction is the trigger — and outlive generation reaping. One immutable row per snapshot: value, verdict, and the as-of it ran at."
  },
  {
    icon: Activity,
    title: "Rolling baselines in one line",
    text: "{metric:self.-1day} resolves to this metric at a shifted instant, so deltas and week-over-week are a single token over the snapshot history."
  }
];

export default function Home() {
  const docs = getAllDocs().slice(0, 10);
  const benchmarkGroups = getSuiteGroups();

  return (
    <main>
      <section className="hero">
        <RabbitHero />
        <div className="hero-content">
          <p className="eyebrow">Postgres extension for semantic and poly-engine SQL</p>
          <h1>RVBBIT</h1>
          <p className="hero-copy">
            Call models, embeddings, and tools straight from SQL — with columnar
            acceleration, adaptive routing, and an audit trail for every call.
            All inside Postgres, with the heap as the source of truth.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/docs/cascades">
              <Workflow aria-hidden="true" size={18} />
              See Cascades
            </Link>
            <Link className="button secondary" href="/docs/quickstart">
              <TerminalSquare aria-hidden="true" size={18} />
              Start with SQL
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="band cascade-band" id="cascades">
        <div className="section-header cascade-header">
          <p>Operators become cascades</p>
          <h2>Multi-step model logic, called like SQL.</h2>
          <span>
            A Cascade is the execution plan inside a semantic operator — guards,
            model calls, validators, retries, tool calls, and a receipt — still
            exposed as a single typed Postgres function.
          </span>
        </div>
        <CascadeDiagram />
        <div className="cascade-copy">
          <div>
            <h3>The workflow lives next to the data</h3>
            <p>
              Instead of scattering model orchestration across application code,
              RVBBIT keeps it in the database — observable in SQL, versioned, and
              callable from an ordinary query.
            </p>
          </div>
          <SqlCode ariaLabel="Cascade SQL example">{`SELECT ticket_id,
       rvbbit.review_risk(body, account_tier) AS risk
FROM support_tickets
WHERE created_at >= now() - interval '1 day';`}</SqlCode>
        </div>
      </section>

      <section className="band semantic-band" id="semantic">
        <div className="section-header semantic-header">
          <p>Semantic functions</p>
          <h2>AI work that looks like ordinary SQL.</h2>
          <span>
            RVBBIT ships built-in semantic primitives for retrieval,
            classification, clustering, extraction, evidence, graph memory, and
            audit receipts. Use them directly or as steps inside Cascades.
          </span>
        </div>
        <div className="semantic-showcase">
          <div className="semantic-card-grid">
            {semanticPillars.map((item) => {
              const Icon = item.icon;
              return (
                <article className="semantic-card" key={item.title}>
                  <Icon aria-hidden="true" size={20} />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              );
            })}
          </div>
          <div className="semantic-code-panel">
            <SqlCode ariaLabel="Semantic retrieval and classification">{`WITH hits AS (
  SELECT value, score
  FROM rvbbit.knn_text(
    'tickets'::regclass,
    'body',
    'renewal risk after late shipments',
    20
  )
)
SELECT t.ticket_id,
       h.score,
       rvbbit.semantic_case(
         t.body,
         ARRAY['billing issue', 'shipping delay', 'renewal risk'],
         ARRAY['billing', 'shipping', 'renewal'],
         'other',
         0.0
       ) AS bucket
FROM hits h
JOIN tickets t ON t.body = h.value
ORDER BY h.score DESC;`}</SqlCode>
            <SqlCode ariaLabel="Knowledge graph and receipts">{`SELECT *
FROM rvbbit.triples_rows(
  'Acme delayed renewal after repeated fulfillment misses.',
  'customer risk'
);

SELECT receipt_id, operator, model, latency_ms, error
FROM rvbbit.receipts
ORDER BY invocation_at DESC
LIMIT 10;`}</SqlCode>
          </div>
        </div>
        <div className="semantic-links">
          <Link href="/docs/semantic-functions">
            Semantic functions
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/docs/retrieval">
            Retrieval and RAG
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/docs/receipts-costs">
            Receipts and costs
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>

      <section className="band mcp-band" id="mcp">
        <div className="section-header mcp-header">
          <p>MCP as a SQL primitive</p>
          <h2>External tools become relational building blocks.</h2>
          <span>
            Register MCP servers in Postgres, discover their tools, call them as
            JSON or row sources, audit every invocation, and use them as nodes
            inside Cascades.
          </span>
        </div>
        <div className="mcp-showcase">
          <div className="mcp-points">
            <article>
              <PlugZap aria-hidden="true" size={20} />
              <h3>Tool ecosystems, not app glue</h3>
              <p>
                GitHub, filesystem, internal HTTP, and custom MCP servers become
                catalog-backed SQL surfaces instead of hidden application code.
              </p>
            </article>
            <article>
              <Rows3 aria-hidden="true" size={20} />
              <h3>Rows when you need rows</h3>
              <p>
                <code>mcp_rows</code> unwraps list-shaped tool responses so they
                can be filtered, joined, ranked, and aggregated beside real
                Postgres data.
              </p>
            </article>
            <article>
              <FileSearch aria-hidden="true" size={20} />
              <h3>Observable by default</h3>
              <p>
                Discovery, health, caching, usage, latency, and invocation
                history live in RVBBIT tables and views for SQL-native UIs.
              </p>
            </article>
          </div>
          <div className="mcp-code-stack">
            <SqlCode ariaLabel="Register an MCP server from SQL">{`SELECT rvbbit.register_mcp_server(
  server_name       => 'github',
  server_transport  => 'stdio',
  server_command    => 'npx',
  server_args       => ARRAY['-y', '@modelcontextprotocol/server-github'],
  server_env        => '{"GITHUB_PERSONAL_ACCESS_TOKEN":"\${GITHUB_TOKEN}"}'::jsonb
);

SELECT rvbbit.refresh_mcp_server('github');`}</SqlCode>
            <SqlCode ariaLabel="Join MCP results with local SQL data">{`SELECT a.account_id,
       a.company_name,
       repo->>'full_name' AS matching_repo,
       (repo->>'stargazers_count')::int AS stars
FROM accounts a
JOIN LATERAL rvbbit.mcp_rows(
  'github',
  'search_repositories',
  jsonb_build_object(
    'query', a.company_name || ' postgres',
    'perPage', 3
  )
) repo ON true
WHERE a.tier = 'strategic'
ORDER BY stars DESC;`}</SqlCode>
          </div>
        </div>
        <Link className="mcp-link" href="/docs/mcp">
          Read the MCP SQL surface
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      <section className="band">
        <div className="section-header">
          <p>What it is</p>
          <h2>One extension, multiple execution paths.</h2>
        </div>
        <div className="capability-grid">
          {capabilities.map((item) => {
            const Icon = item.icon;
            return (
              <article className="feature-card" key={item.title}>
                <Icon aria-hidden="true" size={22} />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="band" id="metrics">
        <div className="section-header">
          <p>Metrics &amp; KPIs</p>
          <h2>A versioned, bitemporal BI layer — built in, never required.</h2>
          <span>
            A metric is a name and a SELECT. Add one more SELECT that returns a
            boolean and it is a KPI. Run it across two independent time axes —
            which definition, and as of when. It is all plain RVBBIT tables and
            your own data: no metric store, no DSL, no lock-in.
          </span>
        </div>
        <div className="capability-grid">
          {metricsFeatures.map((item) => {
            const Icon = item.icon;
            return (
              <article className="feature-card" key={item.title}>
                <Icon aria-hidden="true" size={22} />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>
        <SqlCode ariaLabel="Define a KPI and check it across def-time and data-time">{`-- a metric is a name + SELECT; the 8th arg makes it a KPI
SELECT rvbbit.define_metric(
  'daily_revenue',
  'SELECT sum(amount) AS total FROM orders',
  '{"target": 1000000}'::jsonb, 'all', 'Revenue must clear target', 'analytics',
  '{}'::jsonb,
  'SELECT total >= {target} AS ok, total AS value FROM metric');

-- green under last quarter's definition, over last quarter's data?
SELECT rvbbit.check_metric('daily_revenue', '{}'::jsonb,
  def_as_of  => '2025-01-01',
  data_as_of => '2025-01-01');
-- => {"ok": true, "value": 1180000, "status": "pass"}`}</SqlCode>
        <Link className="mcp-link" href="/docs/metrics-kpis">
          Read the Metrics &amp; KPIs surface
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      <section className="band home-benchmarks" id="benchmarks">
        <div className="section-header benchmark-home-header">
          <p>Beaverdam benchmark snapshot</p>
          <h2>Accelerated paths show up in end-to-end runs.</h2>
          <span>
            Work-in-progress runs compare the default RVBBIT router against
            Postgres, Hydra, Citus, AlloyDB, and ClickHouse. Not final, audited
            numbers — but real end-to-end measurements, and directionally honest.
          </span>
        </div>
        <div className="home-benchmark-grid">
          {benchmarkGroups.map((group) => {
            const rvbbit = group.summaries.find(
              (summary) => summary.system === "rvbbit"
            );
            const clickhouse = group.summaries.find(
              (summary) => summary.system === "clickhouse"
            );
            const alloydb = group.summaries.find(
              (summary) => summary.system === "alloydb"
            );
            const topRoute = group.routes[0];
            if (!rvbbit) return null;

            return (
              <article className="home-benchmark-card" key={group.key}>
                <span>{group.label}</span>
                <h3>{formatMs(rvbbit.geomeanMs)} geomean</h3>
                <div className="home-benchmark-metrics">
                  <div>
                    <small>Suite time</small>
                    <strong>{formatMs(rvbbit.suiteMs)}</strong>
                  </div>
                  <div>
                    <small>Wins</small>
                    <strong>
                      {rvbbit.wins}/{rvbbit.queries}
                    </strong>
                  </div>
                  <div>
                    <small>Route mix</small>
                    <strong>
                      {topRoute
                        ? `${topRoute.queries} ${routeLabel(topRoute.route)}`
                        : "auto"}
                    </strong>
                  </div>
                </div>
                <p>
                  vs {systemLabels.clickhouse}:{" "}
                  {clickhouse
                    ? `${(clickhouse.geomeanMs / rvbbit.geomeanMs).toFixed(2)}x`
                    : "n/a"}
                  {"  "} / vs {systemLabels.alloydb}:{" "}
                  {alloydb
                    ? `${(alloydb.geomeanMs / rvbbit.geomeanMs).toFixed(2)}x`
                    : "n/a"}
                </p>
              </article>
            );
          })}
        </div>
        <Link className="benchmark-link" href="/benchmarks">
          <BarChart3 aria-hidden="true" size={18} />
          Query-by-query results
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      <section className="band split">
        <div className="section-header">
          <p>Shape</p>
          <h2>Built for correctness first, then fast paths where they fit.</h2>
        </div>
        <div className="architecture-list">
          {architecture.map(([name, text], index) => (
            <div className="architecture-row" key={name}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{name}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="band docs-band">
        <div className="section-header">
          <p>Documentation</p>
          <h2>Approachable entry points, deep reference when needed.</h2>
        </div>
        <div className="docs-preview">
          {docs.map((doc) => (
            <Link className="doc-tile" href={doc.href} key={doc.slug}>
              <span>{doc.section}</span>
              <h3>{doc.title}</h3>
              <p>{doc.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="band release-band">
        <div>
          <Sparkles aria-hidden="true" size={20} />
          <h2>Four ideas, one extension.</h2>
          <p>
            Storage, routing, Warren, and semantic SQL each get their own guide —
            and the docs show how they fit together in production.
          </p>
        </div>
        <div className="release-metrics" aria-label="Documentation pillars">
          <span>
            <Database aria-hidden="true" size={18} />
            Storage
          </span>
          <span>
            <GitBranch aria-hidden="true" size={18} />
            Routing
          </span>
          <span>
            <Cable aria-hidden="true" size={18} />
            Operators
          </span>
          <span>
            <Activity aria-hidden="true" size={18} />
            Operations
          </span>
        </div>
      </section>
    </main>
  );
}
