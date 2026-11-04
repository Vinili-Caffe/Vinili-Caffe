#!/usr/bin/env bash
# Regola globale SW: +5 crediti vincitore +10 banca; voto smistato 100 exp +5 crediti.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"

bash "$DEPLOY_DIR/pubblica.sh" \
  "Vinili/Minigames/services/minigameRewards.ts Vinili/Community/services/officialMessageAutomationVotes.ts" \
  "bots-vinyls"

compile_one() {
  local local_ts="$1"
  local remote_js="$2"
  scp -q "$local_ts" "vinili:/tmp/_sw_glob_one.ts"
  scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
  ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/_sw_glob_one.ts $remote_js"
  ssh vinili "$NODE --check $remote_js"
  echo "ok archivio: $remote_js"
}

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsRewardsService.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsRewardsService.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards.js"

compile_one \
  "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.ts" \
  "/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js"

ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 8; pm2 ls | grep bots-vinyls"
echo "ok: SW global win + vote"
