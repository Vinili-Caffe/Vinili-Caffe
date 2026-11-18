#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

python3 - <<'PY'
from pathlib import Path
p=Path('/opt/bot/bots-ts/src/shared/music/services/musicEngine.js')
t=p.read_text()
# show from WAIT RESULT / ready.ok through end of waitForLavalinkTcpThenInitShoukaku
i=t.find('const ready = await waitUntilLavalinkReady')
print(t[i:i+2500])
print('==== has ALWAYS_ON_WATCHER_STARTED?', 'ALWAYS_ON_WATCHER_STARTED' in t)
print('==== startAlwaysOnWatcher context:')
j=t.find('startAlwaysOnWatcher')
print(t[j-200:j+250])
PY

# inject step logs throughout waitForLavalinkTcpThenInitShoukaku
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/bot/bots-ts/src/shared/music/services/musicEngine.js')
t=p.read_text()
if 'SHOUKAKU STEP' in t:
    print('already stepped')
else:
    # after creating shoukaku
    old='client.shoukaku = shoukaku;'
    new='console.warn("[MUSIC] SHOUKAKU STEP assign", { nodes: shoukaku?.nodes?.size });\n    client.shoukaku = shoukaku;'
    if old in t:
        t=t.replace(old,new,1); print('assign step')
    else:
        print('assign miss')
    old2='restoreMusicQueueSnapshot();'
    new2='console.warn("[MUSIC] SHOUKAKU STEP restore");\n    restoreMusicQueueSnapshot();'
    if old2 in t:
        t=t.replace(old2,new2,1); print('restore step')
    old3='startMusicInactivityWatcher(client);'
    new3='console.warn("[MUSIC] SHOUKAKU STEP inactivity");\n    startMusicInactivityWatcher(client);'
    if old3 in t:
        t=t.replace(old3,new3,1); print('inact step')
    old4='startMusicQueueSnapshotLoop(client);'
    new4='console.warn("[MUSIC] SHOUKAKU STEP snapshotloop");\n    startMusicQueueSnapshotLoop(client);'
    if old4 in t:
        t=t.replace(old4,new4,1); print('snap step')
    # before try always on
    old5='const { getMusicBotHooks } = require("../../music/musicBotHooks")'
    # find near startAlwaysOnWatcher
    idx=t.find('startAlwaysOnWatcher')
    head=t.rfind('try {', 0, idx)
    if head>0 and 'SHOUKAKU STEP hooks' not in t:
        t=t[:head]+'console.warn("[MUSIC] SHOUKAKU STEP before hooks");\n    '+t[head:]
        print('before hooks')
    # early return no nodes
    if 'Shoukaku senza nodi' in t and 'SHOUKAKU STEP no_nodes' not in t:
        t=t.replace('Shoukaku senza nodi', 'SHOUKAKU STEP no_nodes / Shoukaku senza nodi', 1)
        print('no_nodes tag')
    p.write_text(t)
print('done')
PY

node --check /opt/bot/bots-ts/src/shared/music/services/musicEngine.js && echo ok

OUT=/home/ubuntu/.pm2/logs/bots-vinyls-out-5.log
ERR=/home/ubuntu/.pm2/logs/bots-vinyls-error-5.log
OP=$(wc -l < "$OUT"); EP=$(wc -l < "$ERR")
pm2 restart bots-vinyls --update-env
sleep 40
echo "=== FILTER ==="
{ tail -n +$((OP+1)) "$OUT"; tail -n +$((EP+1)) "$ERR"; } | grep -iE 'MUSIC|SHOUKAKU|DEBUG|alwaysOn|Error|Inizializzazione' || echo none
