import type { Metadata } from "next";
import Link from "next/link";
import { SqlCode } from "@/components/SqlCode";

export const metadata: Metadata = {
  title: "Clover operators — what the self-hosted gateway runs",
  description:
    "Which clover_* SQL functions a Calliope 1.2.1 CPU install serves, which stay off until you enable a worker, and which are not in this package."
};

const on = [
  ["clover_classify(text, labels)", "Winning label. 2–16 labels use one choice question; other counts score labels independently."],
  ["clover_classify_scores(text, labels)", "All label scores for that call."],
  ["clover_entails(premise, hypothesis)", "Entailment vs not. Threshold stays 0.5. This is not three-way NLI."],
  ["clover_sentiment(text)", "positive, neutral, or negative."],
  ["clover_sentiment_score(text)", "P(positive) − P(negative)."],
  ["clover_toxic(text) / clover_moderate(text)", "Six independent moderation scores. Toxic threshold stays 0.5."],
  ["clover_language(text) / clover_language_info(text)", "Lingua 2.1.1 compact mode. ISO code and a native confidence. Zero model-provider cost."],
  ["clover_transcribe(audio)", "Public HTTP(S) URL, base64, or a data URI. OpenRouter openai/gpt-transcribe unless you change --transcription-model."],
  ["clover_web_scrape(url) / clover_web_markdown(url)", "Bundled Clover Web extractor. No JavaScript browser. cache_policy stays never."],
  ["clover_llm_* , clover_extract_json, summarize, extract", "SQL LLM route clover, default model openai/gpt-6-luna. An operator step can still ask for model calliope."]
];

const optional = [
  ["clover_extract, clover_pii", "GLiNER medium v2.1. Off until COMPOSE_PROFILES includes specialists (or you deploy builtin/clover-gliner)."],
  ["clover_series_embed, clover_series_anomalies, clover_series_similarity, clover_series_impute", "TSPulse. Same specialists profile, or builtin/clover-tspulse. Anomaly detection wants at least 1536 points."],
  ["clover_gliner_extract(text, labels), clover_tspulse(operation, payload)", "Direct worker helpers. Gateway clover_* calls are the ones that hit the ledger."],
  ["clover_cluster, clover_anomaly_fit, clover_anomaly_score", "builtin/clover-analytics. CPU, no GPU. Not started by the default bundle."],
  ["clover_web_research, clover_web_research_deep, clover_web_watch", "Clover Research. The release compose includes the service; --research is how a from-source config turns the route on. SQL cache policy is never."]
];

const absent = [
  "clover_contradicts and the three-way nli3 route — the adapter exists, and a fresh CPU install leaves it unconfigured because Jev and Luna Decisions do not match the old contradiction test.",
  "Forecasting (Chronos), OCR / Granite-Docling, NuExtract as a specialist, SigLIP2 image embeddings, REBEL relations, and TabPFN fit/predict/SHAP. The docs name these as still needing a compatible worker. Do not point them at a chat model.",
  "The Qwen/Cua action scorer. Optional GPU worker, not in the 1.2.1 bundle. choose() stays on Jev."
];

export default function CloverOperatorsPage() {
  return (
    <main className="clover-page">
      <section className="band">
        <div className="section-header">
          <p className="eyebrow">Operator notes · Calliope 1.2.1</p>
          <h2>Names that exist, and the ones that answer.</h2>
          <span>
            These are the SQL functions{" "}
            <a href="https://github.com/ryrobes/calliope/blob/main/docs/CLOVER_SELF_HOSTED.md">
              CLOVER_SELF_HOSTED.md
            </a>{" "}
            documents for the self-hosted gateway. A function can be installed
            and still return <code>capability_unavailable</code> until its
            worker is up. This is not a price list.{" "}
            <Link href="/clover">Back to Clover</Link>.
          </span>
        </div>

        <h3>Served by the default CPU gateway</h3>
        <div className="capability-grid">
          {on.map(([name, text]) => (
            <article className="feature-card" key={name}>
              <p className="clover-ops">{name}</p>
              <p>{text}</p>
            </article>
          ))}
        </div>

        <h3 style={{ marginTop: "2rem" }}>Off until you enable the worker</h3>
        <div className="capability-grid">
          {optional.map(([name, text]) => (
            <article className="feature-card" key={name}>
              <p className="clover-ops">{name}</p>
              <p>{text}</p>
            </article>
          ))}
        </div>

        <h3 style={{ marginTop: "2rem" }}>Not in this CPU package</h3>
        <ul>
          {absent.map((line) => (
            <li key={line} style={{ marginBottom: "0.6rem" }}>
              {line}
            </li>
          ))}
        </ul>

        <div style={{ maxWidth: 860, marginTop: "1.5rem" }}>
          <SqlCode ariaLabel="Probe Clover routes and a default operator">{`-- Local service key, from the install's generated client.env.
-- GET /v1/capabilities?probe=true
-- reports disabled | missing_credentials | configured | ready | unavailable.

SELECT rvbbit.clover_sentiment_score('Excellent repair and quick service');`}</SqlCode>
        </div>
        <p style={{ marginTop: "1rem" }}>
          Built-in operators that are not <code>clover_*</code> —{" "}
          <code>means</code>, <code>about</code>, <code>classify</code>,{" "}
          <code>extract</code>, <code>knn_text</code>, <code>synth_sql</code> —
          are the extension itself. See <Link href="/docs/semantic-functions">semantic functions</Link> and{" "}
          <Link href="/docs/semantic-sql">semantic SQL</Link>.
        </p>
      </section>
    </main>
  );
}
