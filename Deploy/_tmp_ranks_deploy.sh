#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_ARCH="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools /tmp/vc_sw_rank"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish_archivio() {
  local f="$1"
  local local_ts="$BOTS/archivio/starwars/src/Vinili/$f"
  local base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  [ -f "$local_ts" ] || { echo "manca $local_ts" >&2; exit 1; }
  scp -q "$local_ts" "vinili:/tmp/vc_sw_rank/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_ARCH/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_rank/${base}.ts' '$REMOTE_ARCH/$dir/${base}.js' && rm -f '$REMOTE_ARCH/$dir/${base}.ts' '/tmp/vc_sw_rank/${base}.ts' && echo pubblicato: $REMOTE_ARCH/$dir/${base}.js"
}

publish_src() {
  local f="$1"
  local local_ts="$BOTS/src/$f"
  local base dest_dir
  base="$(basename "$f" .ts)"
  dest_dir="/opt/bot/bots-ts/src/$(dirname "$f")"
  [ -f "$local_ts" ] || { echo "manca $local_ts" >&2; exit 1; }
  scp -q "$local_ts" "vinili:/tmp/vc_sw_rank/src_${base}.ts"
  ssh vinili "mkdir -p '$dest_dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_rank/src_${base}.ts' '$dest_dir/${base}.js' && rm -f '$dest_dir/${base}.ts' '/tmp/vc_sw_rank/src_${base}.ts' && echo pubblicato: $dest_dir/${base}.js"
}

publish_archivio "Utils/Eventi/starWarsFactionRanksCatalog.ts"
publish_archivio "Services/Community/starWarsFactionRankService.ts"
publish_archivio "Services/Community/starWarsEventWalletService.ts"
publish_archivio "Services/Community/starWarsEconomyService.ts"
publish_archivio "Prefix/Economy/promuovi.ts"
publish_archivio "Prefix/Economy/declassa.ts"
publish_archivio "Prefix/Economy/nomina.ts"
publish_archivio "Prefix/Economy/swrango.ts"
publish_src "Vinili/core/handlers/prefixHandler.ts"

scp -q "$BOTS/src/Vinili/permissions.json" "vinili:/opt/bot/bots-ts/src/Vinili/permissions.json"
echo "pubblicato: permissions.json"

ssh vinili 'pm2 restart bots-vinyls bot-workers site-api >/dev/null && sleep 6 && node -e "
const c=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsFactionRanksCatalog\");
const s=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsFactionRankService\");
console.log(c.rankLabel(\"repubblica\",4), c.permissionsForTier(2));
console.log(\"promote\", typeof s.promoteFactionMember);
"'

cd "$ROOT"
npx vercel --prod --yes
