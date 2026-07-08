---
title: Quickstart
description: Start the Docker ensemble, run semantic SQL, and accelerate your first table.
section: Start
navOrder: 20
sourceDocs:
  - ../rvbbit-sql/PACKAGING.md
  - ../rvbbit-sql/docs/OPERATORS.md
  - ../rvbbit-sql/docs/RVBBIT_PRODUCTION_SHAPE.md
  - ../rvbbit-sql/docs/DIAGNOSTICS.md
  - ../rvbbit-sql/docs/COSTS_AND_RECEIPTS.md
---

RVBBIT is technically a Postgres extension plus a few helper processes, but
for v1 you should treat it like a database: one Docker Compose file brings up
Postgres 18 with the extension preinstalled, the Duck/Vortex query worker, the
[Data Rabbit](/docs/data-rabbit) desktop UI, and a [Warren](/docs/warren)
agent for deploying capability sidecars.

> **v1 install policy.** The Docker ensemble is the only supported install
> path right now. Piecemeal installation — building the extension into an
> existing Postgres and wiring the sidecars by hand — works, but it is not yet
> streamlined or documented; it will come back as a first-class path in a
> later release. If you have used TimescaleDB or similar "it's really an
> extension" databases, the shape is the same: pretend it is a database and
> start it with Docker.

## Start The Stack

Requirements: Docker with Compose, and about 4 GB of free RAM for the base
stack. One line:

```bash
curl -fsSL https://rvbbit.ai/install.sh | bash
```

