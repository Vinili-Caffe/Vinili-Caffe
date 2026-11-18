#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# keep catalog export healthy
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOnCatalog.js')
t=p.read_text()
nt=t.replace('musicAlwaysOnCatalog_module.exports','module.exports')
if nt!=t:
    p.write_text(nt); print('catalog export fixed again')
else:
    print('catalog export ok')
PY

cd /opt/bot/bots-ts/src
node -e 'require("./shared/music/services/musicAlwaysOn.js"); require("./shared/music/services/musicResume.js"); console.log("require ok")'

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
const doc=await mongoose.connection.db.collection("botstates").findOne({key:"multiGuildVoice.v1"});
console.log("alwaysOn cfg", JSON.stringify(doc?.value?.["1329080093599076474"]?.music?.alwaysOn));
await mongoose.disconnect();
NODE

pm2 restart bots-vinyls --update-env
pm2 restart site-api --update-env
sleep 35
echo "=== recent ==="
tail -n 40 /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log | grep -iE 'BOOT|MUSIC|alwaysOn|resume' || tail -n 15 /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
echo done
