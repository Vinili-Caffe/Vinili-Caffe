"use strict";

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function webhookPath(req) {
  return String(req.originalUrl || req.url || req.path || "").split("?")[0];
}

function shouldSkipRateLimit(req) {
  if (String(req.method || "").toUpperCase() === "OPTIONS") return true;
  const path = webhookPath(req);
  return (
    path === "/webhooks/site-api/health" ||
    path === "/webhooks/health" ||
    path === "/webhooks/status"
  );
}

function rateLimitedJson(_req, res) {
  return res.status(429).json({
    ok: false,
    error: "rate_limited",
    message: "Troppe richieste. Riprova tra poco.",
  });
}

function createSiteApiRateLimiters() {
  const rateLimit = require("express-rate-limit");

  const shared = {
    standardHeaders: true,
    legacyHeaders: false,
    skip: shouldSkipRateLimit,
    handler: rateLimitedJson,
  };

  const globalMax = parsePositiveInt(process.env.SITE_API_RATE_GLOBAL_MAX, 100);
  const strictMax = parsePositiveInt(process.env.SITE_API_RATE_STRICT_MAX, 35);

  return {
    global: rateLimit({
      ...shared,
      windowMs: 60_000,
      max: globalMax,
    }),
    strict: rateLimit({
      ...shared,
      windowMs: 60_000,
      max: strictMax,
    }),
  };
}

const STRICT_WEBHOOK_PREFIXES = [
  "/webhooks/site-web-tickets",
  "/webhooks/site-candidature",
  "/webhooks/site-verify",
  "/webhooks/site-vote",
  "/webhooks/site-unban",
  "/webhooks/site-unmute",
  "/webhooks/site-users",
  "/webhooks/site-notifications",
];

function mountSiteApiRateLimit(app) {
  const { global, strict } = createSiteApiRateLimiters();

  app.use((req, res, next) => {
    const path = webhookPath(req);
    if (!path.startsWith("/webhooks/")) return next();
    const useStrict = STRICT_WEBHOOK_PREFIXES.some((prefix) => path.startsWith(prefix));
    return (useStrict ? strict : global)(req, res, next);
  });
}

module.exports = {
  mountSiteApiRateLimit,
  createSiteApiRateLimiters,
};
