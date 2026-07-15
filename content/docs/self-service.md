---
title: Self-Service, Actually
description: A marketing lead with no SQL ships a live competitive-intelligence dashboard in one conversation - the user story behind the Warehouse MCP, metrics, cubes, and hosted dashboards working as one surface.
section: Start
navOrder: 28
hidden: true
---

<!-- SKELETON: prose is real, gaps are marked [PASTE]/[SCREENSHOT]. Title
     alternates if this one doesn't sit right: "The Afternoon Dashboard",
     "Disposable Utterances", "From Question to Shipped in One Conversation". -->

Every BI consultant learns the same lesson in their first year: nobody asks
you the question they're trying to answer. They ask for a *list of stuff* (or an Excel of chart horrors).
Fourteen columns, six filters, a trend line, an export button. The actual job
was never building that - it was the archaeology of getting them to say what
decision they're trying to make, then quietly building the two-chart thing
that answers it. The list-of-stuff behavior was never irrational, either.
When a revision costs a meeting, an email chain, and a week in someone's
queue, you front-load everything you can think of. When being wrong happens
in front of other humans, the ask arrives dressed up as a fake-confident
requirements doc.

This page is about what happens when both of those costs go to zero.

## The story

The cast: a marketing lead. Lives in Sheets and slide decks. Has never
written a line of SQL and doesn't intend to start. His company runs an
RVBBIT warehouse; someone on the data side spent fifteen minutes last month
connecting it to the chat tool he already uses all day. That's the entire
setup he ever sees.

He needs to present competitive positioning to the CEO. Tomorrow.

<!-- TODO(paste): the actual opening prompt, verbatim - typos, shorthand,
     all of it. The authenticity IS the argument. -->

> **[PASTE: the real opening prompt]**

What happens next is the part that used to be a human's whole job. The agent
doesn't guess at the schema - it asks the warehouse what the data is
*about*. `search_data` returns the relevant tables ranked by what
colleagues actually query, grounded with live sample rows, per-column value
dictionaries, and freshness. It knows the last scrape finished yesterday and
that 82 collector errors mean coverage is incomplete - before it writes a
single query.

<!-- TODO(screenshot): the agent's discovery turn in chat - search_data /
     describe_table results visible, ideally showing samples + freshness. -->

![The agent grounding itself - semantic discovery with live samples, column stats, and freshness before any SQL is written.](/shots/self-service-discovery.png)

Then it drafts queries, checks them against the planner *without running
them* (`validate_sql` is a self-correct loop - bad column names never reach
the CEO), assembles the dashboard from the house template, and publishes it.
Versioned, at a URL, behind the same login as everything else.

One conversation later:

<!-- TODO(screenshot): Zollege Pipeline Observatory, full window. Already
     captured 2026-07-10 - the one with the caveat cards. -->

![The one-shot: a live competitive-intelligence dashboard - nine flat queries, KPI cards, and honest caveats, from one prompt.](/shots/self-service-observatory.png)

Look at the three cards under the header, because they're the tell that this
isn't a chatbot with a chart library. *Collection freshness: latest scrape
one day ago. Coverage caveat: 82 scraper errors, inventory may be
incomplete. Inference boundary: seat declines are a market signal, not
confirmed enrollments.* Nobody prompted for those. The agent hedged honestly
because the substrate hands it freshness, drift, and error counts as
first-class data - so epistemic honesty becomes a KPI card instead of a
footnote nobody writes. A human analyst under deadline pressure skips that
slide. The agent doesn't get embarrassed and doesn't get tired.

## The iteration is the interview

Here's the part that changes the sociology, not just the speed. He looks at
v1 and says:

<!-- TODO(paste): a real mid-conversation iteration message - ideally one
     that reverses an earlier ask, to show changing your mind is free. -->

> **[PASTE: a real "actually, no - make it..." follow-up]**

Nobody performs for a machine. You can ask the dumb question, change your
mind four times, and say "that's ugly, split it by state" - everything
people were never willing to do in front of a consultant billing by the
hour. The requirements interview still happens; it just happens
*implicitly*, through riffing, with an infinitely patient interviewer who
builds the thing between messages. The person who owns the question ends up
in the iteration seat - which is where they always belonged.

