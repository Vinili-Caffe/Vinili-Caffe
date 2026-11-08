#!/usr/bin/env bash
set -euo pipefail
cd /opt/bot || cd /root || true

echo "== pm2 list =="
pm2 ls 2>/dev/null || true

echo "== pm2 log files =="
ls -la /root/.pm2/logs/ 2>/dev/null | head -50 || true

echo "== grep pm2 logs =="
for f in /root/.pm2/logs/*; do
  [ -f "$f" ] || continue
  hits=$(rg -i "transcri|whisper|voiceClip|VoiceTranscription|clip.?trans|failed to transcribe|audio/ogg|GROQ|voice message" "$f" -n --max-count 40 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "--- $f ---"
    echo "$hits"
  fi
done

echo "== grep /opt/bot logs =="
for f in /opt/bot/logs/* /opt/bot/*.log; do
  [ -f "$f" ] || continue
  hits=$(rg -i "transcri|whisper|voiceClip|VoiceTranscription|clip.?trans|failed to transcribe|audio/ogg|GROQ|voice message" "$f" -n --max-count 40 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "--- $f ---"
    echo "$hits"
  fi
done

echo "== mongo guilds voiceTranscription flags =="
node <<'NODE'
const mongoose = require('mongoose');
(async () => {
  require('dotenv').config({ path: '/opt/bot/.env' });
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) { console.log('NO_MONGO_URI'); process.exit(0); }
  await mongoose.connect(uri);
  const cols = await mongoose.connection.db.listCollections().toArray();
  const names = cols.map(c => c.name);
  console.log('collections sample', names.filter(n => /guild|config|setting|voice|feature/i.test(n)).slice(0, 30));
  for (const name of ['guilds', 'Guild', 'guildconfigs', 'guildConfigs', 'settings', 'multiguilds', 'multiguildconfigs']) {
    if (!names.includes(name)) continue;
    const docs = await mongoose.connection.db.collection(name).find({}).project({
      guildId: 1, id: 1, name: 1,
      features: 1,
      clipTranscription: 1,
      voiceTranscription: 1,
      'settings.voiceTranscription': 1,
      'settings.clipTranscription': 1,
    }).limit(20).toArray();
    console.log('COL', name, JSON.stringify(docs, null, 2).slice(0, 8000));
  }
  // also search any doc with voiceTranscription key
  for (const name of names) {
    try {
      const n = await mongoose.connection.db.collection(name).countDocuments({
        $or: [
          { voiceTranscription: { $exists: true } },
          { 'features.voiceTranscription': { $exists: true } },
          { clipTranscription: { $exists: true } },
          { 'features.clip': { $exists: true } },
        ]
      });
      if (n > 0) {
        const sample = await mongoose.connection.db.collection(name).find({
          $or: [
            { voiceTranscription: { $exists: true } },
            { 'features.voiceTranscription': { $exists: true } },
            { clipTranscription: { $exists: true } },
            { 'features.clip': { $exists: true } },
          ]
        }).project({ guildId: 1, id: 1, name: 1, features: 1, clipTranscription: 1, voiceTranscription: 1 }).limit(5).toArray();
        console.log('HIT', name, n, JSON.stringify(sample));
      }
    } catch {}
  }
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
NODE

echo "== code presence =="
ls -la /opt/bot/Bots/src/Vinili/Voice/services/voiceTranscriptionService.* 2>/dev/null || ls -la /opt/bot/src/Vinili/Voice/services/voiceTranscriptionService.* 2>/dev/null || find /opt/bot -name 'voiceTranscriptionService.*' 2>/dev/null | head
find /opt/bot -name 'voiceClipTranscribe.*' 2>/dev/null | head
echo "== groq quick probe =="
node <<'NODE'
require('dotenv').config({ path: '/opt/bot/.env' });
const key = process.env.GROQ_API_KEY;
if (!key) { console.log('NO_GROQ'); process.exit(0); }
(async () => {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${key}` }
  });
  console.log('groq models status', res.status);
  const t = await res.text();
  console.log(t.slice(0, 400));
})().catch(e => console.error(e));
NODE