The script is short and readable — it checks for Docker, downloads
[docker-compose.yml](https://rvbbit.ai/docker-compose.yml) into `./rvbbit/`,
runs `docker compose up -d`, and waits for Postgres to report healthy. If you
prefer to do exactly that by hand:

```bash
# Optional: export provider keys first so LLM-backed operators work.
export OPENROUTER_API_KEY=sk-or-...

mkdir rvbbit && cd rvbbit
curl -fsSL https://rvbbit.ai/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

That starts everything from published images:

| Service | Image | What it is |
| --- | --- | --- |
| `postgres` | `ghcr.io/ryrobes/rvbbit-postgres` | Postgres 18 + `pg_rvbbit`, on host port `55433`. Migrations apply automatically on every `up`, so image upgrades are safe. |
| `duck` | (same image) | The shared Duck/Vortex query worker pool. |
| `lens` | `ghcr.io/ryrobes/rvbbit-lens` | The Data Rabbit desktop UI on host port `3000`. |
| `warren` | `ghcr.io/ryrobes/rvbbit-warren-agent` | Deploys capability sidecars (local models, runtimes, MCP gateways) via the mounted Docker socket. |
| `bootstrap` | (one-shot) | Deploys and verifies the baseline capabilities on first start, then exits. |
| `warehouse-mcp` | opt-in | The [Warehouse MCP server](/docs/warehouse-mcp): start with `docker compose --profile warehouse up -d` after setting `WAREHOUSE_MCP_KEY`. |

Provider API keys (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, …) are passed through from your shell
environment into the containers. None are required to boot — local CPU
embeddings work out of the box — but LLM-backed operators need at least one.

If you only want the database (no UI, no Warren), the single container works
too:

```bash
docker run -d --name rvbbit \
    -p 55433:5432 \
    -e POSTGRES_PASSWORD=rvbbit \
    ghcr.io/ryrobes/rvbbit-postgres:latest
```

For NVIDIA hosts there is a GPU overlay
([docker-compose.gqe.yml](https://rvbbit.ai/docker-compose.gqe.yml)) that
pulls the prebuilt [GQE engine](/docs/gqe) image (~9GB, covers every CUDA
CC 8.0+ card from RTX 30-series to Blackwell) — see the GPU host preflight
on that page first.

## Connect

```bash
psql postgresql://postgres:rvbbit@localhost:55433/rvbbit
```

And open the UI: [http://localhost:3000](http://localhost:3000) — it comes
**pre-connected** to the stack's own Postgres (a seeded "rvbbit (this stack)"
connection; lens ≥ 3.0.5). Add more connections to any Postgres you like —
remember they resolve from the lens *server*, so inside the ensemble the
stack's database is `postgres:5432`, not `localhost`. Against an
rvbbit-enabled database the whole rvbbit surface lights up. The extension is
already created; you never run `CREATE EXTENSION` yourself on the Docker
path.

## Check The Install

Cheap diagnostics should work before you run paid or live-provider calls:

```sql
SELECT * FROM rvbbit.doctor(false);
SELECT * FROM rvbbit.provider_doctor(false);
```

Use live mode only when you intentionally want active provider probes:

```sql
SELECT * FROM rvbbit.provider_doctor(true);
```

## Create A Semantic Operator

Semantic operators are SQL functions backed by model calls or other capability
nodes. They are stored as catalog rows (`rvbbit.operators`) and can be edited at
runtime.

You don't have to write every operator from scratch. The core extension already
seeds LLM-backed `means()`, `about()`, `classify()`, and `extract()`, and
installing a capability pack adds local-specialist versions of those names plus
pack-only operators — for example reranker-backed `means()` / `about()` from the
BGE reranker packs and `extract_pii()` from the GLiNER pack. See
[Capability Packs](/docs/capability-packs#where-the-familiar-operators-come-from)
for which name comes from where. The example below defines your own LLM-backed
operator.

```sql
SELECT rvbbit.create_operator(
    op_name        => 'tone',
    op_arg_names   => ARRAY['text'],
    op_return_type => 'text',
    op_system      => 'Classify the tone. Reply with one lowercase word.',
    op_user        => E'MESSAGE: {{ text }}\n\nTone:',
    op_model       => 'openai/gpt-5.4-mini',
    op_max_tokens  => 8,
    op_temperature => 0.0,
    op_description => 'Classify message tone.'
);
```

Then call it like any other function:

```sql
SELECT id, rvbbit.tone(body) AS tone
FROM support_tickets
LIMIT 20;
```

Inspect the receipt trail:

```sql
SELECT receipt_id,
       operator,
       model,
       latency_ms,
       error,
       invocation_at
FROM rvbbit.receipts
ORDER BY invocation_at DESC
LIMIT 10;

SELECT rvbbit.cost_audit_summary();
```

## Use Embeddings

```sql
SELECT rvbbit.embed('refund request from angry customer');
```

For table search:

```sql
SELECT *
FROM rvbbit.knn_text(
  'support_tickets'::regclass,
  'body',
  'renewal risk after shipping failures',
  10
);
```

## Accelerate A Table

Acceleration is a registry: any ordinary heap table can be added to it, and
RVBBIT then maintains rebuildable columnar files beside the heap. Register a
table and build its first files:

```sql
SELECT rvbbit.enable_table('support_tickets'::regclass);
SELECT rvbbit.refresh_acceleration('support_tickets'::regclass);
```

That refresh:

- scans rows that are newer than the stored watermark,
- writes accelerator files,
- updates the acceleration metadata,
- leaves the heap intact for fallback, dump, and restore.

New tables can opt in at creation time with the `USING rvbbit` sugar — it
produces a plain heap table that is auto-registered:

```sql
CREATE TABLE events (id bigint, payload jsonb) USING rvbbit;
```

`refresh_acceleration` also refreshes layout variants by default. To skip that
work on a fast incremental refresh, pass `refresh_variants => false`:

```sql
SELECT rvbbit.refresh_acceleration(
  'support_tickets'::regclass,
  refresh_variants => false
);
```

For a from-scratch rebuild (drop and re-derive every row group), use
`rvbbit.rebuild_acceleration(...)` instead. See
[Storage Acceleration](/docs/acceleration) for the full registry API.

## Query Normally

The point is that ordinary SQL remains ordinary SQL:

```sql
SELECT account_id, count(*)
FROM support_tickets
WHERE created_at >= now() - interval '30 days'
GROUP BY account_id
ORDER BY count(*) DESC
LIMIT 20;
```

The heap stays the source of truth. When acceleration is enabled, conservative,
rule-based routing decides whether that query should use heap, native execution,
DataFusion, Duck/Vortex, hot memory, [GPU GQE](/docs/gqe) on NVIDIA hosts, or
another available path. Learned routing runs in shadow/observation mode only —
it does not take over default routing. See
[Routing And Training](/docs/routing-training) for the details.

## Check Status

```sql
SELECT *
FROM rvbbit.acceleration_status
ORDER BY table_name;
```

Worker path:

```sql
SELECT *
FROM rvbbit.duck_sidecar_latest
ORDER BY last_heartbeat_at DESC;
```

Costs:

```sql
SELECT rvbbit.cost_audit_summary();
```

## Next Steps

- Use [Data Rabbit](/docs/data-rabbit) — already running at
  [localhost:3000](http://localhost:3000) — to browse, query, and watch the
  system work.
- Use [Semantic SQL](/docs/semantic-sql) to design robust model-backed
  operators.
- Use [Semantic Functions](/docs/semantic-functions) for retrieval,
  classification, clustering, extraction, and evidence snippets.
- Use [Retrieval](/docs/retrieval) and [Knowledge Graph](/docs/knowledge-graph)
  for SQL-native RAG and durable semantic memory.
- Use [Receipts And Costs](/docs/receipts-costs) before exposing paid model
  calls to users.
- Use [MCP Servers](/docs/mcp) when external tool results should join with SQL.
- Use [Storage Acceleration](/docs/acceleration) before enabling acceleration
  for larger reporting tables.
- Use [Routing And Training](/docs/routing-training) before adding trained
  profiles or forced engine paths.
