#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== which .env has MUSIC/LAVALINK ==="
for f in /opt/bot/.env /opt/bot/bots-ts/.env; do
  echo "-- $f"
  [ -f "$f" ] || { echo missing; continue; }
  grep -E '^(MUSIC_LOGS|LAVALINK_HOST|LAVALINK_PASSWORD|LAVALINK_PORT|LAVALINK_MUSIC_WAIT)=' "$f" | sed 's/\(PASSWORD=\).*/\1***/'
done

# ensure MUSIC_LOGS=1 in BOTH env files
for f in /opt/bot/.env /opt/bot/bots-ts/.env; do
  [ -f "$f" ] || continue
  if grep -q '^MUSIC_LOGS=' "$f"; then sed -i 's/^MUSIC_LOGS=.*/MUSIC_LOGS=1/' "$f"
  else echo 'MUSIC_LOGS=1' >> "$f"; fi
done

# dump password equality without printing
node <<'NODE'
const fs=require("fs");
function load(p){const o={}; if(!fs.existsSync(p)) return o;
  for(const line of fs.readFileSync(p,"utf8").split(/\n/)){
    const t=line.trim(); if(!t||t.startsWith("#")) continue; const eq=t.indexOf("="); if(eq<1) continue;
    let v=t.slice(eq+1).trim().replace(/\r/g,"");
    if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    o[t.slice(0,eq).trim()]=v;
  } return o;
}
const a=load("/opt/bot/.env");
const b=load("/opt/bot/bots-ts/.env");
const yml=fs.readFileSync("/opt/bot/Lavalink/application.yml","utf8");
const m=yml.match(/password:\s*"([^"]+)"/);
const yp=m?m[1]:"";
console.log({
  bot_pass_len:(a.LAVALINK_PASSWORD||"").length,
  ts_pass_len:(b.LAVALINK_PASSWORD||"").length,
  yml_pass_len:yp.length,
  bot_eq_yml:a.LAVALINK_PASSWORD===yp,
  ts_eq_yml:b.LAVALINK_PASSWORD===yp,
  bot_host:a.LAVALINK_HOST,
  ts_host:b.LAVALINK_HOST,
  bot_music_logs:a.MUSIC_LOGS,
  ts_music_logs:b.MUSIC_LOGS,
});
NODE

# Run exact wait-for check logic using bots-ts/.env values
node <<'NODE'
const fs=require("fs");
const net=require("net");
function load(p){const o={}; for(const line of fs.readFileSync(p,"utf8").split(/\n/)){
  const t=line.trim(); if(!t||t.startsWith("#")) continue; const eq=t.indexOf("="); if(eq<1) continue;
  let v=t.slice(eq+1).trim().replace(/\r/g,"");
  if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  o[t.slice(0,eq).trim()]=v;
} return o;}
const env={...load("/opt/bot/.env"), ...load("/opt/bot/bots-ts/.env")};
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
    socket.on("error",()=>finish(false));
    socket.on("timeout",()=>finish(false));
  });
  let http=false, status=null;
  try{
    const res=await fetch(`http://${host}:${port}/version`,{headers:{Authorization:password}});
    status=res.status; http=Boolean(res.ok);
  }catch(e){ status=String(e.message); }
  console.log({host,port,tcp,http,status,passLen:password.length});
})();
NODE

# module switch vocale for guild
set -a; . /opt/bot/.env; set +a
cd /opt/bot/bots-ts
node <<'NODE'
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URL);
const col=mongoose.connection.db.collection("botstates");
const sw=await col.findOne({key:"moduleSwitches.v1"});
const gid="1329080093599076474";
console.log("moduleSwitches guild", JSON.stringify(sw?.value?.[gid] || sw?.value?.[gid] || null)?.slice?.(0,500) || JSON.stringify(sw?.value)?.slice(0,800));
// also try nested
if (sw?.value && typeof sw.value==="object") {
  const keys=Object.keys(sw.value);
  console.log("switch_top_keys", keys.slice(0,10), "count", keys.length);
  if (sw.value[gid]) console.log("gid_switches", JSON.stringify(sw.value[gid]));
}
await mongoose.disconnect();
NODE

# Re-inject wake + restart vinyls with ecosystem reload so MUSIC_LOGS applies
cd /opt/bot/bots-ts
# set wake
node <<'NODE'
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URL);
await mongoose.connection.db.collection("botstates").updateOne(
  {key:"musicAlwaysOn.wake.v1"},
  {$set:{value:["1329080093599076474"], updatedAt:new Date()}},
  {upsert:true}
);
console.log("wake ok");
await mongoose.disconnect();
NODE

# restart from ecosystem to reload env file
pm2 restart bots-vinyls --update-env
sleep 25
echo "=== MUSIC_LOGS in live process ==="
pm2 env 5 | grep -E '^MUSIC_LOGS|^LAVALINK_HOST|^LAVALINK_MUSIC' || true

echo "=== logs since restart ==="
# take last 100 lines of out after boot marker
tail -n 120 /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log | tail -80
echo "--- err recent ---"
# only lines from last few minutes: just last 15 err lines
tail -n 15 /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
