const SITE_REALTIME_WS_PATH = "/webhooks/site-realtime-ws";
const LEGACY_SUGGESTIONS_WS_PATH = "/webhooks/site-suggestions-ws";
const WS_UPGRADE_PATHS = new Set([SITE_REALTIME_WS_PATH, LEGACY_SUGGESTIONS_WS_PATH]);

function tryRequireWs() {
  try {
    return require("ws");
  } catch {
    return null;
  }
}

let wssSingleton = null;
let upgradeListenerAttached = false;

function attachSiteSuggestionsWsServer(server) {
  if (!server || upgradeListenerAttached) return false;
  const WS = tryRequireWs();
  if (!WS || !WS.WebSocketServer) {
    global.logger?.warn?.("[WEBHOOK] Pacchetto `ws` assente: `npm install ws` in Vinyls per WebSocket sito.");
    return false;
  }
  const wss = new WS.WebSocketServer({ noServer: true });
  const onUpgrade = (req, socket, head) => {
    const pathOnly = String(req.url || "").split("?")[0];
    if (!WS_UPGRADE_PATHS.has(pathOnly)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  };
  server.on("upgrade", onUpgrade);
  upgradeListenerAttached = true;
  wss.on("connection", (ws) => {
    const helloT = Date.now();
    try {
      ws.send(JSON.stringify({ type: "suggestions_hello", t: helloT }));
      ws.send(JSON.stringify({ type: "realtime_hello", t: helloT }));
    } catch (e) {
          }
    ws.on("error", () => {});
  });
  wssSingleton = wss;
  global.logger?.info?.(
    `[WEBHOOK] WebSocket realtime: ${SITE_REALTIME_WS_PATH} (alias ${LEGACY_SUGGESTIONS_WS_PATH})`,
  );
  return true;
}

function isTruthyEnv(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function broadcastSiteRealtime(payload) {
  if (!wssSingleton || !payload || typeof payload !== "object") return;
  const OPEN = 1;
  let json;
  try {
    json = JSON.stringify(payload);
  } catch {
    return;
  }
  for (const client of wssSingleton.clients) {
    if (client.readyState === OPEN) {
      try {
        client.send(json);
      } catch (e) {
              }
    }
  }
}

function notifyExternalSiteRealtime(payload) {
  if (!isTruthyEnv("SITE_API_EXTERNAL")) return;
  if (isTruthyEnv("SITE_API_PROCESS")) return;
  if (!payload || typeof payload !== "object") return;
  const port = Number(process.env.SITE_API_PORT || 3020) || 3020;
  const secret = String(process.env.SITE_REALTIME_NOTIFY_SECRET || "local").trim() || "local";
  const body = JSON.stringify(payload);
  void fetch(`http://127.0.0.1:${port}/webhooks/site-realtime/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Notify": secret,
    },
    body,
  }).catch(() => null);
}

function broadcastSiteSuggestionsChanged() {
  const payload = { type: "suggestions_changed", at: new Date().toISOString() };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteNotificationsChanged(extra = null) {
  const payload = {
    type: "notifications_changed",
    at: new Date().toISOString(),
  };
  /* badgeCrossDevice1: unread + userId → altri device aggiornano badge senza aspettare full sync */
  try {
    if (extra && typeof extra === "object") {
      const uid = String(extra.userId || "").trim();
      if (/^\d{17,20}$/.test(uid)) payload.userId = uid;
      if (Number.isFinite(Number(extra.unread))) {
        payload.unread = Math.max(0, Math.min(99, Math.floor(Number(extra.unread))));
      }
    }
  } catch (_) {}
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteReviewsChanged() {
  const payload = { type: "reviews_changed", at: new Date().toISOString() };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteConfessionaleChanged(action = "") {
  const payload = {
    type: "confessionale_changed",
    action: String(action || "").trim().toLowerCase() || "changed",
    at: new Date().toISOString(),
  };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteStaffPausesChanged() {
  const payload = { type: "staff_pauses_changed", at: new Date().toISOString() };
  try {
    const { invalidateStaffPauseCalendarCache } = require("./siteStaffPauseApi");
    invalidateStaffPauseCalendarCache();
  } catch {
      }
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteStaffWorkflowChanged(queue = "") {
  const payload = {
    type: "staff_workflow_changed",
    queue: String(queue || "").trim().toLowerCase(),
    at: new Date().toISOString(),
  };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

/** Debounce fanout workflow (store/notifications burst). */
const __workflowChangedDebounce = new Map();
function broadcastSiteStaffWorkflowChangedDebounced(queue = "", ms = 280) {
  const q = String(queue || "").trim().toLowerCase();
  const key = q || "_";
  const prev = __workflowChangedDebounce.get(key);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    __workflowChangedDebounce.delete(key);
    broadcastSiteStaffWorkflowChanged(q);
  }, Math.max(80, Number(ms) || 280));
  __workflowChangedDebounce.set(key, t);
}

/** staffProfLiveAll1 — client already listens for staff_profile_changed */
function broadcastSiteStaffProfileChanged(userId, extras = {}) {
  const uid = String(userId || (extras && extras.userId) || "").trim();
  const payload = {
    type: "staff_profile_changed",
    userId: uid || undefined,
    action: String((extras && extras.action) || "").trim() || undefined,
    at: new Date().toISOString(),
  };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

/** siteLiveAll1 — client already listens for staff_compiti_changed */
function broadcastSiteStaffCompitiChanged(extras = {}) {
  const payload = {
    type: "staff_compiti_changed",
    userId: String((extras && extras.userId) || "").trim() || undefined,
    weekKey: String((extras && extras.weekKey) || "").trim() || undefined,
    action: String((extras && extras.action) || "").trim() || undefined,
    at: new Date().toISOString(),
  };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteBoardsChanged(action = "", extras = {}) {
  const ex = extras && typeof extras === "object" ? extras : {};
  const payload = {
    type: "boards_changed",
    action: String(action || ex.action || "changed").trim().toLowerCase() || "changed",
    listingId: ex.listingId ? String(ex.listingId) : undefined,
    slug: ex.slug ? String(ex.slug) : undefined,
    kind: ex.kind ? String(ex.kind) : undefined,
    at: new Date().toISOString(),
  };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteLiveStatsChanged() {
  const payload = { type: "live_stats_changed", at: new Date().toISOString() };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteUiChanged(scope = "", extras = {}) {
  const ex = extras && typeof extras === "object" ? extras : {};
  const payload = {
    type: "site_ui_changed",
    scope: String(scope || ex.scope || "").trim() || undefined,
    action: String(ex.action || "").trim() || undefined,
    userId: String(ex.userId || "").trim() || undefined,
    at: new Date().toISOString(),
  };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteWebTicketsEvent(payload) {
  if (!payload || typeof payload !== "object") return;
  const body = { ...payload };
  if (!body.at) body.at = new Date().toISOString();
  if (!body.type) body.type = "web_tickets_list_changed";
  broadcastSiteRealtime(body);
  notifyExternalSiteRealtime(body);
}

/** leaveProfileLive1: invalidate site caches + push WS so open profiles drop immediately. */
function invalidateLeftMemberSiteCaches(userId, guildId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    const { markWebsiteMemberLeft } = require("./websiteGuildMemberFetch");
    markWebsiteMemberLeft(uid);
  } catch (_) {}
  try {
    const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi");
    clearStaffProfileCacheForUser(uid);
  } catch (_) {}
  try {
    const { invalidateProfileCacheForUser } = require("./siteUsersLeaderboardApi");
    invalidateProfileCacheForUser(guildId, uid);
  } catch (_) {}
}

function broadcastSiteMemberLeft(userId, guildId = "") {
  const uid = String(userId || "").trim();
  if (!/^\d{17,20}$/.test(uid)) return;
  const gid = String(guildId || "").trim();
  invalidateLeftMemberSiteCaches(uid, gid);
  const payload = {
    type: "member_left",
    userId: uid,
    guildId: gid || undefined,
    at: new Date().toISOString(),
  };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
  /* leaveProfileLive1: bots process often lacks SITE_API_EXTERNAL — always ping site-api loopback */
  if (!isTruthyEnv("SITE_API_PROCESS")) {
    const port = Number(process.env.SITE_API_PORT || 3020) || 3020;
    const secret = String(process.env.SITE_REALTIME_NOTIFY_SECRET || "local").trim() || "local";
    void fetch(`http://127.0.0.1:${port}/webhooks/site-realtime/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Notify": secret,
      },
      body: JSON.stringify(payload),
    }).catch(() => null);
  }
}

module.exports = {
  attachSiteSuggestionsWsServer,
  broadcastSiteSuggestionsChanged,
  broadcastSiteNotificationsChanged,
  broadcastSiteReviewsChanged,
  broadcastSiteConfessionaleChanged,
  broadcastSiteStaffPausesChanged,
  broadcastSiteStaffWorkflowChanged,
  broadcastSiteStaffWorkflowChangedDebounced,
  broadcastSiteStaffProfileChanged,
  broadcastSiteStaffCompitiChanged,
  broadcastSiteBoardsChanged,
  broadcastSiteLiveStatsChanged,
  broadcastSiteUiChanged,
  broadcastSiteWebTicketsEvent,
  broadcastSiteMemberLeft,
  invalidateLeftMemberSiteCaches,
  broadcastSiteRealtime,
  notifyExternalSiteRealtime,
  SUGGESTIONS_WS_PATH: LEGACY_SUGGESTIONS_WS_PATH,
  SITE_REALTIME_WS_PATH,
  WS_UPGRADE_PATHS,
};