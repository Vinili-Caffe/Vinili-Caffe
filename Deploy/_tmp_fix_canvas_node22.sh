#!/bin/bash
set -euo pipefail
export NVM_DIR="/root/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 22
cd /opt/bot
node -v
npm -v
if node -e "require('canvas'); console.log('ok', require.resolve('canvas'));" 2>/dev/null; then
  echo "canvas already resolvable on node22"
else
  echo "reinstall canvas for node22..."
  npm install canvas@2.11.2 --no-fund --no-audit
  node -e "require('canvas'); console.log('ok', require.resolve('canvas'));"
fi
pm2 restart site-api --update-env
sleep 3
# smoke: require from same path site-api uses
/root/.nvm/versions/node/v22.22.2/bin/node -e "process.chdir('/opt/bot'); require('canvas'); console.log('site-api node canvas OK');"
pm2 logs site-api --err --lines 8 --nostream | tail -15 || true
