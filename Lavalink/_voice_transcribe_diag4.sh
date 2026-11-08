#!/usr/bin/env bash
set -euo pipefail

echo "== pm2 =="
export NVM_DIR="/home/ubuntu/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
which pm2; pm2 ls || true

echo "== grep handlers in deployed code =="
grep -Rsn "handleVoiceTranscriptionMessage\|VOICE TRANSCRIBE\|looksLikeVoiceMessage" /opt/bot/bots-ts/src /opt/bot/Coffee /opt/bot/Vinyls 2>/dev/null | head -80

echo "== Vinyls logs recent =="
ls -la /opt/bot/Vinyls/logs | head -30
for f in /opt/bot/Vinyls/logs/*; do
  [ -f "$f" ] || continue
  hits=$(grep -iE 'transcri|whisper|VOICE TRANSCRIBE|voiceClip|groq|ffmpeg|audio/ogg' "$f" 2>/dev/null | tail -30 || true)
  if [ -n "$hits" ]; then
    echo "--- $f ---"
    echo "$hits"
  fi
done

echo "== Coffee logs =="
ls -la /opt/bot/Coffee/logs 2>/dev/null | head || true
find /opt/bot/Coffee -maxdepth 3 -type d -name logs 2>/dev/null
for f in /opt/bot/Coffee/logs/* /home/ubuntu/.pm2/logs/*; do
  [ -f "$f" ] || continue
  hits=$(grep -iE 'transcri|whisper|VOICE TRANSCRIBE|voiceClip|groq|ffmpeg' "$f" 2>/dev/null | tail -20 || true)
  if [ -n "$hits" ]; then
    echo "--- $f ---"
    echo "$hits"
  fi
done

echo "== pm2 logs vinyls/coffee =="
pm2 logs --lines 200 --nostream 2>/dev/null | grep -iE 'transcri|whisper|VOICE TRANSCRIBE|voiceClip|groq|ffmpeg|audio' | tail -60 || true
