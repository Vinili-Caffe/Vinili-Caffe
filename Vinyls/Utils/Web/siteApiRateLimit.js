"use strict";

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function webhookPath(req) {
  return String(req.originalUrl || req.url || req.path || "").split("?")[0];
}

function isReadOnlySiteGet(req) {
  if (String(req.method || "").toUpperCase() !== "GET") return false;
  const path = webhookPath(req);
  if (path.includes("/push/vapid-public-key")) return true;
  if (path === "/webhooks/site-chrome-prefs") return true;
  if (path.startsWith("/webhooks/site-rank-card")) return true;
  if (path.startsWith("/webhooks/site-custom-profile")) return true;
  if (path.startsWith("/webhooks/site-profile-extras")) return true;
  if (path.startsWith("/webhooks/site-users")) return true;
  if (path.startsWith("/webhooks/site-reviews")) return true;
  if (path.startsWith("/webhooks/site-hogwarts-sorting/forbidden-books")) return true;
  if (path === "/webhooks/site-rules") return true;
  if (path.startsWith("/webhooks/site-notifications") && !path.includes("/push/subscribe")) return true;
  if (path.startsWith("/webhooks/site-live-event")) return true;
  if (path.startsWith("/webhooks/site-kick-live")) return true;
  return false;
}

function shouldSkipRateLimit(req) {
  if (String(req.method || "").toUpperCase() === "OPTIONS") return true;
  const path = webhookPath(req);
  const method = String(req.method || "").toUpperCase();
  return (
    path === "/webhooks/site-api/health" ||
    path === "/webhooks/health" ||
    path === "/webhooks/status" ||
        path === "/webhooks/site-kick-sub/events" ||
        (method === "POST" &&
      path.startsWith("/webhooks/site-notifications") &&
      (path.includes("/push/subscribe") || path.includes("/push/unsubscribe"))) ||
    isReadOnlySiteGet(req) ||
            (method === "GET" && path.startsWith("/webhooks/site-staff-"))
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
        validate: { trustProxy: false },
  };

  const globalMax = parsePositiveInt(process.env.SITE_API_RATE_GLOBAL_MAX, 600);
  const strictMax = parsePositiveInt(process.env.SITE_API_RATE_STRICT_MAX, 240);

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
    const method = String(req.method || "").toUpperCase();
    const useStrict =
      method !== "GET" &&
      STRICT_WEBHOOK_PREFIXES.some((prefix) => path.startsWith(prefix));
    return (useStrict ? strict : global)(req, res, next);
  });
}

module.exports = {
  mountSiteApiRateLimit,
  createSiteApiRateLimiters,
};
