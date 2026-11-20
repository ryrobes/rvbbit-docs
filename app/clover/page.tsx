import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TerminalSquare } from "lucide-react";
import { SqlCode } from "@/components/SqlCode";

export const metadata: Metadata = {
  title: "Clover — self-hosted model gateway",
  description:
    "Clover is the Hutch proxy inside a self-hosted Calliope install. OpenRouter-backed SQL operators, optional GLiNER and TSPulse workers, and your own MCP servers. No Clover account."
};

const DEFAULT_OPS = [
  {
    title: "Text judgments",
    ops: "clover_classify · clover_classify_scores · clover_entails · clover_sentiment · clover_sentiment_score · clover_toxic · clover_moderate",
    text: "Typed questions through the OpenRouter Decisions adapter. The default decision model is typesafe/jev-1.13. Three-way NLI (clover_contradicts) is left unconfigured on a fresh CPU install."
  },
  {
    title: "Language, audio, public web",
    ops: "clover_language · clover_language_info · clover_transcribe · clover_web_scrape · clover_web_markdown",
    text: "Lingua on CPU for language. Transcription is OpenRouter openai/gpt-transcribe for a public URL or base64 audio. Scraping is the bundled Clover Web extractor. No separate API key."
  },
  {
    title: "SQL LLM route",
    ops: "summarize · extract · clover_llm_* · clover_extract_json",
    text: "Row-level LLM operators use the clover route. The install default is openai/gpt-6-luna (temperature 0). The Calliope agent route is separate (openai/gpt-6.1-sol unless you change it)."
  },
  {
    title: "Embeddings and rerank",
    ops: "voyageai/voyage-4 · voyageai/rerank-3-lite",
    text: "Default text embeddings are 1,024-dimensional Voyage 4. Rerank is Voyage rerank-3-lite. SQL, catalog search, and memory share that text space. This is not a local GPU."
  }
];

