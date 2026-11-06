#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_ARCH="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools /tmp/vc_sw_wars"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish_archivio() {
  local f="$1"
  local local_ts="$BOTS/archivio/starwars/src/Vinili/$f"
  local base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  [ -f "$local_ts" ] || { echo "manca $local_ts" >&2; exit 1; }
  scp -q "$local_ts" "vinili:/tmp/vc_sw_wars/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_ARCH/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_wars/${base}.ts' '$REMOTE_ARCH/$dir/${base}.js' && rm -f '$REMOTE_ARCH/$dir/${base}.ts' '/tmp/vc_sw_wars/${base}.ts' && echo pubblicato: $dir/${base}.js"
}

publish_src() {
  local f="$1"
  local local_ts="$BOTS/src/$f"
  local base dest_dir
  base="$(basename "$f" .ts)"
  dest_dir="/opt/bot/bots-ts/src/$(dirname "$f")"
  [ -f "$local_ts" ] || { echo "manca $local_ts" >&2; exit 1; }
  scp -q "$local_ts" "vinili:/tmp/vc_sw_wars/src_${base}.ts"
  ssh vinili "mkdir -p '$dest_dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_wars/src_${base}.ts' '$dest_dir/${base}.js' && rm -f '$dest_dir/${base}.ts' '/tmp/vc_sw_wars/src_${base}.ts' && echo pubblicato: $dest_dir/${base}.js"
}

publish_archivio "Services/Community/starWarsEconomyService.ts"
publish_archivio "Web/siteStarWarsEventoApi.ts"
publish_src "Vinili/site/http/webhooks/eventoRoutes.ts"

ssh vinili 'pm2 restart site-api bots-vinyls >/dev/null && sleep 4 && node -e "
const e=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsEconomyService\");
const a=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Web/siteStarWarsEventoApi\");
console.log(\"wars\", typeof e.listWarReports, typeof e.getWarReport, typeof a.handleSiteEventoWarsGet);
"'
