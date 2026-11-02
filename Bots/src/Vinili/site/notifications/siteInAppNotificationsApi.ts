const {
  listSiteInAppNotificationsForUser,
  countSiteInAppUnreadForUser,
  markSiteInAppNotificationRead,
  markSiteInAppNotificationsReadMany,
  markAllSiteInAppNotificationsRead,
  markSiteInAppNotificationsReadForTicket,
  markSiteInAppNotificationsReadForPage,
  deleteAllSiteInAppNotificationsForUser,
  deleteSiteInAppNotificationForUser,
} = require("./siteInAppNotificationsService") as typeof import("./siteInAppNotificationsService");
const {
  getPublicVapidKey,
  isPushEnabled,
  upsertWebPushSubscription,
  removeWebPushSubscription,
  noteWebPushShown,
  sendWebPushTestToEndpoint,
} = require("../../site/http/siteWebPushService") as typeof import("../../site/http/siteWebPushService");
const { isLitePerf, resolveSitePerfTier } = require("../../site/http/sitePerfHints") as typeof import("../../site/http/sitePerfHints");
const { fetchDiscordOAuthMe } = require("../../site/http/discordOauthMe") as typeof import("../../site/http/discordOauthMe");
const { tryNotModified } = require("../../site/http/siteHttpEtag") as typeof import("../../site/http/siteHttpEtag");

const BEARER_USER_CACHE_TTL_MS = 90_000;
const bearerUserCache = new Map();

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

