#!/usr/bin/env bash
# Pubblica bridge economia SW + load prefix/buttons giochi-economia.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_GE="/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili"
TMP="/tmp/vc_sw_econ"

ssh vinili "mkdir -p /opt/bot/bots-ts/tools '$TMP'"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish_ge() {
  local f="$1"
  local base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  scp -q "$BOTS/archivio/giochi-economia/src/Vinili/$f" "vinili:$TMP/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_GE/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '$TMP/${base}.ts' '$REMOTE_GE/$dir/${base}.js' && rm -f '$REMOTE_GE/$dir/${base}.ts' '$TMP/${base}.ts' && echo ok:giochi-economia/$dir/$base.js"
}

publish_ge "Services/Community/activeEconomyService.ts"
publish_ge "Services/Community/serverEconomyService.ts"
publish_ge "Services/Community/serverEconomyGamblingRob.ts"

# Assicura che i prefix/buttons allowlist esistano sulla VPS (compile se presenti in locale)
for f in \
  Prefix/Economy/blackjack.ts \
  Prefix/Economy/coinflip.ts \
  Prefix/Economy/daily.ts \
  Prefix/Economy/monthly.ts \
  Prefix/Economy/rob.ts \
  Prefix/Economy/roulette.ts \
  Prefix/Economy/rps.ts \
  Prefix/Economy/scratch.ts \
  Prefix/Economy/slots.ts \
  Prefix/Economy/weekly.ts \
  Prefix/Economy/work.ts \
  Buttons/blackjackGui.ts \
  Buttons/coinflipGui.ts \
  Buttons/incomeClaimGui.ts \
  Buttons/robGui.ts \
  Buttons/rouletteGui.ts \
  Buttons/rpsGui.ts \
  Buttons/scratchGui.ts \
  Buttons/slotsGui.ts
do
  if [ -f "$BOTS/archivio/giochi-economia/src/Vinili/$f" ]; then
    publish_ge "$f"
  fi
done

bash "$ROOT/Deploy/pubblica.sh" \
  "Vinili/Community/services/activeEconomyService.ts Vinili/core/handlers/prefixHandler.ts Vinili/core/officialPrefixDispatcher.ts Vinili/index.ts" \
  "bots-vinyls"

ssh vinili 'node -e "
const s=require(\"/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili/Services/Community/activeEconomyService\");
const fakeOn={config:{starWarsEvent:{enabled:true,publicEnabled:false}}};
const fakeOff={config:{starWarsEvent:{enabled:true,publicEnabled:true}}};
console.log(\"gate HS preview\", s.isServerEconomyEnabled(fakeOn));
console.log(\"gate public calendar\", s.isServerEconomyEnabled(fakeOff), \"(depends on calendar day)\");
console.log(\"has assert\", typeof s.assertServerEconomyAccess);
console.log(\"has claimWork\", typeof s.claimWork);
"'
