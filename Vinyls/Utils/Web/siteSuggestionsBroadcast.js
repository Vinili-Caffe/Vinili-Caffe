/**
 * Hub WebSocket (stessa porta degli altri /webhooks/*).
 * Path canonico: /webhooks/site-realtime-ws — alias: /webhooks/site-suggestions-ws (nginx già configurato).
 * Messaggi: suggestions_changed, notifications_changed, reviews_changed, + hello iniziali.
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

function broadcastSiteSuggestionsChanged() {
  broadcastSiteRealtime({ type: "suggestions_changed", at: new Date().toISOString() });
}

function broadcastSiteNotificationsChanged() {
  broadcastSiteRealtime({ type: "notifications_changed", at: new Date().toISOString() });
}

function broadcastSiteReviewsChanged() {
  broadcastSiteRealtime({ type: "reviews_changed", at: new Date().toISOString() });
}

module.exports = {
  attachSiteSuggestionsWsServer,
  broadcastSiteSuggestionsChanged,
  broadcastSiteNotificationsChanged,
  broadcastSiteReviewsChanged,
  broadcastSiteRealtime,
  SUGGESTIONS_WS_PATH: LEGACY_SUGGESTIONS_WS_PATH,
  SITE_REALTIME_WS_PATH,
  WS_UPGRADE_PATHS,
};