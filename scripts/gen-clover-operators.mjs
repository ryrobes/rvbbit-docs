// Generate content/clover-operators.json from public/catalog.json —
// one entry per clover_* operator: signature, description, and the
// cascade DAG (args → steps → return) parsed from op_steps. The
// /clover/operators page renders these as inline SVGs.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "public", "catalog.json"), "utf8")
);
const clover = catalog.capabilities.find((c) => c.id === "managed/clover");
if (!clover) throw new Error("managed/clover not found");

const manifest = clover.capability_manifest;
const descByName = new Map(
  (manifest.operators ?? []).map((o) => [o.name, o.description ?? ""])
);
const sql = manifest.managed.install.sql;

// slot → hosted model (for chip labels on specialist nodes)
const modelBySlot = new Map(
  (manifest.managed.models ?? []).map((m) => [m.slot, m.model])
);

// Minimal recursive parser for SQL jsonb_build_array/jsonb_build_object
// expressions: enough for string/number literals and nesting. Returns the
// equivalent JS value, or null if the text doesn't start with one.
function parseJsonbBuild(text) {
  let i = 0;
  function ws() {
    while (i < text.length && /\s/.test(text[i])) i++;
  }
  function value() {
    ws();
    if (text.startsWith("jsonb_build_array", i)) {
      i += "jsonb_build_array".length;
      ws();
      if (text[i] !== "(") return null;
      i++;
      const arr = [];
      ws();
      if (text[i] === ")") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value());
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === ")") {
          i++;
          return arr;
        }
        return null;
      }
    }
    if (text.startsWith("jsonb_build_object", i)) {
      i += "jsonb_build_object".length;
      ws();
      if (text[i] !== "(") return null;
      i++;
      const obj = {};
      ws();
      if (text[i] === ")") {
        i++;
        return obj;
      }
      for (;;) {
        const k = value();
        ws();
        if (text[i] !== ",") return null;
        i++;
        obj[k] = value();
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === ")") {
          i++;
          return obj;
        }
        return null;
      }
    }
    if (text[i] === "E" && text[i + 1] === "'") {
      // Postgres escape-string: backslash sequences are live
      i += 2;
      let s = "";
      while (i < text.length) {
        if (text[i] === "\\" && i + 1 < text.length) {
          const c = text[i + 1];
          s += c === "n" ? "\n" : c === "t" ? "\t" : c;
          i += 2;
        } else if (text[i] === "'" && text[i + 1] === "'") {
          s += "'";
          i += 2;
        } else if (text[i] === "'") {
          i++;
          return s;
        } else {
          s += text[i++];
        }
      }
      return s;
    }
    if (text[i] === "'") {
      i++;
      let s = "";
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") {
          s += "'";
          i += 2;
        } else if (text[i] === "'") {
          i++;
          return s;
        } else {
          s += text[i++];
        }
      }
      return s;
    }
    const num = /^-?\d+(\.\d+)?/.exec(text.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    if (text.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (text.startsWith("false", i)) {
      i += 5;
      return false;
    }
    return null;
  }
  return value();
}

function parseCreateOperator(stmt) {
  const name = stmt.match(/create_operator\('([a-z0-9_]+)'/)?.[1];
  if (!name || !name.startsWith("clover_")) return null;

  const argsRaw = stmt.match(/ARRAY\[([^\]]*)\]/)?.[1] ?? "";
  const args = [...argsRaw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const returns = stmt.match(/ARRAY\[[^\]]*\],\s*'([a-z0-9_]+)'/)?.[1] ?? "text";
  const desc =
    stmt.match(/op_description := '((?:[^']|'')*)'/)?.[1]?.replaceAll("''", "'") ??
    "";

  const stepsRaw = stmt.match(/op_steps := '(\[[\s\S]*?\])'::jsonb/)?.[1];
  let steps = [];
  if (stepsRaw) {
    try {
      steps = JSON.parse(stepsRaw.replaceAll("''", "'"));
    } catch {
      steps = [];
    }
  } else {
    // Alternate authoring style: op_steps := jsonb_build_array(
    //   jsonb_build_object('k','v', 'inputs', jsonb_build_object(...)), …)
    const idx = stmt.indexOf("op_steps := jsonb_build_array");
    if (idx >= 0) {
      steps = parseJsonbBuild(stmt.slice(idx + "op_steps := ".length)) ?? [];
    }
  }

  // Edges: a step consumes {{arg}} / {{priorStep...}} template refs found
  // anywhere in its JSON. Steps with no matched inputs chain sequentially.
  const stepNames = steps.map((s) => s.name);
  const nodes = steps.map((s, i) => {
    const text = JSON.stringify(s);
    const refs = new Set(
      [...text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)/g)].map((m) =>
        m[1].split(".")[0]
      )
    );
    return {
      name: s.name ?? `step${i}`,
      kind: s.kind ?? "step",
      label:
        s.kind === "specialist"
          ? s.specialist
          : s.kind === "llm"
            ? (s.model ?? "gemma4")
            : (s.kind ?? "step"),
      model:
        s.kind === "specialist"
          ? (modelBySlot.get(s.specialist) ?? null)
          : s.kind === "llm"
            ? "gemma-4-31b"
            : null,
      argIn: args.filter((a) => refs.has(a)),
      stepIn: stepNames.filter((n, j) => j < i && refs.has(n))
    };
  });
  // sequential fallback: a non-first step with no explicit inputs feeds
  // from its predecessor (cascade semantics)
  nodes.forEach((n, i) => {
    if (i > 0 && n.argIn.length === 0 && n.stepIn.length === 0) {
      n.stepIn.push(nodes[i - 1].name);
    }
  });

  return {
    name,
    args,
    returns,
    description: descByName.get(name) || desc,
    steps: nodes
  };
}

const seen = new Map();
for (const stmt of sql) {
  if (!stmt.includes("create_operator(")) continue;
  const op = parseCreateOperator(stmt);
  if (op) seen.set(op.name, op); // later statements win (re-defs)
}

const ops = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const out = path.join(root, "content", "clover-operators.json");
fs.writeFileSync(out, JSON.stringify({ operators: ops }, null, 2) + "\n");
console.log(`wrote ${out} (${ops.length} operators)`);
