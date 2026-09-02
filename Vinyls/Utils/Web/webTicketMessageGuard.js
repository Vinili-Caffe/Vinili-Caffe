"use strict";

const { loadAutomodScamConfig } = require("../Moderation/automodScamConfig");

const USER_MIN_INTERVAL_MS = 2500;
const USER_WINDOW_MS = 30_000;
const USER_WINDOW_MAX = 6;

const STAFF_MIN_INTERVAL_MS = 700;
const STAFF_WINDOW_MS = 30_000;
const STAFF_WINDOW_MAX = 20;

const buckets = new Map();
const recentBodies = new Map();

function pruneBuckets(now) {
  if (buckets.size < 800) return;
  for (const [key, row] of buckets) {
    if (!row || now - Number(row.lastAt || 0) > 10 * 60_000) buckets.delete(key);
  }
}

function getBucket(key) {
  let row = buckets.get(key);
  if (!row) {
    row = { times: [], lastAt: 0, lastBody: "" };
    buckets.set(key, row);
  }
  return row;
}

function consumeWebTicketMessageRateLimit(opts = {}) {
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
  row.times = (Array.isArray(row.times) ? row.times : []).filter((t) => now - t < windowMs);

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

function normalizeCompareBody(content) {
  return String(content || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function countNewlines(content) {
  return (String(content || "").match(/\n/g) || []).length;
}

function hasExcessiveBlankLineRuns(content) {
  return /\n{9,}/.test(String(content || ""));
}

function hasRepeatedCharSpam(content) {
  return /(.)\1{11,}/u.test(String(content || ""));
}

function findBlockedScamDomain(content) {
  const text = String(content || "").toLowerCase();
  if (!text) return "";
  const cfg = loadAutomodScamConfig();
  const domains = Array.isArray(cfg?.domains) ? cfg.domains : [];
  for (const d of domains) {
    const dom = String(d || "").trim().toLowerCase();
    if (!dom) continue;
    if (text.includes(dom)) return dom;
  }
  const keywords = Array.isArray(cfg?.discordKeywords) ? cfg.discordKeywords : [];
  for (const kw of keywords) {
    const needle = String(kw || "").trim().toLowerCase();
    if (needle.length >= 4 && text.includes(needle)) return needle;
  }
  return "";
}

function hasMassMentions(content) {
  const text = String(content || "");
  const userMentions = text.match(/<@!?\d{16,22}>/g) || [];
  const roleMentions = text.match(/<@&\d{16,22}>/g) || [];
  return userMentions.length + roleMentions.length >= 6;
}

function checkWebTicketUserMessageAutomod(opts = {}) {
  const content = String(opts.content || "");
  if (!content.trim()) return { ok: true };

  const scamHit = findBlockedScamDomain(content);
  if (scamHit) {
    return {
      ok: false,
      error: "automod_scam",
      message: "Il messaggio contiene un link o testo bloccato dall’automod.",
    };
  }

  if (hasRepeatedCharSpam(content)) {
    return {
      ok: false,
      error: "automod_spam",
      message: "Messaggio rifiutato: troppi caratteri ripetuti.",
    };
  }

  if (hasExcessiveBlankLineRuns(content)) {
    return {
      ok: false,
      error: "automod_flood",
      message: "Messaggio rifiutato: troppe righe vuote consecutive.",
    };
  }

  if (hasMassMentions(content)) {
    return {
      ok: false,
      error: "automod_mentions",
      message: "Troppe menzioni in un solo messaggio.",
    };
  }

  const guildId = String(opts.guildId || "").trim() || "g";
  const userId = String(opts.userId || "").trim();
  const ticketId = String(opts.ticketId || "").trim() || "t";
  if (userId) {
    const body = normalizeCompareBody(content);
    if (body.length >= 8) {
      const key = `${guildId}:${ticketId}:${userId}`;
      const prev = recentBodies.get(key) || [];
      const sameCount = prev.filter((x) => x === body).length;
      if (sameCount >= 2) {
        return {
          ok: false,
          error: "automod_repeat",
          message: "Hai già inviato lo stesso messaggio più volte. Evita lo spam.",
        };
      }
      const next = [...prev, body].slice(-4);
      recentBodies.set(key, next);
      if (recentBodies.size > 2000) {
        const first = recentBodies.keys().next().value;
        if (first) recentBodies.delete(first);
      }
    }
  }

  return { ok: true };
}

module.exports = {
  consumeWebTicketMessageRateLimit,
  checkWebTicketUserMessageAutomod,
  USER_MIN_INTERVAL_MS,
  USER_WINDOW_MAX,
};
