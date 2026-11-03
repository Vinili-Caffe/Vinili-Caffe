#!/usr/bin/env bash
set -euo pipefail
f=/opt/bot/bots-ts/archivio/starwars/src/Vinili/Web/siteStarWarsEventoApi.js
grep -n 'Config/ids\|Utils/Config' "$f" | head -5
echo ---
curl -s -o /dev/null -w "3020 %{http_code}\n" http://127.0.0.1:3020/webhooks/site-api/health || true
pm2 describe site-api 2>/dev/null | grep -E 'status|restarts|uptime' | head -5
echo ---ERR---
tail -20 /root/.pm2/logs/site-api-error-15.log
