#!/usr/bin/env bash
# Allinea premi SW: tutti i minigame del pool contano per cassa/crediti come quiz.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"

bash "$DEPLOY_DIR/pubblica.sh" \
  "Vinili/Minigames/services/minigameRewards.ts Vinili/Minigames/services/minigameConfig.ts Vinili/Minigames/services/minigameFindBot.ts Vinili/Minigames/services/minigameInteractionHandlers.ts" \
  "bots-vinyls"

compile_one() {
  local local_ts="$1"
  local remote_js="$2"
  scp -q "$local_ts" "vinili:/tmp/_sw_rew_one.ts"
  scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
  ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/_sw_rew_one.ts $remote_js"
  ssh vinili "$NODE --check $remote_js"
  echo "ok archivio: $remote_js"
}

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Utils/Minigames/starWarsMinigameHooks.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Minigames/starWarsMinigameHooks.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards.js"

ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 8; pm2 ls | grep bots-vinyls"
echo "ok: SW rewards align"
