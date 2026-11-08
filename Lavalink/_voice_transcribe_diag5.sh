#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="/home/ubuntu/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "== ecosystem apps =="
node - <<'NODE'
const eco = require('/opt/bot/ecosystem.config.cjs');
for (const a of eco.apps || []) {
  if (!/coffee|vinyl|bot/i.test(a.name)) continue;
  console.log(JSON.stringify({
    name: a.name,
    script: a.script,
    cwd: a.cwd,
    env_file: a.env_file || a.env_file || null,
    envKeys: a.env ? Object.keys(a.env).filter(k => /GROQ|OPENAI|VOICE|MONGO|TOKEN|CLIENT/i.test(k)) : [],
    hasGroqInEnv: Boolean(a.env && (a.env.GROQ_API_KEY || a.env.OPENAI_API_KEY)),
  }, null, 2));
}
NODE

echo "== coffee config voiceTranscription =="
python3 - <<'PY'
import json, pathlib
for p in [
  '/opt/bot/Coffee/config.json',
  '/opt/bot/Coffee/Config/config.json',
  '/opt/bot/Vinyls/config.json',
  '/opt/bot/bots-ts/src/Vinili/config.json',
]:
  path=pathlib.Path(p)
  if not path.exists():
    continue
  data=json.loads(path.read_text())
  print('FILE', p)
  print(json.dumps({
    'voiceTranscription': data.get('voiceTranscription'),
    'voiceClip': data.get('voiceClip'),
  }, indent=2)[:2000])
PY

echo "== coffee messageCreate wiring =="
sed -n '1,60p' /opt/bot/Coffee/Events/messageCreate.js

echo "== vinyls messageCreate wiring =="
grep -n "Voice\|transcri\|messageCreate" /opt/bot/Vinyls/Events/messageCreate.js 2>/dev/null | head -40 || true
grep -Rsn "handleVoiceTranscriptionMessage" /opt/bot/Vinyls /opt/bot/bots-ts/src/Vinili/Community/events 2>/dev/null | head -20

echo "== recent coffee/vinyls logs =="
pm2 logs bots-coffee --lines 300 --nostream 2>/dev/null | grep -iE 'transcri|whisper|VOICE|groq|ffmpeg|FormData|audio' | tail -80 || true
echo "----"
pm2 logs bots-vinyls --lines 300 --nostream 2>/dev/null | grep -iE 'transcri|whisper|VOICE|groq|ffmpeg|FormData|audio' | tail -80 || true

echo "== coffee env at runtime via pm2 describe =="
pm2 describe bots-coffee 2>/dev/null | grep -E 'script path|exec cwd|status|unstable|GROQ|OPENAI|env file' | head -40 || true
pm2 env 6 2>/dev/null | grep -E 'GROQ|OPENAI|VOICE_TRANSCRIBE|MONGO_URL' | sed 's/=.*/=***SET***/' || true
pm2 env 5 2>/dev/null | grep -E 'GROQ|OPENAI|VOICE_TRANSCRIBE|MONGO_URL' | sed 's/=.*/=***SET***/' || true