async function resolveUserIdFromBearer(accessToken?) {
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
    const out = await fetchDiscordOAuthMe(token, { timeoutMs: 4500 });
    if (!out.ok) {
      bearerUserCache.delete(token);
      if (out.status === 401 || out.error === "invalid_token") {
        return { ok: false, status: 401, error: "invalid_token", message: "Sessione Discord non valida o scaduta." };
      }
      return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord." };
    }
    meJson = out.me;
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

async function handleSiteNotificationsGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveUserIdFromBearer(accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const q = req.query || {};
    const perfTier = resolveSitePerfTier(req);
    const lite = isLitePerf(req);
    const mode = String(q.mode || "").trim().toLowerCase();
    /* siteNotifW2: badge poll uses mode=count (+ ETag/304) instead of full list */
    if (mode === "count" || mode === "unread") {
      const counted = await countSiteInAppUnreadForUser(resolved.userId);
      /* siteApiDeviceEverywhere1: weak ETag + RFC If-None-Match (Safari/proxies) */
      const etag = `W/"uc-${counted.revision}"`;
      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("X-VC-Perf", perfTier);
      if (tryNotModified(req, res, etag)) return res;
      return res.status(200).json({
        ok: true,
        mode: "count",
        unread: counted.unread,
        total: counted.total,
        revision: counted.revision,
        latestAt: counted.latestAt || 0,
        perf: perfTier,
      });
    }
    const rawLimit = Number(q.limit);
    const defaultLimit = lite ? 30 : perfTier === "mid" ? 50 : 100;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : defaultLimit;
    const items = await listSiteInAppNotificationsForUser(resolved.userId, limit);
    const counted = await countSiteInAppUnreadForUser(resolved.userId).catch(() => null);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-VC-Perf", perfTier);
    /* notifBadgeServerTruth1: unread anche sul full list così il badge non dipende solo dallo store client */
    return res.status(200).json({
      ok: true,
      items,
      unread: counted && Number.isFinite(Number(counted.unread)) ? Number(counted.unread) : undefined,
      total: counted && Number.isFinite(Number(counted.total)) ? Number(counted.total) : undefined,
      perf: perfTier,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteNotificationsMarkReadPost(client?, req?, res?) {
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
    const pageUrl = String(body.pageUrl || body.href || "").trim();
    if (pageUrl) {
      /* pushBadgeVisitFix1: visita pagina → mark matching + dismiss altri device */
      const modified = await markSiteInAppNotificationsReadForPage(resolved.userId, pageUrl, {
        ids: Array.isArray(body.ids) ? body.ids : [],
        ticketIds: Array.isArray(body.ticketIds) ? body.ticketIds : [],
        openUrls: Array.isArray(body.openUrls) ? body.openUrls : [],
      });
      return res.status(200).json({ ok: true, modified, updated: modified > 0 });
    }
    const ticketId = String(body.ticketId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(ticketId)) {
      const modified = await markSiteInAppNotificationsReadForTicket(resolved.userId, ticketId);
      return res.status(200).json({ ok: true, modified });
    }
    const idsRaw = Array.isArray(body.ids) ? body.ids : [];
    const ids = idsRaw.map((x?) => String(x || "").trim()).filter(Boolean);
    if (ids.length > 1) {
      const modified = await markSiteInAppNotificationsReadMany(resolved.userId, ids);
      return res.status(200).json({ ok: true, modified, updated: modified > 0 });
    }
    const id = String(body.id || ids[0] || "").trim();
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

async function handleSiteNotificationsClearPost(client?, req?, res?) {
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

async function handleSiteNotificationsDeletePost(client?, req?, res?) {
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

async function handleSiteNotificationsPushVapidGet(client?, req?, res?) {
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

async function handleSiteNotificationsPushSubscribePost(client?, req?, res?) {
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
    const saved: any = await upsertWebPushSubscription(resolved.userId, subscription, {
      userAgent: String(body.userAgent || req.headers["user-agent"] || "").trim(),
      deviceClass: String(body.deviceClass || body.clientDevice || "").trim(),
      /* pushApplePhonePrefer1 */
      standalone: body.standalone === true || body.standalone === "true" || body.standalone === 1,
    });
    if (!saved.ok) {
      const recreate = saved.recreate === true || saved.error === "endpoint_gone";
      return res.status(recreate ? 409 : 400).json({
        ok: false,
        error: saved.error || "invalid_subscription",
        recreate: recreate || undefined,
        message: recreate
          ? "Endpoint push scaduto: ricrea la sottoscrizione."
          : "Sottoscrizione push non valida.",
      });
    }
    /* killAppleProbePush1: niente più ping "Se vedi questo…" dopo subscribe/wake */
    return res.status(200).json({ ok: true, probeScheduled: false });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications push subscribe:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

/* pushAppleShownAck1: SW → server dopo showNotification (no auth: id monouso) */
/* pushShownAckPhoneOnly1: solo client ios ferma hedge telefono */
async function handleSiteNotificationsPushShownPost(_client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = String(body.id || "").trim();
    const dedupeKey = String(body.dedupeKey || "").trim();
    if (!id && !dedupeKey) {
      return res.status(400).json({ ok: false, error: "missing_id" });
    }
    const ua = String(req.headers?.["user-agent"] || "").slice(0, 400);
    const out = await noteWebPushShown(id, dedupeKey, {
      client: body.client || body.platform || "",
      userAgent: ua,
    });
    return res.status(200).json({
      ok: true,
      ignoredForHedge: Boolean(out?.ignoredForHedge),
      client: out?.client || null,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications push shown:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

/* Notifica di prova a questo dispositivo (pagina notifiche). Una ogni 10 secondi per utente. */
const lastPushTestAt = new Map();
async function handleSiteNotificationsPushTestPost(_client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveUserIdFromBearer(accessToken);
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const now = Date.now();
    if (now - Number(lastPushTestAt.get(resolved.userId) || 0) < 10_000) {
      return res.status(429).json({ ok: false, error: "too_fast", message: "Aspetta qualche secondo e riprova." });
    }
    lastPushTestAt.set(resolved.userId, now);
    if (lastPushTestAt.size > 2000) lastPushTestAt.clear();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out: any = await sendWebPushTestToEndpoint(resolved.userId, String(body.endpoint || "").trim());
    return res.status(200).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-notifications push test:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteNotificationsPushUnsubscribePost(client?, req?, res?) {
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

export = {
  handleSiteNotificationsGet,
  handleSiteNotificationsMarkReadPost,
  handleSiteNotificationsClearPost,
  handleSiteNotificationsDeletePost,
  handleSiteNotificationsPushVapidGet,
  handleSiteNotificationsPushSubscribePost,
  handleSiteNotificationsPushShownPost,
  handleSiteNotificationsPushUnsubscribePost,
  handleSiteNotificationsPushTestPost,
};