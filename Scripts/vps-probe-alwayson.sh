#!/usr/bin/env bash
set -eu
export PATH="/usr/local/bin:/usr/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"
command -v pm2 >/dev/null 2>&1 || export PATH="$(dirname $(readlink -f $(which node 2>/dev/null) 2>/dev/null) 2>/dev/null):$PATH"
# source bot env without printing secrets
set -a
# prefer bots-ts/.env then /opt/bot/.env
if [ -f /opt/bot/bots-ts/.env ]; then . /opt/bot/bots-ts/.env; fi
if [ -f /opt/bot/.env ]; then . /opt/bot/.env; fi
set +a

echo "URI_KEY=$( [ -n \"${MONGO_URL:-}\" ] && echo MONGO_URL || echo MISSING )"
echo "URI_HAS_AUTH=$( node -e 'const u=process.env.MONGO_URL||\"\"; console.log(/:\\/\\/[^:\\/]+:[^@\\/]+@/.test(u)?\"yes\":\"no\")' )"

cd /opt/bot/bots-ts
node <<'NODE'
import mongoose from "mongoose";

const uri = process.env.MONGO_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error("NO_MONGO_URL");
  process.exit(2);
}
await mongoose.connect(uri);
const col = mongoose.connection.db.collection("botstates");

const legacy = await col.findOne({ key: "multiGuildVoice.v1" });
console.log("legacy_voice", Boolean(legacy), "guilds", legacy?.value ? Object.keys(legacy.value).length : 0);
if (legacy?.value && typeof legacy.value === "object") {
  for (const [gid, cfg] of Object.entries(legacy.value)) {
    const a = cfg?.music?.alwaysOn;
    console.log("guild", gid, "alwaysOn", JSON.stringify(a || null), "musicOn", cfg?.music?.enabled);
  }
}

const wake = await col.findOne({ key: "musicAlwaysOn.wake.v1" });
console.log("wake", JSON.stringify(wake?.value ?? null));

// also check BotState alternate collections
const names = await mongoose.connection.db.listCollections().toArray();
console.log("collections_with_state", names.map(n=>n.name).filter(n=>/state|voice|bot/i.test(n.name)).slice(0,30));

await mongoose.disconnect();
NODE

echo "=== pm2 ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
pm2 describe bots-vinyls 2>/dev/null | head -40 || /usr/bin/pm2 describe bots-vinyls 2>/dev/null | head -40 || true
echo "=== logs ==="
(pm2 logs bots-vinyls --lines 120 --nostream 2>/dev/null || true) | grep -iE 'alwaysOn|lavalink|Shoukaku|wake|MUSIC|join fail|wait lavalink|alwaysOn' | tail -80 || true
