#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="/home/ubuntu/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "== wait-for-lavalink + ecosystem args =="
node - <<'NODE'
const eco = require('/opt/bot/ecosystem.config.cjs');
for (const a of eco.apps || []) {
  if (!/bots-coffee|bots-vinyls/.test(a.name)) continue;
  console.log(JSON.stringify({
    name: a.name,
    script: a.script,
    cwd: a.cwd,
    args: a.args,
    node_args: a.node_args,
    envBOT: a.env && (a.env.BOT_NAME || a.env.BOT || a.env.APP_NAME || a.env.VC_BOT),
    envSelected: a.env && Object.fromEntries(Object.entries(a.env).filter(([k]) => /BOT|TOKEN|NAME|KIND|ROLE|APP/i.test(k)).slice(0,20)),
  }, null, 2));
}
NODE
sed -n '1,120p' /opt/bot/wait-for-lavalink.js
echo "----"
sed -n '1,80p' /opt/bot/loader.js

echo "== which messageCreate is loaded from bots-ts =="
find /opt/bot/bots-ts/src -name 'messageCreate.js' | head -20
grep -Rsn "handleVoiceTranscriptionMessage" /opt/bot/bots-ts/src --include='*.js' | head -40

echo "== coffee vs ca bot packages =="
ls /opt/bot/bots-ts/src
ls /opt/bot/bots-ts/src/Caffe 2>/dev/null || ls /opt/bot/bots-ts/src/Coffee 2>/dev/null || true
find /opt/bot/bots-ts/src -maxdepth 3 -type d -iname '*caff*' -o -iname '*coffee*' 2>/dev/null | head

echo "== pm2 show script args =="
pm2 describe bots-coffee | sed -n '1,80p'
echo '===='
pm2 describe bots-vinyls | sed -n '1,80p'

echo "== last coffee logs any error =="
pm2 logs bots-coffee --lines 100 --nostream 2>/dev/null | tail -60
echo '==== vinyls ===='
pm2 logs bots-vinyls --lines 100 --nostream 2>/dev/null | tail -40
