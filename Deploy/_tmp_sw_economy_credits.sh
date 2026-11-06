#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_GE="/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili"
TMP="/tmp/vc_sw_econ2"

ssh vinili "mkdir -p /opt/bot/bots-ts/tools '$TMP'"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish_ge() {
  local f="$1"
  local base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  scp -q "$BOTS/archivio/giochi-economia/src/Vinili/$f" "vinili:$TMP/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_GE/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '$TMP/${base}.ts' '$REMOTE_GE/$dir/${base}.js' && rm -f '$REMOTE_GE/$dir/${base}.ts' '$TMP/${base}.ts' && echo ok:$dir/$base.js"
}

for f in \
  Services/Community/starWarsCreditsBridge.ts \
  Services/Community/serverWalletService.ts \
  Services/Community/serverEconomyService.ts \
  Services/Community/serverEconomyGamblingRob.ts \
  Services/Community/activeEconomyService.ts \
  Services/Community/gringottService.ts \
  Utils/Economy/economyDisplayHelpers.ts \
  Utils/Render/starWarsEconomyTheme.ts \
  Utils/Render/incomeRewardCanvas.ts \
  Utils/Render/blackjackCanvas.ts \
  Utils/Render/slotsCanvas.ts \
  Utils/Render/coinflipCanvas.ts \
  Utils/Render/rouletteCanvas.ts \
  Utils/Render/rpsCanvas.ts \
  Utils/Render/scratchCanvas.ts \
  Utils/Render/robCanvas.ts
do
  publish_ge "$f"
done

ssh vinili 'pm2 restart bots-vinyls >/dev/null; sleep 2; node -e "
const s=require(\"/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili/Services/Community/activeEconomyService\");
const w=require(\"/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili/Services/Community/serverWalletService\");
const d=require(\"/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili/Utils/Economy/economyDisplayHelpers\");
const g=require(\"/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili/Services/Community/gringottService\");
const fake={config:{starWarsEvent:{enabled:true,publicEnabled:false}}};
console.log(\"enabled\", s.isServerEconomyEnabled(fake));
console.log(\"currency\", s.defaultBetCurrency(fake));
console.log(\"minBet\", s.economyConfig(fake).minBet);
console.log(\"format\", d.formatEconomyAmount(1234));
console.log(\"galeoniShim\", g.formatGaleoni(50));
console.log(\"walletCrediti\", w.CURRENCY_CREDITI);
"'
