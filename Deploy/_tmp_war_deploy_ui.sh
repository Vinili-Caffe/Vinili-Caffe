#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_ARCH="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools /tmp/vc_sw_war_deploy"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"
for f in Services/Community/starWarsEconomyService.ts Web/siteStarWarsEventoApi.ts; do
  base="$(basename "$f" .ts)"; dir="$(dirname "$f")"
  scp -q "$BOTS/archivio/starwars/src/Vinili/$f" "vinili:/tmp/vc_sw_war_deploy/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_ARCH/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '/tmp/vc_sw_war_deploy/${base}.ts' '$REMOTE_ARCH/$dir/${base}.js' && rm -f '/tmp/vc_sw_war_deploy/${base}.ts' && echo ok $base"
done
ssh vinili 'pm2 restart site-api bots-vinyls >/dev/null'
cd "$ROOT/WebSite" && npx vercel --prod --yes
