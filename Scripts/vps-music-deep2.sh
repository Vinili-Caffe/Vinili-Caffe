#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== bots-ts .env situation ==="
ls -la /opt/bot/bots-ts/.env /opt/bot/.env /opt/bot/bots-ts/ecosystem.config.cjs 2>&1 | head -20
ls -la /opt/bot/ | head -30

# Run wait-for check with /opt/bot/.env only
node <<'NODE'
const fs=require("fs");
const net=require("net");
function load(p){const o={}; if(!fs.existsSync(p)) return o;
  for(const line of fs.readFileSync(p,"utf8").split(/\n/)){
  const t=line.trim(); if(!t||t.startsWith("#")) continue; const eq=t.indexOf("="); if(eq<1) continue;
  let v=t.slice(eq+1).trim().replace(/\r/g,"");
  if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  o[t.slice(0,eq).trim()]=v;
} return o;}
const env=load("/opt/bot/.env");
const raw=(env.LAVALINK_HOST||"127.0.0.1:2333").trim().replace(/^https?:\/\//i,"");
const lastColon=raw.lastIndexOf(":");
const host=lastColon>0?raw.slice(0,lastColon):raw;
const port=parseInt(lastColon>0?raw.slice(lastColon+1):"2333",10)||2333;
const password=env.LAVALINK_PASSWORD||"youshallnotpass";
(async()=>{
  const tcp=await new Promise((resolve)=>{
    const socket=net.connect({host,port});
    let settled=false; const finish=(ok)=>{ if(settled)return; settled=true; try{socket.destroy()}catch(_){}; resolve(ok); };
    socket.setTimeout(5000);
    socket.on("connect",()=>finish(true));
    socket.on("error",(e)=>{console.log("tcp_error_detail",e.message); finish(false);});
    socket.on("timeout",()=>finish(false));
  });
  let http=false, status=null, body="";
  try{
    const res=await fetch(`http://${host}:${port}/version`,{headers:{Authorization:password}});
    status=res.status; body=await res.text(); http=Boolean(res.ok);
  }catch(e){ status=String(e.message); }
  console.log(JSON.stringify({host,port,tcp,http,status,body:body.slice(0,40),passLen:password.length,musicLogs:env.MUSIC_LOGS}));
})();
NODE

# symlink bots-ts/.env -> /opt/bot/.env so ecosystem always loads it
if [ ! -e /opt/bot/bots-ts/.env ]; then
  ln -s /opt/bot/.env /opt/bot/bots-ts/.env
  echo "created symlink bots-ts/.env -> /opt/bot/.env"
fi

set -a; . /opt/bot/.env; set +a
cd /opt/bot/bots-ts
node <<'NODE'
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URL);
const col=mongoose.connection.db.collection("botstates");
const gid="1329080093599076474";
const sw=await col.findOne({key:"moduleSwitches.v1"});
const val=sw?.value;
console.log("switches_type", typeof val, Array.isArray(val));
if (val && typeof val==="object") {
  console.log("has_gid", Object.prototype.hasOwnProperty.call(val,gid));
  console.log("gid_val", JSON.stringify(val[gid]||null));
  // search vocale
  const raw=JSON.stringify(val);
  const idx=raw.indexOf("vocale");
  console.log("vocale_in_blob", idx>=0, idx>=0?raw.slice(Math.max(0,idx-40), idx+60):"");
}
await col.updateOne(
  {key:"musicAlwaysOn.wake.v1"},
  {$set:{value:[gid], updatedAt:new Date()}},
  {upsert:true}
);
console.log("wake set");
await mongoose.disconnect();
NODE

# Check if alwaysOn code exists on VPS
echo "=== deployed alwaysOn files ==="
ls -la /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js 2>&1 | head -5
grep -n 'startAlwaysOnWatcher\|alwaysOn playing\|listAlwaysOnGuildIds' /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js 2>/dev/null | head -10
grep -n 'startAlwaysOnWatcher' /opt/bot/bots-ts/src/shared/music/services/musicEngine.js 2>/dev/null | head -5

# Check lavalink recent auth fails
echo "=== lavalink last 20 lines ==="
tail -n 20 /home/ubuntu/.pm2/logs/lavalink-out-0.log

# Restart with ecosystem so symlink env is loaded
pm2 restart ecosystem.config.cjs --only bots-vinyls
sleep 28

echo "=== live MUSIC_LOGS ==="
pm2 env 5 | grep -E 'MUSIC_LOGS|LAVALINK_HOST|LAVALINK_MUSIC_WAIT' || true

echo "=== out after boot ==="
# find last BOOT line and show after
python3 - <<'PY'
from pathlib import Path
p=Path("/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log")
lines=p.read_text(errors="replace").splitlines()
# last 100
for line in lines[-100:]:
    print(line)
PY

echo "=== err last 20 ==="
tail -n 20 /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
