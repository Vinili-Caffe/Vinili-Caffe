const { listSiteInAppNotificationsForUser } = require("./siteInAppNotificationsService");

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

async function resolveUserIdFromBearer(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  }
  let meJson;
  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      return { ok: false, status: 401, error: "invalid_token", message: "Sessione Discord non valida o scaduta." };
    }
    meJson = await meRes.json();
  } catch {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord." };
  }
  const userId = String(meJson?.id || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }
  return { ok: true, status: 200, userId };
}

async function handleSiteNotificationsGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveUserIdFromBearer(accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const items = await listSiteInAppNotificationsForUser(resolved.userId, 50);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = { handleSiteNotificationsGet };