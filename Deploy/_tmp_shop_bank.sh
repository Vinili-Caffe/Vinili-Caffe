#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_ARCH="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools /tmp/vc_sw_shopbank"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"
scp -q "$BOTS/archivio/starwars/src/Vinili/Services/Community/starWarsEconomyService.ts" "vinili:/tmp/vc_sw_shopbank/starWarsEconomyService.ts"
ssh vinili "mkdir -p '$REMOTE_ARCH/Services/Community' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs /tmp/vc_sw_shopbank/starWarsEconomyService.ts '$REMOTE_ARCH/Services/Community/starWarsEconomyService.js' && rm -f /tmp/vc_sw_shopbank/starWarsEconomyService.ts && echo ok-economy"
ssh vinili 'pm2 restart site-api >/dev/null && sleep 3 && node -e "
const e=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsEconomyService\");
console.log(\"buyUnit\", typeof e.buyUnit);
"'
