#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Enable music logs without printing secrets
cd /opt/bot
# Prefer editing bots-ts/.env if present, else /opt/bot/.env
ENVF=""
if [ -f /opt/bot/bots-ts/.env ]; then ENVF=/opt/bot/bots-ts/.env
elif [ -f /opt/bot/.env ]; then ENVF=/opt/bot/.env
fi

if [ -n "$ENVF" ]; then
  if grep -q '^MUSIC_LOGS=' "$ENVF"; then
    sed -i 's/^MUSIC_LOGS=.*/MUSIC_LOGS=1/' "$ENVF"
  else
    echo 'MUSIC_LOGS=1' >> "$ENVF"
  fi
  echo "MUSIC_LOGS set in $ENVF -> $(grep '^MUSIC_LOGS=' "$ENVF")"
fi

# Also force via pm2 ecosystem reload: restart with env from file
# ecosystem loads bots-ts/.env into botEnvFromFile
pm2 restart bots-vinyls --update-env
sleep 20

echo "=== fresh out log (last 80) ==="
tail -n 80 /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log

echo "=== fresh err log (last 40) ==="
tail -n 40 /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log

echo "=== alwaysOn / MUSIC / lavalink lines ==="
grep -iE 'alwaysOn|\[MUSIC\]|lavalink|Shoukaku|wake' /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log 2>/dev/null | tail -60 || true

# simulate what wait-for does inside node with same env as pm2
set -a; . /opt/bot/.env; set +a
[ -f /opt/bot/bots-ts/.env ] && set -a && . /opt/bot/bots-ts/.env && set +a
node <<'NODE'
const net = require("net");
const raw = (process.env.LAVALINK_HOST || "127.0.0.1:2333").trim().replace(/^https?:\/\//i, "");
const lastColon = raw.lastIndexOf(":");
const host = lastColon > 0 ? raw.slice(0, lastColon) : raw;
const port = parseInt(lastColon > 0 ? raw.slice(lastColon + 1) : "2333", 10) || 2333;
const password = process.env.LAVALINK_PASSWORD || "youshallnotpass";
console.log("sim host", host, "port", port, "passLen", password.length);
await new Promise((resolve) => {
  const socket = net.connect({ host, port });
  socket.setTimeout(5000);
  socket.on("connect", () => { console.log("tcp_ok"); socket.destroy(); resolve(); });
  socket.on("error", (e) => { console.log("tcp_err", e.message); resolve(); });
  socket.on("timeout", () => { console.log("tcp_timeout"); socket.destroy(); resolve(); });
});
try {
  const res = await fetch(`http://${host}:${port}/version`, { headers: { Authorization: password } });
  console.log("http", res.status, await res.text().then(t=>t.slice(0,40)));
} catch (e) {
  console.log("http_err", e.message);
}
NODE
