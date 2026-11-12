#!/bin/bash
set -euo pipefail
BOT_ROOT="${VC_BOT_ROOT:-/opt/bot}"
TOOLS="$BOT_ROOT/bots-ts/tools/live-stats"
set -a; . "$BOT_ROOT/.env"; set +a
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
