---
title: Quickstart
description: Install Calliope 1.2.1, connect to its Postgres, and run semantic SQL.
section: Start
navOrder: 20
sourceDocs:
  - ../calliope/deploy/README.md
  - ../calliope/docs/RVBBIT_ENGINE.md
  - ../calliope/docs/CLOVER_SELF_HOSTED.md
---

RVBBIT is the Postgres extension inside [Calliope](https://usecalliope.com).
You do not install a separate rvbbit-postgres / Lens / Warren stack. Calliope
1.2.1 is one Compose project: Postgres 18 with the extension, the Duck worker,
Data Rabbit, Warren, Hutch (Clover), and the Calliope app.

`deploy/compose.yaml` in the Calliope repo defines 22 services. A default
start does not run the `computer` desktop or the `specialists` profile
(GLiNER and TSPulse).

## Install

Linux x86-64, Docker Engine, Compose 2.30 or newer. Budget roughly 16 GB RAM
and 50 GB disk for a first machine. You need an OpenRouter key. You do not
need a GPU, and you do not need an account with us.

Read the installer, then run it:

```bash
curl -fsSL https://usecalliope.com/install.sh | bash
```

It asks for the OpenRouter key, an administrator login, and how people will
reach Calliope. The localhost choice binds the web UI, Data Rabbit, and
Postgres to 127.0.0.1. Re-running the script upgrades (it backs up the
database first).

`https://rvbbit.ai/install.sh` only prints that pointer. It does not install
the old stack and it does not run the Calliope installer for you.
`https://rvbbit.ai/docker-compose.yml` defines no services.

To install by hand from a release bundle instead, see
[deploy/README.md](https://github.com/ryrobes/calliope/blob/main/deploy/README.md).
Current images are tagged `1.2.1`, including
`ghcr.io/ryrobes/calliope-postgres:1.2.1` and
`ghcr.io/ryrobes/calliope-datarabbit:1.2.1`.

## Connect

The database name is `rvbbit`. The SQL password is `POSTGRES_PASSWORD` in the
install's private `.env`. It is not the web login, and this site does not
publish a default. On a localhost install the port is whatever the installer
bound (5432 if it was free).

```bash
psql 'host=127.0.0.1 port=5432 dbname=rvbbit user=postgres sslmode=verify-full sslrootcert=./state/postgres-tls/ca.crt'
```

Use the host, port, and user your install actually wrote. Copy only
`state/postgres-tls/ca.crt` to other clients. A public URL publishes Postgres
on 5432 with the same TLS rule; see the deploy guide for
`CALLIOPE_SQL_BIND`.

Data Rabbit is on the port in `CALLIOPE_DATA_URL` (3001 if it was free) and,
on a public hostname, at `https://YOUR_SERVER:3001` and `/datarabbit` on the
Calliope origin. The old Lens container on port 3000 is not this stack.

## Check The Install

```sql
SELECT rvbbit.rvbbit_version();
SELECT * FROM rvbbit.doctor(false);
SELECT * FROM rvbbit.provider_doctor(false);
```

`provider_doctor(true)` probes providers for real. Use it when you mean to.

Clover is already the local Hutch gateway. A few calls the default CPU
package serves:

```sql
SELECT rvbbit.clover_classify(
  'The rooftop unit is leaking refrigerant',
  'repair, billing, installation, scheduling'
);
SELECT rvbbit.clover_sentiment_score('Excellent repair and quick service');
```

There is no Clover key to buy and no `clover-install.sql` to apply. The file
at `/clover-install.sql` is a comment that says so.

## Create A Semantic Operator

Operators are rows in `rvbbit.operators`. The extension already seeds
`means()`, `about()`, `classify()`, and `extract()`. `extract_pii()` is not
one of them. The example below defines your own. The default model, if you
omit `op_model`, is `openai/gpt-6-luna`.

```sql
SELECT rvbbit.create_operator(
    op_name        => 'tone',
    op_arg_names   => ARRAY['text'],
    op_return_type => 'text',
    op_system      => 'Classify the tone. Reply with one lowercase word.',
    op_user        => E'MESSAGE: {{ text }}\n\nTone:',
    op_max_tokens  => 8,
    op_temperature => 0.0,
    op_description => 'Classify message tone.'
);
```

```sql
SELECT id, rvbbit.tone(body) AS tone
FROM support_tickets
LIMIT 20;
```

Receipts:

```sql
SELECT receipt_id, operator, model, latency_ms, error, invocation_at
FROM rvbbit.receipts
ORDER BY invocation_at DESC
LIMIT 10;

SELECT rvbbit.cost_audit_summary();
```

## Use Embeddings

```sql
SELECT rvbbit.embed('refund request from angry customer');
```

```sql
SELECT *
FROM rvbbit.knn_text(
  'support_tickets'::regclass,
  'body',
  'renewal risk after shipping failures',
  10
);
```

The Calliope default text embedding is Voyage 4 (1,024 dimensions) through
the local gateway, not a model downloaded into `$PGDATA` on first call.

## Accelerate A Table

```sql
SELECT rvbbit.enable_table('support_tickets'::regclass);
SELECT rvbbit.refresh_acceleration('support_tickets'::regclass);
```

New tables can opt in at creation:

```sql
CREATE TABLE events (id bigint, payload jsonb) USING rvbbit;
```

Skip layout-variant work on a fast refresh with
`refresh_variants => false`. For a full rebuild use
`rvbbit.rebuild_acceleration(...)`. See
[Storage Acceleration](/docs/acceleration).

## Query Normally

```sql
SELECT account_id, count(*)
FROM support_tickets
WHERE created_at >= now() - interval '30 days'
GROUP BY account_id
ORDER BY count(*) DESC
LIMIT 20;
```

The heap stays the source of truth. Routing across native execution,
DataFusion, and Duck/Vortex is the acceleration path. The NVIDIA GQE image
this site used to publish is not part of Calliope 1.2.1 — see
[GPU Execution](/docs/gqe), which is archived.

## Next Steps

- [Clover](/clover) for the gateway, optional GLiNER/TSPulse, and adding MCP servers.
- [Semantic SQL](/docs/semantic-sql) and [Semantic Functions](/docs/semantic-functions).
- [MCP Servers](/docs/mcp) and [Receipts And Costs](/docs/receipts-costs).
- [Data Rabbit](/docs/data-rabbit).
- [Existing Postgres](/docs/existing-postgres) if you expected a standalone extension tarball. There isn't one on this site.
