#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_ARCH="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools /tmp/vc_sw_miniera"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish_archivio() {
  local f="$1"
  local local_ts="$BOTS/archivio/starwars/src/Vinili/$f"
  local base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  [ -f "$local_ts" ] || { echo "manca $local_ts" >&2; exit 1; }
  scp -q "$local_ts" "vinili:/tmp/vc_sw_miniera/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_ARCH/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_miniera/${base}.ts' '$REMOTE_ARCH/$dir/${base}.js' && rm -f '$REMOTE_ARCH/$dir/${base}.ts' '/tmp/vc_sw_miniera/${base}.ts' && echo pubblicato: $dir/${base}.js"
}

publish_archivio "Services/Community/starWarsSiteGamesService.ts"
publish_archivio "Services/Community/starWarsDiscordMinigamesService.ts"

ssh vinili 'pm2 restart site-api bots-vinyls >/dev/null && sleep 4 && node -e "
const g=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsSiteGamesService\");
console.log(\"miniera\", typeof g.getMinieraState, typeof g.digMiniera, typeof g.settleMinieraKyberIfDue);
"'
