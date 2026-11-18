#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "=== broken _module.exports files ==="
grep -Rln '_module\.exports' /opt/bot/bots-ts/src --include='*.js' | head -50

echo "=== fix all ==="
# Replace Foo_module.exports with module.exports
python3 - <<'PY'
from pathlib import Path
import re
root = Path('/opt/bot/bots-ts/src')
fixed = []
for p in root.rglob('*.js'):
    t = p.read_text(encoding='utf-8', errors='replace')
    nt = re.sub(r'\b\w+_module\.exports\b', 'module.exports', t)
    if nt != t:
        p.write_text(nt, encoding='utf-8')
        fixed.append(str(p))
print('fixed', len(fixed))
for f in fixed[:40]:
    print(' ', f)
PY

# verify catalog require
cd /opt/bot/bots-ts/src
node <<'NODE'
const cat = require("./shared/music/services/musicAlwaysOnCatalog.js");
console.log("catalog ok", Object.keys(cat), "radios", cat.listItalianRadios()?.length);
const ao = require("./shared/music/services/musicAlwaysOn.js");
console.log("alwaysOn ok", Object.keys(ao));
NODE

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
console.log("wake set");
await mongoose.disconnect();
NODE

OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
ERR=/home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
OP=$(wc -l < "$OUT"); EP=$(wc -l < "$ERR")
pm2 restart bots-vinyls --update-env
# site-api also uses catalog for dashboard
pm2 restart site-api --update-env || true
sleep 45
echo "=== FILTER ==="
{ tail -n +$((OP+1)) "$OUT"; tail -n +$((EP+1)) "$ERR"; } | grep -iE 'MUSIC|alwaysOn|DEBUG|WATCHER|hooks|playing|join|FAIL' || echo none
