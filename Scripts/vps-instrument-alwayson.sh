#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

python3 - <<'PY'
from pathlib import Path
import re

# musicEngine: log after watcher start
p = Path('/opt/bot/bots-ts/src/shared/music/services/musicEngine.js')
t = p.read_text()
if 'ALWAYS_ON_WATCHER_STARTED' not in t:
    t2 = t.replace(
        'startAlwaysOnWatcher(client);\n      }',
        'startAlwaysOnWatcher(client);\n        console.warn("[MUSIC] ALWAYS_ON_WATCHER_STARTED");\n      }',
        1,
    )
    if t2 == t:
        print('watcher start needle miss')
    else:
        p.write_text(t2); print('watcher log ok')
else:
    print('watcher log already')

# musicAlwaysOn: instrument early returns in ensureAlwaysOnForGuild
p = Path('/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js')
t = p.read_text()
# find ensureAlwaysOnForGuild and add logs at key early exits
replacements = []

def add_after(old, msg, already_key):
    global t
    if already_key in t:
        return False
    if old not in t:
        print('MISS', msg, repr(old[:80]))
        return False
    t = t.replace(old, old + f'\n    console.warn("[MUSIC] alwaysOn skip: {msg}", {{ guildId: gid }});', 1)
    return True

# coffee
if 'alwaysOn skip: coffee' not in t:
    old = 'if (getMusicBotHooks()?.profile === "coffee") return false;'
    if old in t:
        t = t.replace(old, 'if (getMusicBotHooks()?.profile === "coffee") { console.warn("[MUSIC] alwaysOn skip: coffee"); return false; }', 1)
        print('coffee ok')
    else:
        print('coffee miss', t[t.find('getMusicBotHooks'):t.find('getMusicBotHooks')+120] if 'getMusicBotHooks' in t else 'no hooks')

# no always config
if 'alwaysOn skip: disabled' not in t:
    old = 'if (!always?.enabled || !always.voiceChannelId) return false;'
    if old in t:
        t = t.replace(old, 'if (!always?.enabled || !always.voiceChannelId) { console.warn("[MUSIC] alwaysOn skip: disabled", { guildId: gid, always }); return false; }', 1)
        print('disabled ok')
    else:
        print('disabled miss')

# module off
if 'alwaysOn skip: module_off' not in t:
    old = 'if (MS.moduleExists(gid, "vocale") && !MS.isModuleOn(gid, "vocale")) return false;'
    if old in t:
        t = t.replace(old, 'if (MS.moduleExists(gid, "vocale") && !MS.isModuleOn(gid, "vocale")) { console.warn("[MUSIC] alwaysOn skip: module_off", { guildId: gid }); return false; }', 1)
        print('module ok')
    else:
        print('module miss')

# no target
if 'alwaysOn skip: no_target' not in t:
    old = 'if (!target) return false;'
    # may match multiple - only first after resolveAlwaysOnPlayTarget
    idx = t.find('resolveAlwaysOnPlayTarget')
    chunk = t[idx:idx+200]
    if 'if (!target) return false;' in chunk:
        t = t[:idx] + chunk.replace('if (!target) return false;', 'if (!target) { console.warn("[MUSIC] alwaysOn skip: no_target", { guildId: gid, always }); return false; }', 1) + t[idx+200:]
        print('target ok')
    else:
        print('target miss', repr(chunk))

# user music
if 'alwaysOn skip: user_music' not in t:
    old = 'if (sessionHasUserMusic(session)) return false;'
    if old in t:
        t = t.replace(old, 'if (sessionHasUserMusic(session)) { console.warn("[MUSIC] alwaysOn skip: user_music", { guildId: gid }); return false; }', 1)
        print('user_music ok')
    else:
        print('user_music miss')

# tickAlwaysOn log ids
if 'alwaysOn tick ids' not in t:
    old = 'ids = await listAlwaysOnGuildIds(true);'
    if old in t:
        t = t.replace(old, 'ids = await listAlwaysOnGuildIds(true);\n    console.warn("[MUSIC] alwaysOn tick ids", ids);', 1)
        print('tick ids ok')
    else:
        print('tick ids miss')

# drain wakes log
if 'alwaysOn drain wakes' not in t:
    old = 'list = Array.isArray(prev) ? prev.map(String).filter(Boolean) : [];'
    # too generic - find in drainAlwaysOnWakes
    idx = t.find('async function drainAlwaysOnWakes')
    if idx>=0:
        sub = t[idx:idx+600]
        needle = 'list = Array.isArray(prev) ? prev.map(String).filter(Boolean) : [];'
        if needle in sub:
            t = t[:idx] + sub.replace(needle, needle + '\n    console.warn("[MUSIC] alwaysOn drain wakes", list);', 1) + t[idx+600:]
            print('drain ok')
        else:
            print('drain needle miss', repr(sub[200:400]))
    else:
        print('drain fn miss')

p.write_text(t)
print('alwaysOn file written', len(t))
PY

node --check /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js && echo ao_ok
node --check /opt/bot/bots-ts/src/shared/music/services/musicEngine.js && echo eng_ok

set -a; . /opt/bot/.env; set +a
cd /opt/bot/bots-ts
node <<'NODE'
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URL);
const col = mongoose.connection.db.collection("botstates");
const gid="1329080093599076474";
const doc = await col.findOne({key:"multiGuildVoice.v1"});
console.log("mongo alwaysOn", JSON.stringify(doc?.value?.[gid]?.music?.alwaysOn));
await col.updateOne({key:"musicAlwaysOn.wake.v1"},{$set:{value:[gid],updatedAt:new Date()}},{upsert:true});
console.log("wake set");
await mongoose.disconnect();
NODE

OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
ERR=/home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
OP=$(wc -l < "$OUT"); EP=$(wc -l < "$ERR")
pm2 restart bots-vinyls --update-env
echo "waiting 55s..."
sleep 55
echo "=== FILTER ==="
{ tail -n +$((OP+1)) "$OUT"; tail -n +$((EP+1)) "$ERR"; } | grep -iE 'MUSIC|alwaysOn|DEBUG|Shoukaku' || echo none
