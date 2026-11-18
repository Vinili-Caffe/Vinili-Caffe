#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# syntax check patched files
node --check /opt/bot/bots-ts/src/shared/music/services/musicEngine.js && echo engine_syntax_ok
node --check /opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js && echo ao_syntax_ok
node --check /opt/bot/bots-ts/src/wait-for-lavalink.js && echo wait_syntax_ok

# show musicEngine ready.ok block
python3 - <<'PY'
from pathlib import Path
t=Path('/opt/bot/bots-ts/src/shared/music/services/musicEngine.js').read_text()
i=t.find('waitUntilLavalinkReady')
print(t[i:i+700])
print('---')
i=t.find('function initLavalinkMusicIfEnabled')
print(t[i:i+500])
PY

# inject console.warn at start of init (undeniable)
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/bot/bots-ts/src/shared/music/services/musicEngine.js')
t=p.read_text()
needle='function initLavalinkMusicIfEnabled(client) {\n  if (client._shoukakuInitPending) return;'
# compiled may use __name
import re
m=re.search(r'function initLavalinkMusicIfEnabled\(client\) \{\n', t)
if not m:
    print('NO_INIT_FN'); print(t[t.find('initLavalink'):t.find('initLavalink')+200]); raise SystemExit(1)
insert_at=m.end()
if 'MUSIC INIT ENTER' in t:
    print('already instrumented')
else:
    t=t[:insert_at]+'  console.warn("[MUSIC] INIT ENTER", { pending: Boolean(client?._shoukakuInitPending), done: Boolean(client?._shoukakuInitDone), enabled: process.env.MUSIC_ENABLED });\n'+t[insert_at:]
    p.write_text(t)
    print('instrumented')
PY

# also after wait result
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/bot/bots-ts/src/shared/music/services/musicEngine.js')
t=p.read_text()
old='const ready = await waitUntilLavalinkReady({});'
new='const ready = await waitUntilLavalinkReady({});\n  console.warn("[MUSIC] WAIT RESULT", ready);'
if 'WAIT RESULT' in t:
    print('wait already')
elif old in t:
    p.write_text(t.replace(old,new,1)); print('wait instrumented')
else:
    print('wait needle miss')
PY

echo "MUSIC_ENABLED / logs from pm2:"
pm2 env 5 | grep -E 'MUSIC_|LAVALINK_ALREADY|LAVALINK_MUSIC' || true

OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
ERR=/home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
OP=$(wc -l < "$OUT"); EP=$(wc -l < "$ERR")
pm2 restart bots-vinyls --update-env
sleep 35
echo "=== NEW ==="
{ tail -n +$((OP+1)) "$OUT"; tail -n +$((EP+1)) "$ERR"; } | grep -iE 'MUSIC|DEBUG|alwaysOn|Shoukaku|INIT|WAIT RESULT' || echo 'still none'
echo "=== raw new out last 40 ==="
tail -n +$((OP+1)) "$OUT" | tail -40
echo "=== raw new err last 20 ==="
tail -n +$((EP+1)) "$ERR" | tail -20
