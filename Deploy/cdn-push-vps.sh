#!/usr/bin/env bash
# Pubblica siteCdnMedia + sync script sulla VPS e sincronizza TUTTI i media pubblici su R2.
# Richiede VC_R2_* in /opt/bot/.env (o /opt/bot/.env.r2).
# Uso:
#   bash Deploy/cdn-push-vps.sh
#   PROVA=1 bash Deploy/cdn-push-vps.sh
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$DEPLOY_DIR/pubblica.sh" "Vinili/Web/siteCdnMedia.ts Vinili/features/contest/siteContestApi.ts Vinili/features/boards/siteBoardsApi.ts" "site-api bot-workers"
ssh vinili "mkdir -p /opt/bot/bots-ts/tools"
scp -q "$DEPLOY_DIR/cdn-sync-on-vps.mjs" vinili:/opt/bot/bots-ts/tools/cdn-sync-on-vps.mjs
ssh vinili "PROVA=${PROVA:-} VC_CDN_MEDIA_JS=/opt/bot/bots-ts/src/Vinili/Web/siteCdnMedia.js node /opt/bot/bots-ts/tools/cdn-sync-on-vps.mjs"
