const IDs = require("../Config/ids");
const { resolveWebsiteCandidatureMember } = require("../../Events/interaction/candidatureApplicationHandlers");

const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

/**
 * GET Bearer: verifica che l'utente sia nel guild principale e abbia il ruolo High Staff (sito serata film).
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
    const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
    if (!resolved.ok) {
      const st = Number(resolved.status) || 403;
      return res.status(st).json({
        ok: false,
        error: resolved.error,
        message: resolved.message,
      });
    }
    if (!HIGH_STAFF_ROLE_ID) {
      return res.status(503).json({
        ok: false,
        error: "misconfigured",
        message: "Ruolo High Staff non configurato sul bot.",
      });
    }
    const member = resolved.member;
    if (!member?.roles?.cache?.has(HIGH_STAFF_ROLE_ID)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Questa pagina è riservata all'High Staff del server.",
      });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-seratafilm-access:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = { handleSiteSeratafilmAccessGet };