#!/bin/bash
set -euo pipefail
export NVM_DIR="${NVM_DIR:-/home/ubuntu/.nvm}"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "== env keys =="
for f in /opt/bot/.env /opt/bot/bots-ts/.env; do
  [ -f "$f" ] || continue
  echo "-- $f"
  grep -E '^(GROQ_API_KEY|OPENAI_API_KEY|VOICE_TRANSCRIBE)' "$f" 2>/dev/null | sed 's/=.*/=***SET***/' || true
done

echo "== config.json =="
node - <<'NODE'
const c = require("/opt/bot/bots-ts/src/Vinili/config.json");
console.log(JSON.stringify({
  voiceClip: c.voiceClip || null,
  voiceTranscription: c.voiceTranscription || null,
}, null, 2));
NODE

echo "== resolve providers =="
node - <<'NODE'
process.chdir("/opt/bot");
for (const line of require("fs").readFileSync("/opt/bot/.env","utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k && process.env[k] == null) process.env[k] = v;
}
const { resolveTranscriptionProvider } = require("/opt/bot/bots-ts/src/Vinili/Community/services/voiceClipTranscribe.js");
const p = resolveTranscriptionProvider("auto");
console.log(JSON.stringify({
  provider: p ? p.kind : null,
  hasOpenAI: Boolean(process.env.OPENAI_API_KEY || process.env.VOICE_TRANSCRIBE_API_KEY),
  hasGroq: Boolean(process.env.GROQ_API_KEY),
}, null, 2));
NODE

echo "== mongo clipTranscription main =="
node - <<'NODE'
process.chdir("/opt/bot");
for (const line of require("fs").readFileSync("/opt/bot/.env","utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k && process.env[k] == null) process.env[k] = v;
}
const mongoose = require("/opt/bot/bots-ts/node_modules/mongoose");
(async () => {
  await mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 2 });
  const {
    getTenantBoardsSync,
    isTenantClipTranscriptionEnabledSync,
  } = require("/opt/bot/bots-ts/src/MultiGuild/core/tenantGuildSettings.js");
  const gid = "1329080093599076474";
  const boards = getTenantBoardsSync(gid);
  console.log(JSON.stringify({
    clipTranscription: boards?.clipTranscription,
    enabledFlag: isTenantClipTranscriptionEnabledSync(gid),
    features: boards?.features,
  }, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE

echo "== logs =="
pm2 logs bots-vinyls --lines 150 --nostream 2>/dev/null | grep -iE '\[clip\]|transcri|whisper|groq|transcription_not|VOICE TRANSCRIBE' | tail -40 || true
