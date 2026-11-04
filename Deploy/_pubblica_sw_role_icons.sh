#!/usr/bin/env bash
# SW role icons + calendar sync (nome+icona per epoca).
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"

LOCAL_TS="$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsCalendarRoleSync.ts"
REMOTE_JS="/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsCalendarRoleSync.js"

scp -q "$LOCAL_TS" "vinili:/tmp/_sw_cal_one.ts"
scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/_sw_cal_one.ts $REMOTE_JS"
ssh vinili "$NODE --check $REMOTE_JS"
echo "ok archivio: $REMOTE_JS"

ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 6; pm2 ls | grep bots-vinyls"
echo "ok: SW role icons sync"
