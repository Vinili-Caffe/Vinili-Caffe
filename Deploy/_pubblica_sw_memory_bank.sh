#!/usr/bin/env bash
# Fix memory SW bank shape + swspawn force-clear.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"

compile_one() {
  local local_ts="$1"
  local remote_js="$2"
  scp -q "$local_ts" "vinili:/tmp/_sw_mem_one.ts"
  scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
  ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/_sw_mem_one.ts $remote_js"
  ssh vinili "$NODE --check $remote_js"
  echo "ok archivio: $remote_js"
}

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigameBanks.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigameBanks.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Utils/Minigames/starWarsMinigameHooks.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Minigames/starWarsMinigameHooks.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Prefix/Minigames/swspawn.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Minigames/swspawn.js"

ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 8; pm2 ls | grep bots-vinyls"
echo "ok: SW memory bank + swspawn"
