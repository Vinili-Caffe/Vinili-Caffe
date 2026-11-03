const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const http = require("node:http") as typeof import("node:http");

/* ROOT = bots-ts/src (Prefix/Commands). .env vive in cwd pm2 (/opt/bot), non sotto src. */
const ROOT = path.resolve(__dirname, "../../..");
const envCandidates = [
  path.join(process.cwd(), ".env"),
  path.resolve(ROOT, "../../.env"),
  path.resolve(ROOT, "../.env"),
  path.join(ROOT, ".env"),
];
try {
  const envPath = envCandidates.find((p?) => fs.existsSync(p)) || "";
  if (envPath) {
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
const mongoose = require("mongoose") as typeof import("mongoose");
const discord = require("discord.js") as typeof import("discord.js");
const {
  installEmbedFooterPatch,
  installOutgoingMessageEmbedPatch,
} = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
installEmbedFooterPatch();
installOutgoingMessageEmbedPatch(discord);
const { createSiteApiRestClient } = require("../../site/http/siteApiRestClient") as typeof import("../../site/http/siteApiRestClient");
const { mountSiteWebhookRoutes } = require("./siteWebhookRoutes") as typeof import("./siteWebhookRoutes");
const { mountSiteApiRateLimit } = require("./siteApiRateLimit") as typeof import("./siteApiRateLimit");

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function normalizeCorsOriginEntry(entry?) {
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

function parseCorsOriginAllowlist(raw?) {
  return String(raw || "")
    .split(",")
    .map((s?) => normalizeCorsOriginEntry(s))
    .filter(Boolean);
}

function expandCorsOriginAllowlist(origins?) {
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
      } else if (u.hostname.startsWith("www.")) {
        // appelliApi1: site lives on www; env often has apex-only CORS origins
        const alt = new URL(o);
        alt.hostname = u.hostname.slice(4);
        set.add(alt.origin);
      } else if (u.hostname && !u.hostname.startsWith("www.")) {
        const alt = new URL(o);
        alt.hostname = `www.${u.hostname}`;
        set.add(alt.origin);
      }
    } catch {
      continue;
    }
  }
  return [...set];
}

