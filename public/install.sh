#!/usr/bin/env bash
#
# rvbbit installer - https://rvbbit.ai
#
#   curl -fsSL https://rvbbit.ai/install.sh | bash
#
# What this does (please, read it - it's short):
#   1. checks for docker + the compose plugin
#   2. downloads docker-compose.yml into ./rvbbit/
#   3. docker compose up -d   (Postgres 18 + rvbbit, lens UI, warren agent)
#   4. waits for Postgres to report healthy, prints connection info
#
# It does NOT touch anything outside ./rvbbit, does not need root (assuming
# your user is in the docker group), and is safe to re-run.

set -euo pipefail

RVBBIT_VERSION="${RVBBIT_VERSION:-4.0.10}"
INSTALL_DIR="${RVBBIT_DIR:-rvbbit}"
COMPOSE_URL="https://rvbbit.ai/docker-compose.yml"

say() { printf '\033[1;35mrvbbit>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mrvbbit>\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not found - install it first: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "docker compose (v2 plugin) not found"
docker info >/dev/null 2>&1 || die "cannot talk to the docker daemon (try: sudo usermod -aG docker \$USER, then re-login)"

mkdir -p "$INSTALL_DIR" && cd "$INSTALL_DIR"

if [ -f docker-compose.yml ]; then
  say "using existing ./$INSTALL_DIR/docker-compose.yml (delete it to re-fetch)"
else
  say "fetching docker-compose.yml"
  curl -fsSL "$COMPOSE_URL" -o docker-compose.yml
fi

say "starting the stack (first run pulls ~2GB of images)"
RVBBIT_VERSION="$RVBBIT_VERSION" docker compose up -d

say "waiting for Postgres to become healthy (first boot runs all migrations)"
for i in $(seq 1 90); do
  status="$(docker inspect --format '{{.State.Health.Status}}' rvbbit-postgres 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "$status" = "healthy" ] || die "Postgres didn't become healthy in 3 minutes - check: docker compose logs postgres"

PGPORT="${RVBBIT_POSTGRES_PORT:-55433}"
LENSPORT="${RVBBIT_LENS_PORT:-3000}"

say ""
say "rvbbit $RVBBIT_VERSION is up."
say ""
say "  psql postgresql://postgres:rvbbit@localhost:${PGPORT}/rvbbit"
say "  lens (SQL Desktop):  http://localhost:${LENSPORT}"
say ""
say "first accelerated table:"
say "  CREATE TABLE t USING rvbbit AS SELECT ...;"
say "  SELECT rvbbit.refresh_acceleration('t'::regclass, true);"
say ""
say "semantic operators need a model key - add to ./$INSTALL_DIR/.env and re-run 'docker compose up -d':"
say "  OPENROUTER_API_KEY=...   (or OPENAI_API_KEY / ANTHROPIC_API_KEY)"
say ""
say "docs: https://rvbbit.ai/docs    GPU/GQE + MCP server: https://rvbbit.ai/docs/gqe"
