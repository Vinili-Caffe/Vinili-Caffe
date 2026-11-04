#!/usr/bin/env bash
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"
REMOTE_JS="/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService.js"

scp -q "$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService.ts" vinili:/tmp/starWarsQuizMalusService.ts
scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/starWarsQuizMalusService.ts $REMOTE_JS"
ssh vinili "$NODE --check $REMOTE_JS"
ssh vinili "grep -n 'Malus attivo\\|VC_EXP\\|setImage' $REMOTE_JS | head -20"
ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 8; pm2 ls | grep bots-vinyls"
echo "ok: malus embed"
