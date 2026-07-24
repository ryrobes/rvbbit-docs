import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TerminalSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Clover — hosted semantic operators & industry kits for Postgres",
  description:
    "Pre-built AI operators for the Postgres you already run: judgment, extraction, summarization, OCR, forecasting — flat pricing, receipts on every answer. Plus Clover Kits: turn-key vertical capability like construction pay-application auditing and dental claims integrity, installed into your database.",
};

const FAMILIES = [
  {
    title: "Judgment & meaning",
    ops: "clover_means · clover_relevance · clover_entails · clover_contradicts · clover_sentiment",
    text: "WHERE clauses that read. Filter, rank, and test claims by meaning instead of keywords — calibrated together so the operators agree with each other.",
  },
  {
    title: "Extraction & structure",
    ops: "clover_extract · clover_pii · clover_triples · clover_llm_extract",
    text: "Entities, PII, knowledge-graph triples, and schema-shaped JSON pulled out of freeform text — described in plain English, returned as columns.",
  },
  {
    title: "Language functions",
    ops: "clover_llm_summarize · translate · anonymize · apply · make_operator",
    text: "Summaries, translation, redaction, question-answering — and an operator that builds new operators from a one-sentence description, born with its own tests.",
  },
  {
    title: "Media & signals",
    ops: "clover_ocr · clover_transcribe · clover_forecast · clover_image_similar",
    text: "Documents become text, audio becomes transcripts, series become forecasts — the same SQL surface, the same receipts.",
  },
  {
    title: "Tabular ML",
    ops: "clover_fit · clover_predict · clover_anomaly_fit · clover_anomaly_score",
    text: "Foundation-model tabular prediction and anomaly detection. Your fitted models come back to you as blobs — nothing you make persists on our side.",
  },
];

const TIERS = [
  {
    name: "Free",
    price: "$0",
    lanes: "1 inference lane",
    slug: "clover-free",
    note: "Every operator. Real GPUs. One concurrent generation stream.",
  },
  {
    name: "Pro",
    price: "$299/mo",
    lanes: "5 inference lanes",
    slug: "clover-pro",
    note: "Parallel generation for row-wise LLM work and multi-user teams.",
  },
  {
    name: "Scale",
    price: "$999/mo",
    lanes: "25 inference lanes",
    slug: "clover-scale",
    note: "Wide fan-out: thousand-row semantic sweeps at interactive speed.",
  },
];

const KITS = [
  {
    name: "Construction Commercial Controls",
    badge: "In development · design partners open",
    bullets: [
      "Pay-application auditing against contract terms and prior billings",
      "Schedule-of-values drift and front-loading detection",
      "Change-order exposure and notice-deadline tracking",
    ],
    mailtoSubject: "Construction Commercial Controls kit",
  },
  {
    name: "Dental Claims Integrity",
    badge: "In development",
    bullets: [
      "Denial-pattern surfacing across carriers and codes",
      "Note-to-claim consistency checks",
      "Recall and treatment-plan follow-through signals",
    ],
    mailtoSubject: "Dental Claims Integrity kit",
  },
  {
    name: "Your industry",
    badge: "Design partners",
    bullets: [
      "The first partner in a vertical shapes the kit",
      "Your controls, encoded as operators, views, and surfaces",
      "Working system first, polish second — on your real data",
    ],
    mailtoSubject: "Clover Kit design partner",
  },
];

