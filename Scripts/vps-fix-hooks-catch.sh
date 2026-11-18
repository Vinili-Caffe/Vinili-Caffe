#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

python3 - <<'PY'
from pathlib import Path
p=Path('/opt/bot/bots-ts/src/shared/music/services/musicEngine.js')
t=p.read_text()
old='''    try {
      const { getMusicBotHooks } = require("../../music/musicBotHooks");
      if (getMusicBotHooks()?.profile !== "coffee") {
        const { startAlwaysOnWatcher } = require("./musicAlwaysOn");
        startAlwaysOnWatcher(client);
        console.warn("[MUSIC] ALWAYS_ON_WATCHER_STARTED");
      }
    } catch (_) {
    }'''
new='''    try {
      const { getMusicBotHooks } = require("../../music/musicBotHooks");
      const hooks = getMusicBotHooks();
      console.warn("[MUSIC] hooks profile", hooks?.profile);
      if (hooks?.profile !== "coffee") {
        const { startAlwaysOnWatcher } = require("./musicAlwaysOn");
        startAlwaysOnWatcher(client);
        console.warn("[MUSIC] ALWAYS_ON_WATCHER_STARTED");
      } else {
        console.warn("[MUSIC] alwaysOn skipped: coffee profile");
      }
    } catch (err) {
      console.warn("[MUSIC] alwaysOn watcher start FAIL", err?.stack || err?.message || err);
    }'''
if old not in t:
    # try without ALWAYS_ON line
    idx=t.find('SHOUKAKU STEP before hooks')
    print('OLD miss, context:', repr(t[idx:idx+500]))
else:
    p.write_text(t.replace(old,new,1))
    print('catch fixed')
PY

# Also try requiring musicAlwaysOn in isolation
cd /opt/bot/bots-ts/src
node <<'NODE'
try {
  const m = require("./shared/music/services/musicAlwaysOn.js");
  console.log("require alwaysOn ok", Object.keys(m));
} catch (e) {
  console.log("require alwaysOn FAIL", e.stack || e);
}
NODE

node --check /opt/bot/bots-ts/src/shared/music/services/musicEngine.js && echo eng_ok

OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
ERR=/home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
OP=$(wc -l < "$OUT"); EP=$(wc -l < "$ERR")
pm2 restart bots-vinyls --update-env
sleep 35
echo "=== FILTER ==="
{ tail -n +$((OP+1)) "$OUT"; tail -n +$((EP+1)) "$ERR"; } | grep -iE 'MUSIC|alwaysOn|DEBUG|FAIL|hooks|WATCHER' || echo none
