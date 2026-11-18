#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# load bot env
set -a
[ -f /opt/bot/bots-ts/.env ] && . /opt/bot/bots-ts/.env
[ -f /opt/bot/.env ] && . /opt/bot/.env
set +a

echo "HOST=${LAVALINK_HOST:-unset}"
echo "PORT=${LAVALINK_PORT:-unset}"
echo "PASS_LEN=${#LAVALINK_PASSWORD}"
echo "PASS_SET=$([ -n "${LAVALINK_PASSWORD:-}" ] && echo yes || echo no)"

# lavalink server password from application.yml / .env.lavalink (length only)
if [ -f /opt/bot/Lavalink/.env.lavalink ]; then
  echo "lavalink_env_keys=$(grep -E '^(LAVALINK_|SERVER_|PASSWORD)' /opt/bot/Lavalink/.env.lavalink | sed 's/=.*/=***/')"
fi
if [ -f /opt/bot/Lavalink/application.yml ]; then
  echo "=== application.yml password lines ==="
  grep -nE 'password|server:|port:' /opt/bot/Lavalink/application.yml | head -20
fi
if [ -f /opt/bot/bots-ts/Lavalink/application.yml ]; then
  echo "=== bots-ts application.yml ==="
  grep -nE 'password|server:|port:' /opt/bot/bots-ts/Lavalink/application.yml | head -20
fi

PASS="${LAVALINK_PASSWORD:-youshallnotpass}"
HOST="${LAVALINK_HOST:-127.0.0.1}"
PORT="${LAVALINK_PORT:-2333}"

echo "=== curl /version with bot password ==="
code=$(curl -s -o /tmp/ll-ver.txt -w "%{http_code}" -H "Authorization: $PASS" "http://${HOST}:${PORT}/version" || echo fail)
echo "HTTP $code body=$(head -c 80 /tmp/ll-ver.txt 2>/dev/null || true)"

echo "=== curl /version wrong pass ==="
code2=$(curl -s -o /tmp/ll-ver2.txt -w "%{http_code}" -H "Authorization: wrong" "http://${HOST}:${PORT}/version" || echo fail)
echo "HTTP $code2"

echo "=== tcp ==="
timeout 2 bash -c "echo >/dev/tcp/${HOST}/${PORT}" && echo tcp_ok || echo tcp_fail

echo "=== recent vinyls wait-for / MUSIC ==="
pm2 logs bots-vinyls --lines 40 --nostream 2>/dev/null | tail -40

echo "=== probe from wait-for module if present ==="
node -e '
const http=require("http");
const host=process.env.LAVALINK_HOST||"127.0.0.1";
const port=Number(process.env.LAVALINK_PORT||2333);
const pass=process.env.LAVALINK_PASSWORD||"youshallnotpass";
const req=http.get({host,port,path:"/version",headers:{Authorization:pass},timeout:3000},res=>{
  let d=""; res.on("data",c=>d+=c); res.on("end",()=>console.log("probe",res.statusCode,d.slice(0,60)));
});
req.on("error",e=>console.log("probe_err",e.message));
'
