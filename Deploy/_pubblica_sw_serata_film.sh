#!/usr/bin/env bash
# Serate film SW: calendario fisso 21:00 + classifica fazioni (unica, in fine serata).
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
NODE="/root/.nvm/versions/node/v22.22.2/bin/node"

bash "$DEPLOY_DIR/pubblica.sh" \
  "Vinili/Community/services/movieNightSchedule.ts Vinili/Community/services/movieNightMessages.ts Vinili/Community/services/movieNightStageCloseFlow.ts Vinili/Community/services/movieNightAnnouncementService.ts Vinili/Community/services/movieNightEventPoster.ts Vinili/Community/events/guildScheduledEventCreate.ts Vinili/Community/events/guildScheduledEventUpdate.ts Vinili/Community/schemas/siteDocumentSchema.ts" \
  "bots-vinyls"

LOCAL_LB="$REPO_ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsSerataFilmFactionLeaderboardService.ts"
REMOTE_LB="/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsSerataFilmFactionLeaderboardService.js"

scp -q "$LOCAL_LB" "vinili:/tmp/_sw_cal_one.ts"
scp -q "$DEPLOY_DIR/_compile_one_archivio.cjs" vinili:/tmp/_compile_one_archivio.cjs
ssh vinili "$NODE /tmp/_compile_one_archivio.cjs /tmp/_sw_cal_one.ts $REMOTE_LB"
ssh vinili "$NODE --check $REMOTE_LB"
echo "ok archivio: $REMOTE_LB"

ssh vinili "pm2 restart bots-vinyls --update-env >/dev/null; sleep 8; pm2 ls | grep bots-vinyls"
echo "ok: SW serata film calendar + faction LB"
