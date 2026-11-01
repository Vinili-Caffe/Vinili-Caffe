const http = require("http") as typeof import("http");

let server = null;
let boundClient = null;

function resolveCoffeeHealthPort() {
  const n = Number(process.env.COFFEE_HEALTH_PORT || 3011);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3011;
}

function parseRolesQuery(urlPathWithQuery?) {
  try {
    const u = new URL(String(urlPathWithQuery || "/"), "http://coffee.local");
    const raw = String(u.searchParams.get("roles") || "").trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((id?) => String(id || "").trim())
      .filter((id?) => /^\d{17,22}$/.test(id));
  } catch (_) {
    return [];
  }
}

function json(res?, status?, payload?) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function startCoffeeHealthHttpServer(client?) {
  boundClient = client || boundClient;
  if (server) return server;
  const port = resolveCoffeeHealthPort();
  const host = String(process.env.COFFEE_HEALTH_HOST || "127.0.0.1").trim() || "127.0.0.1";
  server = http.createServer((req?, res?) => {
    const rawUrl = String(req.url || "/");
    const pathOnly = rawUrl.split("?")[0];
    if (req.method !== "GET") {
      json(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    if (pathOnly === "/webhooks/site-wiki-help") {
      try {
        const ready = Boolean(boundClient?.isReady?.() || boundClient?.user?.id);
        if (!ready) {
          json(res, 503, { ok: false, error: "coffee_not_ready" });
          return;
        }
        const roleIds = parseRolesQuery(rawUrl);
        const help = require("../../Prefix/Utility/help") as typeof import("../../Prefix/Utility/help");
        if (typeof help.buildWikiHelpCatalog !== "function") {
          json(res, 500, { ok: false, error: "catalog_unavailable" });
          return;
        }
        const catalog = help.buildWikiHelpCatalog(boundClient, roleIds);
        json(res, 200, {
          ok: true,
          bot: "coffee",
          catalog,
        });
      } catch (err) {
        global.logger?.error?.("[HEALTH] Coffee wiki-help:", err?.message || err);
        json(res, 500, { ok: false, error: "internal" });
      }
      return;
    }

    if (pathOnly !== "/health" && pathOnly !== "/webhooks/status" && pathOnly !== "/") {
      json(res, 404, { ok: false, error: "not_found" });
      return;
    }
    const ready = Boolean(boundClient?.isReady?.() || boundClient?.user?.id);
    json(res, ready ? 200 : 503, {
      ok: ready,
      status: ready ? "online" : "starting",
      service: "coffee",
      bot: boundClient?.user?.tag || boundClient?.user?.username || null,
      ts: new Date().toISOString(),
    });
  });
  server.listen(port, host, () => {
    global.logger?.info?.(`[HEALTH] Coffee listening on http://${host}:${port}/health`);
  });
  server.on("error", (err?) => {
    global.logger?.error?.("[HEALTH] Coffee HTTP error:", err?.message || err);
  });
  return server;
}

export = { startCoffeeHealthHttpServer };
