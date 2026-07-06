---
title: Document Brain
description: A role-gated document knowledge base — chunked, embedded, ACL-filtered retrieval with graph enrichment, entirely in SQL.
section: SQL Primitives
navOrder: 45
sourceDocs:
  - ../rvbbit-sql/docs/brain-query-providers.md
---

The Brain turns documents into rows, intelligence into columns, and access
control into plain rows. Ingested documents are chunked, embedded, and stored
in ordinary tables (`rvbbit.brain_documents`, `rvbbit.brain_chunks`); search
is ACL-filtered vector retrieval; enrichment wires documents into the
[knowledge graph](/docs/knowledge-graph).

Security is the defining design choice, and it is **default-deny**: a
document with no role grant is visible to nobody, and the ACL filter is
applied *before* the vector search — a restricted chunk never enters the KNN
candidate set, so it can't leak into an answer by paraphrase.

## Ingest

```sql
-- A source groups documents and carries default roles.
SELECT rvbbit.brain_define_source('handbook', 'manual',
                                  p_default_roles => ARRAY['staff']);

SELECT rvbbit.brain_ingest(
  p_source => 'handbook',
  p_title  => 'Expense policy',
  p_body   => 'Receipts are required for anything over $50 ...',
  p_roles  => ARRAY['staff'],
  p_folder => 'policies'
);
```

`brain_ingest` upserts by `(source, uri)`, chunks the body
(paragraph-packed, ~1,200 characters), embeds each chunk with
`rvbbit.embed(...)` (the configured default embedder), and assigns roles. It
is idempotent — re-ingesting an unchanged document is cheap.

## Access Control

Roles are rows; membership maps principals (emails) to roles:

```sql
SELECT rvbbit.brain_grant('staff', 'ryan@example.com');
SELECT rvbbit.brain_revoke('staff', 'former@example.com');

-- Per-document exclusion, e.g. "no one should see a doc about themselves":
SELECT rvbbit.brain_exclude(42, 'subject@example.com', 'about this person');
```

Every retrieval function takes the caller's email as its first argument and
intersects with `rvbbit.brain_visible_docs(email)` — the single security
predicate — before anything else happens.

## Search And Retrieval

```sql
SELECT title, chunk, score
FROM rvbbit.ask_brain('ryan@example.com', 'what needs a receipt?', 8);
```

`ask_brain` is retrieval, not generation: it returns ranked, ACL-filtered
chunks (with doc metadata and scores), which you then feed to an operator, a
Cascade, or an agent. The richer form is `brain_search`, which adds chunk
identity and extracted entities, plus a jsonb filter:

```sql
SELECT title, chunk, score
FROM rvbbit.brain_search(
  'ryan@example.com',
  'travel reimbursement',
  8,
  '{"source": "handbook", "folder": "policies"}'::jsonb
);
```

Filter keys: `source`, `type` (doc type), `folder` (prefix), `since`,
`until`. `rvbbit.brain_facets(email)` returns the visible types and sources
with counts, so an agent can discover what it may ask about. For the
surrounding text of a hit, `rvbbit.brain_context(email, doc_id, chunk_idx,
window)` returns neighboring chunks.

## Graph Enrichment

A separate, budgeted pass (not inlined into ingest) runs triple extraction
over chunks and writes entities and `mentions`/`links_to` edges into the KG
graph `brain` — re-running only when a document's content hash changes:

```sql
SELECT rvbbit.brain_enrich_doc(42);          -- one document
SELECT rvbbit.brain_enrich_pending(25);      -- drain the backlog, bounded
```

Then explore, still ACL-gated:

```sql
SELECT * FROM rvbbit.brain_doc_graph('ryan@example.com', 42);
SELECT rvbbit.brain_related('ryan@example.com', 42);
SELECT rvbbit.brain_entity('ryan@example.com', 'Acme Corp');
```

## Remote Sources And Sync

Two strategies bring external content in:

- **File-mirror sources** (Google Drive, S3, and similar) sync through a
  connector sidecar named in the source's `config`. `rvbbit.brain_sync_source
  (source_id)` requests a manifest from the connector, extracts binary bodies
  to markdown, and applies adds/updates/tombstones.
  The connector services are external — bring your own endpoint; the SQL
  diff/ingest/ACL engine works standalone.
- **Query sources** (Linear, JIRA, GitHub — anything reachable from SQL,
  including [MCP](/docs/mcp) row sources) are defined by a provider with a
  `list_sql` / `item_sql` pair (`rvbbit.brain_define_provider(...)`,
  `rvbbit.brain_add_query_source(...)`) and synced with
  `rvbbit.brain_sync_query_source(...)`.

Sharing flows through ACLs conservatively: each synced folder becomes a
synthetic role whose members are the folder's individually-shared emails,
while group/domain/"anyone" shares are **not** auto-granted — they queue in
`rvbbit.brain_pending_grants` for an explicit
`rvbbit.brain_approve_pending_grant(...)`.

The pg_cron-ready nightly entrypoint chains everything:

```sql
SELECT rvbbit.brain_nightly();   -- sync sources → enrich pending → refresh vectors
```

## In Data Rabbit

The **Document Brain** window ([Data Rabbit](/docs/data-rabbit)) is a browser
over all of this — sources panel, ingest-by-drag, and a "View as <email>" ACL
inspector that shows exactly what a given principal can retrieve. The
[Warehouse MCP server](/docs/warehouse-mcp) exposes the same role-gated
retrieval to Claude and other MCP clients.
