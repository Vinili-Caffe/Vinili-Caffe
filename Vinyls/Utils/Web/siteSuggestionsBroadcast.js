/**
 * Hub WebSocket (stessa porta degli altri /webhooks/*).
 * Path canonico: /webhooks/site-realtime-ws — alias: /webhooks/site-suggestions-ws (nginx già configurato).
 * Messaggi: suggestions_changed, notifications_changed, reviews_changed, staff_pauses_changed,
 * web_ticket_*, web_tickets_list_changed, + hello iniziali.
 */
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
      /* ignore */
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
        /* ignore */
      }
    }
  }
}

/**
 * Con SITE_API_EXTERNAL i browser WS sono su site-api (3020), mentre bot scrive voti/reminder.
 * Notifica localhost così il realtime arriva comunque ai client collegati a site-api.
 */
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

function broadcastSiteNotificationsChanged() {
  const payload = { type: "notifications_changed", at: new Date().toISOString() };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteReviewsChanged() {
  const payload = { type: "reviews_changed", at: new Date().toISOString() };
  broadcastSiteRealtime(payload);
  notifyExternalSiteRealtime(payload);
}

function broadcastSiteStaffPausesChanged() {
  const payload = { type: "staff_pauses_changed", at: new Date().toISOString() };
  try {
    const { invalidateStaffPauseCalendarCache } = require("./siteStaffPauseApi");
    invalidateStaffPauseCalendarCache();
  } catch {
    /* ignore */
  }
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

module.exports = {
  attachSiteSuggestionsWsServer,
  broadcastSiteSuggestionsChanged,
  broadcastSiteNotificationsChanged,
  broadcastSiteReviewsChanged,
  broadcastSiteStaffPausesChanged,
  broadcastSiteWebTicketsEvent,
  broadcastSiteRealtime,
  SUGGESTIONS_WS_PATH: LEGACY_SUGGESTIONS_WS_PATH,
  SITE_REALTIME_WS_PATH,
  WS_UPGRADE_PATHS,
};