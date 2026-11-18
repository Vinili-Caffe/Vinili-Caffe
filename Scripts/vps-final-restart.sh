#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd /opt/bot/bots-ts/src
node -e 'require("./shared/music/services/musicAlwaysOnCatalog.js"); require("./shared/music/services/musicAlwaysOn.js"); require("./shared/music/services/musicEngine.js"); console.log("all require ok")'

# ensure catalog has no _module
grep -n '_module\.exports\|module\.exports' /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOnCatalog.js | tail -5

set -a; . /opt/bot/.env; set +a
cd /opt/bot/bots-ts
node <<'NODE'
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URL);
await mongoose.connection.db.collection("botstates").updateOne(
  {key:"musicAlwaysOn.wake.v1"},
  {$set:{value:["1329080093599076474"],updatedAt:new Date()}},
  {upsert:true}
);
console.log("wake");
await mongoose.disconnect();
NODE

pm2 restart bots-vinyls --update-env
sleep 30
echo "=== status ==="
pm2 describe bots-vinyls | grep -E 'status|uptime|restarts' | head -8
echo "=== recent music lines ==="
tail -n 80 /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log | grep -iE 'MUSIC|alwaysOn|FAIL|watcher' || echo '(no err music)'
tail -n 40 /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log | grep -iE 'BOOT|MUSIC|alwaysOn' || true
