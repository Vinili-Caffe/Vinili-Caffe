#!/bin/bash
set -euo pipefail
BOT_ROOT="${VC_BOT_ROOT:-/opt/bot}"
TOOLS="$BOT_ROOT/bots-ts/tools/live-stats"
# Non fare `source` del .env: una riga senza `=` (es. INSTAGRAM_ACCESS_TOKEN) con set -e
# faceva abortire il cron e lasciava live-stats-extra.json fermo per giorni.
# Node carica /opt/bot/.env in modo safe (skip linee senza =).
export VC_BOT_ENV="${VC_BOT_ENV:-$BOT_ROOT/.env}"
export VC_LIVE_STATS_JSON_OUT=/var/www/viniliecaffe/live-stats-extra.json
cd "$TOOLS"
node refresh-live-stats-extra.mjs
chown www-data:www-data "$VC_LIVE_STATS_JSON_OUT" 2>/dev/null || true
for DEST in /var/www/viniliecaffe-react /var/www/viniliecaffe-beta; do
  if [ -d "$DEST" ]; then
    cp -f "$VC_LIVE_STATS_JSON_OUT" "$DEST/live-stats-extra.json"
    chown www-data:www-data "$DEST/live-stats-extra.json" 2>/dev/null || true
  fi
done
