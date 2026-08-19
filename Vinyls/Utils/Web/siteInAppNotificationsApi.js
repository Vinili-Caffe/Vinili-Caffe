const {
  listSiteInAppNotificationsForUser,
  markSiteInAppNotificationRead,
  markAllSiteInAppNotificationsRead,
  markSiteInAppNotificationsReadForTicket,
  deleteAllSiteInAppNotificationsForUser,
  deleteSiteInAppNotificationForUser,
} = require("./siteInAppNotificationsService");
const {
  getPublicVapidKey,
  isPushEnabled,
  upsertWebPushSubscription,
  removeWebPushSubscription,
} = require("./siteWebPushService");

const BEARER_USER_CACHE_TTL_MS = 90_000;
const bearerUserCache = new Map();

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
  const now = Date.now();
  const cached = bearerUserCache.get(token);
  if (cached && now - cached.at < BEARER_USER_CACHE_TTL_MS && cached.userId) {
    return { ok: true, status: 200, userId: cached.userId };
  }
  let meJson;
  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      bearerUserCache.delete(token);
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
  bearerUserCache.set(token, { userId, at: now });
  if (bearerUserCache.size > 400) {
    const cutoff = now - BEARER_USER_CACHE_TTL_MS;
    for (const [k, v] of bearerUserCache) {
      if (!v || v.at < cutoff) bearerUserCache.delete(k);
    }
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

async function handleSiteNotificationsMarkReadPost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveUserIdFromBearer(accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.all === true) {
      const modified = await markAllSiteInAppNotificationsRead(resolved.userId);
      return res.status(200).json({ ok: true, modified });
    }
    const ticketId = String(body.ticketId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(ticketId)) {
      const modified = await markSiteInAppNotificationsReadForTicket(resolved.userId, ticketId);
      return res.status(200).json({ ok: true, modified });
    }
    const id = String(body.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "missing_id", message: "Campo id richiesto." });
    }
    const updated = await markSiteInAppNotificationRead(resolved.userId, id);
    return res.status(200).json({ ok: true, updated });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications mark-read:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteNotificationsClearPost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveUserIdFromBearer(accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const deleted = await deleteAllSiteInAppNotificationsForUser(resolved.userId);
    return res.status(200).json({ ok: true, deleted });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications clear:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteNotificationsDeletePost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveUserIdFromBearer(accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = String(body.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "missing_id", message: "Campo id richiesto." });
    }
    const deleted = await deleteSiteInAppNotificationForUser(resolved.userId, id);
    return res.status(200).json({ ok: true, deleted });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications delete:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteNotificationsPushVapidGet(client, req, res) {
  try {
    const publicKey = getPublicVapidKey();
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json({
      ok: true,
      enabled: isPushEnabled() && Boolean(publicKey),
      publicKey: publicKey || "",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications push vapid:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteNotificationsPushSubscribePost(client, req, res) {
  try {
    if (!isPushEnabled()) {
      return res.status(503).json({
        ok: false,
        error: "push_disabled",
        message: "Notifiche push non configurate sul server.",
      });
    }
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveUserIdFromBearer(accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const subscription = body.subscription && typeof body.subscription === "object" ? body.subscription : body;
    const saved = await upsertWebPushSubscription(resolved.userId, subscription, {
      userAgent: String(req.headers["user-agent"] || "").trim(),
    });
    if (!saved.ok) {
      return res.status(400).json({
        ok: false,
        error: saved.error || "invalid_subscription",
        message: "Sottoscrizione push non valida.",
      });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications push subscribe:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteNotificationsPushUnsubscribePost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveUserIdFromBearer(accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const endpoint = String(body.endpoint || body?.subscription?.endpoint || "").trim();
    const removed = await removeWebPushSubscription(resolved.userId, endpoint);
    if (!removed.ok) {
      return res.status(400).json({
        ok: false,
        error: removed.error || "invalid_subscription",
        message: "Endpoint push non valido.",
      });
    }
    return res.status(200).json({ ok: true, deleted: removed.deleted });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications push unsubscribe:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteNotificationsGet,
  handleSiteNotificationsMarkReadPost,
  handleSiteNotificationsClearPost,
  handleSiteNotificationsDeletePost,
  handleSiteNotificationsPushVapidGet,
  handleSiteNotificationsPushSubscribePost,
  handleSiteNotificationsPushUnsubscribePost,
};