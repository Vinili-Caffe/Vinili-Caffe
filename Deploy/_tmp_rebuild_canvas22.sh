#!/bin/bash
set -euo pipefail
export NVM_DIR="/root/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
cd /opt/bot
rm -rf node_modules/canvas
npm install canvas@2.11.2 --no-fund --no-audit --build-from-source
node -e "require('canvas'); console.log('canvas OK', require.resolve('canvas'));"
pm2 restart site-api --update-env
sleep 2
echo DONE