## Dashboards as disposable utterances

Most dashboards rot. The honest number from years of consulting: something
like 80% of them stop being looked at within a quarter, and the ones that
survive become a standing maintenance cost - plus the license bill for the
privilege. That was never a tooling failure exactly; it was an economics
problem. When a dashboard costs a week, it has to be a *project* - built to
serve every stakeholder's hedged wishlist forever, parameterized to death,
too important to delete.

When it costs an afternoon, it becomes an utterance. Getting an answer and
moving on to the next problem. Open it next week and it's still useful?
Great. Broken or stale? Ask the agent to fix it - or just make a new one.

You can watch this happen in the field: people are building dashboards
literally named **"July Report"**. Every instinct from the BI era says
that's wrong - parameterize it, make it generic, DRY. But the person
reporting to the CEO tomorrow doesn't want the general case. He builds
*exactly* what he needs, presents it, and moves on. As it should be. The
"confusing kitchen-sink dashboard" everyone complained about was an artifact
of dashboard *scarcity* - one artifact straining to serve every question
forever. Abundance dissolves the complaint.

And unlike a chat-exported chart, these utterances aren't dead ends. Every
query in that dashboard is flat, visible in the SOURCES strip, and crawled
into the catalog - so the warehouse learns what people actually ask, popular
objects rank higher in the next person's discovery, and a query that keeps
recurring is one Promote away from becoming a governed metric. The
dashboard teaches the warehouse.

## And then it compounds

Three days after the observatory, the same marketing lead - still no SQL -
had this:

<!-- TODO(screenshot): AA Market Map v0 - layer toggles, PostGIS clusters,
     spend actions with ROAS. Already captured 2026-07-10. -->

![Three days later: a PostGIS market map with demand clusters, layer toggles, and spend actions scored by ROAS. Not a dashboard anymore - a tool.](/shots/self-service-market-map.png)

Layer toggles. Demand clusters over PostGIS. Spend actions scored by ROAS.
A radius selector. That's not a report anymore; it's an operational tool -
and he named it `v0` himself, which means he's thinking in iterations
without anyone teaching him to. This is the quiet trajectory: the artifacts
drift from *report* toward *application* the moment the ceiling stops being
the author's tooling and becomes the author's appetite.

<!-- TODO(optional): if the client OKs it, a one-line quote from the
     marketing lead lands harder than anything we can write. -->

## Why the CEO can trust the number

The skeptical read of everything above is "so an LLM makes up charts now."
The reason it holds up in front of a CEO:

- **Governed numbers outrank raw tables.** Discovery deliberately ranks
  blessed [metrics](/docs/metrics-kpis) and curated [cubes](/docs/cubes)
  above raw schema - the agent reaches for the official definition of
  revenue before it reaches for a table named `revenue_v2_final`.
- **Nothing runs unvalidated, and nothing writes.** Every query passes a
  plan-only validation loop, then executes read-only with an enforced row
  cap and timeout. There is no code path from chat to a write.
- **Every call leaves a receipt.** Who asked, what ran, which objects it
  touched, how long it took - all of it lands in the activity log. The
  dashboard's own queries are inspectable by anyone who clicks the SOURCES
  strip.
- **The internals stay invisible.** Schema scoping means the agent (and the
  marketing lead) never see the engine's catalog - only the data they're
  meant to.

The full clinical version lives in [Warehouse MCP](/docs/warehouse-mcp).

## Set it up

The whole thing rides one MCP server over your existing warehouse - no
extra platform, no per-seat license for the person asking questions.

1. Run the warehouse MCP server and point it at your database -
   [setup here](/docs/warehouse-mcp#run-it).
2. Connect it to wherever your people already talk: Claude Desktop or
   Cowork as a native connector, Claude Code for the analysts - or a chat
   bridge into Google Chat / Slack, which is how the marketing lead in this
   story met it.
3. Optional but transformative: crawl the catalog and bless your first few
   metrics, so discovery has curated things to rank first.

Then get out of the way.

<!-- TODO(paste): closing beat - considering ending on the GChat message
     where he shipped the July Report link to the CEO. -->
