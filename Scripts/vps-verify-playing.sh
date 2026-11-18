#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# brief music logs
sed -i 's/^MUSIC_LOGS=.*/MUSIC_LOGS=1/' /opt/bot/.env
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
await mongoose.disconnect();
NODE

OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
OP=$(wc -l < "$OUT")
EP=$(wc -l < /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log)
pm2 restart bots-vinyls --update-env
sleep 40
echo "=== NEW music ==="
{ tail -n +$((OP+1)) "$OUT"; tail -n +$((EP+1)) /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log; } | grep -iE 'alwaysOn|watcher start|FAIL|Catalog|_module' || echo none

# lavalink recent voice?
echo "=== lavalink recent ==="
tail -n 15 /home/ubuntu/.pm2/logs/lavalink-out-0.log | grep -iE 'guild|player|track|rds|error|connected' || tail -n 5 /home/ubuntu/.pm2/logs/lavalink-out-0.log

# back to quiet
sed -i 's/^MUSIC_LOGS=.*/MUSIC_LOGS=0/' /opt/bot/.env
pm2 restart bots-vinyls --update-env
echo done
