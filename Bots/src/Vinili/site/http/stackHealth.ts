const mongoose = require("mongoose") as typeof import("mongoose");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");

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

async function probeCoffeeHealth(timeoutMs = 1500) {
  const { host, port } = resolveCoffeeHealthTarget();
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      ctrl?.abort?.();
    } catch (_) {}
  }, Math.max(250, Number(timeoutMs) || 1500));
  try {
    const res = await fetch(`http://${host}:${port}/health`, {
      signal: ctrl?.signal,
      cache: "no-store",
    });
    const json: any = await res.json().catch(() => ({}));
    const ok = Boolean(res.ok && (json?.ok === true || json?.status === "online"));
    return {
      ok,
      bot: json?.bot || null,
      status: json?.status || (ok ? "online" : "offline"),
    };
  } catch {
    return { ok: false, bot: null, status: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
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

  let coffee = null;
  if (includeCoffee) {
    coffee = await probeCoffeeHealth(1500);
  }

  const checks = {
    bot: botReady,
    mongo: mongoOk && mongoPingMs != null,
    ...(includeLavalink ? { lavalink: Boolean(lavalinkOk) } : {}),
    ...(includeCoffee ? { coffee: Boolean(coffee?.ok) } : {}),
  };
  const ok = Object.values(checks).every(Boolean);

  return {
    ok,
    status: ok ? "online" : "degraded",
    service: String(opts.service || "bots"),
    bot: botTag,
    coffee: coffee?.bot || null,
    checks,
    mongoPingMs,
    uptimeSec: Math.floor(process.uptime()),
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
  probeLavalinkHttpReady,
};
