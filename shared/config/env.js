function getToken(config = {}, envKey = "DISCORD_TOKEN") {
  return process.env[envKey] || process.env.DISCORD_TOKEN || config?.token || null;
}

function getMongoUrl(config = {}) {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    config?.mongoURL ||
    config?.mongoUrl ||
    null
  );
}

function ensureToken(token, botLabel = "Bot") {
  if (!token || typeof token !== "string" || !token.trim()) {
    if (global.logger?.error) {
      global.logger.error(`Token mancante per ${botLabel}. Imposta la variabile d'ambiente corretta nel .env.`);
    }
    process.exit(1);
  }
  return token;
}

function clientIdFromBotToken(token) {
  const raw = String(token || "").trim();
  const head = raw.split(".")[0];
  if (!head) return null;
  try {
    const pad = "=".repeat((4 - (head.length % 4)) % 4);
    const decoded = Buffer.from(head + pad, "base64").toString("utf8").trim();
    return /^\d{17,20}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function assertBotTokenIdentity(token, {
  botLabel = "Bot",
  expectedClientId = null,
  forbiddenClientId = null,
} = {}) {
  const got = clientIdFromBotToken(token);
  const expected = String(expectedClientId || "").trim() || null;
  const forbidden = String(forbiddenClientId || "").trim() || null;
  const log = global.logger?.error?.bind(global.logger) || console.error;

  if (forbidden && got && got === forbidden) {
    log(
      `[LOGIN] ${botLabel}: token resolves to forbidden clientId=${got} (likely swapped with the other bot). Refusing to start.`,
    );
    process.exit(1);
  }
  if (expected && got && got !== expected) {
    log(
      `[LOGIN] ${botLabel}: token clientId=${got} != expected ${expected}. Refusing to start.`,
    );
    process.exit(1);
  }
  return got;
}

module.exports = {
  getToken,
  getMongoUrl,
  ensureToken,
  clientIdFromBotToken,
  assertBotTokenIdentity,
};