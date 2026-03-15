function getToken(config = {}, envKey = "DISCORD_TOKEN") {
  return process.env[envKey] || process.env.DISCORD_TOKEN || config?.token || null;
}

function getMongoUrl(config = {}) {
  return process.env.MONGO_URL || process.env.MONGODB_URI || config?.mongoURL || config?.mongoUrl || null;
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

module.exports = { getToken, getMongoUrl, ensureToken };