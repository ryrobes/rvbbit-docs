---
title: Existing Postgres
description: There is no published extension tarball. Use the Calliope Postgres image, or build crates/pg_rvbbit from the Calliope repo.
section: Start
navOrder: 25
sourceDocs:
  - ../calliope/PACKAGING.md
  - ../calliope/docs/RVBBIT_ENGINE.md
---

The old download on this site,
`https://rvbbit.ai/dist/pg_rvbbit-4.1.6-pg18-amd64.tar.gz`, is gone. So is
`ghcr.io/ryrobes/rvbbit-postgres` as a product install. Copying a `.so` out
of that image is not a supported path.

What works today:

1. **Calliope**, which is the product. The installer starts
   `ghcr.io/ryrobes/calliope-postgres:1.2.1` with `pg_rvbbit` already loaded.
   See [Quickstart](/docs/quickstart). The release asset
   `calliope-1.2.1-linux-amd64.tar.gz` is that Compose bundle, not an
   extension package.
2. **Build the extension from source** in
   [github.com/ryrobes/calliope](https://github.com/ryrobes/calliope), crate
   `crates/pg_rvbbit`. This is a development build. It is not a tested
   "drop in beside production Postgres" installer, and Calliope's own
   `PACKAGING.md` still describes older image names. The compile steps below
   are the ones that file currently gives for a from-source build. If they
   drift, trust the repo, not this page.

Supported server version for the extension is PostgreSQL 18. Hosted Postgres
without superuser (RDS, Cloud SQL, Supabase, Neon) cannot load it.
`shared_preload_libraries` has to include `pg_rvbbit` or planner hooks never
register.

## Build from the Calliope repo

Requirements named in `PACKAGING.md`:

- Rust stable 1.95+
- `cargo-pgrx` 0.18.0 (`cargo install --locked cargo-pgrx --version 0.18.0`)
- PostgreSQL 18 development headers (`postgresql-server-dev-18` on Debian)
- `libzstd-dev`, `libclang-dev`, `pkg-config`, `build-essential`

```bash
git clone https://github.com/ryrobes/calliope.git
cd calliope
cargo pgrx init --pg18 $(which pg_config)
cargo pgrx install --release --pg-config $(which pg_config)
cargo build --release --locked --manifest-path crates/rvbbit_duck/Cargo.toml
sudo cp crates/rvbbit_duck/target/release/rvbbit-duck /usr/local/bin/
```

Then, as superuser, after a restart with the preload library set:

```sql
CREATE EXTENSION pg_rvbbit;
SELECT rvbbit.rvbbit_version();
```

`PACKAGING.md` also says `CREATE EXTENSION` installs a base version and that
upgrades from 2.0.14 onward use `ALTER EXTENSION pg_rvbbit UPDATE`. Confirm
that against the checkout you built. This site is not going to invent a
migration command the file does not stand behind.

The Duck/Vortex worker is the `rvbbit-duck` binary. If it is absent, the
router skips those candidates. Calliope runs it as the `duck` service; a
from-source build has to install the binary itself.

## What you do not get from a bare extension

A bare `CREATE EXTENSION` does not start Hutch, Data Rabbit, Warren, or the
OpenRouter gateway. Clover operators that the Calliope appliance registers
are part of that install, not of the `.so` alone. There is no hosted Clover
to point at.

For semantic SQL against an API you already have, the extension can register
a backend by env-var name (the key stays in the server environment):

```sql
SELECT rvbbit.register_backend(
  'llm',
  'https://openrouter.ai/api/v1/chat/completions',
  'openai_chat', 32, 4, 120000,
  'OPENROUTER_API_KEY'
);
```

That is a DIY provider, not Clover. The paved road is still the Calliope
install, which wires Hutch for you.

## Layers, briefly

| Layer | Where it is in Calliope | On a from-source build |
| --- | --- | --- |
| Extension | Inside `calliope-postgres` | `cargo pgrx install` |
| Query worker | `duck` service | `rvbbit-duck` on `PATH` |
| Local models | Warren, plus optional `specialists` | You run Warren yourself. Not documented as a one-liner here. |
| Model gateway | `clover` (Hutch) and its workers | Not part of the extension binary. See [Clover](/clover). |
