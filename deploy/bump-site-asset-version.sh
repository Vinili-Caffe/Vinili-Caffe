#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/var/www/viniliecaffe}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "${SCRIPT_DIR}/bump-all-site-assets.py" "$ROOT"
grep -m1 -oE 'vc-cursor-trail.js[^" ]*|web-tickets-page.js[^" ]*|vc-landing.css[^" ]*|discord-auth.js[^" ]*' \
  "${ROOT}/index.html" "${ROOT}/tickets/index.html" 2>/dev/null || true
