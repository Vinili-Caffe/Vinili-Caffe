#!/bin/bash
set -euo pipefail
cd /opt/bot
NODE=/root/.nvm/versions/node/v22.22.2/bin/node
$NODE -e "require('./node_modules/canvas'); console.log('canvas OK');"
$NODE -e "require('./bots-ts/src/Vinili/Level/utils/rankCanvas.js'); console.log('rankCanvas OK');"
$NODE -e "require('./bots-ts/archivio/giochi-economia/src/Vinili/Utils/Render/robCanvas.js'); console.log('robCanvas OK');"
# confirm no fresh ABI errors since last restart
echo "--- err after restart marker ---"
# truncate isn't needed; just show if process is up and listening
curl -s -o /dev/null -w "site-api http %{http_code}\n" http://127.0.0.1:3020/ || true
pm2 pid site-api
ls -la node_modules/canvas/build/Release/
