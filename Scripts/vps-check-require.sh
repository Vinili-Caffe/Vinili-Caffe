#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== exports ==="
grep -n '_module\|module.exports' /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOnCatalog.js | tail -10
grep -n '_module\|module.exports' /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js | tail -5

echo "=== require ==="
cd /opt/bot/bots-ts/src
node -e 'require("./shared/music/services/musicAlwaysOn.js"); console.log("alwaysOn ok")'

echo "=== MUSIC_LOGS ==="
grep MUSIC_LOGS /opt/bot/.env || true
pm2 env 5 | grep MUSIC_LOGS || true

echo "=== force MUSIC_LOGS=1 + wake + restart, wait 50s ==="
sed -i 's/^MUSIC_LOGS=.*/MUSIC_LOGS=1/' /opt/bot/.env
# also ensure symlink
[ -L /opt/bot/bots-ts/.env ] || ln -sf /opt/bot/.env /opt/bot/bots-ts/.env

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
console.log("cfg", JSON.stringify(doc?.value?.["1329080093599076474"]?.music?.alwaysOn));
await mongoose.disconnect();
NODE

# reload ecosystem so env file is re-read into pm2
cd /opt/bot/bots-ts
pm2 restart ecosystem.config.cjs --only bots-vinyls
sleep 5
pm2 env 5 | grep MUSIC_LOGS || true

OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
ERR=/home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
OP=$(wc -l < "$OUT"); EP=$(wc -l < "$ERR")
sleep 45
echo "=== NEW ==="
{ tail -n +$((OP+1)) "$OUT"; tail -n +$((EP+1)) "$ERR"; } | tee /tmp/music-new.txt | grep -iE 'alwaysOn|MUSIC|watcher|FAIL|BOOT|Lavalink' || echo none
echo "=== count playing ==="
grep -c 'alwaysOn playing' /tmp/music-new.txt || true

sed -i 's/^MUSIC_LOGS=.*/MUSIC_LOGS=0/' /opt/bot/.env
