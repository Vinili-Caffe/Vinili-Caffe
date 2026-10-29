#!/usr/bin/env bash
# Prova sulla VPS: ferma il bot di test originale (bots-coffee, solo quello) e avvia la versione TypeScript
# da /opt/bot-ts-test con le stesse impostazioni. Il bot ufficiale (bots-vinyls) non viene toccato.
# Per tornare all'originale: tools/vps-test-stop.sh
set -euo pipefail
NODE=/root/.nvm/versions/node/v22.22.2/bin/node
T=/opt/bot-ts-test
[ -f "$T/wait-for-lavalink.js" ] || { echo "manca $T: prima tools/vps-test-prepare.sh" >&2; exit 1; }

pm2 stop bots-coffee >/dev/null
sleep 3
pm2 delete bots-coffee-ts >/dev/null 2>&1 || true
cd "$T"
NODE_OPTIONS=--max-old-space-size=320 \
ENABLE_LOADER_NPM_INSTALL=0 ENABLE_LOADER_GIT_PULL=0 BOT_SCHEDULER_EXTERNAL=1 \
LOADER_BOTS=coffee NODE_BINARY="$NODE" ENABLE_SHARDING=0 SHOW_NODE_WARNINGS=1 NODE_ENV=production \
  pm2 start "$T/wait-for-lavalink.js" --name bots-coffee-ts --interpreter "$NODE" --cwd "$T" --no-autorestart >/dev/null

echo "bot di test TypeScript avviato, attendo l'avvio (40 s)…"
sleep 40
pm2 ls | grep -E "bots-coffee|bots-vinyls"
echo "--- ultime righe del bot TS ---"
pm2 logs bots-coffee-ts --nostream --lines 40 2>/dev/null | sed "s/\x1b\[[0-9;]*m//g" | tail -40
