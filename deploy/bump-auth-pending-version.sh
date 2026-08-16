#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/var/www/viniliecaffe}"
NEWV="${2:-$(date +%s%3N)}"
echo "Bump vc-auth-pending to ${NEWV}"
find "$ROOT" -name '*.html' -print0 | while IFS= read -r -d '' f; do
  sed -i \
    -e "s|vc-auth-pending.js?v=[0-9]*|vc-auth-pending.js?v=${NEWV}|g" \
    -e "s|vc-auth-pending.js\"|vc-auth-pending.js?v=${NEWV}\"|g" \
    -e "s|vc-auth-pending.js'|vc-auth-pending.js?v=${NEWV}'|g" \
    "$f"
done
grep -o 'vc-auth-pending.js[^"[:space:]>]*' "$ROOT/vote/index.html" | head -1 || true
