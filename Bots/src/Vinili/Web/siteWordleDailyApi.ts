/* wordleDailySync1: partita del giorno sul profilo (stessa su telefono e PC).
   wordleOnePerDay1: max 1 partita/giorno su tutte le lingue — se inizi in IT non puoi rifarla in EN.
   GET  /webhooks/site-wordle/daily?lang=it → { ok, game } (restituisce la partita del giorno, qualunque lingua)
   POST /webhooks/site-wordle/daily { lang, game } → merge; rifiuta se già iniziata un'altra lingua
   Il guess autenticato usa load/save di questo modulo per non rifare la partita. */
"use strict";

const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");

const LANGS = new Set(["it", "en", "es", "fr", "de", "pt"]);
const MARKS = new Set(["g", "y", "b"]);

function isStartedGame(game?) {
  if (!game) return false;
  const boardLen = Array.isArray(game.board) ? game.board.length : 0;
  return boardLen > 0 || Boolean(game.done) || Boolean(game.won) || Boolean(game.lost);
}

function bearer(raw?) {
  const v = String(raw || "").trim();
  return v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : v;
}

function cleanBoard(raw?) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(0, 6)) {
    if (!row || typeof row !== "object") continue;
    const guess = String(row.guess || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 5);
    if (guess.length !== 5) continue;
    const marks = Array.isArray(row.marks)
      ? row.marks.slice(0, 5).map((m?) => (MARKS.has(String(m)) ? String(m) : "b"))
      : ["b", "b", "b", "b", "b"];
    while (marks.length < 5) marks.push("b");
    out.push({ guess, marks });
  }
  return out;
}

function cleanKeyMarks(raw?) {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const ch = String(k || "")
      .toLowerCase()
      .slice(0, 1);
    if (!/^[a-z]$/.test(ch)) continue;
    if (MARKS.has(String(v))) out[ch] = String(v);
  }
  return out;
}

function cleanGame(raw?, fallbackLang = "it") {
  const s = raw && typeof raw === "object" ? raw : {};
  const lang = LANGS.has(String(s.lang)) ? String(s.lang) : fallbackLang;
  const board = cleanBoard(s.board);
  const done = Boolean(s.done) || board.length >= 6;
  const won = Boolean(s.won);
  const lost = Boolean(s.lost) || (done && !won);
  const answer = done
    ? String(s.answer || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 5)
    : "";
  return {
    day: String(s.day || "").slice(0, 12),
    lang,
    board,
    done: done || won || lost,
    won,
    lost: lost && !won,
    answer,
    keyMarks: cleanKeyMarks(s.keyMarks),
  };
}

/** true se `a` è più avanti di `b` (stesso giorno). */
function betterGame(a?, b?) {
  if (!b) return true;
  if (!a) return false;
  if (a.day !== b.day) return Boolean(a.day) && (!b.day || String(a.day) > String(b.day));
  if (a.done !== b.done) return Boolean(a.done);
  if (a.board.length !== b.board.length) return a.board.length > b.board.length;
  if (a.answer && !b.answer) return true;
  return false;
}

async function auth(client?, req?, res?) {
  const token = bearer(req.headers.authorization);
  if (!token) {
    res.status(401).json({ ok: false, error: "missing_token" });
    return null;
  }
  const resolved = await resolveWebsiteGuildMember(client, token);
  if (!resolved.ok) {
    res.status(Number(resolved.status) || 401).json({ ok: false, error: resolved.error || "auth" });
    return null;
  }
  return resolved;
}

async function resolveOptionalAuth(client?, req?) {
  const token = bearer(req.headers?.authorization);
  if (!token) return null;
  const resolved = await resolveWebsiteGuildMember(client, token).catch(() => null);
  if (!resolved || !resolved.ok) return null;
  return resolved;
}

async function loadDailyBucket(guildId?, userId?) {
  if (!guildId || !userId) return null;
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.siteWordleDaily")
    .lean()
    .catch(() => null);
  return doc?.profile?.siteWordleDaily && typeof doc.profile.siteWordleDaily === "object"
    ? doc.profile.siteWordleDaily
    : null;
}

async function loadDailyGame(guildId?, userId?, lang?) {
  if (!LANGS.has(lang) || !guildId || !userId) return null;
  const bucket = await loadDailyBucket(guildId, userId);
  const raw = bucket?.[lang];
  if (!raw) return null;
  return cleanGame(raw, lang);
}

/** Partita già iniziata oggi (qualsiasi lingua). Una sola al giorno. */
async function loadStartedDailyGame(guildId?, userId?, day?) {
  if (!guildId || !userId || !day) return null;
  const bucket = await loadDailyBucket(guildId, userId);
  if (!bucket) return null;
  let best = null;
  for (const lang of LANGS) {
    const raw = bucket[lang];
    if (!raw) continue;
    const g = cleanGame(raw, lang);
    if (g.day !== day || !isStartedGame(g)) continue;
    if (!best || betterGame(g, best)) best = g;
  }
  return best;
}

async function saveDailyGame(guildId?, userId?, game?) {
  const g = cleanGame(game);
  if (!LANGS.has(g.lang) || !g.day || !guildId || !userId) return null;

  /* wordleOnePerDay1: se oggi c'è già una partita in un'altra lingua, non aprirne un'altra */
  const locked = await loadStartedDailyGame(guildId, userId, g.day);
  if (locked && locked.lang !== g.lang) {
    return locked;
  }

  const where = { guildId: String(guildId), userId: String(userId) };
  const current = await loadDailyGame(guildId, userId, g.lang);
  if (current && current.day === g.day && !betterGame(g, current)) return current;
  await ActivityUserProfile.updateOne(
    where,
    { $setOnInsert: where, $set: { [`profile.siteWordleDaily.${g.lang}`]: g } },
    { upsert: true },
  ).catch(() => null);
  return g;
}

async function handleSiteWordleDailyGet(client?, req?, res?) {
  try {
    const r = await auth(client, req, res);
    if (!r) return;
    const lang = LANGS.has(String(req.query?.lang || "")) ? String(req.query.lang) : "it";
    /* preferisci la partita già iniziata oggi (anche in altra lingua) */
    const day = String(req.query?.day || "").slice(0, 12);
    let game = null;
    if (day) {
      game = await loadStartedDailyGame(r.guild?.id, r.userId, day);
    }
    if (!game) game = await loadDailyGame(r.guild?.id, r.userId, lang);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ ok: true, game: game || null });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-wordle daily get:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteWordleDailyPost(client?, req?, res?) {
  try {
    const r = await auth(client, req, res);
    if (!r) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const lang = LANGS.has(String(body.lang || body.game?.lang || ""))
      ? String(body.lang || body.game?.lang)
      : "";
    if (!lang) return res.status(400).json({ ok: false, error: "bad_lang" });
    const incoming = cleanGame({ ...(body.game || body), lang }, lang);
    if (!incoming.day) return res.status(400).json({ ok: false, error: "bad_day" });
    const kept = await saveDailyGame(r.guild?.id, r.userId, incoming);
    const lockedOther = kept && kept.lang !== lang;
    return res.json({
      ok: true,
      game: kept,
      locked: Boolean(lockedOther || (kept && isStartedGame(kept))),
      lockedLang: kept?.lang || lang,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-wordle daily post:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

export = {
  cleanGame,
  isStartedGame,
  loadDailyGame,
  loadStartedDailyGame,
  saveDailyGame,
  resolveOptionalAuth,
  handleSiteWordleDailyGet,
  handleSiteWordleDailyPost,
  LANGS,
};
