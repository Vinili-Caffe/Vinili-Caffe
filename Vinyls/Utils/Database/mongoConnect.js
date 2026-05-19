const mongoose = require("mongoose");

const MONGO_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 20000,
  maxPoolSize: 25,
  minPoolSize: 2,
  maxIdleTimeMS: 60_000,
};
const MONGO_RETRY_ATTEMPTS = 4;
const MONGO_RETRY_DELAY_MS = 3000;

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

async function connectMongo(client) {
  const mongoUrl = buildMongoUrl(client);
  if (!mongoUrl) {
    logDb(client, "error", "[DATABASE] No MongoDB URL. Set MONGO_URL or MONGO_URL_LOCAL (or MONGODB_URI) in .env.");
    return false;
  }

  logDb(client, "info", "[DATABASE] Connecting to: " + maskMongoUrlForLog(mongoUrl));

  mongoose.set("strictQuery", false);
  mongoose.set("bufferCommands", false);

  if (mongoose.connection.readyState === 1) {
    logDb(client, "info", "[DATABASE] Already connected to MongoDB.");
    return true;
  }

  const fallbackUrl = mongoUrlWith127(mongoUrl);
  const urlsToTry = [mongoUrl];
  if (fallbackUrl && fallbackUrl !== mongoUrl) urlsToTry.push(fallbackUrl);

  for (let attempt = 1; attempt <= MONGO_RETRY_ATTEMPTS; attempt += 1) {
    for (const url of urlsToTry) {
      try {
        await mongoose.connect(url, MONGO_CONNECT_OPTIONS);
        logDb(client, "info", "[DATABASE] Connected to MongoDB successfully.");
        return true;
      } catch (err) {
        const isLast = attempt === MONGO_RETRY_ATTEMPTS && url === urlsToTry[urlsToTry.length - 1];
        if (isLast) {
          logDb(client, "error", `[DATABASE] Error connecting to the database (${err?.message || err})`);
          return false;
        }
        if (attempt === 1 && url === mongoUrl) {
          logDb(
            client,
            "info",
            `[DATABASE] First connection failed, retrying up to ${MONGO_RETRY_ATTEMPTS - 1} times (${err?.message || err})`,
          );
        }
      }
    }
    if (attempt < MONGO_RETRY_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, MONGO_RETRY_DELAY_MS));
    }
  }

  logDb(client, "error", "[DATABASE] All connection attempts failed.");
  return false;
}

module.exports = {
  buildMongoUrl,
  connectMongo,
  isMongoReady,
  maskMongoUrlForLog,
};