#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# ensure wake pending
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
console.log("wake ok");
await mongoose.disconnect();
NODE

# mark log position
OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
ERR=/home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
OUT_POS=$(wc -l < "$OUT")
ERR_POS=$(wc -l < "$ERR")
echo "markers out=$OUT_POS err=$ERR_POS uptime=$(pm2 jlist | node -e 'let d=\"\";process.stdin.on(\"data\",c=>d+=c);process.stdin.on(\"end\",()=>{const a=JSON.parse(d);const v=a.find(x=>x.name===\"bots-vinyls\");console.log(v?.pm2_env?.status, v?.pm2_env?.pm_uptime, Date.now()-(v?.pm2_env?.pm_uptime||0));})')"

echo "sleeping 45s for music init + alwaysOn tick..."
sleep 45

echo "=== NEW out lines ==="
tail -n +$((OUT_POS+1)) "$OUT" | tail -120
echo "=== NEW err lines ==="
tail -n +$((ERR_POS+1)) "$ERR" | tail -40

echo "=== filter music ==="
{ tail -n +$((OUT_POS+1)) "$OUT"; tail -n +$((ERR_POS+1)) "$ERR"; } | grep -iE 'MUSIC|alwaysOn|Shoukaku|lavalink|wake|join' || echo "(no music lines)"

# also check if wait-for child thinks ready by sampling process env of child? skip
# force trigger: inspect getConfig path via node requiring deployed module
node <<'NODE'
import { createRequire } from "module";
const require = createRequire("/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js");
// just listAlwaysOn via voiceRuntime
const VR = require("/opt/bot/bots-ts/src/MultiGuild/services/voiceRuntime.js");
const ids = await VR.listAlwaysOnGuildIds(true);
console.log("listAlwaysOnGuildIds", ids);
const cfg = await VR.getConfig("1329080093599076474", true);
console.log("cfg.alwaysOn", JSON.stringify(cfg.music.alwaysOn));
NODE
