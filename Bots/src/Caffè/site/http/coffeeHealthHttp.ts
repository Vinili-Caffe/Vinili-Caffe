const http = require("http") as typeof import("http");
const mongoose = require("mongoose") as typeof import("mongoose");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");

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

async function measureDiscordRestPingMs(client?) {
  if (!client?.rest?.get) return null;
  const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");
  const t0 = Date.now();
  try {
    await client.rest.get(Routes.user("@me"));
    return Math.max(0, Date.now() - t0);
  } catch {
    return null;
  }
}

async function measureMongoPingMs() {
  if (!isMongoReady()) return null;
  const t0 = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    return Math.max(0, Date.now() - t0);
  } catch {
    return null;
  }
}

function resolveShardLabel(client?) {
  const shardIds = Array.isArray(client?.shard?.ids)
    ? client.shard.ids.map((id?) => Number(id)).filter((id?) => Number.isInteger(id) && id >= 0)
    : [];
  if (shardIds.length) return String(shardIds[0]);
  return "0";
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
        const help = require("../../core/wikiHelpCatalog") as typeof import("../../core/wikiHelpCatalog");
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

    void (async () => {
      try {
        const ready = Boolean(boundClient?.isReady?.() || boundClient?.user?.id);
        const rawGw = Number(boundClient?.ws?.ping);
        const gatewayPingMs = Number.isFinite(rawGw) && rawGw >= 0 ? Math.round(rawGw) : null;
        const [restPingMs, mongoPingMs] = await Promise.all([measureDiscordRestPingMs(boundClient), measureMongoPingMs()]);
        const memMb = Math.round((process.memoryUsage().rss || 0) / (1024 * 1024));
        json(res, ready ? 200 : 503, {
          ok: ready,
          status: ready ? "online" : "starting",
          service: "coffee",
          bot: boundClient?.user?.tag || boundClient?.user?.username || null,
          gatewayPingMs,
          restPingMs,
          mongoPingMs,
          shard: resolveShardLabel(boundClient),
          uptimeSec: Math.floor(process.uptime()),
          memMb,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        global.logger?.error?.("[HEALTH] Coffee health:", err?.message || err);
        json(res, 503, { ok: false, status: "error", service: "coffee", error: "health_failed" });
      }
    })();
  });
  server.listen(port, host, () => {
    if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
      global.logger?.info?.(`[HEALTH] Coffee listening on http://${host}:${port}/health`);
    }
  });
  server.on("error", (err?) => {
    global.logger?.error?.("[HEALTH] Coffee HTTP error:", err?.message || err);
  });
  return server;
}

export = { startCoffeeHealthHttpServer };
