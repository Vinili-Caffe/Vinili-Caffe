#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_ARCH="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools /tmp/vc_sw_rankui"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish_archivio() {
  local f="$1"
  local local_ts="$BOTS/archivio/starwars/src/Vinili/$f"
  local base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  [ -f "$local_ts" ] || { echo "manca $local_ts" >&2; exit 1; }
  scp -q "$local_ts" "vinili:/tmp/vc_sw_rankui/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_ARCH/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_rankui/${base}.ts' '$REMOTE_ARCH/$dir/${base}.js' && rm -f '$REMOTE_ARCH/$dir/${base}.ts' '/tmp/vc_sw_rankui/${base}.ts' && echo pubblicato: $dir/${base}.js"
}

publish_src() {
  local f="$1"
  local local_ts="$BOTS/src/$f"
  local base dest_dir
  base="$(basename "$f" .ts)"
  dest_dir="/opt/bot/bots-ts/src/$(dirname "$f")"
  [ -f "$local_ts" ] || { echo "manca $local_ts" >&2; exit 1; }
  scp -q "$local_ts" "vinili:/tmp/vc_sw_rankui/src_${base}.ts"
  ssh vinili "mkdir -p '$dest_dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_rankui/src_${base}.ts' '$dest_dir/${base}.js' && rm -f '$dest_dir/${base}.ts' '/tmp/vc_sw_rankui/src_${base}.ts' && echo pubblicato: $dest_dir/${base}.js"
}

publish_archivio "Services/Community/starWarsFactionRankService.ts"
publish_archivio "Services/Community/starWarsEventWalletService.ts"
publish_archivio "Web/siteStarWarsEventoApi.ts"
publish_src "Vinili/site/http/webhooks/eventoRoutes.ts"
scp -q "$BOTS/src/Vinili/permissions.json" "vinili:/opt/bot/bots-ts/src/Vinili/permissions.json"
echo "permissions.json ok"

# rimuovi comandi Discord vecchi
ssh vinili 'rm -f \
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Economy/promuovi.js \
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Economy/declassa.js \
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Economy/nomina.js \
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Economy/swrango.js \
  && echo removed_prefix_cmds'

ssh vinili 'pm2 restart bots-vinyls site-api >/dev/null && sleep 5 && node -e "
const r=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsFactionRankService\");
console.log(\"list\", typeof r.listFactionRankRoster, \"claim\", typeof r.claimMarshalIfVacant);
const api=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Web/siteStarWarsEventoApi\");
console.log(\"api ranks\", typeof api.handleSiteEventoFactionRanksGet, typeof api.handleSiteEventoFactionRanksPost);
"'

cd "$ROOT"
npx vercel --prod --yes
