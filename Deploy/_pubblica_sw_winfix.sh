#!/usr/bin/env bash
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"

bash "$DEPLOY_DIR/pubblica.sh" \
  "Vinili/Minigames/services/minigameHandlersMessage.ts Vinili/Minigames/services/minigameHandlersQuiz.ts Vinili/Minigames/services/minigameState.ts Vinili/Minigames/services/minigameRoundScoring.ts" \
  "bots-vinyls"

scp -q "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsQuiz.ts" vinili:/tmp/starWarsQuiz.ts
scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/starWarsQuiz.ts /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsQuiz.js"
ssh vinili "$NODE --check /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsQuiz.js"
ssh vinili "grep -n 'answer: prepared.answer\|answerBool' /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsQuiz.js | head -10"
ssh vinili "grep -n 'msgChannelId\|gameHere\|officialChatId\|normalizeTruthValue' /opt/bot/bots-ts/src/Vinili/Minigames/services/minigameHandlersMessage.js /opt/bot/bots-ts/src/Vinili/Minigames/services/minigameHandlersQuiz.js /opt/bot/bots-ts/src/Vinili/Minigames/services/minigameRoundScoring.js | head -30"
ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 8; pm2 ls | grep bots-vinyls"
echo "ok: sw winfix"
