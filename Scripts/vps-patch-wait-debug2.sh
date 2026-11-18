#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

python3 - <<'PY'
from pathlib import Path
p = Path("/opt/bot/bots-ts/src/wait-for-lavalink.js")
text = p.read_text()
old = '''async function check() {
  if (!await checkTcp()) return false;
  return checkHttpReady();
}'''
new = '''async function check() {
  const tcpOk = await checkTcp();
  if (!tcpOk) {
    if (!global.__llDbgTcp) {
      global.__llDbgTcp = true;
      console.warn("[wait-for-lavalink] DEBUG tcp fail host="+host+" port="+port+" passLen="+String(process.env.LAVALINK_PASSWORD||"").length+" rawHost="+String(process.env.LAVALINK_HOST||""));
    }
    return false;
  }
  const httpOk = await checkHttpReady();
  if (!httpOk) {
    if (!global.__llDbgHttp) {
      global.__llDbgHttp = true;
      console.warn("[wait-for-lavalink] DEBUG http fail host="+host+" port="+port+" passLen="+String(process.env.LAVALINK_PASSWORD||"").length);
    }
    return false;
  }
  if (!global.__llDbgOk) {
    global.__llDbgOk = true;
    console.warn("[wait-for-lavalink] DEBUG lavalink OK host="+host+" port="+port);
  }
  return true;
}'''
if old not in text:
    print("STILL_MISSING")
    idx = text.find("async function check()")
    print(repr(text[idx:idx+220]))
else:
    p.write_text(text.replace(old, new, 1))
    print("WAIT_PATCHED")
PY

python3 - <<'PY'
from pathlib import Path
p = Path("/opt/bot/bots-ts/src/shared/music/services/musicEngine.js")
text = p.read_text()
old = '''if (!ready.ok) {
    client._shoukakuInitPending = false;
    return;
  }'''
new = '''if (!ready.ok) {
    client._shoukakuInitPending = false;
    global.logger?.warn?.("[MUSIC] Lavalink non pronto dopo wait", { host: ready.host, port: ready.port, waitedMs: ready.waitedMs });
    return;
  }'''
if old not in text:
    print("ENGINE_MISS")
    idx = text.find("if (!ready.ok)")
    print(repr(text[idx:idx+160]))
else:
    p.write_text(text.replace(old, new, 1))
    print("ENGINE_PATCHED")
PY

# also patch join fail in alwaysOn compiled form
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js")
text = p.read_text()
# find join fail block
idx = text.find('alwaysOn join fail')
print("join_idx", idx)
print(repr(text[idx-80:idx+220]))
# inject warn after logMusic join fail if not already
if 'alwaysOn join fail' in text and '[MUSIC] alwaysOn join fail' not in text:
    text = text.replace(
        'logMusic("alwaysOn join fail", {',
        'global.logger?.warn?.("[MUSIC] alwaysOn join fail", { guildId: gid, err: err?.message || err });\n        logMusic("alwaysOn join fail", {',
        1,
    )
    p.write_text(text)
    print("JOIN_WARN_ADDED")
else:
    print("JOIN_ALREADY_OR_MISS")
PY

# wake + restart
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

OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
ERR=/home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
OP=$(wc -l < "$OUT"); EP=$(wc -l < "$ERR")
pm2 restart bots-vinyls --update-env
sleep 40
echo "=== NEW OUT ==="
tail -n +$((OP+1)) "$OUT" | tail -100
echo "=== NEW ERR ==="
tail -n +$((EP+1)) "$ERR" | tail -40
echo "=== MUSIC FILTER ==="
{ tail -n +$((OP+1)) "$OUT"; tail -n +$((EP+1)) "$ERR"; } | grep -iE 'MUSIC|alwaysOn|Shoukaku|DEBUG|lavalink' || echo none
