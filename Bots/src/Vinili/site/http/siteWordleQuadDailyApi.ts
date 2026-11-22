/**
 * Wordle ×4: partita del giorno sul profilo (4 griglie, 9 tentativi condivisi).
 * Una partita/giorno cross-lingua, indipendente dal Wordle classico.
 */
"use strict";

const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const wordle = require("../../Minigames/services/wordleService") as typeof import("../../Minigames/services/wordleService");

const LANGS = new Set(["it", "en", "es", "fr", "de", "pt"]);
const MARKS = new Set(["g", "y", "b"]);
const N = () => wordle.QUAD_BOARDS || 4;

function bearer(raw?) {
  const v = String(raw || "").trim();
  return v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : v;
}

function isStartedGame(game?) {
  if (!game) return false;
  const guesses = Array.isArray(game.guesses) ? game.guesses.length : 0;
  return guesses > 0 || Boolean(game.done) || Boolean(game.won) || Boolean(game.lost);
}

function cleanMarksRow(raw?) {
  if (!Array.isArray(raw)) return ["b", "b", "b", "b", "b"];
  const marks = raw.slice(0, 5).map((m?) => (MARKS.has(String(m)) ? String(m) : "b"));
  while (marks.length < 5) marks.push("b");
  return marks;
}

function cleanBoardRows(raw?) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(0, wordle.QUAD_MAX_ATTEMPTS || 9)) {
    if (!row || typeof row !== "object") continue;
    const guess = String(row.guess || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 5);
    if (guess.length !== 5) continue;
    out.push({ guess, marks: cleanMarksRow(row.marks) });
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

function emptyBoards() {
  return Array.from({ length: N() }, () => ({
    rows: [],
    won: false,
    done: false,
    answer: "",
  }));
}

function cleanGame(raw?, fallbackLang = "it") {
  const s = raw && typeof raw === "object" ? raw : {};
  const lang = LANGS.has(String(s.lang)) ? String(s.lang) : fallbackLang;
  const guesses = Array.isArray(s.guesses)
    ? s.guesses
        .map((g?) =>
          String(g || "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
            .slice(0, 5),
        )
        .filter((g?) => g.length === 5)
        .slice(0, wordle.QUAD_MAX_ATTEMPTS || 9)
    : [];

  let boards = Array.isArray(s.boards) ? s.boards.slice(0, N()) : [];
  while (boards.length < N()) boards.push({ rows: [], won: false, done: false, answer: "" });
  boards = boards.map((b?, i?) => {
    const row = b && typeof b === "object" ? b : {};
    const rows = cleanBoardRows(row.rows);
    const won = Boolean(row.won) || rows.some((r?) => (r.marks || []).every((m?) => m === "g"));
    const answer = won || Boolean(s.done)
      ? String(row.answer || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 5)
      : "";
    return { rows, won, done: won || Boolean(row.done), answer };
  });

  const wonAll = boards.every((b?) => b.won);
  const done = Boolean(s.done) || wonAll || guesses.length >= (wordle.QUAD_MAX_ATTEMPTS || 9);
  const won = Boolean(s.won) || wonAll;
  const lost = Boolean(s.lost) || (done && !won);

  return {
    day: String(s.day || "").slice(0, 12),
    lang,
    guesses,
    boards,
    done: done || won || lost,
    won,
    lost: lost && !won,
    keyMarks: cleanKeyMarks(s.keyMarks),
  };
}

function betterGame(a?, b?) {
  if (!b) return true;
  if (!a) return false;
  if (a.day !== b.day) return Boolean(a.day) && (!b.day || String(a.day) > String(b.day));
  if (a.done !== b.done) return Boolean(a.done);
  const ag = Array.isArray(a.guesses) ? a.guesses.length : 0;
  const bg = Array.isArray(b.guesses) ? b.guesses.length : 0;
  if (ag !== bg) return ag > bg;
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

async function loadDailyBucket(guildId?, userId?) {
  if (!guildId || !userId) return null;
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.siteWordleQuadDaily")
    .lean()
    .catch(() => null);
  return doc?.profile?.siteWordleQuadDaily && typeof doc.profile.siteWordleQuadDaily === "object"
    ? doc.profile.siteWordleQuadDaily
    : null;
}

async function loadDailyGame(guildId?, userId?, lang?) {
  if (!LANGS.has(lang) || !guildId || !userId) return null;
  const bucket = await loadDailyBucket(guildId, userId);
  const raw = bucket?.[lang];
  if (!raw) return null;
  return cleanGame(raw, lang);
}

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

  const locked = await loadStartedDailyGame(guildId, userId, g.day);
  if (locked && locked.lang !== g.lang) return locked;

  const where = { guildId: String(guildId), userId: String(userId) };
  const current = await loadDailyGame(guildId, userId, g.lang);
  if (current && current.day === g.day && !betterGame(g, current)) return current;
  await ActivityUserProfile.updateOne(
    where,
    { $setOnInsert: where, $set: { [`profile.siteWordleQuadDaily.${g.lang}`]: g } },
    { upsert: true },
  ).catch(() => null);
  return g;
}

async function handleSiteWordleQuadDailyGet(client?, req?, res?) {
  try {
    const r = await auth(client, req, res);
    if (!r) return;
    const lang = LANGS.has(String(req.query?.lang || "")) ? String(req.query.lang) : "it";
    const day = String(req.query?.day || "").slice(0, 12);
    let game = null;
    if (day) game = await loadStartedDailyGame(r.guild?.id, r.userId, day);
    if (!game) game = await loadDailyGame(r.guild?.id, r.userId, lang);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ ok: true, game: game || null });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-wordle-quad daily get:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteWordleQuadDailyPost(client?, req?, res?) {
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
    global.logger?.error?.("[WEBHOOK] site-wordle-quad daily post:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

export = {
  cleanGame,
  emptyBoards,
  isStartedGame,
  loadDailyGame,
  loadStartedDailyGame,
  saveDailyGame,
  handleSiteWordleQuadDailyGet,
  handleSiteWordleQuadDailyPost,
  LANGS,
};
