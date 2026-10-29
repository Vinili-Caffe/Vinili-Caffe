/**
 * Probe/wait Lavalink condiviso (Vinyls + Coffee) — evita doppia copia del wait TCP/HTTP.
 */
const net = require("net") as typeof import("net");

function parseLavalinkHost(rawInput?) {
  const raw = String(rawInput || process.env.LAVALINK_HOST || "127.0.0.1:2333")
    .trim()
    .replace(/^https?:\/\//i, "");
  const lastColon = raw.lastIndexOf(":");
  const host = lastColon > 0 ? raw.slice(0, lastColon) : raw || "127.0.0.1";
  const port = parseInt(lastColon > 0 ? raw.slice(lastColon + 1) : "2333", 10) || 2333;
  const url = `${host}:${port}`;
  return { host, port, url };
}

function probeLavalinkTcp(host?, port?, timeoutMs = 1500) {
  return new Promise((resolve?) => {
    const socket = net.connect({ host, port, family: 4 });
    let settled = false;
    const done = (ok?) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (_) {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
  });
}

async function probeLavalinkHttpReady(host?, port?, timeoutMs = 2500) {
  const password = process.env.LAVALINK_PASSWORD || "youshallnotpass";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${port}/version`, {
      headers: { Authorization: password },
      signal: ctrl.signal,
    });
    return Boolean(res?.ok);
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function isTransientLavalinkConnectError(err?) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|connect ECONNREFUSED/i.test(msg) ||
    /websocket closed before a connection was established/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /socket hang up/i.test(msg) ||
    /EPIPE/i.test(msg)
  );
}

async function waitUntilLavalinkReady(opts: Record<string, any> = {}) {
  const { host, port, url } = parseLavalinkHost(opts.hostRaw);
  const alreadyWaited = ["1", "true", "yes", "on"].includes(
    String(process.env.LAVALINK_ALREADY_WAITED || "").trim().toLowerCase(),
  );
  const defaultWait = alreadyWaited ? 12_000 : 45_000;
  const maxWaitMs = Math.max(
    3_000,
    Number(opts.maxWaitMs || process.env.LAVALINK_MUSIC_WAIT_MS || defaultWait) || defaultWait,
  );
  const started = Date.now();
  let warnedOffline = false;
  const onWaiting = typeof opts.onWaiting === "function" ? opts.onWaiting : null;

  while (Date.now() - started < maxWaitMs) {
    if ((await probeLavalinkTcp(host, port)) && (await probeLavalinkHttpReady(host, port))) {
      return { ok: true, host, port, url };
    }
    if (!warnedOffline) {
      warnedOffline = true;
      onWaiting?.({ host, port, url });
    }
    await new Promise((r?) => setTimeout(r, Number(opts.retryMs) || 2000));
  }

  if (await probeLavalinkHttpReady(host, port)) {
    return { ok: true, host, port, url };
  }
  return { ok: false, host, port, url, waitedMs: Date.now() - started };
}

export = {
  parseLavalinkHost,
  probeLavalinkTcp,
  probeLavalinkHttpReady,
  isTransientLavalinkConnectError,
  waitUntilLavalinkReady,
};
