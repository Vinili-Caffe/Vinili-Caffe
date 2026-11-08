#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="/home/ubuntu/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "== coffee messageCreate =="
grep -n "handleVoiceTranscription\|VOICE TRANSCRIBE\|handleTts" /opt/bot/bots-ts/src/Caffè/Community/events/messageCreate.js | head -20

echo "== coffee ready =="
grep -n "restorePendingVoiceTranscription\|VOICE TRANSCRIBE" /opt/bot/bots-ts/src/Caffè/core/events/ready.js | head -20

echo "== coffee config =="
python3 - <<'PY'
import json
c=json.load(open('/opt/bot/bots-ts/src/Caffè/config.json', encoding='utf-8'))
print(json.dumps(c.get('voiceTranscription'), indent=2))
v=json.load(open('/opt/bot/bots-ts/src/Vinili/config.json', encoding='utf-8'))
print('vinili enabled', (v.get('voiceTranscription') or {}).get('enabled'))
PY

echo "== pm2 =="
pm2 ls | grep -E 'coffee|vinyls'
pm2 logs bots-coffee --lines 40 --nostream 2>/dev/null | tail -30
