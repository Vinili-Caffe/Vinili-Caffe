/**
 * siteUserPresence1 — API heartbeat + query presenza sito.
 */
"use strict";

const { fetchDiscordOAuthMe } = require("./discordOauthMe") as typeof import("./discordOauthMe");
const {
  setSitePresence,
  clearSitePresence,
  getManySitePresence,
  parseIds,
  MAX_QUERY_IDS,
} = require("./siteUserPresenceStore") as typeof import("./siteUserPresenceStore");

function normalizeHeaderSecret(value?) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return String(m ? m[1] : raw).trim();
}

async function resolveUserIdFromToken(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) return { ok: false, status: 401, error: "missing_token", message: "Login richiesto." };
  const me = await fetchDiscordOAuthMe(token, { timeoutMs: 4500 });
  if (!me?.ok || !me.me?.id) {
    return {
      ok: false,
      status: Number(me?.status) || 401,
      error: me?.error || "invalid_token",
      message: me?.message || "Sessione non valida.",
    };
  }
  return { ok: true, userId: String(me.me.id) };
}

function emitPresenceChanged(userId?, status?) {
  try {
    const { broadcastSiteRealtime, notifyExternalSiteRealtime } = require("../features/suggestions/siteSuggestionsBroadcast") as typeof import("../features/suggestions/siteSuggestionsBroadcast");
    const payload = {
      type: "site_presence_changed",
      userId: String(userId),
      status: String(status),
      at: new Date().toISOString(),
    };
    broadcastSiteRealtime(payload);
    notifyExternalSiteRealtime(payload);
  } catch (_) {}
}

async function handleSiteUserPresenceHeartbeat(req?, res?) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  const auth = await resolveUserIdFromToken(accessToken);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error, message: auth.message });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const clear = body.clear === true || body.active === false || String(body.status || "").toLowerCase() === "offline";
  if (clear) {
    const changed = clearSitePresence(auth.userId);
    if (changed) emitPresenceChanged(auth.userId, "offline");
    return res.status(200).json({ ok: true, status: "offline", cleared: true });
  }
  const status = String(body.status || "online").toLowerCase() === "idle" ? "idle" : "online";
  const path = String(body.path || req.headers["x-vc-path"] || "").slice(0, 180);
  const visible = body.visible !== false && body.hidden !== true;
  const changed = setSitePresence(auth.userId, status, { path, visible });
  if (changed) emitPresenceChanged(auth.userId, changed.status);
  return res.status(200).json({ ok: true, status, userId: auth.userId });
}

async function handleSiteUserPresenceQuery(req?, res?) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const ids = parseIds(body.ids != null ? body.ids : req.query?.ids)
    .map((id?) => String(id || "").trim())
    .filter((id?) => /^\d{16,22}$/.test(id))
    .slice(0, MAX_QUERY_IDS);
  const statuses = getManySitePresence(ids);
  res.set("Cache-Control", "private, no-store");
  return res.status(200).json({ ok: true, statuses });
}

export = {
  handleSiteUserPresenceHeartbeat,
  handleSiteUserPresenceQuery,
};
