#!/usr/bin/env bash
# Pubblica embed/canvas SW minigames (core + archivio quiz/planet).
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"

bash "$DEPLOY_DIR/pubblica.sh" \
  "Vinili/Minigames/services/minigameImageCanvas.ts Vinili/Minigames/services/minigameImages.ts Vinili/Minigames/services/minigameEmbedGuess.ts Vinili/Minigames/services/minigameEmbeds.ts Vinili/Minigames/services/quizWords.ts Vinili/Minigames/services/quizCulture.ts Vinili/Minigames/services/minigameFindBot.ts Vinili/Minigames/services/minigameMemory.ts Vinili/Minigames/services/minigameHandlersHangman.ts Vinili/Minigames/services/minigameRoundAdvance.ts Vinili/Minigames/services/minigameRoundEnd.ts Vinili/Minigames/services/minigameRestoreQuiz.ts" \
  "bots-vinyls"

compile_one() {
  local local_ts="$1"
  local remote_js="$2"
  scp -q "$local_ts" "vinili:/tmp/_sw_embed_one.ts"
  scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
  ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/_sw_embed_one.ts $remote_js"
  ssh vinili "$NODE --check $remote_js"
  echo "ok archivio: $remote_js"
}

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsQuiz.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsQuiz.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsGuessPlanet.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsGuessPlanet.js"

ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 8; pm2 ls | grep bots-vinyls"
echo "ok: SW embeds deploy"
