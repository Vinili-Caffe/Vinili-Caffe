const fs = require("fs");
const path = require("path");
const http = require("node:http");

const ROOT = path.resolve(__dirname, "../../..");
const envPath = path.join(ROOT, ".env");
try {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  }
} catch (_) {}

const express = require("express");
const mongoose = require("mongoose");
const discord = require("discord.js");
const {
  installEmbedFooterPatch,
  installOutgoingMessageEmbedPatch,
} = require("../../Utils/Embeds/defaultFooter");
installEmbedFooterPatch();
installOutgoingMessageEmbedPatch(discord);
const { createSiteApiRestClient } = require("./siteApiRestClient");
const { mountSiteWebhookRoutes } = require("./siteWebhookRoutes");
const {
  listSitePaymentPlans,
  createSitePaymentOrder,
  captureSitePaymentOrder,
  handleSitePayPalWebhook,
} = require("../../Utils/Web/sitePaymentsApi");
const { mountSiteApiRateLimit } = require("../../Utils/Web/siteApiRateLimit");

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function normalizeCorsOriginEntry(entry) {
  const stripped = String(entry || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  if (!stripped) return "";
  try {
    const u = new URL(stripped);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

function parseCorsOriginAllowlist(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => normalizeCorsOriginEntry(s))
    .filter(Boolean);
}

function expandCorsOriginAllowlist(origins) {
  const set = new Set(origins);
  for (const o of origins) {
    try {
      const u = new URL(o);
      if (u.hostname === "localhost") {
        const alt = new URL(o);
        alt.hostname = "127.0.0.1";
        set.add(alt.origin);
      } else if (u.hostname === "127.0.0.1") {
        const alt = new URL(o);
        alt.hostname = "localhost";
        set.add(alt.origin);
      }
    } catch {
      continue;
    }
  }
  return [...set];
}

function isLoopbackBrowserOriginUrl(origin) {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

function corsAllowlistPermitsAnyLoopbackDevOrigin(allowlist) {
  return allowlist.some((o) => isLoopbackBrowserOriginUrl(o));
}

function loadVinylsConfig() {
  const configPath = path.join(ROOT, "Vinyls", "config.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

async function main() {
  process.env.SITE_API_PROCESS = "1";
  const port = Number(process.env.SITE_API_PORT || 3020) || 3020;
  const mongo =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongo) {
    console.error("[SITE-API] Missing MONGO_URL");
    process.exit(1);
  }

  const token = String(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || "").trim();
  if (!token) {
    console.error("[SITE-API] Missing DISCORD_TOKEN");
    process.exit(1);
  }

    if (process.env.WEBSITE_CANDIDATURE_HTTP == null || String(process.env.WEBSITE_CANDIDATURE_HTTP).trim() === "") {
    process.env.WEBSITE_CANDIDATURE_HTTP = "1";
  }
  if (process.env.WEBSITE_PUBLIC_HTTP == null || String(process.env.WEBSITE_PUBLIC_HTTP).trim() === "") {
    process.env.WEBSITE_PUBLIC_HTTP = "1";
  }

  global.logger = {
    info: (...a) => console.log(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
    debug: (...a) => console.log(...a),
  };

  await mongoose.connect(mongo, {
    maxPoolSize: 4,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 8_000,
  });
  try {
    const { refreshPartnershipConfigCache } = require("../../MultiGuild/core/tenantPartnershipSettings");
    const { refreshTenantGuildSettingsCache } = require("../../MultiGuild/core/tenantGuildSettings");
    await Promise.all([
      refreshPartnershipConfigCache().catch(() => null),
      refreshTenantGuildSettingsCache().catch(() => null),
    ]);
  } catch (err) {
    console.warn("[SITE-API] tenant cache warm:", err?.message || err);
  }
  const config = loadVinylsConfig();
  const client = await createSiteApiRestClient(config, token);
  global.botClient = client;
  try {
    require("../../Handlers/prefixHandler")(client);
    const { listFoldersIfExists } = require("../../../shared/runtime/fsRuntime");
    const prefixRoot = path.join(ROOT, "Vinyls", "Prefix");
    const folders = listFoldersIfExists(prefixRoot);
    if (typeof client.prefixCommands === "function" && folders.length) {
      await client.prefixCommands(folders, prefixRoot);
      client.__prefixCommandsReady = true;
    }
    require("../../Handlers/commandHandler")(client);
    const cmdRoot = path.join(ROOT, "Vinyls", "Commands");
    const cmdFolders = listFoldersIfExists(cmdRoot);
    if (typeof client.handleCommands === "function" && cmdFolders.length) {
      await client.handleCommands(cmdFolders, cmdRoot);
      client.__slashCommandsReady = true;
    }
  } catch (err) {
    console.warn("[SITE-API] prefix commands load:", err?.message || err);
  }

  const app = express();
    app.set("trust proxy", 1);
  mountSiteApiRateLimit(app);
  app.use(
    express.json({
      limit: "12mb",
      verify: (req, _res, buf) => {
        const pathOnly = String(req.originalUrl || req.url || req.path || "")
          .split("?")[0]
          .replace(/\/+$/, "") || "/";
                if (
          pathOnly === "/webhooks/site-kick-sub/events" ||
          pathOnly.endsWith("/site-kick-sub/events")
        ) {
          req._kickSubRawBody = Buffer.isBuffer(buf) ? Buffer.from(buf) : buf;
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));

  const candidatureCorsAllowlist = expandCorsOriginAllowlist(
    parseCorsOriginAllowlist(
      String(process.env.WEBSITE_CANDIDATURE_CORS_ORIGIN || process.env.WEBSITE_PUBLIC_ORIGIN || "").trim(),
    ),
  );

  const siteCorsMiddleware = (req, res, next) => {
    const rawPath = String(req.originalUrl || req.url || req.path || "");
    const pathStr = rawPath.split("?")[0];
    const isStatus =
      pathStr === "/webhooks/status" ||
      pathStr === "/webhooks/health" ||
      pathStr === "/webhooks/site-api/health";
    const isCandidature = pathStr.startsWith("/webhooks/site-candidature");
    const isUnban = pathStr.startsWith("/webhooks/site-unban");
    const isUnmute = pathStr.startsWith("/webhooks/site-unmute");
    const isSiteRules = pathStr.startsWith("/webhooks/site-rules");
    const isSiteUsers = pathStr.startsWith("/webhooks/site-users");
    const isSiteVote = pathStr.startsWith("/webhooks/site-vote");
    const isSiteLiveEvent = pathStr.startsWith("/webhooks/site-live-event");
    const isSiteKickLive = pathStr.startsWith("/webhooks/site-kick-live");
    const isSiteKickSub = pathStr.startsWith("/webhooks/site-kick-sub");
    const isSiteRoles = pathStr.startsWith("/webhooks/site-roles");
    const isSiteRankCard = pathStr.startsWith("/webhooks/site-rank-card");
    const isSiteReviews = pathStr.startsWith("/webhooks/site-reviews");
    const isSiteSuggestions = pathStr.startsWith("/webhooks/site-suggestions");
    const isSiteBotFeedback = pathStr.startsWith("/webhooks/site-bot-feedback");
    const isSiteWebTickets = pathStr.startsWith("/webhooks/site-web-tickets");
    const isSiteNotifications = pathStr.startsWith("/webhooks/site-notifications");
    const isSiteVerify = pathStr.startsWith("/webhooks/site-verify");
    const isSitePayments = pathStr.startsWith("/webhooks/site-payments");
    const isSiteSeratafilmAccess =
      pathStr.startsWith("/webhooks/site-seratafilm-access") ||
      pathStr.startsWith("/webhooks/site-seratafilm-film");
    const isSiteStaffAccess =
      pathStr.startsWith("/webhooks/site-staff-access") ||
      pathStr.startsWith("/webhooks/site-staff-dashboard") ||
      pathStr.startsWith("/webhooks/site-staff-manage") ||
      pathStr.startsWith("/webhooks/site-staff-organico") ||
      pathStr.startsWith("/webhooks/site-staff-pause") ||
      pathStr.startsWith("/webhooks/site-staff-profile") ||
      pathStr.startsWith("/webhooks/site-staff-pm-hub") ||
      pathStr.startsWith("/webhooks/site-staff-pm-points-removed") ||
      pathStr.startsWith("/webhooks/site-staff-pm-actions") ||
      pathStr.startsWith("/webhooks/site-staff-tickets") ||
      pathStr.startsWith("/webhooks/site-staff-seratafilm") ||
      pathStr.startsWith("/webhooks/site-staff-guide");
    const isSiteHogwartsSorting = pathStr.startsWith("/webhooks/site-hogwarts-sorting");
    const isSiteCustomProfile = pathStr.startsWith("/webhooks/site-custom-profile");
    const isSiteProfileExtras = pathStr.startsWith("/webhooks/site-profile-extras");
    if (
      !isStatus &&
      !isCandidature &&
      !isUnban &&
      !isUnmute &&
      !isSiteRules &&
      !isSiteUsers &&
      !isSiteVote &&
      !isSiteLiveEvent &&
      !isSiteKickLive &&
      !isSiteKickSub &&
      !isSiteRoles &&
      !isSiteRankCard &&
      !isSiteReviews &&
      !isSiteSuggestions &&
      !isSiteBotFeedback &&
      !isSiteWebTickets &&
      !isSiteNotifications &&
      !isSiteVerify &&
      !isSitePayments &&
      !isSiteSeratafilmAccess &&
      !isSiteStaffAccess &&
      !isSiteHogwartsSorting &&
      !isSiteCustomProfile &&
      !isSiteProfileExtras
    ) {
      return next();
    }
    const originRaw = String(req.headers.origin || "").trim();
    const originNorm = originRaw ? normalizeCorsOriginEntry(originRaw) || originRaw : "";
    let allowOrigin = "";
    if (originNorm && candidatureCorsAllowlist.includes(originNorm)) {
      allowOrigin = originRaw;
    } else if (
      originNorm &&
      candidatureCorsAllowlist.length > 0 &&
      corsAllowlistPermitsAnyLoopbackDevOrigin(candidatureCorsAllowlist) &&
      isLoopbackBrowserOriginUrl(originNorm)
    ) {
      allowOrigin = originRaw;
    } else if (originNorm && candidatureCorsAllowlist.length === 0) {
      if (isLoopbackBrowserOriginUrl(originNorm)) allowOrigin = originRaw;
    }
    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      res.append("Vary", "Origin");
    } else if (
      isStatus ||
      isSiteRules ||
      isSiteUsers ||
      isSiteVote ||
      isSiteLiveEvent ||
      isSiteKickLive ||
      isSiteKickSub ||
      isSiteRoles ||
      isSiteRankCard ||
      isSiteReviews ||
      isSiteSuggestions ||
      isSiteBotFeedback ||
      isSiteNotifications ||
      isSitePayments ||
      isSiteSeratafilmAccess ||
      isSiteStaffAccess ||
      isSiteHogwartsSorting
    ) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Access-Control-Request-Private-Network",
    );
    if (allowOrigin) res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };

  app.get("/webhooks/site-api/health", (_req, res) => {
    const { sendStackHealth } = require("../../Utils/Web/stackHealth");
    return sendStackHealth(client, _req, res, { service: "site-api", includeLavalink: false });
  });
  app.get("/webhooks/health", (req, res) => {
    const { sendStackHealth } = require("../../Utils/Web/stackHealth");
    return sendStackHealth(client, req, res, { service: "site-api", includeLavalink: false });
  });
  app.get("/webhooks/status", (_req, res) => {
    res.status(200).json({ status: "online", bot: client.user?.tag || client.user?.username || "site-api" });
  });

  mountSiteWebhookRoutes(app, client, {
    normalizeHeaderSecret,
    siteCorsMiddleware,
    listSitePaymentPlans,
    createSitePaymentOrder,
    captureSitePaymentOrder,
    handleSitePayPalWebhook,
  });

  app.post("/webhooks/site-realtime/notify", (req, res) => {
    const remote = String(req.socket?.remoteAddress || req.ip || "");
    const isLoopback =
      remote === "127.0.0.1" ||
      remote === "::1" ||
      remote === "::ffff:127.0.0.1" ||
      remote.endsWith("127.0.0.1");
    if (!isLoopback) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    const expected = String(process.env.SITE_REALTIME_NOTIFY_SECRET || "local").trim() || "local";
    const got = String(req.headers["x-internal-notify"] || "").trim();
    if (got !== expected) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const type = String(body.type || "").trim();
    if (!type) {
      return res.status(400).json({ ok: false, error: "missing_type" });
    }
    try {
      if (type === "staff_pauses_changed") {
        try {
          const { invalidateStaffPauseCalendarCache } = require("../../Utils/Web/siteStaffPauseApi");
          invalidateStaffPauseCalendarCache();
        } catch {
                  }
      }
      const { broadcastSiteRealtime } = require("../../Utils/Web/siteSuggestionsBroadcast");
      broadcastSiteRealtime({ ...body, at: body.at || new Date().toISOString() });
    } catch (err) {
      return res.status(500).json({ ok: false, error: "broadcast_failed", message: err?.message || String(err) });
    }
    return res.status(200).json({ ok: true });
  });

  app.use((err, req, res, next) => {
    const isJsonBodyError =
      (err instanceof SyntaxError && Number(err.status) === 400 && "body" in err) ||
      err?.type === "entity.parse.failed" ||
      err?.type === "entity.too.large";
    if (isJsonBodyError) {
      if (!res.headersSent) {
        return res.status(err?.type === "entity.too.large" ? 413 : 400).json({
          ok: false,
          error: err?.type === "entity.too.large" ? "payload_too_large" : "invalid_json",
          message: "Richiesta non valida. Riprova.",
        });
      }
      return undefined;
    }
    if (!res.headersSent) {
      global.logger?.error?.("[SITE-API]", err?.message || err);
      return res.status(Number(err?.status) || 500).json({
        ok: false,
        error: "internal",
        message: "Errore interno.",
      });
    }
    return next(err);
  });

  const server = http.createServer(app);
  try {
    const { attachSiteSuggestionsWsServer } = require("../../Utils/Web/siteSuggestionsBroadcast");
    attachSiteSuggestionsWsServer(server);
  } catch (err) {
    console.warn("[SITE-API] WebSocket init:", err?.message || err);
  }
  server.listen(port, "0.0.0.0", () => {
    console.log(`[SITE-API] listening on 0.0.0.0:${port} as ${client.user?.tag || client.user?.username}`);
    try {
      const { warmSiteRolesCache } = require("../../Utils/Web/siteRolesApi");
      setTimeout(() => {
        warmSiteRolesCache(client);
      }, 2500);
    } catch (err) {
      console.warn("[SITE-API] site-roles warm:", err?.message || err);
    }
    try {
      const {
        startPartnershipHistoryMigrationWorker,
      } = require("../Partner/tenantPartnershipHistoryMigrationService");
      startPartnershipHistoryMigrationWorker(client);
    } catch (err) {
      console.warn("[SITE-API] partnership migration worker:", err?.message || err);
    }
    try {
      const { startPotionReminderLoop } = require("../Community/hogwartsPotionReminderService");
      startPotionReminderLoop(client);
    } catch (err) {
      console.warn("[SITE-API] potions reminder loop:", err?.message || err);
    }
  });
}

main().catch((err) => {
  console.error("[SITE-API] fatal:", err);
  process.exit(1);
});
