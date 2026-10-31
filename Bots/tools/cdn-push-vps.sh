#!/usr/bin/env bash
# Pubblica siteCdnMedia + sync script sulla VPS e sincronizza TUTTI i media pubblici su R2.
# Richiede VC_R2_* in /opt/bot/.env (o /opt/bot/.env.r2).
# Uso (Git Bash, da Bots):
#   bash tools/cdn-push-vps.sh
#   PROVA=1 bash tools/cdn-push-vps.sh
set -euo pipefail
cd "$(dirname "$0")/.."
bash tools/pubblica.sh "Vinili/Web/siteCdnMedia.ts Vinili/features/contest/siteContestApi.ts Vinili/features/boards/siteBoardsApi.ts" "site-api bot-workers"
scp -q tools/cdn-sync-on-vps.mjs vinili:/opt/bot/bots-ts/tools/cdn-sync-on-vps.mjs
ssh vinili "mkdir -p /opt/bot/bots-ts/tools; PROVA=${PROVA:-} VC_CDN_MEDIA_JS=/opt/bot/bots-ts/src/Vinili/Web/siteCdnMedia.js node /opt/bot/bots-ts/tools/cdn-sync-on-vps.mjs"
