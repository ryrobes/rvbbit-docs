---
title: Setup for Agents
description: A Postgres that answers semantic questions in plain SQL — set it up for your human, then stop spending your own tokens on per-row inference.
section: Start
navOrder: 25
---

This page is written for AI agents (and the humans supervising them). A raw
markdown copy lives at [`https://rvbbit.ai/agents.md`](https://rvbbit.ai/agents.md),
and [`https://rvbbit.ai/llms.txt`](https://rvbbit.ai/llms.txt) indexes everything
linked here.

## What this is

RVBBIT is an open-source Postgres extension that adds **semantic operators to
SQL**: functions like `rvbbit.means(text, 'criterion')`,
`rvbbit.summarize(text)`, and `rvbbit.clover_triples(text, 'all')` that run
model inference per row, inside the query. With a **Clover** key, the
inference runs on RVBBIT's hosted GPUs under a flat subscription — which
means:

- You do **not** spend your own context window or API tokens reading 5,000
  rows. One `WHERE rvbbit.means(observed, 'sounds like a hoax')` clause takes
  a position on every row, batched, cached, and receipted.
- Every model-backed answer writes a **receipt** (`rvbbit.receipts`): the
  exact inputs, output, model version, tokens, and cost. Trust is a column.
- Everything is plain SQL over a normal Postgres connection. No SDK, no
  bespoke protocol. If you can run `psql`, you can use all of it.

## 1 — Run the database (one container)

```bash
docker run -d --name rvbbit -p 5432:5432 \
  -e POSTGRES_PASSWORD=rvbbit \
  -e RVBBIT_CLOVER_KEY=$RVBBIT_CLOVER_KEY \
  ghcr.io/ryrobes/rvbbit-postgres:latest
```

Or the full ensemble (adds the Data Rabbit SQL desktop for the humans):

```bash
curl -fsSL https://rvbbit.ai/install.sh | bash
```

Already have Postgres 18? RVBBIT installs as an ordinary extension — see the
[quickstart](https://rvbbit.ai/docs/quickstart).

## 2 — Get a Clover key (the one human step)

Ask your human to visit
[`https://rvbbit.ai/buy/clover-free`](https://rvbbit.ai/buy/clover-free) —
the free tier is $0, takes about a minute of browser checkout, and issues one
API key. Set it as `RVBBIT_CLOVER_KEY` in the database container's
environment. This is the only step that requires a browser; everything before
and after is headless.

## 3 — Install the Clover operators

```bash
curl -fsSL https://rvbbit.ai/clover-install.sql | psql "postgresql://postgres:rvbbit@localhost:5432/postgres"
```

This registers the hosted backends and ~50 operators (`clover_*` specialist
models + `clover_llm_*` generalist LLM functions). Idempotent — safe to
re-run after catalog updates.

## 4 — Verify

```sql
SELECT rvbbit.clover_means('apple pie recipe', 'dessert recipes');  -- true
SELECT rvbbit.clover_sentiment_score('this warehouse is astonishingly fast');
```

## What you can do now

```sql
-- Filter by meaning, not keywords
SELECT * FROM support_tickets
WHERE rvbbit.clover_means(body, 'customer is threatening to cancel');

-- Structured extraction to jsonb, schema described in plain English
SELECT rvbbit.clover_llm_extract(email_body,
  'vendor: string, invoice_number: string, total: decimal, due_date: date')
FROM inbox;

-- Knowledge-graph triples with evidence and confidence
SELECT * FROM rvbbit.triples_json_rows(
  rvbbit.clover_triples('Sarah Chen works at Acme and reported the outage', 'all'));

-- Teach the database a new verb (an operator that builds operators,
-- born with its own tests)
SELECT rvbbit.clover_llm_make_operator(
  'TRUE if a review mentions a competitor');

-- Discover everything installed, from SQL
SELECT name, description FROM rvbbit.operators ORDER BY name;
SELECT * FROM rvbbit.capability_search('extract entities from text');

-- Audit any answer
SELECT operator, model, inputs, output, cost_usd
FROM rvbbit.receipts ORDER BY invocation_at DESC LIMIT 10;
```

## Notes for agents

- **Discovery is SQL.** `rvbbit.operators`, `rvbbit.capability_catalog`, and
  `rvbbit.capability_search(text)` describe every installed ability. You do
  not need a tool manifest; ask the database.
- **Free tier = 1 concurrent inference lane.** Queries never fail on lane
  saturation — they queue and complete. Paid tiers add lanes (speed), never
  correctness.
- **Results are cached.** Re-running a semantic query over unchanged rows is
  near-free.
- **MCP (optional).** RVBBIT can also expose the warehouse as an MCP server
  for richer tool use, but it is a separate service with its own auth — the
  SQL surface above covers everything it does. Start with SQL.

## The full catalog

- Machine-readable capability catalog: [`https://rvbbit.ai/catalog.json`](https://rvbbit.ai/catalog.json)
- Human docs: [`https://rvbbit.ai/docs`](https://rvbbit.ai/docs)
- The SQL desktop for your humans: [`https://datarabbit.com`](https://datarabbit.com)
