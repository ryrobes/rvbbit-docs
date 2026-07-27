---
title: Colony — Peer Capabilities
description: Share a model running on your own machine - Ollama, a Gradio app, a local MCP server - with everyone in scope on the shared warehouse, as plain SQL.
section: Execution
navOrder: 56
sourceDocs:
  - ../rvbbit-sql/docs/COLONY.md
  - ../rvbbit-sql/docs/PEER_CAPABILITIES_PLAN.md
---

A **Colony** turns the shared warehouse into a shared arsenal. Anyone
running Data Rabbit can attach something running on their *own machine* —
the Ollama model on their workstation, a Gradio specialist they built, a
local stdio MCP server — and everyone in scope on the same database can
call it from plain SQL while that person's client stays up.

The database is the rendezvous. There is no relay, no tunnel, no new
service: a share is a pair of catalog rows plus a request/response queue
inside Postgres, and the sharer's Data Rabbit client polls for work the
same way it already polls for everything else. The shared laptop never
accepts an inbound connection — it dials **out** to the database it
already trusts, which makes the whole thing NAT- and firewall-friendly by
construction.

## What a share looks like

Three transport shapes cover the useful local world:

| Shape | What it fronts | Payload in | Answer out |
|---|---|---|---|
| `openai_chat` | Any OpenAI-compatible endpoint — Ollama, vLLM, LM Studio | `{"user": "..."}` | the model's reply as text |
| `gradio` | A local Gradio app (the classic ML-demo shape) | `{"user": "..."}` | the app's output as text |
| `mcp` | A local stdio MCP server the client spawns and holds | `{"tool": "...", "args": {...}}` | the tool's result |

Every share is scoped to a **Postgres role** — the same burrow roles that
gate everything else. Only members of that role can call it; everyone
else is rejected server-side, before any work is queued.

## Sharing something

Open the **Colony** window in Data Rabbit and hit *Share a capability*.
The *Scan for local models* button probes Ollama's default port and the
common Gradio ports — explicitly, when you click it, never in the
background — and offers what it finds as one-click candidates. Pick a
name, a kind, a scope role, and share.

Sharing runs from the Data Rabbit desktop app (or a self-hosted instance)
because its local server is the runner — it's the process that can
actually see `localhost:11434`. *Calling* a shared capability needs
nothing special: it's just SQL, from any client.

Your machine's hostname is recorded with the share, so the Fleet map can
draw your laptop as the cluster member it now is.

## Calling one

Ad hoc, from anywhere with access:

```sql
-- chat / gradio shapes
SELECT rvbbit.call_specialist('colony_ollama',
       '{"user": "Summarize: revenue grew 12% while costs held flat."}'::jsonb);

-- mcp shape
SELECT rvbbit.call_specialist('colony_tools',
       '{"tool": "echo", "args": {"message": "hello"}}'::jsonb);
```

A peer backend is **just another backend** — the router, receipts, and
operator machinery don't know the difference. That means you can build a
real SQL operator on top of a colleague's shared model:

```sql
-- An LLM-shaped operator pinned to a Colony peer (chat semantics):
SELECT rvbbit.create_operator('team_summarize', ARRAY['text'], 'text',
  op_steps := '[{"kind":"llm","name":"main",
                 "system":"You are a concise summarizer. One sentence.",
                 "user":"Summarize: {{ inputs.text }}",
                 "provider":"colony_ollama","model":"llama3.1:latest"}]'::jsonb);

-- A specialist-shaped operator over a shared Gradio app:
SELECT rvbbit.create_operator('team_sentiment', ARRAY['t'], 'text',
  op_steps := '[{"kind":"specialist","name":"s",
                 "specialist":"colony_sentiment",
                 "inputs":{"user":"{{t}}"}}]'::jsonb);

SELECT title, team_sentiment(body) FROM feedback LIMIT 50;
```

Once created, those operators work inline in any query, get receipts and
cost accounting like everything else, and show up in
`rvbbit.capability_search()` for agents to discover.

## Finding what's shared

Shared capabilities are first-class citizens of the capability graph:

```sql
SELECT * FROM rvbbit.capability_search('something that can classify sentiment');
```

returns Colony peers alongside operators and packs, with their live
status in the description (`LIVE — 1 instance online`, `OFFLINE`,
`PAUSED by its sharer`). The **Capability Explorer** window browses them
under *Peer Capabilities (Colony)*, and the **Fleet** window draws each
sharing machine as a node on the cluster map — named by hostname, with
the shared capabilities as its skills.

The live roster in SQL:

```sql
SELECT * FROM rvbbit.peer_backends_live;
-- backend_name · kind · scope_role · shared_by · enabled
-- · instance_count · min_queue_depth
```

## Lifecycle

The sharer stays in control:

```sql
SELECT rvbbit.set_peer_backend_enabled('colony_ollama', false);  -- pause
SELECT rvbbit.set_peer_backend_enabled('colony_ollama', true);   -- resume
SELECT rvbbit.deregister_peer_backend('colony_ollama');          -- detach
```

Pausing keeps the share visible but marked `PAUSED` — discoverable, not
callable. Detaching removes the registration entirely and fails any
in-flight requests with a clear error (`peer backend was detached by its
sharer`) rather than letting them hang. Closing the Data Rabbit client
simply stops the heartbeat: the share reads `OFFLINE` until the client
returns, and new calls fail fast with *"has no live instance right now"*.

## Many machines, one name

If several people register runners under the **same backend name**, the
queue fans work out across them automatically — each request is claimed
exactly once (`FOR UPDATE SKIP LOCKED`, the standard Postgres queue
idiom), and faster or less-busy machines naturally claim more. A team can
turn three workstations with the same Ollama model into a small
answering pool without configuring anything beyond sharing under one
name.

## The rules that keep it honest

- **Scope is enforced in the database.** A share is gated by a real
  Postgres role membership check on every call. Not in the client, not
  in a gateway — in the same place your data's permissions already live.
- **The sharer's machine only dials out.** Nothing ever connects *to*
  the sharing client. It claims work from the queue over its existing
  database connection.
- **Requests are rows.** Every call — payload, response, status, timing
  — is a row in your database, auditable like everything else. Share
  with groups you'd be comfortable seeing your model's prompts.
- **Absence is a fast failure, not a hang.** No live runner means an
  immediate error; timeouts mark requests failed; detaching fails
  in-flight work explicitly.

## Advanced: the raw queue

`call_specialist()` wraps a two-step contract you can also drive
directly — enqueue, then poll:

```sql
SELECT rvbbit.enqueue_peer_request('colony_ollama',
       '{"user": "hello"}'::jsonb);       -- returns a request uuid
SELECT rvbbit.poll_peer_response('<uuid>'::uuid, 30000);
```

These are deliberately **two separate statements**. A single function
that both enqueues and waits can never work in Postgres: its INSERT
stays invisible to every other backend — including the runner trying to
claim it — until the statement commits, which can't happen while it's
still waiting. The two-step shape is the contract, not a convenience.
