const mongoose = require("mongoose") as typeof import("mongoose");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");

function resolveLavalinkTarget() {
  const raw = String(process.env.LAVALINK_HOST || process.env.LAVALINK_URL || "127.0.0.1:2333").trim();
  if (!raw) return { host: "127.0.0.1", port: 2333 };
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      return { host: u.hostname || "127.0.0.1", port: Number(u.port) || 2333 };
    }
  } catch (_) {}
  const parts = raw.split(":");
  const host = parts[0] || "127.0.0.1";
  const port = Number(parts[1]) || 2333;
  return { host, port };
}

async function probeLavalinkHttpReady(host?, port?, timeoutMs = 1500) {
  const password = String(process.env.LAVALINK_PASSWORD || "youshallnotpass").trim() || "youshallnotpass";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      ctrl?.abort?.();
    } catch (_) {}
  }, Math.max(250, Number(timeoutMs) || 1500));
  try {
    const res = await fetch(`http://${host}:${port}/version`, {
      headers: { Authorization: password },
      signal: ctrl?.signal,
      cache: "no-store",
    });
    return Boolean(res?.ok);
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function resolveCoffeeHealthTarget() {
  const host = String(process.env.COFFEE_HEALTH_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = Number(process.env.COFFEE_HEALTH_PORT || 3011);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? Math.floor(port) : 3011,
  };
}

function resolveGatewayHealthTarget() {
  const host = String(process.env.BOT_GATEWAY_HEALTH_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = Number(process.env.BOT_GATEWAY_HEALTH_PORT || 3000);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? Math.floor(port) : 3000,
  };
}

function emptyProbe(status = "unreachable") {
  return {
    ok: false,
    bot: null,
    status,
    gatewayPingMs: null,
    restPingMs: null,
    mongoPingMs: null,
    shard: null,
    uptimeSec: null,
    memMb: null,
  };
}

function mapHealthJson(json?, ok = false) {
  return {
    ok,
    bot: json?.bot || null,
    status: json?.status || (ok ? "online" : "offline"),
    gatewayPingMs: Number.isFinite(Number(json?.gatewayPingMs)) ? Number(json.gatewayPingMs) : null,
    restPingMs: Number.isFinite(Number(json?.restPingMs)) ? Number(json.restPingMs) : null,
    mongoPingMs: Number.isFinite(Number(json?.mongoPingMs)) ? Number(json.mongoPingMs) : null,
    shard: json?.shard != null ? String(json.shard) : null,
    uptimeSec: Number.isFinite(Number(json?.uptimeSec)) ? Number(json.uptimeSec) : null,
    memMb: Number.isFinite(Number(json?.memMb)) ? Number(json.memMb) : null,
  };
}

async function probeHttpHealth(url?, timeoutMs = 1500) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      ctrl?.abort?.();
    } catch (_) {}
  }, Math.max(250, Number(timeoutMs) || 1500));
  try {
    const res = await fetch(url, {
      signal: ctrl?.signal,
      cache: "no-store",
    });
    const json: any = await res.json().catch(() => ({}));
    const ok = Boolean(res.ok && (json?.ok === true || json?.status === "online"));
    return mapHealthJson(json, ok);
  } catch {
    return emptyProbe("unreachable");
  } finally {
    clearTimeout(timer);
  }
}

async function probeCoffeeHealth(timeoutMs = 1500) {
  const { host, port } = resolveCoffeeHealthTarget();
  return probeHttpHealth(`http://${host}:${port}/health`, timeoutMs);
}

