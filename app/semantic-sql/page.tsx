import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What is Semantic SQL? — a definition",
  description:
    "Semantic SQL is SQL whose predicates and expressions operate on meaning instead of characters — model calls as typed SQL operators. What it is, how it works, and what it is not (text-to-SQL, vector search, RAG).",
  alternates: { canonical: "https://rvbbit.ai/semantic-sql" }
};

const JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "DefinedTerm",
      name: "Semantic SQL",
      description:
        "SQL in which predicates and expressions operate on the meaning of data rather than its characters — machine-learning models exposed as ordinary typed SQL functions and operators, so filtering, ranking, classification, and extraction by meaning compose with joins, groups, and the rest of the relational algebra.",
      url: "https://rvbbit.ai/semantic-sql"
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is semantic SQL the same as text-to-SQL?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Text-to-SQL generates SQL from a natural-language question. Semantic SQL is SQL you write yourself, in which some operators understand meaning. The query is still deterministic, versioned, reviewable code."
          }
        },
        {
          "@type": "Question",
          name: "Is semantic SQL just vector search / pgvector?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Vector similarity is one primitive of semantic SQL, not the whole of it. A semantic SQL surface also includes judgment operators (entailment, classification, toxicity), extraction to typed columns, transformation (summarize, translate, repair), and LLM-judged predicates — each returning ordinary SQL types."
          }
        },
        {
          "@type": "Question",
          name: "How is semantic SQL different from RAG?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "RAG retrieves documents to ground a chatbot's answer. Semantic SQL answers set-oriented questions inside the database: filter these 40,000 rows by meaning, group them by inferred category, join them on entity identity. No chat loop involved."
          }
        },
        {
          "@type": "Question",
          name: "Aren't model outputs non-deterministic? How can that live in SQL?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The same way floats and collations live in SQL: with engineering discipline. Pin model versions, cache aggressively (same input + same model = same answer), record a receipt for every call naming the exact model, and gate free-text model output through deterministic code before it becomes a typed value."
          }
        }
      ]
    }
  ]
};

function Sql({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "rgba(15,23,42,0.55)",
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 10,
        padding: "0.9rem 1.1rem",
        overflowX: "auto",
        fontSize: "0.88rem",
        lineHeight: 1.55
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

function Verdict({ good, children }: { good?: boolean; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.6rem",
        borderRadius: 999,
        fontSize: "0.78rem",
        border: `1px solid ${good ? "rgba(94,234,212,0.5)" : "rgba(248,113,113,0.45)"}`,
        color: good ? "#5eead4" : "#fca5a5",
        marginRight: "0.5rem"
      }}
    >
      {children}
    </span>
  );
}

