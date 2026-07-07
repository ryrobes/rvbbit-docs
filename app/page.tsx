import { readdirSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Cable,
  Cpu,
  Database,
  FileSearch,
  GitBranch,
  Layers3,
  ListChecks,
  Lock,
  Network,
  PlugZap,
  ReceiptText,
  Rows3,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow
} from "lucide-react";
import { RabbitHero } from "@/components/RabbitHero";
import { ScrollVideo } from "@/components/ScrollVideo";
import { Screenshot } from "@/components/Screenshot";
import { SqlCode } from "@/components/SqlCode";
import { formatMs, getSuiteGroups, routeLabel } from "@/lib/benchmarks";
import { getAllDocs } from "@/lib/docs";

const differentiators = [
  {
    icon: Workflow,
    title: "You build the operators",
    text: "Not a sealed list of AI functions. Compose model calls, your own validators, retries, and tool calls into one typed SQL function — your operator, your logic."
  },
  {
    icon: Cpu,
    title: "Bring your own models",
    text: "Spin up a Hugging Face specialist or your own model on your own GPU and call it from SQL like any other function — or use the 40-plus packs that ship in the box. Not a vendor's frontier-model menu."
  },
  {
    icon: Lock,
    title: "Open, local, no lock-in",
    text: "It's a Postgres extension you run yourself. Heap stays the source of truth — drop the extension and your data is still ordinary rows."
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
    icon: Sparkles,
    title: "Bring your own operators",
    text: "When the built-ins aren't enough, compose your own from models, tools, and validators — same SQL call shape."
  }
];

const receiptDims = [
  "operator",
  "model",
  "inputs",
  "sub-calls",
  "tokens in / out",
  "cost · USD",
  "latency · ms",
  "error",
  "take / verdict",
  "query_id"
];

const architecture = [
  ["Heap", "Authoritative Postgres tables and fallback execution."],
  ["Accelerate", "Columnar files, layout variants, time travel, hot cache, Lance."],
  ["Route", "Cheap query-shape decisions plus optional trained profiles."],
  ["Warren", "Capability nodes for semantic and workflow execution."]
];

const metricsFeatures = [
  {
    icon: GitBranch,
    title: "Versioned definitions",
    text: "Every metric is an append-versioned row. The definition — including the KPI threshold — is part of the record, so you can re-run exactly the rule you shipped last quarter, or apply today's definition going forward."
  },
  {
    icon: ShieldCheck,
    title: "A KPI is a versioned threshold",
    text: "A check is one SELECT returning a boolean. Because the threshold is versioned too, you can ask: was this green under the rule we believed in then?"
  },
  {
    icon: Database,
    title: "Durable, verdict-stamped history",
    text: "Observations are written when the data changes — compaction is the trigger — and outlive generation reaping. One immutable row per snapshot: value, verdict, and the threshold it ran against."
  },
  {
    icon: Cable,
    title: "Parameterized and composable",
    text: "Inject params and reference other metrics inline — {param}, {metric:NAME} — so one definition builds on another instead of copy-pasted SQL."
  }
];

function getAliceVideoFiles() {
  try {
    const entries = readdirSync(join(process.cwd(), "public", "alice"));
    const webm = entries.filter((entry) => entry.endsWith(".webm")).sort();
    return webm.length > 0
      ? webm
      : entries.filter((entry) => entry.endsWith(".mp4")).sort();
  } catch {
    return [];
  }
}