/** Gateway Discord Vinili (porta 3000) quando site-api è processo separato. */
async function probeGatewayHealth(timeoutMs = 1500) {
  const { host, port } = resolveGatewayHealthTarget();
  return probeHttpHealth(`http://${host}:${port}/webhooks/health`, timeoutMs);
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

function resolveGatewayPingMs(client?) {
  const raw = Number(client?.ws?.ping);
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
}

function resolveShardLabel(client?) {
  const shardIds = Array.isArray(client?.shard?.ids)
    ? client.shard.ids.map((id?) => Number(id)).filter((id?) => Number.isInteger(id) && id >= 0)
    : [];
  if (shardIds.length) return String(shardIds[0]);
  return "0";
}

async function buildStackHealthPayload(client?, opts: Record<string, any> = {}) {
  const includeLavalink = opts.includeLavalink !== false;
  const includeCoffee = opts.includeCoffee !== false;
  const botReady = Boolean(client?.isReady?.() || client?.user?.id);
  const botTag = client?.user?.tag || client?.user?.username || null;
  const mongoOk = isMongoReady();
  let mongoPingMs = null;
  if (mongoOk) {
    const t0 = Date.now();
    try {
      await mongoose.connection.db.admin().ping();
      mongoPingMs = Date.now() - t0;
    } catch (_) {
      mongoPingMs = null;
    }
  }

  let lavalinkOk = null;
  if (includeLavalink) {
    const { host, port } = resolveLavalinkTarget();
    /* lavalinkAuthHealth1: /version con Authorization (TCP aperto ≠ Lavalink sano) */
    lavalinkOk = await probeLavalinkHttpReady(host, port, 1500);
  }

  const serviceName = String(opts.service || "bots");
  const preferGatewayProcess = opts.preferGatewayProcess === true || serviceName === "site-api";

  const [restPingLocal, coffee, gateway] = await Promise.all([
    measureDiscordRestPingMs(client),
    includeCoffee ? probeCoffeeHealth(1500) : Promise.resolve(null),
    preferGatewayProcess ? probeGatewayHealth(1500) : Promise.resolve(null),
  ]);
  let gatewayPingMs = resolveGatewayPingMs(client);
  let restPingMs = restPingLocal;
  let shard = resolveShardLabel(client);
  const mem = process.memoryUsage();
  let memMb = Math.round((mem.rss || 0) / (1024 * 1024));
  let uptimeSec = Math.floor(process.uptime());
  let botOut = botTag;

  /* Su site-api il client non ha il websocket Discord: le metriche “Bot Vinili” vengono dal gateway. */
  if (gateway?.ok) {
    if (gatewayPingMs == null) gatewayPingMs = gateway.gatewayPingMs ?? null;
    if (restPingMs == null) restPingMs = gateway.restPingMs ?? null;
    if (preferGatewayProcess) {
      botOut = gateway.bot || botOut;
      shard = gateway.shard || shard;
      if (gateway.memMb != null) memMb = gateway.memMb;
      if (gateway.uptimeSec != null) uptimeSec = gateway.uptimeSec;
      if (gateway.mongoPingMs != null && mongoPingMs == null) mongoPingMs = gateway.mongoPingMs;
    }
  }

  const checks = {
    bot: preferGatewayProcess ? Boolean(gateway?.ok || botReady) : botReady,
    mongo: mongoOk && mongoPingMs != null,
    ...(includeLavalink ? { lavalink: Boolean(lavalinkOk) } : {}),
    ...(includeCoffee ? { coffee: Boolean(coffee?.ok) } : {}),
  };
  const ok = Object.values(checks).every(Boolean);

  return {
    ok,
    status: ok ? "online" : "degraded",
    service: serviceName,
    bot: botOut,
    coffee: coffee?.bot || null,
    checks,
    mongoPingMs,
    gatewayPingMs,
    restPingMs,
    shard,
    memMb,
    uptimeSec,
    coffeeDetail: coffee
      ? {
          ok: Boolean(coffee.ok),
          bot: coffee.bot || null,
          status: coffee.status || null,
          gatewayPingMs: coffee.gatewayPingMs ?? null,
          restPingMs: coffee.restPingMs ?? null,
          mongoPingMs: coffee.mongoPingMs ?? null,
          shard: coffee.shard ?? null,
          uptimeSec: coffee.uptimeSec ?? null,
          memMb: coffee.memMb ?? null,
        }
      : null,
    ts: new Date().toISOString(),
  };
}

function sendStackHealth(client?, req?, res?, opts: Record<string, any> = {}) {
  return buildStackHealthPayload(client, opts)
    .then((payload?) => {
      res.status(payload.ok ? 200 : 503).json(payload);
    })
    .catch((err?) => {
      global.logger?.error?.("[WEBHOOK] health:", err?.message || err);
      res.status(503).json({
        ok: false,
        status: "error",
        service: String(opts.service || "bots"),
        error: "health_failed",
      });
    });
}

export = {
  sendStackHealth,
  probeCoffeeHealth,
  probeGatewayHealth,
  probeLavalinkHttpReady,
};
