const net = require("node:net");
const mongoose = require("mongoose");

/* perfP2: pool bot più stretto (multi-process verso stesso Mongo) */
const MONGO_POOL = Math.max(2, Math.min(16, Number(process.env.VC_MONGO_POOL_SIZE || 6) || 6));
const MONGO_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 8_000,
  connectTimeoutMS: 8_000,
  socketTimeoutMS: 20_000,
  maxPoolSize: MONGO_POOL,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  autoIndex: false,
  autoCreate: false,
  family: 4,
};
const MONGO_LOCAL_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 5_000,
  socketTimeoutMS: 30_000,
  heartbeatFrequencyMS: 8_000,
  maxPoolSize: MONGO_POOL,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  autoIndex: false,
  autoCreate: false,
  family: 4,
};
const MONGO_RETRY_ATTEMPTS = 5;
const MONGO_RETRY_DELAY_MS = 400;
const MONGO_TCP_PROBE_INTERVAL_MS = 400;

let connectInFlight = null;
let disconnectHookInstalled = false;
let reconnectTimer = null;
let reconnectBackoffAttempt = 0;

function parseMongoEndpoint(url) {
  const raw = String(url || "");
  if (!raw) return null;
  try {
    const parsed = new URL(raw.replace(/^mongodb(\+srv)?:/, "https:"));
    const host = (parsed.hostname || "").toLowerCase();
    if (!host) return null;
    const port = Number(parsed.port || (raw.startsWith("mongodb+srv") ? 27017 : 27017));
    return { host, port, isLocal: host === "127.0.0.1" || host === "localhost" };
  } catch {
    return null;
  }
}

function tcpReachable(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForMongoReachable(url, maxWaitMs = 30_000) {
  const endpoint = parseMongoEndpoint(url);
  if (!endpoint?.isLocal) return true;
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (await tcpReachable(endpoint.host, endpoint.port)) return true;
    await new Promise((r) => setTimeout(r, MONGO_TCP_PROBE_INTERVAL_MS));
  }
  return false;
}

function buildConnectOptions(url) {
  const opts = { ...MONGO_CONNECT_OPTIONS };
  const endpoint = parseMongoEndpoint(url);
  if (endpoint?.isLocal) {
    Object.assign(opts, MONGO_LOCAL_CONNECT_OPTIONS);
    opts.directConnection = true;
  }
  return opts;
}

let dualMongoWarned = false;

function mongoHostKey(url) {
  const ep = parseMongoEndpoint(url);
  if (!ep?.host) return "";
  return `${ep.host}:${ep.port || 27017}`;
}

/**
 * mongoSingleSource1: una sola sorgente attiva.
 * Se esiste MONGO_URL_LOCAL, Atlas (MONGO_URL srv) viene ignorato — evita DB divergenti.
 */
function buildMongoUrl(client) {
  const local =
    String(process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || "").trim() || null;
  const remote =
    String(process.env.MONGO_URL || process.env.MONGODB_URI || "").trim() || null;
  const fromConfig = String(client?.config?.mongoURL || "").trim() || null;

  if (local) {
    if (!dualMongoWarned && remote && mongoHostKey(local) !== mongoHostKey(remote)) {
      dualMongoWarned = true;
      const msg =
        "[DATABASE] mongoSingleSource1: uso SOLO LOCAL (" +
        maskMongoUrlForLog(local) +
        "); ignoro Atlas/remoto (" +
        maskMongoUrlForLog(remote) +
        "). Allinea MONGO_URL a LOCAL o sposta Atlas in MONGO_URL_ATLAS_BACKUP.";
      try {
        global.logger?.warn?.(msg);
      } catch (_) {
        console.warn(msg);
      }
    }
    return local;
  }
  return remote || fromConfig || null;
}

function resolveMongoUrl(client) {
  return buildMongoUrl(client);
}

function mongoUrlWith127(url) {
  if (!url || typeof url !== "string" || url.startsWith("mongodb+srv://")) return null;
  try {
    const parsed = new URL(url.replace(/^mongodb:/, "https:"));
    const host = (parsed.hostname || "").toLowerCase();
    if (host === "127.0.0.1") return null;
    parsed.hostname = "127.0.0.1";
    return parsed.toString().replace(/^https:/, "mongodb:");
  } catch {
    return null;
  }
}

