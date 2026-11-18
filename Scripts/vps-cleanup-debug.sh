#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Restore wait-for from bak if present (remove DEBUG)
WF=/opt/bot/bots-ts/src/wait-for-lavalink.js
BAK=$(ls -1t "$WF".bak-alwayson-* 2>/dev/null | head -1 || true)
if [ -n "$BAK" ] && [ -f "$BAK" ]; then
  cp -a "$BAK" "$WF"
  echo "restored wait-for from $BAK"
fi

# MUSIC_LOGS back to 0
for f in /opt/bot/.env /opt/bot/bots-ts/.env; do
  [ -f "$f" ] || continue
  if grep -q '^MUSIC_LOGS=' "$f"; then sed -i 's/^MUSIC_LOGS=.*/MUSIC_LOGS=0/' "$f"
  else echo 'MUSIC_LOGS=0' >> "$f"; fi
done
echo "MUSIC_LOGS=$(grep '^MUSIC_LOGS=' /opt/bot/.env)"

# Keep catalog module.exports fix (already done). Soften alwaysOn/musicEngine debug:
# strip console.warn debug lines we injected, keep functional code.
python3 - <<'PY'
from pathlib import Path
import re

# musicEngine: remove STEP/INIT/WAIT instrumentation console.warns but keep real warn for Lavalink/alwaysOn
p = Path('/opt/bot/bots-ts/src/shared/music/services/musicEngine.js')
t = p.read_text()
# drop debug console.warn lines
t2 = re.sub(r'\n\s*console\.warn\("\[MUSIC\] (INIT ENTER|WAIT RESULT|SHOUKAKU STEP[^"]*|hooks profile|ALWAYS_ON_WATCHER_STARTED|alwaysOn skipped: coffee profile)"[^;]*\);', '', t)
# keep FAIL logger
t2 = t2.replace(
'''    } catch (err) {
      console.warn("[MUSIC] alwaysOn watcher start FAIL", err?.stack || err?.message || err);
    }''',
'''    } catch (err) {
      global.logger?.warn?.("[MUSIC] alwaysOn watcher start:", err?.message || err);
    }'''
)
# remove WAIT RESULT leftover if any
t2 = re.sub(r'\n\s*console\.warn\("\[MUSIC\] WAIT RESULT", ready\);', '', t2)
if t2 != t:
    p.write_text(t2)
    print('musicEngine cleaned', len(t), '->', len(t2))
else:
    print('musicEngine no change')

p = Path('/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js')
t = p.read_text()
t2 = re.sub(r'\n\s*console\.warn\("\[MUSIC\] alwaysOn [^"]*"[^;]*\);', '', t)
# also remove inline coffee/disabled console.warn blocks we added - careful
# restore simple returns for coffee/disabled if we wrapped them
t2 = t2.replace(
  'if (getMusicBotHooks()?.profile === "coffee") { console.warn("[MUSIC] alwaysOn skip: coffee"); return false; }',
  'if (getMusicBotHooks()?.profile === "coffee") return false;'
)
t2 = re.sub(
  r'if \(!always\?\.enabled \|\| !always\.voiceChannelId\) \{ console\.warn\("\[MUSIC\] alwaysOn skip: disabled"[^}]+\} return false; \}',
  'if (!always?.enabled || !always.voiceChannelId) return false;',
  t2
)
t2 = t2.replace(
  'if (MS.moduleExists(gid, "vocale") && !MS.isModuleOn(gid, "vocale")) { console.warn("[MUSIC] alwaysOn skip: module_off", { guildId: gid }); return false; }',
  'if (MS.moduleExists(gid, "vocale") && !MS.isModuleOn(gid, "vocale")) return false;'
)
t2 = t2.replace(
  'if (sessionHasUserMusic(session)) { console.warn("[MUSIC] alwaysOn skip: user_music", { guildId: gid }); return false; }',
  'if (sessionHasUserMusic(session)) return false;'
)
# keep global.logger.warn for join/play/wait - those are useful
if t2 != t:
    p.write_text(t2)
    print('alwaysOn cleaned', len(t), '->', len(t2))
else:
    print('alwaysOn no change')

# verify catalog still good
assert 'module.exports' in Path('/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOnCatalog.js').read_text()
assert 'musicAlwaysOnCatalog_module' not in Path('/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOnCatalog.js').read_text()
print('catalog export ok')
PY

node --check /opt/bot/bots-ts/src/shared/music/services/musicEngine.js
node --check /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js
node --check /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOnCatalog.js
cd /opt/bot/bots-ts/src && node -e 'require("./shared/music/services/musicAlwaysOn.js"); console.log("require ok")'

pm2 restart bots-vinyls --update-env
sleep 25
echo "=== confirm playing ==="
grep -iE 'alwaysOn playing|ALWAYS_ON|watcher start|catalog' /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log | tail -20 || true
# inject wake again after cleanup restart
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
console.log("wake re-set");
await mongoose.disconnect();
NODE
sleep 20
grep -iE 'alwaysOn playing' /home/ubuntu/.pm2/logs/bots-vinyls-out-5.log /home/ubuntu/.pm2/logs/bots-vinyls-error-5.log | tail -10 || echo 'no playing line yet (MUSIC_LOGS=0 ok if bot in channel)'
pm2 describe bots-vinyls | grep -E 'status|uptime|restarts' | head -8