export default function CloverPage() {
  return (
    <main className="clover-page">
      <section className="band clover-hero">
        <div className="section-header">
          <p className="eyebrow">Clover — self-hosted, inside Calliope</p>
          <h2>Your OpenRouter key. Your machine. No Clover account.</h2>
          <span>
            Clover is the model gateway in a Calliope install. Hutch is the
            proxy everything else calls: Postgres operators, the agent, memory,
            speech. Provider keys stay on that gateway. The hosted Clover
            service, including the free tier, is gone — there is no checkout,
            no <code>clover.rvbb.it</code>, and nothing to buy.
          </span>
        </div>
        <div className="clover-install">
          <p className="eyebrow">It comes with the Calliope install</p>
          <pre>
            <code>curl -fsSL https://usecalliope.com/install.sh | bash</code>
          </pre>
          <p className="clover-install-note">
            Linux x86-64, Docker Compose 2.30+. The installer asks for an
            OpenRouter key, an administrator login, and how people will reach
            the box. The localhost choice binds the web UI, Data Rabbit, and
            Postgres to 127.0.0.1. Read the script before you run it.{" "}
            <Link href="/docs/quickstart">Quickstart</Link>
            {" · "}
            <a href="https://github.com/ryrobes/calliope/blob/main/docs/CLOVER_SELF_HOSTED.md">
              CLOVER_SELF_HOSTED.md
            </a>
          </p>
        </div>
      </section>

      <section className="band" id="what-runs">
        <div className="section-header">
          <p>What a default install actually serves</p>
          <h2>A working subset, not every specialist that has a SQL name.</h2>
          <span>
            Calliope registers the SQL functions. Registration is not the same
            thing as a live worker. Unconfigured <code>/b/.../predict</code>{" "}
            routes return HTTP 503 <code>capability_unavailable</code>. They do
            not invent an answer. The shipping bundle is Calliope 1.2.1:{" "}
            <code>deploy/compose.yaml</code> defines 22 services. GLiNER and
            TSPulse are in the <code>specialists</code> profile and stay off
            unless you opt in before initialization.
          </span>
        </div>
        <div className="capability-grid">
          {DEFAULT_OPS.map((f) => (
            <article className="feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p className="clover-ops">{f.ops}</p>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
        <div style={{ maxWidth: 860, marginTop: "1.5rem" }}>
          <SqlCode ariaLabel="Default Clover SQL that the CPU gateway serves">{`SELECT rvbbit.clover_classify(
  'The rooftop unit is leaking refrigerant',
  'repair, billing, installation, scheduling'
);

SELECT rvbbit.clover_entails(
  'Several invoices were paid yesterday',
  'Some invoices were paid'
);

SELECT rvbbit.clover_web_markdown('https://example.com');`}</SqlCode>
        </div>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/clover/operators">
            Which operators are on, which are optional, and which are not in
            this package
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </p>
      </section>

      <section className="band" id="specialists">
        <div className="section-header">
          <p>Optional CPU workers</p>
          <h2>GLiNER and TSPulse are off until you say so.</h2>
          <span>
            On the shipping install, set this in <code>settings.env</code>{" "}
            <em>before</em> initialization, then run the installer. The
            initializer enables their Clover routes only when this profile is
            selected. Models download on first start into Docker volumes.
          </span>
        </div>
        <div className="clover-install">
          <pre>
            <code>COMPOSE_PROFILES=computer,specialists</code>
          </pre>
          <p className="clover-install-note">
            <code>computer</code> is Callie&apos;s CPU desktop (browser, files,
            terminal). <code>specialists</code> starts{" "}
            <code>calliope-clover-gliner</code> and{" "}
            <code>calliope-clover-tspulse</code>. Neither is a GPU. Forecasting,
            OCR, NuExtract, image embeddings, and tabular fit/predict/SHAP are
            not part of this CPU package — leave them unconfigured rather than
            pointing the route at a chat model.
          </p>
        </div>
        <div style={{ maxWidth: 860, marginTop: "1.25rem" }}>
          <SqlCode ariaLabel="GLiNER and TSPulse after the specialists profile is on">{`-- After the specialists profile is up. These 503 until the workers are ready.
SELECT rvbbit.clover_extract(
  'Alice at Acme in Boston; alice@example.com',
  'person,organization,location,email');
SELECT rvbbit.clover_pii('Contact Alice at alice@example.com');`}</SqlCode>
        </div>
        <p className="clover-install-note" style={{ maxWidth: 860, marginTop: "0.75rem" }}>
          A from-source Clover (not the release bundle) can also install the
          same workers with{" "}
          <code>rvbbit.deploy_catalog_capability(&apos;builtin/clover-gliner&apos;, ...)</code>{" "}
          and <code>builtin/clover-tspulse</code>, then pass{" "}
          <code>--gliner-worker</code> and <code>--tspulse-worker</code> to{" "}
          <code>scripts/clover/configure.py</code>. That path is documented in
          the Calliope repo. The one-liner install uses the profile above.
          Clustering (<code>clover_cluster</code>, <code>clover_anomaly_fit</code>,{" "}
          <code>clover_anomaly_score</code>) is the separate{" "}
          <code>builtin/clover-analytics</code> Warren pack, also off until you
          deploy it.
        </p>
      </section>

      <section className="band" id="extend">
        <div className="section-header">
          <p>Extend it</p>
          <h2>Your MCP servers and your operators, in SQL.</h2>
          <span>
            Hutch is the model proxy. MCP servers are a different door: tools
            you register, then call from SQL or from an operator step. The
            gateway runtime is the <code>runtimes/mcp-gateway</code> capability.
          </span>
        </div>
        <div style={{ maxWidth: 860 }}>
          <SqlCode ariaLabel="Register an MCP server and define an operator">{`SELECT rvbbit.deploy_catalog_capability(
    catalog_id => 'runtimes/mcp-gateway',
    target_selector => '{"gpu":false}'::jsonb);

SELECT rvbbit.register_mcp_server(
    server_name      => 'github',
    server_transport => 'stdio',
    server_command   => 'npx',
    server_args      => ARRAY['-y', '@modelcontextprotocol/server-github'],
    server_env       => '{"GITHUB_PERSONAL_ACCESS_TOKEN":"\${GITHUB_TOKEN}"}'::jsonb,
    server_timeout_ms => 60000);
SELECT rvbbit.refresh_mcp_server('github');

SELECT rvbbit.create_operator(
    op_name        => 'triage_ticket',
    op_arg_names   => ARRAY['body'],
    op_return_type => 'text',
    op_steps => '[
      {"name":"cheap","kind":"specialist","specialist":"classify",
       "inputs":{"text":"{{ inputs.body }}","labels":"billing,bug,how-to,outage"}},
      {"name":"enrich","kind":"mcp","server":"crm","tool":"get_customer",
       "inputs":{"ticket_text":"{{ inputs.body }}"}}
    ]'::jsonb);`}</SqlCode>
        </div>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/docs/mcp">MCP from SQL</Link>
          {" · "}
          <Link href="/docs/semantic-sql">Defining operators</Link>
          {" · "}
          <a href="https://github.com/ryrobes/calliope/blob/main/docs/OPERATORS.md">
            OPERATORS.md
          </a>
        </p>
      </section>

      <section className="band" id="where">
        <div className="section-header">
          <p>Where the pieces live</p>
          <h2>Names that match the 1.2.1 Compose file.</h2>
        </div>
        <div className="capability-grid">
          <article className="feature-card">
            <h3>Postgres</h3>
            <p>
              <code>ghcr.io/ryrobes/calliope-postgres:1.2.1</code>. Database{" "}
              <code>rvbbit</code>. SQL is published on 5432 with TLS when you
              choose a public URL; a localhost install binds it to 127.0.0.1
              (the installer picks a free port if 5432 is taken).
            </p>
          </article>
          <article className="feature-card">
            <h3>Data Rabbit</h3>
            <p>
              <code>ghcr.io/ryrobes/calliope-datarabbit:1.2.1</code>. On a public
              URL it is <code>https://YOUR_SERVER:3001</code> and also{" "}
              <code>/datarabbit</code> on the Calliope origin. The old Lens
              image and port 3000 are not this install.
            </p>
          </article>
          <article className="feature-card">
            <h3>Hutch</h3>
            <p>
              The <code>clover</code> service, image{" "}
              <code>calliope-clover:1.2.1</code>, plus <code>clover-decisions</code>,{" "}
              <code>clover-utilities</code>, <code>clover-web</code>, and{" "}
              <code>clover-research</code>. They stay on the Compose network.
              A from-source standalone gateway publishes only{" "}
              <code>127.0.0.1:18090</code>.
            </p>
          </article>
          <article className="feature-card">
            <TerminalSquare aria-hidden="true" size={22} />
            <h3>Readiness</h3>
            <p>
              <code>GET /v1/capabilities?probe=true</code> with the local service
              key reports each route as disabled, missing credentials,
              configured, ready, or unavailable. It does not make a paid
              inference call.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
