const crypto = require("crypto");
const { resolveWebsiteCandidatureMember } = require("../../Events/interaction/candidatureApplicationHandlers");
const { memberHasHogwartsPreviewStaffRole } = require("./hogwartsEventParticipation");
const ACCESS_CACHE_TTL_MS = 90_000;
const ACCESS_CACHE_MAX = 400;
const accessCache = new Map();

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function accessCacheKey(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex").slice(0, 40);
}

function pruneAccessCache() {
  const now = Date.now();
  for (const [key, entry] of accessCache) {
    if (!entry || Number(entry.exp || 0) <= now) accessCache.delete(key);
  }
  if (accessCache.size <= ACCESS_CACHE_MAX) return;
  const keys = [...accessCache.keys()];
  for (let i = 0; i < keys.length - ACCESS_CACHE_MAX; i += 1) {
    accessCache.delete(keys[i]);
  }
}

function readCachedAccess(token) {
  const key = accessCacheKey(token);
  const entry = accessCache.get(key);
  if (!entry || Number(entry.exp || 0) <= Date.now()) {
    accessCache.delete(key);
    return null;
  }
  return entry;
}

function writeCachedAccess(token, payload) {
  pruneAccessCache();
  accessCache.set(accessCacheKey(token), {
    ...payload,
    exp: Date.now() + ACCESS_CACHE_TTL_MS,
  });
}

/**
 * GET Bearer: verifica login Discord, appartenenza al server e ruolo staff anteprima (High Staff+).
 * @param {import("discord.js").Client} client
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function handleSiteSeratafilmAccessGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }

    const cached = readCachedAccess(accessToken);
    if (cached) {
      res.setHeader("Cache-Control", "private, no-store");
      if (cached.ok) return res.status(200).json({ ok: true, cached: true });
      return res.status(Number(cached.status) || 403).json({
        ok: false,
        error: cached.error || "forbidden",
        message: cached.message || "Accesso negato.",
        cached: true,
      });
    }

    const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      const st = Number(resolved.status) || 403;
      writeCachedAccess(accessToken, {
        ok: false,
        status: st,
        error: resolved.error,
        message: resolved.message,
      });
      return res.status(st).json({
        ok: false,
        error: resolved.error,
        message: resolved.message,
      });
    }
    const member = resolved.member;
    if (!memberHasHogwartsPreviewStaffRole(member)) {
      writeCachedAccess(accessToken, {
        ok: false,
        status: 403,
        error: "forbidden",
        message: "Questa pagina è riservata all'High Staff del server.",
      });
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Questa pagina è riservata all'High Staff del server.",
      });
    }
    writeCachedAccess(accessToken, { ok: true, status: 200 });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-seratafilm-access:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = { handleSiteSeratafilmAccessGet };