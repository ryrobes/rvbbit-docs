// Generate public/clover-install.sql from public/catalog.json (the managed
// Clover entry's install statements) and mirror content/docs/agents.md to
// public/agents.md so agents can fetch the raw markdown. Runs on prebuild —
// the catalog is the single source of truth, this is just a rendering.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "public", "catalog.json");
const sqlOut = path.join(root, "public", "clover-install.sql");
const agentsSrc = path.join(root, "content", "docs", "agents.md");
const agentsOut = path.join(root, "public", "agents.md");

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const clover = (catalog.capabilities ?? []).find((c) => c.id === "managed/clover");
if (!clover) throw new Error("managed/clover not found in public/catalog.json");
const statements = clover.capability_manifest?.managed?.install?.sql;
if (!Array.isArray(statements) || statements.length === 0) {
  throw new Error("managed/clover has no install SQL");
}
for (const s of statements) {
  if (/FUNCTIONrvbbit/.test(s)) throw new Error("malformed statement (missing space after FUNCTION)");
}

const header = `-- Clover — hosted semantic operators for RVBBIT, installed from plain psql.
-- Source of truth: https://rvbbit.ai/catalog.json (managed/clover). Generated file.
--
-- Prereqs:
--   * pg_rvbbit installed in this database (the rvbbit-postgres image does
--     this on first boot; otherwise: CREATE EXTENSION pg_rvbbit;)
--   * RVBBIT_CLOVER_KEY set in the Postgres server's environment
--     (free key: https://rvbbit.ai/buy/clover-free)
--
-- Usage:
--   curl -fsSL https://rvbbit.ai/clover-install.sql | psql "$DSN"
--
-- Idempotent: re-run any time the catalog updates.
-- Optional after install:
--   SELECT rvbbit.bind_triples_to_clover();           -- KG triples via Clover
--   SELECT rvbbit.bind_extract_entities_to_clover();  -- Brain NER via Clover

CREATE EXTENSION IF NOT EXISTS pg_rvbbit;

`;

const body = statements
  .map((s) => {
    const t = s.trimEnd();
    return t.endsWith(";") ? t : `${t};`;
  })
  .join("\n\n");

fs.writeFileSync(sqlOut, header + body + "\n");
console.log(`wrote ${sqlOut} (${statements.length} statements)`);

// Mirror the agents doc, stripping frontmatter for the raw copy.
const md = fs.readFileSync(agentsSrc, "utf8").replace(/^---[\s\S]*?---\s*/, "");
fs.writeFileSync(agentsOut, `# Setup for Agents — RVBBIT\n\n${md}`);
console.log(`wrote ${agentsOut}`);
