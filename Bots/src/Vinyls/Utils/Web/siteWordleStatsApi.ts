/* wordleStatsSync1: statistiche del Wordle del sito salvate sul profilo, così si ritrovano su telefono e PC.
   GET  /webhooks/site-wordle/stats           → { ok, stats: { it?: Stats, en?: Stats } }
   POST /webhooks/site-wordle/stats { lang, stats } → salva se la copia inviata è più completa
   Unione tra dispositivi: vince la cronologia con più partite giocate (a parità, quella più recente). */
"use strict";

const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");

const LANGS = new Set(["it", "en", "es", "fr", "de", "pt"]);

function bearer(raw?) {
  const v = String(raw || "").trim();
  return v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : v;
}

function int(v?, max = 100000) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
}

function clean(raw?) {
  const s = raw && typeof raw === "object" ? raw : {};
  const dist = Array.isArray(s.distribution) ? s.distribution.slice(0, 6).map((n?) => int(n)) : [];
  while (dist.length < 6) dist.push(0);
  const played = int(s.played);
  return {
    played,
    won: Math.min(int(s.won), played),
    currentStreak: Math.min(int(s.currentStreak), played),
    maxStreak: Math.min(int(s.maxStreak), played),
    distribution: dist,
    lastDay: String(s.lastDay || "").slice(0, 12),
    lastLang: LANGS.has(String(s.lastLang)) ? String(s.lastLang) : "",
  };
}

/** true se `a` è più completa di `b` */
function better(a?, b?) {
  if (!b) return true;
  if (a.played !== b.played) return a.played > b.played;
  return String(a.lastDay) > String(b.lastDay);
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

async function handleSiteWordleStatsGet(client?, req?, res?) {
  try {
    const r = await auth(client, req, res);
    if (!r) return;
    const doc = await ActivityUserProfile.findOne({ guildId: String(r.guild?.id || ""), userId: r.userId })
      .select("profile.siteWordleStats")
      .lean()
      .catch(() => null);
    const raw = doc?.profile?.siteWordleStats || {};
    const stats: Record<string, any> = {};
    for (const l of LANGS) if (raw[l]) stats[l] = clean(raw[l]);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ ok: true, stats });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-wordle stats get:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleSiteWordleStatsPost(client?, req?, res?) {
  try {
    const r = await auth(client, req, res);
    if (!r) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const lang = String(body.lang || "");
    if (!LANGS.has(lang)) return res.status(400).json({ ok: false, error: "bad_lang" });
    const incoming = clean(body.stats);
    const where = { guildId: String(r.guild?.id || ""), userId: r.userId };
    const doc = await ActivityUserProfile.findOne(where).select("profile.siteWordleStats").lean().catch(() => null);
    const current = doc?.profile?.siteWordleStats?.[lang] ? clean(doc.profile.siteWordleStats[lang]) : null;
    if (!better(incoming, current)) return res.json({ ok: true, stats: current, kept: "server" });
    await ActivityUserProfile.updateOne(
      where,
      { $setOnInsert: where, $set: { [`profile.siteWordleStats.${lang}`]: incoming } },
      { upsert: true },
    ).catch(() => null);
    return res.json({ ok: true, stats: incoming, kept: "client" });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-wordle stats post:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

export = { handleSiteWordleStatsGet, handleSiteWordleStatsPost };
