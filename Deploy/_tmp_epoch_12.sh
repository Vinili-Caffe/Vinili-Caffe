#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_ARCH="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools /tmp/vc_sw_cal2"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar.ts" \
  "vinili:/tmp/vc_sw_cal2/starWarsEventCalendar.ts"
ssh vinili "mkdir -p '$REMOTE_ARCH/Utils/Eventi' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs /tmp/vc_sw_cal2/starWarsEventCalendar.ts '$REMOTE_ARCH/Utils/Eventi/starWarsEventCalendar.js' && rm -f /tmp/vc_sw_cal2/starWarsEventCalendar.ts && echo ok"
ssh vinili 'pm2 restart site-api bots-vinyls >/dev/null && echo restarted'
