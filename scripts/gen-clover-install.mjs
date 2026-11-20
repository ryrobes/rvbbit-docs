// prebuild: publish a retired clover-install.sql (hosted Clover is gone)
// and mirror content/docs/agents.md to public/agents.md.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sqlOut = path.join(root, "public", "clover-install.sql");
const agentsSrc = path.join(root, "content", "docs", "agents.md");
const agentsOut = path.join(root, "public", "agents.md");

const sql = `-- Hosted Clover is retired. Do not point Postgres at clover.rvbb.it,
-- and do not look for a Clover API key, free tier, or Polar checkout.
--
-- Calliope 1.2.1 installs a self-hosted Hutch / Clover gateway and registers
-- its operators itself. There is nothing to pipe into psql from this file.
--
--   curl -fsSL https://usecalliope.com/install.sh | bash
--
-- Docs: https://rvbbit.ai/clover
--       https://github.com/ryrobes/calliope/blob/main/docs/CLOVER_SELF_HOSTED.md
`;

fs.writeFileSync(sqlOut, sql);
console.log(`wrote ${sqlOut}`);

const md = fs.readFileSync(agentsSrc, "utf8").replace(/^---[\s\S]*?---\s*/, "");
fs.writeFileSync(agentsOut, `# Setup for Agents — RVBBIT\n\n${md}`);
console.log(`wrote ${agentsOut}`);
