import Link from "next/link";
import type { Metadata } from "next";
import catalog from "../../../content/clover-operators.json";

export const metadata: Metadata = {
  title: "Clover operators — every clover_* function, with its cascade",
  description:
    "All 49 hosted Clover operators for Postgres: signatures, descriptions, and the exact model cascade each one runs (encoder specialists, LLM steps, code gates)."
};

type Step = {
  name: string;
  kind: string;
  label: string;
  model: string | null;
  argIn: string[];
  stepIn: string[];
};

type Op = {
  name: string;
  args: string[];
  returns: string;
  description: string;
  steps: Step[];
};

const OPS: Op[] = (catalog as { operators: Op[] }).operators;

const KIND_COLOR: Record<string, string> = {
  llm: "#a78bfa",
  specialist: "#5eead4",
  code: "#fbbf24"
};

const KIND_LABEL: Record<string, string> = {
  llm: "LLM (gemma-4)",
  specialist: "encoder model",
  code: "code gate"
};

// Layered layout: args column → one column per step → return column.
function OpDag({ op }: { op: Op }) {
  const rowH = 34;
  const argW = 104;
  const stepW = 132;
  const outW = 84;
  const gap = 44;
  const pad = 8;

  const rows = Math.max(op.args.length, 1);
  const midY = (rows * rowH) / 2 + pad;
  const width =
    pad + argW + gap + op.steps.length * (stepW + gap) + outW + pad;
  const height = rows * rowH + pad * 2 + 14;

  const argY = (i: number) => pad + i * rowH + rowH / 2 + 7;
  const stepX = (i: number) => pad + argW + gap + i * (stepW + gap);
  const outX = pad + argW + gap + op.steps.length * (stepW + gap);

  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  op.steps.forEach((s, si) => {
    s.argIn.forEach((a) => {
      const ai = op.args.indexOf(a);
      if (ai >= 0)
        edges.push({
          x1: pad + argW,
          y1: argY(ai),
          x2: stepX(si),
          y2: midY + 7
        });
    });
    s.stepIn.forEach((prev) => {
      const pi = op.steps.findIndex((p) => p.name === prev);
      if (pi >= 0)
        edges.push({
          x1: stepX(pi) + stepW,
          y1: midY + 7,
          x2: stepX(si),
          y2: midY + 7
        });
    });
  });
  // final step → return
  if (op.steps.length > 0) {
    edges.push({
      x1: stepX(op.steps.length - 1) + stepW,
      y1: midY + 7,
      x2: outX,
      y2: midY + 7
    });
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, display: "block" }}
      role="img"
      aria-label={`${op.name} cascade: ${op.steps.map((s) => s.label).join(" then ")}`}
    >
      {edges.map((e, i) => {
        const mx = (e.x1 + e.x2) / 2;
        return (
          <path
            key={i}
            d={`M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}`}
            fill="none"
            stroke="rgba(148,163,184,0.45)"
            strokeWidth={1.2}
          />
        );
      })}
      {op.args.map((a, i) => (
        <g key={a}>
          <rect
            x={pad}
            y={argY(i) - 12}
            width={argW}
            height={24}
            rx={12}
            fill="rgba(148,163,184,0.08)"
            stroke="rgba(148,163,184,0.4)"
          />
          <text
            x={pad + argW / 2}
            y={argY(i) + 4}
            textAnchor="middle"
            fontSize={11}
            fontFamily="var(--font-mono, ui-monospace, monospace)"
            fill="#cbd5e1"
          >
            {a}
          </text>
        </g>
      ))}
      {op.steps.map((s, i) => (
        <g key={s.name}>
          <rect
            x={stepX(i)}
            y={midY - 10}
            width={stepW}
            height={34}
            rx={8}
            fill="rgba(15,23,42,0.6)"
            stroke={KIND_COLOR[s.kind] ?? "#94a3b8"}
            strokeWidth={1.3}
          />
          <text
            x={stepX(i) + stepW / 2}
            y={midY + 4}
            textAnchor="middle"
            fontSize={11}
            fontFamily="var(--font-mono, ui-monospace, monospace)"
            fill={KIND_COLOR[s.kind] ?? "#94a3b8"}
          >
            {s.label}
          </text>
          <text
            x={stepX(i) + stepW / 2}
            y={midY + 17}
            textAnchor="middle"
            fontSize={8.5}
            fill="rgba(148,163,184,0.75)"
          >
            {s.kind === "llm"
              ? "hosted LLM"
              : s.kind === "code"
                ? "deterministic gate"
                : (s.model ?? "").split("/").pop() || "hosted encoder"}
          </text>
        </g>
      ))}
      <g>
        <rect
          x={outX}
          y={midY - 5}
          width={outW}
          height={24}
          rx={12}
          fill="rgba(244,114,182,0.07)"
          stroke="rgba(244,114,182,0.45)"
        />
        <text
          x={outX + outW / 2}
          y={midY + 11}
          textAnchor="middle"
          fontSize={11}
          fontFamily="var(--font-mono, ui-monospace, monospace)"
          fill="#f9a8d4"
        >
          {op.returns}
        </text>
      </g>
    </svg>
  );
}

