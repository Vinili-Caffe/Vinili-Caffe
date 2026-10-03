"use strict";

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function webhookPath(req) {
  return String(req.originalUrl || req.url || req.path || "")
    .split("?")[0]
    .replace(/\/+$/, "") || "/";
}

function clientIpKey(req) {
  try {
    const cf = String(req.headers["cf-connecting-ip"] || "").trim();
    if (cf) return cf;
  } catch (_) {}
  try {
    const real = String(req.headers["x-real-ip"] || "").trim();
    if (real && real !== "127.0.0.1" && real !== "::1") return real;
  } catch (_) {}
  try {
    const xf = String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    if (xf && xf !== "127.0.0.1" && xf !== "::1") return xf;
  } catch (_) {}
  try {
    const ip = String(req.ip || "").trim();
    if (ip) return ip;
  } catch (_) {}
  return "unknown";
}

function isReadOnlySiteGet(req) {
  if (String(req.method || "").toUpperCase() !== "GET") return false;
  const path = webhookPath(req);
  if (path.includes("/push/vapid-public-key")) return true;
  if (path === "/webhooks/site-chrome-prefs") return true;
  if (path === "/webhooks/site-discord-me") return true;
  if (path === "/webhooks/site-staff-access") return true;
  if (path === "/webhooks/site-cookie-consent") return true;
  if (path.startsWith("/webhooks/site-rank-card")) return true;
  if (path.startsWith("/webhooks/site-custom-profile")) return true;
  if (path.startsWith("/webhooks/site-profile-extras")) return true;
  if (path.startsWith("/webhooks/site-welcome-pronouns")) return true;
  if (path.startsWith("/webhooks/site-users")) return true;
  if (path.startsWith("/webhooks/site-roles")) return true;
  if (path.startsWith("/webhooks/site-vote")) return true;
  // mobileApisFast2: ticket/candidature GET must not burn strict rate limit on CGNAT phones
  if (path.startsWith("/webhooks/site-web-tickets")) return true;
  if (path.startsWith("/webhooks/site-candidature")) return true;
  if (path.startsWith("/webhooks/site-unban")) return true;
  if (path.startsWith("/webhooks/site-unmute")) return true;
  if (path.startsWith("/webhooks/site-reviews")) return true;
  if (path.startsWith("/webhooks/site-boards")) return true;
  if (path.startsWith("/webhooks/site-hogwarts-sorting/forbidden-books")) return true;
  if (path === "/webhooks/site-rules") return true;
  if (path.startsWith("/webhooks/site-notifications") && !path.includes("/push/subscribe")) return true;
  if (path.startsWith("/webhooks/site-live-event")) return true;
  if (path.startsWith("/webhooks/site-kick-live")) return true;
  if (path.startsWith("/webhooks/site-kick-sub/status")) return true;
  if (path.startsWith("/webhooks/site-kick-sub/oauth-start")) return true;
  // dashGuilds429Fix1: GET dashboard (guilds/credits/…) non deve bruciare il global limit
  if (path.startsWith("/webhooks/site-dashboard")) return true;
  if (path.startsWith("/webhooks/site-twitch-live")) return true;
  if (path.startsWith("/webhooks/site-wiki-help")) return true;
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
    // consoleErrFix1: chrome-prefs GET+POST (sync theme/nav) — no express 429
    path === "/webhooks/site-chrome-prefs" ||
    // console429Everywhere1: boot identity — no express 429 (CGNAT / multi-tab)
    path === "/webhooks/site-discord-me" ||
    path === "/webhooks/site-staff-access" ||
    (method === "POST" &&
      path.startsWith("/webhooks/site-notifications") &&
      (path.includes("/push/subscribe") ||
        path.includes("/push/unsubscribe") ||
        /* siteApiDeviceEverywhere1: read/clear/delete su CGNAT+multi-tab */
        path.endsWith("/read") ||
        path.endsWith("/clear") ||
        path.endsWith("/delete"))) ||
    isReadOnlySiteGet(req) ||
    // ticketClaimHard1: claim/unclaim/presence su CGNAT non devono finire in 429
    path.startsWith("/webhooks/site-web-tickets") ||
    // Staff inbox/workflows/chat: no rate limit (GET+POST) — detail+chat open together.
    path.startsWith("/webhooks/site-staff-")
  );
}

function rateLimitedJson(_req, res) {
  return res.status(429).json({
    ok: false,
    error: "rate_limited",
    message: "Troppe richieste. Riprova tra poco.",
  });
}

function clientAuthKey(req) {
  try {
    const auth = String(req.headers.authorization || "").trim();
    if (!auth) return "";
    /* siteApiDeviceEverywhere1: bucket per token (hash corto) — 2 device stessa IP non si cannibalizzano */
    let h = 2166136261;
    for (let i = 0; i < auth.length; i += 1) {
      h ^= auth.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return "t" + (h >>> 0).toString(36);
  } catch (_) {
    return "";
  }
}

function rateLimitKey(req) {
  const ip = clientIpKey(req);
  const tok = clientAuthKey(req);
  return tok ? `${ip}:${tok}` : ip;
}

function createSiteApiRateLimiters() {
  const rateLimit = require("express-rate-limit");

  const shared = {
    standardHeaders: true,
    legacyHeaders: false,
    skip: shouldSkipRateLimit,
    handler: rateLimitedJson,
    /* rateLimitIpKey1 + siteApiDeviceEverywhere1: IP+token dietro nginx */
    keyGenerator: (req) => rateLimitKey(req),
    validate: { trustProxy: false },
  };

  const globalMax = parsePositiveInt(process.env.SITE_API_RATE_GLOBAL_MAX, 1200);
  const strictMax = parsePositiveInt(process.env.SITE_API_RATE_STRICT_MAX, 400);

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
  // ticketManageSoft429Fix1: tickets già in shouldSkipRateLimit — non passare dallo strict
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
  createSiteApiRateLimiters,
  mountSiteApiRateLimit,
  shouldSkipRateLimit,
  isReadOnlySiteGet,
  clientIpKey,
  rateLimitKey,
};
