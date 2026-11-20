#!/usr/bin/env bash
# The standalone RVBBIT stack (rvbbit-postgres / rvbbit-lens / rvbbit-warren-agent)
# is no longer published from this site. RVBBIT now ships as the SQL engine
# inside Calliope. This script does not install anything and does not run
# the Calliope installer.
set -euo pipefail

cat <<'EOF'
The standalone RVBBIT installer has moved.

RVBBIT is the SQL engine inside Calliope. Install Calliope (read the script
before you pipe it to a shell):

  curl -fsSL https://usecalliope.com/install.sh | bash

Product site:  https://usecalliope.com
Source:        https://github.com/ryrobes/calliope
Engine docs:   https://rvbbit.ai/docs/quickstart

This copy of install.sh did not change your machine.
EOF
