"use strict";

const { findHateSpeechMatch } = require("../../Utils/Moderation/automodHateSpeechMatch") as typeof import("../../Utils/Moderation/automodHateSpeechMatch");

const USER_MIN_INTERVAL_MS = 2500;
const USER_WINDOW_MS = 30_000;
const USER_WINDOW_MAX = 6;

const STAFF_MIN_INTERVAL_MS = 700;
const STAFF_WINDOW_MS = 30_000;
const STAFF_WINDOW_MAX = 20;

const buckets = new Map();

function pruneBuckets(now?) {
  if (buckets.size < 800) return;
  for (const [key, row] of buckets) {
    if (!row || now - Number(row.lastAt || 0) > 10 * 60_000) buckets.delete(key);
  }
}

function getBucket(key?) {
  let row = buckets.get(key);
  if (!row) {
    row = { times: [], lastAt: 0, lastBody: "" };
    buckets.set(key, row);
  }
  return row;
}

function consumeWebTicketMessageRateLimit(opts: Record<string, any> = {}) {
  const guildId = String(opts.guildId || "").trim() || "g";
  const userId = String(opts.userId || "").trim();
  if (!userId) return { ok: true };

  const isStaff = String(opts.kind || "") === "staff";
  const minInterval = isStaff ? STAFF_MIN_INTERVAL_MS : USER_MIN_INTERVAL_MS;
  const windowMs = isStaff ? STAFF_WINDOW_MS : USER_WINDOW_MS;
  const windowMax = isStaff ? STAFF_WINDOW_MAX : USER_WINDOW_MAX;

  const now = Date.now();
  pruneBuckets(now);
  const key = `${guildId}:${userId}:${isStaff ? "s" : "u"}`;
  const row = getBucket(key);
  row.times = (Array.isArray(row.times) ? row.times : []).filter((t?) => now - t < windowMs);

  const sinceLast = now - Number(row.lastAt || 0);
  if (row.lastAt && sinceLast < minInterval) {
    const retryAfterMs = Math.max(250, minInterval - sinceLast);
    return {
      ok: false,
      error: "rate_limited",
      retryAfterMs,
      message: isStaff
        ? `Rallenta un attimo (attendi ${Math.ceil(retryAfterMs / 1000)}s).`
        : `Stai inviando troppo in fretta. Attendi ${Math.ceil(retryAfterMs / 1000)}s.`,
    };
  }

  if (row.times.length >= windowMax) {
    const oldest = row.times[0] || now;
    const retryAfterMs = Math.max(1000, windowMs - (now - oldest));
    return {
      ok: false,
      error: "rate_limited",
      retryAfterMs,
      message: isStaff
        ? "Troppi messaggi in poco tempo. Riprova tra poco."
        : `Hai inviato troppi messaggi. Riprova tra ${Math.ceil(retryAfterMs / 1000)}s.`,
    };
  }

  row.times.push(now);
  row.lastAt = now;
  return { ok: true };
}

/** ticketHateOnly1: web tickets keep only racist/homophobic slur filters */
function checkWebTicketUserMessageAutomod(opts: Record<string, any> = {}) {
  const content = String(opts.content || "");
  if (!content.trim()) return { ok: true };

  const hate = findHateSpeechMatch(content);
  if (hate) {
    return {
      ok: false,
      error: "automod_hate",
      message: "Il messaggio contiene linguaggio razzista o omofobo non consentito.",
    };
  }

  return { ok: true };
}

export = {
  consumeWebTicketMessageRateLimit,
  checkWebTicketUserMessageAutomod,
};
