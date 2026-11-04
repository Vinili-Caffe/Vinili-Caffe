#!/usr/bin/env bash
# Puzzle di Kessel: 6 difficoltà + API claim/cooldown.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"

compile_one() {
  local local_ts="$1"
  local remote_js="$2"
  scp -q "$local_ts" "vinili:/tmp/_sw_cal_one.ts"
  scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
  ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/_sw_cal_one.ts $remote_js"
  ssh vinili "$NODE --check $remote_js"
  echo "ok archivio: $remote_js"
}

bash "$DEPLOY_DIR/pubblica.sh" \
  "Vinili/site/http/webhooks/eventoRoutes.ts" \
  "bots-vinyls"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsPuzzleCatalog.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsPuzzleCatalog.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsSiteGamesService.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsSiteGamesService.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Web/siteStarWarsEventoApi.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Web/siteStarWarsEventoApi.js"

ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 8; pm2 ls | grep bots-vinyls"
echo "ok: SW puzzle difficulties"