function isLoopbackBrowserOriginUrl(origin?) {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

function corsAllowlistPermitsAnyLoopbackDevOrigin(allowlist?) {
  return allowlist.some((o?) => isLoopbackBrowserOriginUrl(o));
}

function loadVinylsConfig() {
  const configPath = path.join(ROOT, "Vinili", "config.json");
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  try {
    require("../../Config/emergencyRoleIdRemap").applyEmergencyRoleRemapToConfig(cfg);
  } catch (_) {}
  return cfg;
}

async function main() {
  process.env.SITE_API_PROCESS = "1";
  const port = Number(process.env.SITE_API_PORT || 3020) || 3020;
  /* mongoSingleSource1 */
  const { buildMongoUrl } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
  const mongo = buildMongoUrl();
  if (!mongo) {
    console.error("[SITE-API] Missing MONGO_URL / MONGO_URL_LOCAL");
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
    const { refreshPartnershipConfigCache } = require("../../Partner/core/tenantPartnershipSettings") as typeof import("../../Partner/core/tenantPartnershipSettings");
    const { refreshTenantGuildSettingsCache } = require("../../MultiGuild/core/tenantGuildSettings") as typeof import("../../MultiGuild/core/tenantGuildSettings");
    await Promise.all([
      refreshPartnershipConfigCache().catch(() => null),
      refreshTenantGuildSettingsCache().catch(() => null),
    ]);
  } catch (err) {
    console.warn("[SITE-API] tenant cache warm:", err?.message || err);
  }
  const config = loadVinylsConfig();
  const client: any = await createSiteApiRestClient(config, token);
  global.botClient = client;
  /* siteApiW6: register handlers sync; await command loads after listen */
  const { listFoldersIfExists } = require("../../../shared/runtime/fsRuntime") as typeof import("../../../shared/runtime/fsRuntime");
  let prefixRoot = "";
  let folders = [];
  let cmdRoot = "";
  let cmdFolders = [];
  try {
    require("../../core/handlers/prefixHandler")(client);
    prefixRoot = path.join(ROOT, "Vinili", "Prefix");
    folders = listFoldersIfExists(prefixRoot);
    require("../../core/handlers/commandHandler")(client);
    cmdRoot = path.join(ROOT, "Vinili", "Commands");
    cmdFolders = listFoldersIfExists(cmdRoot);
  } catch (err) {
    console.warn("[SITE-API] command handlers bind:", err?.message || err);
  }

  async function loadSiteApiCommandsBg() {
    try {
      /* Prefix/Commands legacy possono essere assenti: i loader caricano comunque i path modulo. */
      if (typeof client.prefixCommands === "function") {
        await client.prefixCommands(folders, prefixRoot || path.join(ROOT, "Vinili", "Prefix"));
        client.__prefixCommandsReady = true;
      }
      if (typeof client.handleCommands === "function") {
        await client.handleCommands(cmdFolders, cmdRoot || path.join(ROOT, "Vinili", "Commands"));
        client.__slashCommandsReady = true;
      }
      console.log(
        `[SITE-API] commands ready (bg) prefix=${client.pcommands?.size || 0} slash=${client.commands?.size || 0}`,
      );
    } catch (err) {
      console.warn("[SITE-API] prefix commands load:", err?.message || err);
    }
  }

  const app = express();
    app.set("trust proxy", 1);
  mountSiteApiRateLimit(app);
  app.use(
    express.json({
      limit: "12mb",
      verify: (req?, _res?, buf?) => {
        const pathOnly = String(req.originalUrl || req.url || req.path || "")
          .split("?")[0]
          .replace(/\/+$/, "") || "/";
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));

  const candidatureCorsAllowlist = expandCorsOriginAllowlist(
    parseCorsOriginAllowlist(
      String(process.env.WEBSITE_CANDIDATURE_CORS_ORIGIN || process.env.WEBSITE_PUBLIC_ORIGIN || "").trim(),
    ),
  );

  const siteCorsMiddleware = (req?, res?, next?) => {
    const rawPath = String(req.originalUrl || req.url || req.path || "");
    const pathStr = rawPath.split("?")[0];
    const isStatus =
      pathStr === "/webhooks/status" ||
      pathStr === "/webhooks/health" ||
      pathStr === "/webhooks/site-api/health";
    /* siteCorsAll1: tutti i /webhooks/site-* (confessionale/wordle/…) — evita preflight senza ACAO */
    const isSiteApi = pathStr.startsWith("/webhooks/site-");
    if (!isStatus && !isSiteApi) {
      return next();
    }
    const originRaw = String(req.headers.origin || "").trim();
    const originNorm = originRaw ? normalizeCorsOriginEntry(originRaw) || originRaw : "";
    let allowOrigin = "";
    if (originNorm && candidatureCorsAllowlist.includes(originNorm)) {
      allowOrigin = originNorm;
    } else if (
      originNorm &&
      candidatureCorsAllowlist.length > 0 &&
      corsAllowlistPermitsAnyLoopbackDevOrigin(candidatureCorsAllowlist) &&
      isLoopbackBrowserOriginUrl(originNorm)
    ) {
      allowOrigin = originNorm;
    } else if (originNorm && candidatureCorsAllowlist.length === 0) {
      if (isLoopbackBrowserOriginUrl(originNorm)) allowOrigin = originNorm;
    }
    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      res.append("Vary", "Origin");
    } else if (isStatus || isSiteApi) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      /* siteApiDeviceEverywhere1: If-None-Match + X-VC-Perf (Safari/Firefox preflight) */
      "Content-Type, Authorization, Accept, Cache-Control, Pragma, If-None-Match, If-Match, Access-Control-Request-Private-Network, X-VC-View-As, X-VC-Perf",
    );
    if (allowOrigin) res.setHeader("Access-Control-Allow-Private-Network", "true");
    /* Expose ETag so browsers can cache validators for conditional GET */
    res.setHeader("Access-Control-Expose-Headers", "ETag, X-VC-Perf, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };

  app.get("/webhooks/site-api/health", (_req?, res?) => {
    const { sendStackHealth } = require("../../site/http/stackHealth") as typeof import("../../site/http/stackHealth");
    return sendStackHealth(client, _req, res, { service: "site-api", includeLavalink: false });
  });
  app.get("/webhooks/site-api/perf", (_req?, res?) => {
    let oauth = { size: 0, inflight: 0, ttlMs: 0 };
    try {
      oauth = require("../../site/http/discordOauthMe").getDiscordOAuthMeCacheStats();
    } catch (_) {}
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      service: "site-api",
      uptimeSec: Math.floor(process.uptime()),
      memMb: Math.round((process.memoryUsage().rss || 0) / (1024 * 1024)),
      oauthMeCache: oauth,
    });
  });
  app.get("/webhooks/health", (req?, res?) => {
    const { sendStackHealth } = require("../../site/http/stackHealth") as typeof import("../../site/http/stackHealth");
    return sendStackHealth(client, req, res, { service: "site-api", includeLavalink: false });
  });
  app.get("/webhooks/status", (_req?, res?) => {
    res.status(200).json({ status: "online", bot: client.user?.tag || client.user?.username || "site-api" });
  });

  mountSiteWebhookRoutes(app, client, {
    normalizeHeaderSecret,
    siteCorsMiddleware,
  });

  app.post("/webhooks/site-realtime/notify", (req?, res?) => {
    const remote = String(req.socket?.remoteAddress || req.ip || "");
    const isLoopback =
      remote === "127.0.0.1" ||
      remote === "::1" ||
      remote === "::ffff:127.0.0.1" ||
      remote.endsWith("127.0.0.1");
    if (!isLoopback) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    const expected = String(process.env.SITE_REALTIME_NOTIFY_SECRET || "").trim();
    if (!expected || expected === "local") {
      return res.status(503).json({ ok: false, error: "misconfigured" });
    }
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
          const { invalidateStaffPauseCalendarCache } = require("../../site/staff/siteStaffPauseApi") as typeof import("../../site/staff/siteStaffPauseApi");
          invalidateStaffPauseCalendarCache();
        } catch {
                  }
      }
      /* leaveProfileLive1: bots → site-api: wipe profile/staff/member caches before WS fanout */
      if (type === "member_left") {
        try {
          const { invalidateLeftMemberSiteCaches } = require("../../site/suggestions/siteSuggestionsBroadcast") as typeof import("../../site/suggestions/siteSuggestionsBroadcast");
          invalidateLeftMemberSiteCaches(body.userId, body.guildId);
        } catch {
                  }
      }
      /* voteWsLive1: cache /vote/ vive nel processo site-api — invalida qui al ping dai bots */
      if (type === "votes_changed") {
        try {
          const { invalidateSiteVoteCache } = require("../../site/http/siteVoteApi") as typeof import("../../site/http/siteVoteApi");
          const gid = String(client?.config?.mainGuildId || "").trim();
          invalidateSiteVoteCache(gid, body.userId);
        } catch {
                  }
      }
      const { broadcastSiteRealtime } = require("../../site/suggestions/siteSuggestionsBroadcast") as typeof import("../../site/suggestions/siteSuggestionsBroadcast");
      broadcastSiteRealtime({ ...body, at: body.at || new Date().toISOString() });
    } catch (err) {
      return res.status(500).json({ ok: false, error: "broadcast_failed", message: err?.message || String(err) });
    }
    return res.status(200).json({ ok: true });
  });

  app.use((err?: any, req?, res?, next?) => {
    const isJsonBodyError =
      (err instanceof SyntaxError && Number((err as any).status) === 400 && "body" in err) ||
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
  /* siteApiDeviceEverywhere1: evita 502 nginx su hang Discord/LTE lenti */
  try {
    server.requestTimeout = 65_000;
    server.headersTimeout = 70_000;
    server.keepAliveTimeout = 65_000;
    server.maxHeadersCount = 100;
  } catch (_) {}
  try {
    const { attachSiteSuggestionsWsServer } = require("../../site/suggestions/siteSuggestionsBroadcast") as typeof import("../../site/suggestions/siteSuggestionsBroadcast");
    attachSiteSuggestionsWsServer(server);
  } catch (err) {
    console.warn("[SITE-API] WebSocket init:", err?.message || err);
  }
  server.listen(port, "0.0.0.0", () => {
    console.log(`[SITE-API] listening on 0.0.0.0:${port} as ${client.user?.tag || client.user?.username}`);
    console.log("[SITE-API] siteApiDeviceEverywhere1 timeouts on");
    setImmediate(() => {
      loadSiteApiCommandsBg();
    });
    try {
      const { warmSiteRolesCache } = require("../../site/http/siteRolesApi") as typeof import("../../site/http/siteRolesApi");
      const warmRoles = () => {
        try {
          warmSiteRolesCache(client);
        } catch (e) {
          console.warn("[SITE-API] site-roles warm:", e?.message || e);
        }
      };
      setTimeout(warmRoles, 2500);
      /* siteUsersSwr1: tieni cache calda — evita cold Discord su /ruoli */
      /* perfP2: warm meno aggressivi (piano audit site-api) */
      setInterval(warmRoles, Math.max(60_000, Number(process.env.VC_SITE_WARM_ROLES_MS || 90_000) || 90_000)).unref?.();
    } catch (err) {
      console.warn("[SITE-API] site-roles warm:", err?.message || err);
    }
    /* siteApiW4: warm users + live-event so first public hit isn't cold */
    try {
      const { warmSiteUsersLeaderboardCache } = require("../../site/http/siteUsersLeaderboardApi") as typeof import("../../site/http/siteUsersLeaderboardApi");
      const warmUsers = () => {
        warmSiteUsersLeaderboardCache(client).catch((e?) => {
          console.warn("[SITE-API] site-users warm:", e?.message || e);
        });
      };
      setTimeout(warmUsers, 4500);
      /* siteUsersSwr1: refresh periodico classifiche (TTL 90s) */
      setInterval(warmUsers, Math.max(55_000, Number(process.env.VC_SITE_WARM_USERS_MS || 90_000) || 90_000)).unref?.();
    } catch (err) {
      console.warn("[SITE-API] site-users warm init:", err?.message || err);
    }
    try {
      const { warmSiteLiveEventCache } = require("../../site/http/siteLiveEventApi") as typeof import("../../site/http/siteLiveEventApi");
      setTimeout(() => {
        warmSiteLiveEventCache(client);
      }, 3000);
    } catch (err) {
      console.warn("[SITE-API] site-live-event warm:", err?.message || err);
    }
    /* apiWarmSwr1: wiki / boards / staff roster+organico / dash deps */
    try {
      const { warmSiteWikiHelpCache } = require("../../site/http/siteWikiHelpApi") as typeof import("../../site/http/siteWikiHelpApi");
      const warmWiki = () => {
        warmSiteWikiHelpCache(client).catch((e?) => {
          console.warn("[SITE-API] site-wiki-help warm:", e?.message || e);
        });
      };
      setTimeout(warmWiki, 5000);
      setInterval(warmWiki, 75_000).unref?.();
    } catch (err) {
      console.warn("[SITE-API] site-wiki-help warm init:", err?.message || err);
    }
    try {
      const { warmSiteBoardsListingsCache } = require("../../site/boards/siteBoardsApi") as typeof import("../../site/boards/siteBoardsApi");
      const warmBoards = () => {
        warmSiteBoardsListingsCache(client).catch((e?) => {
          console.warn("[SITE-API] site-boards warm:", e?.message || e);
        });
      };
      setTimeout(warmBoards, 6000);
      setInterval(warmBoards, 70_000).unref?.();
    } catch (err) {
      console.warn("[SITE-API] site-boards warm init:", err?.message || err);
    }
    try {
      const { warmStaffRosterCache } = require("../../site/staff/siteStaffRosterCache") as typeof import("../../site/staff/siteStaffRosterCache");
      const { warmSiteStaffOrganicoCache } = require("../../site/staff/siteStaffOrganicoApi") as typeof import("../../site/staff/siteStaffOrganicoApi");
      const { warmSiteStaffDashboardDeps } = require("../../site/staff/siteStaffDashboardApi") as typeof import("../../site/staff/siteStaffDashboardApi");
      const warmStaff = () => {
        warmStaffRosterCache(client)
          .then(() =>
            Promise.all([
              warmSiteStaffOrganicoCache(client).catch(() => null),
              warmSiteStaffDashboardDeps(client).catch(() => null),
            ]),
          )
          .catch((e?) => {
            console.warn("[SITE-API] staff warm:", e?.message || e);
          });
      };
      setTimeout(warmStaff, 7000);
      setInterval(warmStaff, 90_000).unref?.();
    } catch (err) {
      console.warn("[SITE-API] staff warm init:", err?.message || err);
    }
    /* apiWarmSwr2: twitch PIP + vote board + reviews list + compiti workers */
    try {
      const { warmSiteTwitchLiveCache } = require("../../site/http/siteTwitchLiveApi") as typeof import("../../site/http/siteTwitchLiveApi");
      const warmLivePip = () => {
        warmSiteTwitchLiveCache(client).catch((e?) => {
          console.warn("[SITE-API] live-pip warm:", e?.message || e);
        });
      };
      setTimeout(warmLivePip, 20_000);
      setInterval(warmLivePip, Math.max(55_000, Number(process.env.VC_SITE_WARM_LIVE_MS || 90_000) || 90_000)).unref?.();
    } catch (err) {
      console.warn("[SITE-API] live-pip warm init:", err?.message || err);
    }
    try {
      const { warmSiteVoteBoardCache } = require("../../site/http/siteVoteApi") as typeof import("../../site/http/siteVoteApi");
      const warmVote = () => {
        warmSiteVoteBoardCache(client).catch((e?) => {
          console.warn("[SITE-API] site-vote warm:", e?.message || e);
        });
      };
      setTimeout(warmVote, 2500);
      /* perfP1: warm vote meno aggressivo (era 18s) */
      const voteWarmMs = Math.max(
        30_000,
        Math.min(300_000, Number(process.env.VC_SITE_VOTE_WARM_MS || 60_000) || 60_000),
      );
      setInterval(warmVote, voteWarmMs).unref?.();
    } catch (err) {
      console.warn("[SITE-API] site-vote warm init:", err?.message || err);
    }
    try {
      const { warmSiteReviewsListCache } = require("../../site/http/siteReviewsApi") as typeof import("../../site/http/siteReviewsApi");
      const warmReviews = () => {
        warmSiteReviewsListCache(client).catch((e?) => {
          console.warn("[SITE-API] site-reviews warm:", e?.message || e);
        });
      };
      setTimeout(warmReviews, 3000);
      setInterval(warmReviews, Math.max(25_000, Number(process.env.VC_SITE_WARM_REVIEWS_MS || 60_000) || 60_000)).unref?.();
      // recensioni di chi non è più staff: pulizia all'avvio e ogni 6 ore
      const { purgeExStaffReviews } = require("../../site/http/siteReviewsApi") as typeof import("../../site/http/siteReviewsApi");
      const purgeExStaff = () => {
        purgeExStaffReviews(client).catch((e?) => console.warn("[SITE-API] purge ex staff reviews:", e?.message || e));
      };
      setTimeout(purgeExStaff, 60_000).unref?.();
      setInterval(purgeExStaff, 6 * 60 * 60_000).unref?.();
    } catch (err) {
      console.warn("[SITE-API] site-reviews warm init:", err?.message || err);
    }
    try {
      const { warmSiteStaffCompitiWorkersCache } = require("../../site/staff/siteStaffCompitiApi") as typeof import("../../site/staff/siteStaffCompitiApi");
      const warmCompiti = () => {
        warmSiteStaffCompitiWorkersCache(client).catch((e?) => {
          console.warn("[SITE-API] compiti workers warm:", e?.message || e);
        });
      };
      setTimeout(warmCompiti, 10000);
      setInterval(warmCompiti, 100_000).unref?.();
    } catch (err) {
      console.warn("[SITE-API] compiti warm init:", err?.message || err);
    }
    try {
      const {
        startPartnershipHistoryMigrationWorker,
      } = require("../../Partner/services/tenantPartnershipHistoryMigrationService") as typeof import("../../Partner/services/tenantPartnershipHistoryMigrationService");
      startPartnershipHistoryMigrationWorker(client);
    } catch (err) {
      console.warn("[SITE-API] partnership migration worker:", err?.message || err);
    }
  });
}

main().catch((err?) => {
  console.error("[SITE-API] fatal:", err);
  process.exit(1);
});
