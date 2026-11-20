# Setup for Agents — RVBBIT

This page is written for AI agents (and the humans supervising them). A raw
markdown copy lives at [`https://rvbbit.ai/agents.md`](https://rvbbit.ai/agents.md),
and [`https://rvbbit.ai/llms.txt`](https://rvbbit.ai/llms.txt) indexes the rest.

## What this is

RVBBIT is the Postgres extension inside [Calliope](https://usecalliope.com).
Semantic work is ordinary SQL: seeded operators such as `rvbbit.means`,
`rvbbit.about`, `rvbbit.classify`, and `rvbbit.extract`, plus retrieval
(`rvbbit.knn_text`), graph triples (`rvbbit.triples_rows`), text-to-SQL
(`rvbbit.synth_sql`), and MCP (`rvbbit.mcp_call` / `rvbbit.mcp_rows`).

Clover is the self-hosted model gateway in that same install (Hutch). It uses
the OpenRouter key the installer asks for. There is no Clover account, no free
tier, and no subscription key. `https://rvbbit.ai/clover-install.sql` is a
comment file that tells you this. Do not register `clover.rvbb.it`.

## 1 — Install Calliope

Linux x86-64, Docker Engine, Compose 2.30 or newer. Read the script before
you run it:

```bash
curl -fsSL https://usecalliope.com/install.sh | bash
```

The localhost choice binds the web UI, Data Rabbit, and Postgres to
127.0.0.1. The database name is `rvbbit`. The administrator password for SQL
is `POSTGRES_PASSWORD` in the install's private `.env` (not the web login,
and not a published default). Copy `state/postgres-tls/ca.crt` if you connect
with TLS verification. See
[deploy/README.md](https://github.com/ryrobes/calliope/blob/main/deploy/README.md).

`https://rvbbit.ai/install.sh` only prints this pointer. It does not install
anything.

## 2 — The one human secret

The installer asks for an OpenRouter key. That key stays on the gateway
(`state/clover/credentials/openrouter.key`). You do not create a Clover
account. System → Settings → Instance AI can replace the key later.

## 3 — Verify

```sql
SELECT rvbbit.rvbbit_version();
SELECT * FROM rvbbit.doctor(false);
```

Text judgments that the default CPU gateway actually serves
([CLOVER_SELF_HOSTED.md](https://github.com/ryrobes/calliope/blob/main/docs/CLOVER_SELF_HOSTED.md)):

```sql
SELECT rvbbit.clover_classify(
  'The rooftop unit is leaking refrigerant',
  'repair, billing, installation, scheduling'
);
SELECT rvbbit.clover_sentiment_score('Excellent repair and quick service');
SELECT rvbbit.clover_language('bonjour mes amis');
```

`rvbbit.means(text, criterion)` is a seeded LLM operator. It uses the Clover
LLM route (default model `openai/gpt-6-luna` for SQL operators), not a
separate hosted GPU tier.

## 4 — Extend it

Register an MCP server and call it. The gateway runtime has to be ready
first (`runtimes/mcp-gateway`):

```sql
SELECT name, status FROM rvbbit.mcp_gateways WHERE status = 'ready';

SELECT rvbbit.register_mcp_server(
    server_name      => 'github',
    server_transport => 'stdio',
    server_command   => 'npx',
    server_args      => ARRAY['-y', '@modelcontextprotocol/server-github'],
    server_env       => '{"GITHUB_PERSONAL_ACCESS_TOKEN":"${GITHUB_TOKEN}"}'::jsonb,
    server_timeout_ms => 60000);
SELECT rvbbit.refresh_mcp_server('github');
```

Define your own operator with `rvbbit.create_operator` (an `mcp` step is one
of the step kinds). Optional GLiNER and TSPulse workers are off unless the
install was started with `COMPOSE_PROFILES=computer,specialists`. Details:
[Clover](/clover).

## What not to do

- Do not `docker pull ghcr.io/ryrobes/rvbbit-postgres` or follow a compose
  file from this site. Those images are the retired standalone stack.
- Do not download `https://rvbbit.ai/dist/pg_rvbbit-4.1.6-pg18-amd64.tar.gz`.
  That tarball is gone. See [Existing Postgres](/docs/existing-postgres).
- Do not send a human to `/buy` or `/account`. Those routes are gone.
