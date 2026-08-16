const http = require("http");

let server = null;

function resolveCoffeeHealthPort() {
  const n = Number(process.env.COFFEE_HEALTH_PORT || 3011);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3011;
}

function startCoffeeHealthHttpServer(client) {
  if (server) return server;
  const port = resolveCoffeeHealthPort();
  const host = String(process.env.COFFEE_HEALTH_HOST || "127.0.0.1").trim() || "127.0.0.1";
  server = http.createServer((req, res) => {
    const pathOnly = String(req.url || "/").split("?")[0];
    if (req.method !== "GET" || (pathOnly !== "/health" && pathOnly !== "/webhooks/status" && pathOnly !== "/")) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    const ready = Boolean(client?.isReady?.() || client?.user?.id);
    const payload = {
      ok: ready,
      status: ready ? "online" : "starting",
      service: "coffee",
      bot: client?.user?.tag || client?.user?.username || null,
      ts: new Date().toISOString(),
    };
    res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  });
  server.listen(port, host, () => {
    global.logger?.info?.(`[HEALTH] Coffee listening on http://${host}:${port}/health`);
  });
  server.on("error", (err) => {
    global.logger?.error?.("[HEALTH] Coffee HTTP error:", err?.message || err);
  });
  return server;
}

module.exports = { startCoffeeHealthHttpServer, resolveCoffeeHealthPort };
