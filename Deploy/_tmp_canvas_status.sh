#!/bin/bash
set -euo pipefail
export NVM_DIR="/root/.nvm"
. "$NVM_DIR/nvm.sh"

echo "=== pm2 site-api node ==="
pm2 describe site-api | grep -E 'script path|interpreter|node.js|exec cwd|status' || true

echo "=== which nodes ==="
nvm use 22 >/dev/null
echo "nvm22: $(node -v) MODULE=$(node -p process.versions.modules)"
/root/.nvm/versions/node/v22.22.2/bin/node -v
/root/.nvm/versions/node/v20.20.2/bin/node -v 2>/dev/null || true

echo "=== canvas binary ==="
ls -la /opt/bot/node_modules/canvas/build/Release/canvas.node 2>/dev/null || echo "no canvas.node"
# try load with both
echo "-- load with node22 --"
cd /opt/bot
/root/.nvm/versions/node/v22.22.2/bin/node -e "require('canvas'); console.log('node22 OK')" 2>&1 | head -20
echo "-- load with node20 --"
/root/.nvm/versions/node/v20.20.2/bin/node -e "require('canvas'); console.log('node20 OK')" 2>&1 | head -20

echo "=== recent site-api err ==="
pm2 logs site-api --err --lines 12 --nostream | tail -20 || true
