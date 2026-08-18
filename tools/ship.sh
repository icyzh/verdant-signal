#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

[ -z "$(git status --porcelain -uno)" ] || { echo 'REFUSED: working tree is dirty' >&2; exit 1; }
node tests/compat.mjs >/dev/null

REV=$(git rev-parse HEAD)
git push origin HEAD:main
[ "$(git rev-parse origin/main)" = "$REV" ] || { echo 'origin/main mismatch' >&2; exit 1; }
echo "Verdant Signal $REV pushed to origin/main"
