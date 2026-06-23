const net = require("node:net");
const mongoose = require("mongoose");

const MONGO_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 15_000,
  connectTimeoutMS: 15_000,
  socketTimeoutMS: 20_000,
  maxPoolSize: 25,
  minPoolSize: 1,
  maxIdleTimeMS: 60_000,
};
const MONGO_LOCAL_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 15_000,
  connectTimeoutMS: 15_000,
  socketTimeoutMS: 45_000,
  heartbeatFrequencyMS: 10_000,
};
const MONGO_RETRY_ATTEMPTS = 5;
const MONGO_RETRY_DELAY_MS = 1000;
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

function buildMongoUrl(client) {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    client?.config?.mongoURL
  );
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

  const delay = Math.min(60_000, 2000 * Math.pow(2, reconnectBackoffAttempt));
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
  await waitForMongoReachable(mongoUrl);

  const fallbackUrl = mongoUrlWith127(mongoUrl);
  const urlsToTry = [mongoUrl];
  if (fallbackUrl && fallbackUrl !== mongoUrl) urlsToTry.push(fallbackUrl);

  logDb(client, "info", "[DATABASE] Connecting to: " + maskMongoUrlForLog(mongoUrl));

  for (let attempt = 1; attempt <= MONGO_RETRY_ATTEMPTS; attempt += 1) {
    for (const url of urlsToTry) {
      if (isMongoReady()) return true;
      try {
        await mongoose.connect(url, buildConnectOptions(url));
        installMongoDisconnectHook(client);
        reconnectBackoffAttempt = 0;
        logDb(client, "info", "[DATABASE] Connected to MongoDB successfully.");
        return true;
      } catch (err) {
        if (isMongoReady()) return true;
        const isLast = attempt === MONGO_RETRY_ATTEMPTS && url === urlsToTry[urlsToTry.length - 1];
        if (isLast) {
          logDb(client, "error", `[DATABASE] Error connecting to the database (${err?.message || err})`);
          return false;
        }
        if (attempt > 1 || url !== mongoUrl) {
          logDb(
            client,
            "info",
            `[DATABASE] Retry ${attempt}/${MONGO_RETRY_ATTEMPTS} (${err?.message || err})`,
          );
        }
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

module.exports = {
  buildMongoUrl,
  connectMongo,
  ensureMongoReady,
  isMongoReady,
  isMongoTransientError,
  maskMongoUrlForLog,
  waitForMongoReachable,
  waitForMongoConnection,
  withMongoTimeout,
};