export default function Home() {
  const docs = getAllDocs().slice(0, 10);
  const benchmarkGroups = getSuiteGroups();
  const aliceVideoFiles = getAliceVideoFiles();

  return (
    <main>
      <ScrollVideo files={aliceVideoFiles} />
      <section className="hero">
        <RabbitHero />
        <div className="hero-content hero-split">
          <div className="hero-lede">
            <p className="eyebrow">Open-source Postgres extension</p>
            <h1 className="hero-title">
              Call a model from <span className="accent">inside a SELECT</span>.
            </h1>
            <p className="hero-copy">
              Classify a column, filter a <code>WHERE</code> by meaning, even
              file a ticket — with retries, validation, and a cost receipt. We
              call these operators, and you can build (or deploy) your own.
            </p>
            <div className="hero-actions">
              <Link className="button primary" href="/docs/quickstart">
                <TerminalSquare aria-hidden="true" size={18} />
                Start with SQL
              </Link>
              <Link className="button secondary" href="/docs">
                Read the docs
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </div>
            <p className="hero-foot">Your hardware · your data · no lock-in.</p>
          </div>

          <aside
            className="hero-demo"
            aria-label="An operator you define, called from ordinary SQL"
          >
            <div className="hero-card">
              <div className="hero-card-bar">
                <span className="hero-card-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="hero-card-title">your operators + a built-in semantic filter</span>
              </div>
              <SqlCode ariaLabel="Operators you define plus a built-in semantic filter, in one SQL query">
                {`-- your operators + a built-in semantic filter, one query
SELECT ticket_id,
       triage(body)    AS priority,   -- your classifier
       sentiment(body) AS mood        -- another operator
FROM   support_tickets
WHERE  created_at > now() - interval '1 day'
  AND  rvbbit.means(body, 'a customer about to cancel');`}
              </SqlCode>
              <div className="hero-result">
                <div className="hero-result-head">
                  <span>2 matches</span>
                  <span>semantic filter</span>
                  <span className="ok">receipts logged ✓</span>
                </div>
                <table className="hero-result-table">
                  <thead>
                    <tr>
                      <th>ticket_id</th>
                      <th>priority</th>
                      <th>mood</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1842</td>
                      <td>
                        <span className="hero-pill">urgent</span>
                      </td>
                      <td>
                        <span className="hero-pill cool">angry</span>
                      </td>
                    </tr>
                    <tr>
                      <td>1907</td>
                      <td>
                        <span className="hero-pill">urgent</span>
                      </td>
                      <td>
                        <span className="hero-pill cool">frustrated</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="band" id="dr-proof">
        <Screenshot
          src="shots/data-rabbit-desktop.png"
          alt="Data Rabbit — a desktop over any Postgres, lit up on an RVBBIT database: adaptive routing, model deploys, the operator canvas, the knowledge graph, and live receipts."
          caption="Data Rabbit — point it at any Postgres to browse and query; point it at an RVBBIT database and it lights up. Everything here is plain SQL underneath."
          wide
        />
      </section>

      <section className="band" id="why">
        <div className="section-header">
          <p>Why it&apos;s different</p>
          <h2>Not a fixed menu of AI functions — a layer you program.</h2>
          <span>
            Cortex and Databricks hand you a sealed set of AI SQL calls on their
            cloud. RVBBIT hands you the building blocks: compose hosted models,
            your own Hugging Face deployments, tools, retries, and receipts into
            operators you define — open source, on Postgres, over your own data.
          </span>
        </div>
        <div className="capability-grid">
          {differentiators.map((item) => {
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

      <section className="band mcp-band" id="act">
        <div className="section-header mcp-header">
          <p>SQL that acts</p>
          <h2>A SELECT can file the ticket — and leave a receipt.</h2>
          <span>
            An operator is an ordinary SQL function, but inside it can call
            models, MCP tools, and flows. So Postgres&apos;s own machinery —
            triggers, <code>pg_cron</code>, Alerts — becomes an automation
            engine. <code>SELECT do_stuff()</code> actually does stuff: opens
            tickets, posts messages, kicks off analysis — with trackable SQL as
            the glue.
          </span>
        </div>
        <div className="mcp-showcase">
          <div className="mcp-code-stack">
            <SqlCode ariaLabel="A trigger that opens a Linear ticket">{`-- A plain Postgres trigger that now reaches the outside world:
-- analyze the incident with your operator, file a Linear ticket.
CREATE FUNCTION on_critical_incident() RETURNS trigger AS $$
BEGIN
  PERFORM rvbbit.mcp_call('linear', 'create_issue', jsonb_build_object(
    'title',       'SEV1 · ' || NEW.service,
    'description', summarize_incident(NEW.logs)   -- your LLM operator
  ));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER incident_to_linear
  AFTER INSERT ON incidents
  FOR EACH ROW WHEN (NEW.severity = 'critical')
  EXECUTE FUNCTION on_critical_incident();`}</SqlCode>
            <SqlCode ariaLabel="Declare the same thing as an Alert">{`-- Or declare it: a condition → an action, swept on a clock, edge-triggered.
SELECT rvbbit.define_alert(
  'revenue_drop',
  '{"kind":"sql","metric_name":"daily_revenue"}'::jsonb,
  '{"operator":"mcp_call","server":"linear","tool":"create_issue"}'::jsonb
);`}</SqlCode>
          </div>
          <div className="mcp-points">
            <article>
              <Workflow aria-hidden="true" size={20} />
              <h3>Operators have side effects</h3>
              <p>
                Compose a model call, an MCP tool, a validator, and a flow into
                one function. Calling it doesn&apos;t just compute — it acts.
              </p>
            </article>
            <article>
              <Cable aria-hidden="true" size={20} />
              <h3>Triggers, schedules, alerts</h3>
              <p>
                A trigger fires it on <code>INSERT</code>, <code>pg_cron</code>{" "}
                on a clock, or declare an Alert: condition → action,
                edge-triggered and fire-and-forget.
              </p>
            </article>
            <article>
              <ReceiptText aria-hidden="true" size={20} />
              <h3>Every action is audited</h3>
              <p>
                Each side effect can leave a receipt — args, sub-calls, latency,
                cost, errors — so automation stays replayable and reviewable,
                not a black box.
              </p>
            </article>
          </div>
        </div>
        <Link className="mcp-link" href="/docs/alerts">
          Read about reactive Alerts
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      <section className="band mcp-band" id="receipts">
        <div className="section-header mcp-header">
          <p>Receipts</p>
          <h2>Every model call and side effect is logged, costed, replayable.</h2>
          <span>
            Each operator and action can write a receipt — its inputs, the
            model, the sub-calls it fanned out to, tokens, cost, latency, and
            any error. Governance isn&apos;t a bolt-on: it&apos;s a row in a
            table you can query, join, and audit like anything else.
          </span>
        </div>
        <div className="mcp-showcase">
          <ul className="receipt-dims" aria-label="Columns captured on every receipt">
            {receiptDims.map((dim) => (
              <li key={dim}>{dim}</li>
            ))}
          </ul>
          <div className="mcp-code-stack">
            <SqlCode ariaLabel="Roll up AI and action cost from the receipts table">{`-- what did the last day of AI + actions cost, and where?
SELECT operator,
       model,
       count(*)                                  AS calls,
       round(sum(cost_usd)::numeric, 4)          AS cost_usd,
       round(avg(latency_ms))                    AS avg_ms,
       count(*) FILTER (WHERE error IS NOT NULL) AS errors
FROM   rvbbit.receipts
WHERE  invocation_at > now() - interval '1 day'
GROUP  BY operator, model
ORDER  BY cost_usd DESC;`}</SqlCode>
          </div>
        </div>
        <Link className="mcp-link" href="/docs/receipts-costs">
          Read about receipts and costs
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      <section className="band mcp-band" id="models">
        <div className="section-header mcp-header">
          <p>Models &amp; capability packs</p>
          <h2>Ships with 40+ model packs. Add any Hugging Face model in a paste.</h2>
          <span>
            Every operator is backed by a model, and RVBBIT comes with a catalog
            of curated packs — local specialists (GLiNER, DeBERTa, BGE
            rerankers), embeddings, summarizers, even MCP servers like Brave and
            Apollo — each exposing ready-made SQL operators. That&apos;s where{" "}
            <code>means()</code>, <code>about()</code>, <code>extract_pii()</code>,
            and <code>classify()</code> come from: they work on day one, no
            prompt-wiring.
          </span>
        </div>
        <div className="mcp-showcase">
          <div className="mcp-points">
            <article>
              <Layers3 aria-hidden="true" size={20} />
              <h3>Batteries included</h3>
              <p>
                40+ curated packs: classification, extraction, embeddings,
                reranking, summarization, web search. Day one,{" "}
                <code>means()</code> and <code>classify()</code> just work.
              </p>
            </article>
            <article>
              <Cpu aria-hidden="true" size={20} />
              <h3>Paste a model, get a function</h3>
              <p>
                Pick a model in Data Rabbit; a scaffold → build → register →
                smoke pipeline turns it into <code>rvbbit.your_operator(...)</code>.
                Local or managed runtime, CPU or CUDA.
              </p>
            </article>
            <article>
              <PlugZap aria-hidden="true" size={20} />
              <h3>MCP servers are packs too</h3>
              <p>
                Register an MCP server and its tools become pseudo-tables or
                functions — joinable beside your data, audited like everything
                else.
              </p>
            </article>
          </div>
          <div className="mcp-code-stack">
            <Screenshot
              src="shots/hf-deploy.png"
              alt="Deploy from Hugging Face in Data Rabbit — paste a model ID, inspect it, and run a scaffold → build → register → operator → smoke pipeline that turns it into a typed SQL operator, deployed local or to a managed runtime."
              caption="Deploy from Hugging Face — paste a model ID, get a typed SQL operator."
            />
          </div>
        </div>
        <Screenshot
          src="shots/capabilities.png"
          alt="The capability catalog in Data Rabbit — 40+ curated packs mixing local specialist models, API embeddings, and MCP servers, each card exposing a set of ready-made SQL operators with call counts, latencies, and test status."
          caption="The capability catalog — 40+ packs, each exposing ready-made SQL operators."
          wide
        />
        <Link className="mcp-link" href="/capabilities">
          Browse the capability catalog
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      <section className="band semantic-band" id="semantic">
        <div className="section-header semantic-header">
          <p>Semantic functions</p>
          <h2>Retrieval, classification, and graph memory — built-in SQL functions.</h2>
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

      <section className="band" id="synth">
        <div className="section-header">
          <p>Text-to-SQL</p>
          <h2>Ask in English, get one grounded SELECT over your real schema.</h2>
          <span>
            Plain text-to-SQL is tame in 2026. The interesting part:{" "}
            <code>rvbbit.synth</code> reads your catalog and writes ONE read-only
            SELECT against your actual tables and foreign keys — and it&apos;s the
            same operator + receipts machinery as everything else here, so the
            generated SQL is grounded, validated read-only, cached, and
            inspectable.
          </span>
        </div>
        <SqlCode ariaLabel="Generate one grounded read-only SELECT from English">{`-- Ask in English; get ONE grounded, read-only SELECT over your real schema.
SELECT rvbbit.synth_sql('bigfoot sightings in California since 1990');

  SELECT s.id, s.state, s.classification, s.reported
  FROM   bigfoot.sightings AS s
  WHERE  s.state = 'California' AND s.reported >= DATE '1990-01-01'
  ORDER  BY s.reported DESC
  LIMIT  100;

-- Same machinery as every operator: catalog-grounded, validated, cached, replayable.`}</SqlCode>
        <Link className="mcp-link" href="/docs/text-to-sql">
          Read about text-to-SQL
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      <section className="band mcp-band" id="mcp">
        <div className="section-header mcp-header">
          <p>MCP as a SQL primitive</p>
          <h2>Call any tool from SQL — as a data source, or an action.</h2>
          <span>
            Register MCP servers in Postgres and discover their tools. Read them
            as JSON or row sources to join beside your data — or call them to
            make something happen. Every invocation is cataloged and audited,
            and any tool can be a node inside a Cascade.
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
        <Screenshot
          src="shots/operator-canvas.png"
          alt="An operator's cascade on the canvas in Data Rabbit — its steps (input, a specialist model node, output parser) wired together, a Try-It panel that runs the operator for real, and a live receipt with latency, tokens, and execution history."
          caption="One operator's cascade on the canvas — every step, with a live receipt."
        />
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

      <section className="band split">
        <div className="section-header">
          <p>Architecture</p>
          <h2>Heap is the source of truth; fast paths are optional and earn their place.</h2>
          <span>
            One extension, multiple execution paths. A semantic layer and an
            optional storage/routing engine sit beside the Postgres heap — which
            stays authoritative, with fallbacks for correctness and
            pg_dump/restore.
          </span>
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

      <section className="band" id="metrics">
        <div className="section-header">
          <p>Metrics &amp; KPIs</p>
          <h2>A versioned BI layer — built in, never required.</h2>
          <span>
            A metric is a name and a SELECT. Add one more SELECT that returns a
            boolean and it is a KPI. Every definition is versioned, so you can
            re-run exactly the rule you shipped last quarter. It is all plain
            RVBBIT tables and your own data: no metric store, no DSL, no
            lock-in.
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
        <SqlCode ariaLabel="Define a KPI and check it under a past definition">{`-- a metric is a name + SELECT; the 8th arg makes it a KPI
SELECT rvbbit.define_metric(
  'daily_revenue',
  'SELECT sum(amount) AS total FROM orders',
  '{"target": 1000000}'::jsonb, 'all', 'Revenue must clear target', 'analytics',
  '{}'::jsonb,
  'SELECT total >= {target} AS ok, total AS value FROM metric');

-- evaluate it under the exact definition we shipped on 2025-01-01
SELECT rvbbit.check_metric('daily_revenue', '{}'::jsonb,
  def_as_of => '2025-01-01');
-- => {"ok": true, "value": 1180000, "status": "pass"}`}</SqlCode>
        <Link className="mcp-link" href="/docs/metrics-kpis">
          Read the Metrics &amp; KPIs surface
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      <section className="band home-benchmarks" id="benchmarks">
        <div className="section-header benchmark-home-header">
          <p>Acceleration benchmark snapshot</p>
          <h2>When a fast path fits, the router takes it.</h2>
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

      <section className="band" id="data-rabbit">
        <div className="section-header">
          <p>Data Rabbit</p>
          <h2>A Postgres desktop that gets superpowers on RVBBIT.</h2>
          <span>
            Data Rabbit is a fast desktop for any Postgres — browse, query,
            explore. Point it at an RVBBIT database and it lights up: watch the
            planner pick an engine, deploy a specialist model, build operators on
            a canvas, and read live receipts. Works without the extension;
            unmissable with it.
          </span>
        </div>
        <div className="shot-row">
          <Screenshot
            src="shots/routing-cockpit.png"
            alt="The Adaptive Routing cockpit in Data Rabbit — the planner choosing among native, DataFusion, Duck, and heap per query shape, with live timings."
            caption="Adaptive Routing — watch the planner pick an engine per query."
          />
          <Screenshot
            src="shots/model-studio.png"
            alt="Model Studio in Data Rabbit — spinning up a Hugging Face specialist model and wiring it to a SQL operator."
            caption="Model Studio — spin up a specialist model, call it from SQL."
          />
        </div>
        <div className="shot-row">
          <Screenshot
            src="shots/scry.png"
            alt="Scry in Data Rabbit — a graph explorer over the data knowledge graph, spidering from a table to its columns and related entities."
            caption="Scry — explore your data's knowledge graph."
          />
          <Screenshot
            src="shots/data-search.png"
            alt="Data Search in Data Rabbit — free-text semantic search over the catalog, ranking tables and columns by what their data is about."
            caption="Data Search — find tables by what their data is about."
          />
        </div>
      </section>

      <section className="band docs-band">
        <div className="section-header">
          <p>Documentation</p>
          <h2>Start with one SQL snippet. Go as deep as you want.</h2>
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

      <section className="band release-band" id="get-started">
        <div>
          <TerminalSquare aria-hidden="true" size={20} />
          <h2>docker compose up -d</h2>
          <p>
            One compose file brings up the whole thing — Postgres 18 with the
            extension preinstalled, the query workers, Data Rabbit, and a
            Warren agent. Start with a single SQL snippet and go as deep as
            you want — heap stays the source of truth.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button primary" href="/docs/quickstart">
            <TerminalSquare aria-hidden="true" size={18} />
            Start with SQL
          </Link>
          <Link className="button secondary" href="/docs">
            Read the docs
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
}
