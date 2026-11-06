#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_ARCH="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools /tmp/vc_sw_noscomm"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish() {
  local f="$1"
  local local_ts="$BOTS/archivio/starwars/src/Vinili/$f"
  local base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  scp -q "$local_ts" "vinili:/tmp/vc_sw_noscomm/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_ARCH/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_noscomm/${base}.ts' '$REMOTE_ARCH/$dir/${base}.js' && rm -f '/tmp/vc_sw_noscomm/${base}.ts' && echo ok:$f"
}

publish "Utils/Eventi/starWarsEventCalendar.ts"
publish "Utils/Eventi/starWarsMinigamesRegistry.ts"
publish "Services/Community/starWarsDiscordMinigamesService.ts"

ssh vinili 'pm2 restart site-api bots-vinyls >/dev/null && sleep 3 && node -e "
const cal=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar\");
const reg=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry\");
const rows=cal.listCalendarDays?cal.listCalendarDays():[];
const hasS=JSON.stringify(cal.FEATURES||{}).includes(\"scommessa\");
const items=(reg.REGISTRY||[]).map(r=>r.id);
console.log(\"feat_scommessa_key\", hasS, \"registry_has\", items.includes(\"scommessa\"));
"'
