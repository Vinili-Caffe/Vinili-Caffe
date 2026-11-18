#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
set -a
[ -f /opt/bot/bots-ts/.env ] && . /opt/bot/bots-ts/.env
[ -f /opt/bot/.env ] && . /opt/bot/.env
set +a

# parse host:port
RAW="${LAVALINK_HOST:-127.0.0.1:2333}"
RAW="${RAW#http://}"; RAW="${RAW#https://}"
if [[ "$RAW" == *:* ]]; then
  HOST="${RAW%:*}"; PORT="${RAW##*:}"
else
  HOST="$RAW"; PORT="${LAVALINK_PORT:-2333}"
fi
PASS="${LAVALINK_PASSWORD:-youshallnotpass}"

echo "parsed host=$HOST port=$PORT pass_len=${#PASS}"
echo "tcp:"; timeout 2 bash -c "echo >/dev/tcp/$HOST/$PORT" && echo ok || echo fail
echo "http:"; curl -s -o /tmp/ll.txt -w "HTTP %{http_code}\n" -H "Authorization: $PASS" "http://$HOST:$PORT/version"; head -c 100 /tmp/ll.txt; echo

echo "=== yml pass vs env ==="
YML_PASS=$(grep -E 'password:' /opt/bot/Lavalink/application.yml | head -1 | sed -E 's/.*password:[[:space:]]*"?([^"]*)"?.*/\1/')
echo "yml_len=${#YML_PASS} env_len=${#PASS} match=$([ "$YML_PASS" = "$PASS" ] && echo YES || echo NO)"

cd /opt/bot/bots-ts
node <<'NODE'
import mongoose from "mongoose";
const uri = process.env.MONGO_URL;
await mongoose.connect(uri);
const col = mongoose.connection.db.collection("botstates");
const gid = "1329080093599076474";
await col.updateOne(
  { key: "musicAlwaysOn.wake.v1" },
  { $set: { value: [gid], updatedAt: new Date() } },
  { upsert: true }
);
const wake = await col.findOne({ key: "musicAlwaysOn.wake.v1" });
console.log("wake_set", JSON.stringify(wake?.value));

// module switches vocale?
const blobs = await col.findOne({ key: "multiGuildVoice.v1" });
console.log("alwaysOn", JSON.stringify(blobs?.value?.[gid]?.music?.alwaysOn));

// find module switch keys
const keys = await col.find({ key: /module|switch|vocale/i }).project({ key: 1 }).limit(20).toArray();
console.log("switchish_keys", keys.map(k=>k.key));

await mongoose.disconnect();
NODE

echo "=== MUSIC env on vinyls ==="
pm2 env 5 2>/dev/null | grep -iE 'LAVALINK|MUSIC|LOADER' | sed 's/\(PASSWORD=\).*/\1***/' | head -40

echo "=== force MUSIC_LOGS=1 restart vinyls ==="
# set via pm2 restart with env update temporarily
pm2 restart bots-vinyls --update-env
sleep 8
pm2 logs bots-vinyls --lines 60 --nostream 2>/dev/null | grep -iE 'lavalink|Shoukaku|alwaysOn|MUSIC|ready|wake|join' | tail -50