function maskMongoUrlForLog(url) {
  if (!url || typeof url !== "string") return "***";
  try {
    const u = url.replace(/^mongodb(\+srv)?:/, "https:");
    const parsed = new URL(u);
    const host = (parsed.hostname || "").toLowerCase();
    const path = (parsed.pathname || "/").replace(/^\//, "") || "(default)";
    const protocol = url.startsWith("mongodb+srv") ? "mongodb+srv" : "mongodb";
    return `${protocol}://***@${host}${parsed.port && parsed.port !== "443" && parsed.port !== "80" ? ":" + parsed.port : ""}/${path}`;
  } catch {
    return "***";
  }
}

function isMongoReady() {
  return mongoose.connection?.readyState === 1;
}

function isMongoTransientError(error) {
  let err = error;
  while (err) {
    const name = String(err.name || "");
    if (
      name === "MongoNetworkTimeoutError" ||
      name === "MongoServerSelectionError" ||
      name === "PoolClearedOnNetworkError" ||
      name === "MongoNetworkError"
    ) {
      return true;
    }
    err = err.cause;
  }
  return false;
}

function isMongoConnecting() {
  return mongoose.connection?.readyState === 2;
}

function waitForMongoConnection(timeoutMs = 20_000) {
  if (isMongoReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const conn = mongoose.connection;
    const onDone = () => {
      cleanup();
      resolve(isMongoReady());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(isMongoReady());
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      conn.off("connected", onDone);
      conn.off("error", onDone);
      conn.off("disconnected", onDone);
    };
    conn.once("connected", onDone);
    conn.once("error", onDone);
    conn.once("disconnected", onDone);
  });
}

function logDb(client, level, ...args) {
  const logs = client?.logs;
  if (level === "error") {
    if (logs?.error) return logs.error(...args);
    return global.logger?.error?.(...args);
  }
  if (logs?.success) return logs.success(...args);
  if (logs?.logging) return logs.logging(...args);
  if (global.logger?.info) return global.logger.info(...args);
  console.log(...args);
}

function resolveMongoClient(client) {
  return client || global.__vinylsDiscordClient || global.botClient || null;
}

function scheduleMongoReconnect(client) {
  const boundClient = resolveMongoClient(client);
  if (!boundClient || reconnectTimer) return;
  if (isMongoReady() || isMongoConnecting() || connectInFlight) return;

  const delay = Math.min(15_000, 400 * Math.pow(2, reconnectBackoffAttempt));
  reconnectBackoffAttempt = Math.min(reconnectBackoffAttempt + 1, 6);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (isMongoReady()) {
      reconnectBackoffAttempt = 0;
      return;
    }
    logDb(boundClient, "info", `[DATABASE] Reconnecting after disconnect (backoff ${delay}ms)...`);
    void connectMongo(boundClient).then((ok) => {
      if (ok) reconnectBackoffAttempt = 0;
    }).catch(() => null);
  }, delay);
  reconnectTimer.unref?.();
}

function installMongoDisconnectHook(client) {
  if (disconnectHookInstalled) return;
  disconnectHookInstalled = true;
  const boundClient = resolveMongoClient(client);
  mongoose.connection.on("disconnected", () => {
    scheduleMongoReconnect(boundClient);
  });
  mongoose.connection.on("error", (err) => {
    if (!isMongoTransientError(err)) return;
    global.logger?.warn?.("[DATABASE] Transient pool error:", err?.message || err);
    scheduleMongoReconnect(boundClient);
  });
}

