# RVBBIT Docs Site

Standalone Next.js documentation and marketing site for RVBBIT.

The site is markdown-first. Curated docs live in `content/docs`, and each page
can point back to upstream source docs in `../rvbbit-sql/docs` through the
`sourceDocs` frontmatter field.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Content Model

Each markdown document uses frontmatter:

```yaml
---
title: Storage Acceleration
description: Optional poly-engine acceleration beside Postgres heap.
section: Storage
navOrder: 40
sourceDocs:
  - ../rvbbit-sql/docs/TUNING.md
---
```

Run this before publishing docs after an upstream change:

```bash
npm run check:sources
```

That command verifies that every `sourceDocs` path still exists.

## Design Direction

- Black, flat, document-first.
- Conservative pastel accents for architecture and product affordances.
- No vaporwave gradients, oversized decorative blobs, or marketing-card bloat.
- Landing page and docs share the same typography, navigation, and content
  vocabulary.
- The rabbit mark is re-rendered as SVG from the local bitmap logo references
  at `~/chunky-black.png` and `~/datarabbit.ico`. The reusable web asset is
  `public/rabbit-mark.svg`, with the inline React version in
  `components/RabbitMark.tsx`.
