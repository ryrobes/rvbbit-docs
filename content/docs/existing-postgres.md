---
title: Existing Postgres
description: Add RVBBIT to a Postgres 18 you already run. Start with just the extension, then opt into the query worker and self-hosted models as you need them.
section: Start
navOrder: 25
sourceDocs:
  - ../rvbbit-sql/docs/INSTALL_TIERS.md
---

The [Quickstart](/docs/quickstart) Docker ensemble is the turnkey path — one
Compose file brings up everything at once. But RVBBIT is **additive onto a
Postgres 18 you already run**, and the moving parts are opt-in. You can start
with nothing but the extension and add the rest only when a workload asks for
it.

This is the piecemeal path: install the layers you want.

> RVBBIT is a normal Postgres extension. Like TimescaleDB, `pg_cron`, or
> `pg_stat_statements`, it needs one entry in `shared_preload_libraries` and a
> restart — that is the only invasive step, and it is standard for any
> extension that hooks the planner.

## What each layer gives you

| Layer | Add | Unlocks |
| --- | --- | --- |
| **0** | the extension | Semantic SQL (against any LLM/embedding API), columnar acceleration, [receipts](/docs/receipts-costs), operators, [cubes](/docs/cubes), [metrics](/docs/metrics-kpis) |
| **1** | the query worker | Vectorized engines for large scans (Duck / DataFusion / Vortex) |
| **2** | local models | Run embedding, rerank, classify, and LLM models on your **own** hardware — no external API |

Each layer is strictly additive. Nothing you skip is load-bearing.

## Layer 0 — the extension

### Get the artifacts

Grab the extension tarball (linux amd64, PG 18) — no Docker needed:

```bash
curl -fsSLO https://rvbbit.ai/dist/pg_rvbbit-4.1.3-pg18-amd64.tar.gz
curl -fsSL  https://rvbbit.ai/dist/pg_rvbbit-4.1.3-pg18-amd64.tar.gz.sha256 | sha256sum -c
tar xzf pg_rvbbit-4.1.3-pg18-amd64.tar.gz
sudo pg_rvbbit-4.1.3-pg18-amd64/install.sh    # copies into pg_config paths
```

<details>
<summary>Alternative: extract the same three files from the published image</summary>

```bash
cid=$(docker create ghcr.io/ryrobes/rvbbit-postgres:latest)
docker cp "$cid":/usr/lib/postgresql/18/lib/pg_rvbbit.so ./
mkdir -p extension && docker cp "$cid":/usr/share/postgresql/18/extension/. ./extension/
docker cp "$cid":/usr/local/bin/rvbbit-duck ./
docker rm "$cid"

cp pg_rvbbit.so "$(pg_config --pkglibdir)/"
cp extension/pg_rvbbit*.control extension/pg_rvbbit*.sql "$(pg_config --sharedir)/extension/"
cp rvbbit-duck /usr/local/bin/            # the query worker (Layer 1) uses this; it need not run yet
```

</details>

Built for **PostgreSQL 18**. The `.so` is self-contained — there are no extra
system libraries to install.

### Enable it

```sql
ALTER SYSTEM SET shared_preload_libraries = 'pg_rvbbit';   -- add pg_cron for scheduled maintenance
-- restart Postgres, then:
CREATE EXTENSION pg_rvbbit;
```

### What works at Layer 0

- **Acceleration** — the in-process columnar engine. Create a table with the
  RVBBIT [table access method](/docs/acceleration) and compact it:

  ```sql
  CREATE TABLE events (id bigint, kind text, amount numeric) USING rvbbit;
  -- INSERT your data, then:
  SELECT rvbbit.compact('events'::regclass);
  ```

  Aggregates and scans route to the in-process native reader — no worker
  process required.

- **Semantic SQL** — point a [provider](/docs/providers) at any
  OpenAI-compatible endpoint (OpenRouter, OpenAI, or a self-hosted vLLM /
  Ollama). The key lives in an environment variable on the Postgres host; the
  extension only stores its *name*:

  ```sql
  SELECT rvbbit.register_backend(
    'llm',
    'https://openrouter.ai/api/v1/chat/completions',
    'openai_chat', 32, 4, 120000,
    'OPENROUTER_API_KEY'          -- env var name, not the key itself
  );
  ```

  LLM-backed operators now work; embedding operators point at an embeddings
  API the same way. See [Operators & Semantic SQL](/docs/providers).

- **Receipts, cache, cubes, metrics** — all extension-resident, all at Layer 0.

So Layer 0 alone gives you semantic SQL and columnar acceleration on data you
already have, using an inference API you already have — with no self-hosted
infrastructure at all.

## Layer 1 — the query worker

The vectorized scan engines (Duck, DataFusion, Vortex) that RVBBIT reaches for
on **large** scans come from the `rvbbit-duck` binary you already copied in
Layer 0. There is nothing to start and nothing to configure:

- Detection is **presence-based** — if `rvbbit-duck` is on `PATH` (or at
  `/usr/local/bin`), the [router](/docs/routing-training) adds the vectorized
  candidates to its options automatically.
- The extension **forks the binary on demand** — a child process spun up
  exactly when the router picks a vectorized candidate, for scans where the
  in-process engine is the slower choice. There is no daemon you *have* to run.
- Small scans stay in-process; large ones spill to the worker by measured
  cost. If the binary is absent, the router simply never picks it — graceful
  degradation, not an error.

In other words, Layer 1 is usually already on: copying the binary in Layer 0
is the whole install.

### Optional: shared broker (daemon) mode

Forking per query ("local per-call" mode) is the simplest shape and fine for
interactive use. Under **sustained** analytical load, you can instead run one
long-running worker pool that all queries share — the *shared broker* mode —
to cut process-launch churn:

```sql
ALTER SYSTEM SET rvbbit.duck_backend_persistent = on;   -- or env RVBBIT_DUCK_BACKEND_SHARED=1
SELECT pg_reload_conf();
```

The router uses the broker when it is up and falls back to per-call forking if
it is not, so enabling it is safe and reversible. Worker count and socket
location are tunable via the `RVBBIT_DUCK_BACKEND_SHARED_*` settings — see
[Duck/Vortex Worker](/docs/duck-vortex-worker) for the full mode comparison.

## Layer 2 — local models

To run models on your **own** hardware instead of an external API, add a
[Warren](/docs/warren) — RVBBIT's model-deployment agent. The only host
requirement is **Docker**.

- The Warren agent is a small binary that needs Docker access and a connection
  string to your Postgres. Install it with the agent script (see
  [Warren](/docs/warren)).
- Deploying a model [capability](/docs/capability-packs) renders a Compose
  project and brings it up. The model and its dependencies live **inside the
  container** — nothing gets installed on your host.

With a Warren attached, embedding, reranker, classifier, and LLM models answer
on your own metal, and Layer 0's semantic SQL no longer needs any external
inference API.

## Which layer do I want?

- **Kicking the tires** on data you already have → Layer 0.
- **Large analytical scans** → Layer 1 is already installed; it just starts
  getting picked.
- **Keep inference in-house**, no external API → add Layer 2.
- **Want it all, turnkey** → the [Quickstart](/docs/quickstart) Docker ensemble
  brings up every layer at once, plus the [Data Rabbit](/docs/data-rabbit)
  desktop UI.