export default function CloverPage() {
  return (
    <main className="clover-page">
      <section className="band clover-hero">
        <div className="section-header">
          <p className="eyebrow">Clover — managed capability</p>
          <h2>
            We bring the expertise <em>to your database.</em>
          </h2>
          <span>
            RVBBIT gives you the building blocks. Clover is the other door:
            ~50 <Link href="/semantic-sql">semantic SQL</Link> operators,
            pre-built and calibrated as a set, running on hosted GPUs under
            flat pricing — installed into the Postgres you already run. Your
            data never leaves your database; every answer ships with a
            receipt naming the exact model that produced it.
          </span>
        </div>
        <div className="clover-install">
          <p className="eyebrow">Install from psql — no UI required</p>
          <pre>
            <code>curl -fsSL https://rvbbit.ai/clover-install.sql | psql &quot;$DSN&quot;</code>
          </pre>
          <p className="clover-install-note">
            Free key at <Link href="/buy/clover-free">rvbbit.ai/buy/clover-free</Link>.
            The <code>rvbbit-postgres</code> image auto-installs on first boot when{" "}
            <code>RVBBIT_CLOVER_KEY</code> is set. Agents:{" "}
            <Link href="/docs/agents">there&apos;s a page for you</Link>.
          </p>
        </div>
      </section>

      <section className="band" id="operators">
        <div className="section-header">
          <p>What&apos;s in the box</p>
          <h2>Operators that were tested together, so they agree with each other.</h2>
          <span>
            Not a grab bag of model endpoints — a battery-tested set. Model
            versions are pinned, upgrades are opt-in, and{" "}
            <code>rvbbit.receipts</code> records inputs, outputs, model, and
            cost for every call.
          </span>
        </div>
        <div className="capability-grid">
          {FAMILIES.map((f) => (
            <article className="feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p className="clover-ops">{f.ops}</p>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/clover/operators">
            Browse the full operator reference — all 49, each with the model
            cascade it runs →
          </Link>
        </p>
      </section>

      <section className="band" id="pricing">
        <div className="section-header">
          <p>Pricing</p>
          <h2>Lanes, not tokens.</h2>
          <span>
            A lane is one LLM generation in flight. ML operators are unmetered
            on every tier, and queries never lose rows to rate limits — fewer
            lanes only ever means slower, never incomplete. Metered pricing
            taxes curiosity; capacity only taxes impatience.
          </span>
        </div>
        <div className="clover-tiers">
          {TIERS.map((t) => (
            <article className="clover-tier" key={t.slug}>
              <h3>{t.name}</h3>
              <p className="clover-price">{t.price}</p>
              <p className="clover-lanes">{t.lanes}</p>
              <p className="clover-tier-note">{t.note}</p>
              <Link className="button primary" href={`/buy/${t.slug}`}>
                Get {t.name}
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="band" id="kits">
        <div className="section-header">
          <p>Clover Kits</p>
          <h2>Turn-key vertical capability, installed into your Postgres.</h2>
          <span>
            Vertical SaaS asks you to move your data into their app. A Kit
            moves the expertise into your database instead: domain operators,
            metrics, alerts, and ready-made Data Rabbit surfaces for a
            specific line of work — running where your data already lives.
            And when the turn-key part isn&apos;t quite your business, it&apos;s
            SQL all the way down. Change it.
          </span>
        </div>
        <div className="clover-kits">
          {KITS.map((k) => (
            <article className="clover-kit" key={k.name}>
              <span className="clover-kit-badge">{k.badge}</span>
              <h3>{k.name}</h3>
              <ul>
                {k.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <a
                className="clover-kit-cta"
                href={`mailto:ryan@rvbbit.ai?subject=${encodeURIComponent(k.mailtoSubject)}`}
              >
                Talk to us about this kit →
              </a>
            </article>
          ))}
        </div>
        <p className="clover-kits-foot">
          Every kit includes: domain-tuned operators · curated views and
          metrics · alerts · Data Rabbit scenes and dashboards · receipts on
          every model-backed judgment. Kits are in active development — the
          fastest way to move one up the list is to want it out loud:{" "}
          <a href="mailto:ryan@rvbbit.ai?subject=Clover%20Kits">ryan@rvbbit.ai</a>.
        </p>
      </section>

      <section className="band release-band">
        <div>
          <TerminalSquare aria-hidden="true" size={20} />
          <h2>Two commands to semantic SQL</h2>
          <p>
            Run the container with your key, or install into the Postgres you
            already have. Either way, the first{" "}
            <code>WHERE rvbbit.clover_means(...)</code> is minutes away.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button primary" href="/buy/clover-free">
            Get a free key
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link className="button secondary" href="/docs/quickstart">
            Read the quickstart
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
}
