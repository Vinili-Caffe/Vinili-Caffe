#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash Deploy/pubblica.sh "Vinili/Staff/utils/staffGuideContent.ts" "site-api" </dev/null
ssh vinili 'curl -s -o /dev/null -w "health=%{http_code}\n" http://127.0.0.1:3020/webhooks/site-api/health; grep -n "MEZZE GIORNATE\|Provvigione\|0,5 giorni\|15%" /opt/bot/bots-ts/src/Vinili/Staff/utils/staffGuideContent.js | head -15' </dev/null