function withMongoTimeout(promise, ms = 8000, label = "mongo") {
  const limit = Math.max(500, Number(ms) || 8000);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${limit}ms`));
      }, limit);
      timer.unref?.();
    }),
  ]);
}

async function ensureMongoReady(opts = {}) {
  if (isMongoReady()) return true;
  const maxWaitMs = Math.max(0, Number(opts.maxWaitMs ?? 5000));
  const client = resolveMongoClient(opts.client);
  if (client && !isMongoConnecting() && !connectInFlight) {
    void connectMongo(client).catch(() => null);
  }
  if (maxWaitMs <= 0) return isMongoReady();
  return waitForMongoConnection(maxWaitMs);
}

async function runConnectMongo(client, mongoUrl) {
  const startedAt = Date.now();
  await waitForMongoReachable(mongoUrl, 3_000);

  const fallbackUrl = mongoUrlWith127(mongoUrl);
  const urlsToTry = [mongoUrl];
  if (fallbackUrl && fallbackUrl !== mongoUrl) urlsToTry.push(fallbackUrl);

  logDb(client, "info", "[DATABASE] Connecting to: " + maskMongoUrlForLog(mongoUrl));

  for (let attempt = 1; attempt <= MONGO_RETRY_ATTEMPTS; attempt += 1) {
    for (const url of urlsToTry) {
      if (isMongoReady()) return true;
      try {
        const connectStarted = Date.now();
        await mongoose.connect(url, buildConnectOptions(url));
        installMongoDisconnectHook(client);
        reconnectBackoffAttempt = 0;
        logDb(
          client,
          "info",
          `[DATABASE] Connected to MongoDB successfully (${Date.now() - connectStarted}ms, total ${Date.now() - startedAt}ms).`,
        );
        return true;
      } catch (err) {
        if (isMongoReady()) return true;
        const isLast = attempt === MONGO_RETRY_ATTEMPTS && url === urlsToTry[urlsToTry.length - 1];
        logDb(
          client,
          isLast ? "error" : "info",
          `[DATABASE] ${isLast ? "Error connecting" : `Retry ${attempt}/${MONGO_RETRY_ATTEMPTS}`} (${err?.message || err})`,
        );
        if (isLast) return false;
      }
    }
    if (attempt < MONGO_RETRY_ATTEMPTS) {
      await waitForMongoReachable(mongoUrl, 5_000);
      await new Promise((r) => setTimeout(r, MONGO_RETRY_DELAY_MS));
    }
  }

  logDb(client, "error", "[DATABASE] All connection attempts failed.");
  return false;
}

async function connectMongo(client) {
  const mongoUrl = buildMongoUrl(client);
  if (!mongoUrl) {
    logDb(client, "error", "[DATABASE] No MongoDB URL. Set MONGO_URL or MONGO_URL_LOCAL (or MONGODB_URI) in .env.");
    return false;
  }

  mongoose.set("strictQuery", false);
  mongoose.set("bufferCommands", false);

  if (isMongoReady()) {
    return true;
  }

  if (connectInFlight) {
    return connectInFlight;
  }

  if (isMongoConnecting()) {
    const ok = await waitForMongoConnection();
    if (ok) return true;
  }

  connectInFlight = runConnectMongo(client, mongoUrl).finally(() => {
    connectInFlight = null;
  });
  return connectInFlight;
}

async function closeMongoGraceful(reason = "shutdown") {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  connectInFlight = null;
  if (!mongoose.connection || mongoose.connection.readyState === 0) return true;
  try {
    await mongoose.connection.close(false);
    global.logger?.info?.(`[DATABASE] Closed gracefully (${reason}).`);
    return true;
  } catch (err) {
    global.logger?.warn?.("[DATABASE] Close failed:", err?.message || err);
    return false;
  }
}

function isBenignIndexError(err) {
  const msg = String(err?.message || err || "");
  return (
    /too many indexes/i.test(msg) ||
    /same name as the requested index/i.test(msg) ||
    /IndexOptionsConflict|IndexKeySpecsConflict|already exists/i.test(msg) ||
    /Expression not supported in partial index/i.test(msg) ||
    /E11000 duplicate key/i.test(msg)
  );
}

async function ensureMongoIndexes({ reason = "manual" } = {}) {
  if (!isMongoReady()) return { ok: false, reason: "not_ready" };
  const models = Object.values(mongoose.models || {});
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  const startedAt = Date.now();
  for (const model of models) {
    try {
      await model.createIndexes();
      ok += 1;
    } catch (err) {
      if (isBenignIndexError(err)) {
        skipped += 1;
        global.logger?.debug?.(
          `[DATABASE] createIndexes skip ${model?.modelName || "?"}:`,
          err?.message || err,
        );
      } else {
        failed += 1;
        global.logger?.warn?.(
          `[DATABASE] createIndexes ${model?.modelName || "?"}:`,
          err?.message || err,
        );
      }
    }
  }
  global.logger?.info?.(
    `[DATABASE] ensureIndexes (${reason}): models=${models.length} ok=${ok} skipped=${skipped} failed=${failed} in ${Date.now() - startedAt}ms.`,
  );
  return { ok: failed === 0, models: models.length, createdOk: ok, skipped, failed };
}

module.exports = {
  buildMongoUrl,
  resolveMongoUrl,
  connectMongo,
  closeMongoGraceful,
  ensureMongoReady,
  ensureMongoIndexes,
  isMongoReady,
  isMongoTransientError,
  maskMongoUrlForLog,
  waitForMongoReachable,
  waitForMongoConnection,
  withMongoTimeout,
};