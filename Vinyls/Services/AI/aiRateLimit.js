const buckets = new Map();

function checkAiRateLimit(userId, cooldownSec = 15) {
  const uid = String(userId || "").trim();
  const sec = Math.max(0, Number(cooldownSec) || 0);
  if (sec <= 0) return { ok: true, retryAfterSec: 0 };
  if (!uid) return { ok: false, retryAfterSec: sec };
  const now = Date.now();
  const prev = Number(buckets.get(uid) || 0);
  if (prev && now - prev < sec * 1000) {
    return { ok: false, retryAfterSec: Math.ceil((sec * 1000 - (now - prev)) / 1000) };
  }
  buckets.set(uid, now);
  return { ok: true, retryAfterSec: 0 };
}

module.exports = { checkAiRateLimit };