export default function SemanticSqlPage() {
  return (
    <main className="clover-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
      />

      {/* Dictionary-entry hero */}
      <section className="band">
        <div className="section-header" style={{ maxWidth: 860 }}>
          <p className="eyebrow">a definition</p>
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)", marginBottom: "0.4rem" }}>
            semantic SQL
          </h1>
          <p
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic",
              textTransform: "none",
              color: "inherit",
              opacity: 0.6,
              fontSize: "1rem",
              marginBottom: "1.1rem"
            }}
          >
            /səˈman.tɪk ˌɛs.kjuːˈɛl/ · noun
          </p>
          <p
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              textTransform: "none",
              color: "inherit",
              fontSize: "1.3rem",
              lineHeight: 1.65,
              borderLeft: "3px solid rgba(94,234,212,0.6)",
              paddingLeft: "1.1rem"
            }}
          >
            SQL in which predicates and expressions operate on the{" "}
            <strong>meaning</strong> of data rather than its characters —
            machine-learning models exposed as ordinary typed SQL functions,
            so filtering, ranking, classifying, and extracting <em>by meaning</em>{" "}
            compose with joins, groups, and everything else the relational
            algebra already does.
          </p>
          <div style={{ marginTop: "1.6rem" }}>
            <Sql>{`SELECT * FROM tickets
WHERE means(body, 'angry about billing');`}</Sql>
            <p
              style={{
                fontSize: "0.95rem",
                textTransform: "none",
                fontFamily: "inherit",
                color: "inherit",
                opacity: 0.7,
                marginTop: "0.5rem"
              }}
            >
              That WHERE clause is the whole idea. The rest of this page is
              detail.
            </p>
          </div>
        </div>
      </section>

      {/* The problem it names */}
      <section className="band">
        <div className="section-header">
          <p>Why the term exists</p>
          <h2>Databases match characters. Questions are about meaning.</h2>
          <span>
            Fifty years of SQL gives you exact equality, ranges, and pattern
            matching over characters. But most of the questions people
            actually bring to their data are semantic: <em>which of these are
            complaints? which notes mention a safety issue? which two records
            are the same customer?</em>
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1rem",
            maxWidth: 980
          }}
        >
          <article className="feature-card">
            <h3>Character SQL</h3>
            <Sql>{`SELECT * FROM tickets
WHERE body ILIKE '%angry%'
   OR body ILIKE '%mad%'
   OR body ILIKE '%upset%';  -- …`}</Sql>
            <p>
              <Verdict>misses</Verdict>
              &ldquo;this is the <em>third time</em> I&rsquo;ve been
              overcharged&rdquo;
            </p>
            <p>
              <Verdict>false hit</Verdict>
              &ldquo;I was angry until support sorted it — five stars&rdquo;
            </p>
          </article>
          <article className="feature-card">
            <h3>Semantic SQL</h3>
            <Sql>{`SELECT * FROM tickets
WHERE means(body, 'angry about billing');`}</Sql>
            <p>
              <Verdict good>catches</Verdict>
              fury that never uses an anger word
            </p>
            <p>
              <Verdict good>skips</Verdict>
              praise that happens to contain one
            </p>
          </article>
        </div>
      </section>

      {/* Mechanics */}
      <section className="band">
        <div className="section-header">
          <p>How it works</p>
          <h2>Models become functions. Functions return SQL types.</h2>
          <span>
            Underneath, three kinds of machinery answer the call — and the
            crucial move is that each returns a plain, typed SQL value, so the
            planner, the optimizer, and your GROUP BY never know anything
            unusual happened.
          </span>
        </div>
        <div className="capability-grid">
          <article className="feature-card">
            <h3 style={{ color: "#5eead4" }}>Encoder models</h3>
            <p>
              Embeddings, cross-encoders, NLI, sentiment, OCR, forecasting.
              Small, fast, cheap enough to run over whole tables. They answer{" "}
              <em>how similar / does this entail / which label</em> — and they
              do the bulk of semantic work.
            </p>
          </article>
          <article className="feature-card">
            <h3 style={{ color: "#a78bfa" }}>LLM steps</h3>
            <p>
              For judgment that needs actual reading: extract this invoice to
              my schema, is this evidence for that claim, rewrite with PII
              redacted. Prompt-engineered once, exposed as a function forever.
            </p>
          </article>
          <article className="feature-card">
            <h3 style={{ color: "#fbbf24" }}>Deterministic gates</h3>
            <p>
              Code between the model and your column: parse the output, apply
              the threshold, coerce the type, refuse the garbage. The reason a
              semantic predicate can safely return a <code>bool</code>.
            </p>
          </article>
        </div>
        <div style={{ maxWidth: 860, marginTop: "1.2rem" }}>
          <p style={{ opacity: 0.85 }}>
            And because operators return ordinary types, they compose like
            SQL, not like an API:
          </p>
          <Sql>{`SELECT clover_classify(body, '["bug","billing","feature request"]') AS topic,
       count(*),
       avg(clover_sentiment_score(body))
FROM tickets
WHERE created_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 2 DESC;`}</Sql>
        </div>
      </section>

      {/* What it is not */}
      <section className="band">
        <div className="section-header">
          <p>Disambiguation</p>
          <h2>What semantic SQL is not.</h2>
          <span>
            The term gets conflated with three neighbors. All three are real
            and useful; none of them is this.
          </span>
        </div>
        <div className="capability-grid">
          <article className="feature-card">
            <h3>Not text-to-SQL</h3>
            <p>
              Text-to-SQL turns a natural-language question into a query.
              Semantic SQL is a query <em>you</em> wrote — versioned,
              reviewed, deterministic in shape — where some operators
              understand meaning. One generates code; the other extends the
              language.
            </p>
          </article>
          <article className="feature-card">
            <h3>Not (just) vector search</h3>
            <p>
              Nearest-neighbor similarity is one primitive — the{" "}
              <em>adjective</em>. Semantic SQL also needs verbs: entail,
              classify, extract, repair, judge. A <code>pgvector</code> column
              is an ingredient; a semantic SQL surface is the cuisine.
            </p>
          </article>
          <article className="feature-card">
            <h3>Not RAG</h3>
            <p>
              RAG retrieves context so a chatbot can answer one question.
              Semantic SQL answers <em>set-oriented</em> questions — filter
              40,000 rows by meaning, group by inferred category, join on
              entity identity — with no chat loop anywhere.
            </p>
          </article>
        </div>
      </section>

      {/* Engineering honesty */}
      <section className="band">
        <div className="section-header">
          <p>The hard question</p>
          <h2>&ldquo;But models aren&rsquo;t deterministic.&rdquo;</h2>
          <span>
            Correct — and SQL has absorbed messier things than this (floats,
            collations, time zones). The discipline that makes it safe:{" "}
            <strong>pin</strong> model versions so answers are reproducible;{" "}
            <strong>cache</strong> so the same input never pays or drifts
            twice; <strong>receipt</strong> every call with the exact model
            that produced it, so any answer can be audited later;{" "}
            <strong>gate</strong> free-text output through deterministic code
            before it becomes a typed value; and <strong>test</strong>{" "}
            operators like functions, because that&rsquo;s what they are.
            Treat a semantic operator like a tiny, versioned ML deployment —
            because it is one — and it behaves like SQL.
          </span>
        </div>
      </section>

      {/* Try it — the vendor part, honestly labeled */}
      <section className="band">
        <div className="section-header">
          <p>A working implementation</p>
          <h2>This site ships one.</h2>
          <span>
            RVBBIT implements semantic SQL as a Postgres extension —{" "}
            <Link href="/clover/operators">49 operators</Link> across encoder,
            composite, and LLM cascades, hosted or{" "}
            <Link href="/docs/existing-postgres">self-hosted</Link>, with
            receipts on every call. Runnable in about five lines:
          </span>
        </div>
        <div style={{ maxWidth: 860 }}>
          <Sql>{`-- any Postgres 18 (tarball: rvbbit.ai/existing-postgres)
CREATE EXTENSION pg_rvbbit;  SELECT rvbbit.migrate();
\\! curl -fsSL https://rvbbit.ai/clover-install.sql | psql
SELECT rvbbit.set_secret('RVBBIT_CLOVER_KEY', 'rvb_…');  -- free key: rvbbit.ai/free

SELECT means('this blanket is cozy wool', 'warm bedding');   -- t`}</Sql>
          <p style={{ marginTop: "0.8rem" }}>
            <Link href="/quickstart">Quickstart</Link> ·{" "}
            <Link href="/clover/operators">the operator reference</Link> ·{" "}
            <Link href="/free">free key</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