function OpCard({ op }: { op: Op }) {
  return (
    <article className="feature-card" id={op.name} style={{ overflow: "hidden" }}>
      <h3 style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "0.95rem" }}>
        {op.name}({op.args.join(", ")}) → {op.returns}
      </h3>
      <p>{op.description}</p>
      <div style={{ overflowX: "auto" }}>
        <OpDag op={op} />
      </div>
    </article>
  );
}

const GROUPS: { title: string; blurb: string; filter: (o: Op) => boolean }[] = [
  {
    title: "Encoder specialists",
    blurb:
      "Single hosted encoder models — embeddings, rerank, sentiment, NLI, OCR, transcription, forecasting, tabular prediction. Unmetered on every tier.",
    filter: (o) => o.steps.length === 1 && o.steps[0].kind === "specialist"
  },
  {
    title: "Composite cascades",
    blurb:
      "Multi-step operators: encoder output flows through a deterministic code gate (or a second encoder) before it becomes SQL. The DAG is the documentation.",
    filter: (o) => o.steps.length > 1
  },
  {
    title: "LLM operators",
    blurb:
      "Prompt-engineered gemma-4 steps with strict output contracts — extraction to your schema, repair, translation, judgment, logic. Metered by lanes, never tokens.",
    filter: (o) => o.steps.length === 1 && o.steps[0].kind === "llm"
  }
];

export default function CloverOperatorsPage() {
  return (
    <main className="clover-page">
      <section className="band">
        <div className="section-header">
          <p className="eyebrow">
            <Link href="/clover">Clover</Link> · operator reference ·{" "}
            <Link href="/semantic-sql">new to the term?</Link>
          </p>
          <h2>
            All {OPS.length} operators, <em>with the cascade each one runs.</em>
          </h2>
          <span>
            Every <code>clover_*</code> function below is plain SQL after{" "}
            <code>curl -fsSL https://rvbbit.ai/clover-install.sql | psql</code>.
            The diagrams are the real execution DAGs from the installer —
            arguments flow into hosted model steps (and deterministic code
            gates), and out as a typed SQL value. Receipts record the exact
            model version for every call.
          </span>
          <div
            style={{
              marginTop: "0.8rem",
              fontSize: "0.85rem",
              opacity: 0.8,
              display: "flex",
              gap: "1.5rem",
              flexWrap: "wrap"
            }}
          >
            {(["specialist", "llm", "code"] as const).map((k) => (
              <span key={k} style={{ whiteSpace: "nowrap" }}>
                <span style={{ color: KIND_COLOR[k] }}>■</span> {KIND_LABEL[k]}
              </span>
            ))}
          </div>
        </div>
      </section>

      {GROUPS.map((g) => {
        const ops = OPS.filter(g.filter);
        if (ops.length === 0) return null;
        return (
          <section className="band" key={g.title}>
            <div className="section-header">
              <p>{g.title}</p>
              <h2>{ops.length} operators</h2>
              <span>{g.blurb}</span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: "1rem"
              }}
            >
              {ops.map((op) => (
                <OpCard key={op.name} op={op} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
