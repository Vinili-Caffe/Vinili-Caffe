const crypto = require("node:crypto");
const IDs = require("../../Utils/Config/ids");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers");
const {
  enqueuePendingDiscadiaVote,
  enqueuePendingTopggVote,
} = require("./discadiaVoteInboxService");
const TOPGG_V1_SIGNATURE_TIMESTAMP_WINDOW_MS = 30_000;

function tryRequireExpress() {
  try {
    return require("express");
  } catch {
    return null;
  }
}

function shouldStartDiscadiaVoteHttpWebhook(client) {
  const env = String(process.env.DISCADIA_VOTE_HTTP_WEBHOOK || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(env)) return true;
  if (["0", "false", "no", "off"].includes(env)) return false;
  return Boolean(client?.config?.discadia?.httpVoteWebhookEnabled);
}

function shouldStartTopggVoteHttpWebhook(client) {
  if (["1", "true", "yes", "on"].includes(String(process.env.TOPGG_VOTE_HTTP_EXTERNAL || "").trim().toLowerCase())) {
    return false;
  }
  const env = String(process.env.TOPGG_VOTE_HTTP_WEBHOOK || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(env)) return true;
  if (["0", "false", "no", "off"].includes(env)) return false;
  return Boolean(client?.config?.topgg?.httpVoteWebhookEnabled);
}

function isCandidatureWebsiteApiEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.WEBSITE_CANDIDATURE_HTTP || "").trim().toLowerCase());
}

function shouldStartPublicSiteReadonlyHttp() {
  const raw = process.env.WEBSITE_PUBLIC_HTTP;
  if (raw == null || String(raw).trim() === "") return true;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function isSiteApiExternal() {
  return ["1", "true", "yes", "on"].includes(String(process.env.SITE_API_EXTERNAL || "").trim().toLowerCase());
}

function shouldStartBotHttpServer(client) {
  if (isSiteApiExternal()) return true;
  return shouldStartDiscadiaVoteHttpWebhook(client) || shouldStartTopggVoteHttpWebhook(client) || isCandidatureWebsiteApiEnabled() || shouldStartPublicSiteReadonlyHttp();
}

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

function asDiscordSnowflakeId(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const id = String(Math.trunc(value));
    return /^\d{17,22}$/.test(id) ? id : null;
  }
  if (typeof value === "bigint") {
    const id = String(value);
    return /^\d{17,22}$/.test(id) ? id : null;
  }
  const text = String(value).trim();
  if (/^\d{17,22}$/.test(text)) return text;
  return null;
}

function extractSnowflakeFromText(text) {
  if (!text) return null;
  const mention = String(text).match(/<@!?(\d{17,22})>/);
  if (mention) return mention[1];
  const labeled = String(text).match(
    /["']?(?:user(?:[_-]?id)?|voter(?:[_-]?id)?|discord(?:[_-]?id)?|uid|member(?:[_-]?id)?)["']?\s*[:=]\s*["']?(\d{17,22})/i,
  );
  if (labeled) return labeled[1];
  const snowflake = String(text).match(/\b(\d{17,22})\b/);
  return snowflake ? snowflake[1] : null;
}

function flattenWebhookEmbedText(embed) {
  if (!embed || typeof embed !== "object") return "";
  const parts = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };
  push(embed.title);
  push(embed.description);
  push(embed.url);
  push(embed.author?.name);
  push(embed.footer?.text);
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      push(field?.name);
      push(field?.value);
    }
  }
  return parts.join("\n");
}

function extractVoteWebhookUserId(body) {
  if (!body || typeof body === "string") {
    if (typeof body === "string") return extractSnowflakeFromText(body);
    return null;
  }
  if (Buffer.isBuffer(body)) return extractVoteWebhookUserId(body.toString("utf8"));

  const directUser = asDiscordSnowflakeId(body.user);
  if (directUser) return directUser;

  const candidates = [
    body.user_id,
    body.userId,
    body.userid,
    body.uid,
    body.voter_id,
    body.voterId,
    body.discord_id,
    body.discordId,
    body.member_id,
    body.memberId,
    body.user?.id,
    body.user?.user_id,
    body.user?.userId,
    body.user?.discord_id,
    body.user?.discordId,
    body.user?.platform_id,
    body.user?.platformId,
    body.voter?.id,
    body.voter,
    body.member?.id,
    body.member,
    body.data?.user?.id,
    body.data?.user?.platform_id,
    body.data?.user?.platformId,
    body.data?.user?.discord_id,
    body.data?.user?.discordId,
    body.data?.user_id,
    body.data?.userId,
    body.data?.voter_id,
    body.data?.voterId,
    typeof body.content === "string" ? body.content : null,
    body.id,
  ];
  for (const c of candidates) {
    const asId = asDiscordSnowflakeId(c);
    if (asId) return asId;
    if (typeof c === "string") {
      const fromText = extractSnowflakeFromText(c);
      if (fromText) return fromText;
    }
  }

  if (Array.isArray(body.embeds)) {
    for (const embed of body.embeds) {
      const fromEmbed = extractSnowflakeFromText(flattenWebhookEmbedText(embed));
      if (fromEmbed) return fromEmbed;
    }
  }
  return null;
}

function normalizeWebhookPath(pathRaw) {
  const pathOnly = String(pathRaw || "").split("?")[0];
  if (!pathOnly || pathOnly === "/") return "/";
  return pathOnly.replace(/\/+$/, "") || "/";
}

function isDiscadiaWebhookRequest(req) {
  return normalizeWebhookPath(req.originalUrl || req.url || req.path) === "/webhooks/discadia";
}

function summarizeRawBodyForLog(rawBuf, maxLen = 240) {
  if (!Buffer.isBuffer(rawBuf) || rawBuf.length === 0) return "(empty)";
  const compact = rawBuf.toString("utf8").replace(/\s+/g, " ").trim();
  if (!compact) return "(empty)";
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen)}…`;
}

function parseDiscadiaWebhookBodyFromRaw(rawBuf, contentTypeRaw) {
  if (!Buffer.isBuffer(rawBuf) || rawBuf.length === 0) return {};
  const raw = rawBuf.toString("utf8").trim();
  if (!raw) return {};

  const contentType = String(contentTypeRaw || "").toLowerCase();
  const looksUrlEncoded =
    contentType.includes("application/x-www-form-urlencoded") ||
    (!raw.startsWith("{") && !raw.startsWith("[") && raw.includes("="));

  if (looksUrlEncoded) {
    try {
      const params = new URLSearchParams(raw);
      if ([...params.keys()].length) {
        const out = {};
        for (const [key, value] of params) out[key] = value;
        return out;
      }
    } catch {
          }
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
      }

  const userFromText = extractSnowflakeFromText(raw);
  if (userFromText) return { user_id: userFromText };
  return {};
}

function resolveDiscadiaWebhookBody(req) {
  const fromParser = req.body;
  if (fromParser && typeof fromParser === "object" && !Buffer.isBuffer(fromParser)) {
    const keys = Object.keys(fromParser);
    if (keys.length) return fromParser;
  }
  const fromRaw = parseDiscadiaWebhookBodyFromRaw(req._discadiaRawBody, req.headers["content-type"]);
  if (fromRaw && typeof fromRaw === "object" && Object.keys(fromRaw).length) return fromRaw;
  if (req.query && typeof req.query === "object" && Object.keys(req.query).length) return req.query;
  return fromRaw || {};
}

async function handleDiscadiaVoteWebhook(req, res, client, secret) {
  try {
    if (secret) {
      const receivedSecret = normalizeHeaderSecret(
        req.headers["authorization"] || req.headers["x-discadia-secret"],
      );
      if (receivedSecret !== secret) {
        global.logger?.warn?.("[WEBHOOK] Discadia: Unauthorized request (secret mismatch)");
        return res.status(401).send("Unauthorized");
      }
    }

    const body = resolveDiscadiaWebhookBody(req);
    const rawText = Buffer.isBuffer(req._discadiaRawBody)
      ? req._discadiaRawBody.toString("utf8")
      : "";
            const user_id =
      extractSnowflakeFromText(rawText) ||
      extractVoteWebhookUserId(body) ||
      extractVoteWebhookUserId(req.query);
    if (!user_id) {
      const contentType = String(req.headers["content-type"] || "").trim() || "(none)";
      const rawSummary = summarizeRawBodyForLog(req._discadiaRawBody);
      const looksLikeProbe =
        rawSummary === "(empty)" || rawSummary === "{}" || rawSummary === "[]" || rawSummary === "null";
      if (looksLikeProbe) {
                return res.status(200).send("Ignored");
      }
      global.logger?.warn?.(
        "[WEBHOOK] Discadia: User ID missing; content-type: " +
          contentType +
          "; body keys: " +
          (body && typeof body === "object" ? Object.keys(body).join(", ") : "(non-object)") +
          "; raw: " +
          rawSummary,
      );
      return res.status(400).send("User ID missing");
    }

    const guildId = client.config.mainGuildId || IDs.guilds.main;
        await enqueuePendingDiscadiaVote(guildId, user_id, {
      source: "bots-http",
      rawSnippet: rawText.replace(/\s+/g, " ").trim().slice(0, 240),
    });

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));

    if (!guild) {
      global.logger?.warn?.("[WEBHOOK] Discadia: Guild not ready, vote queued for " + user_id);
      return res.status(200).send("Queued");
    }

    const user = await client.users.fetch(user_id).catch(() => null);
    if (!user) {
      global.logger?.warn?.("[WEBHOOK] Discadia: User not found for ID " + user_id);
      return res.status(404).send("User not found");
    }

    const handled = await processDiscadiaVote(guild, user, client, { voteListing: "discadia" });
    if (handled) {
      return res.status(200).send("Vote Processed");
    }
    return res.status(200).send("Queued");
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] Discadia: Error handling webhook", err);
    return res.status(500).send("Internal Server Error");
  }
}

function extractTopggVoteDiscordUserId(body) {
  if (!body || typeof body !== "object") return null;
  const type = String(body.type || "").toLowerCase();
  if (type === "vote.create" || type === "webhook.test") {
    const userObj = body.data?.user;
    if (userObj && typeof userObj === "object") {
      for (const key of ["platform_id", "platformId", "discord_id", "discordId"]) {
        const raw = userObj[key];
        if (raw == null) continue;
        const id = String(raw).trim();
        if (/^\d{17,22}$/.test(id)) return id;
      }
      const nestedUser = extractVoteWebhookUserId(userObj);
      if (nestedUser) return nestedUser;
    }
    const nestedData = extractVoteWebhookUserId(body.data);
    if (nestedData) return nestedData;
  }
  return extractVoteWebhookUserId(body);
}

function parseTopggV1SignatureHeader(raw) {
  if (raw == null) return null;
  const s = Array.isArray(raw) ? raw[0] : String(raw);
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  const map = {};
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    map[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  const t = map.t;
  const v1 = map.v1;
  if (!t || !v1) return null;
  return { t, v1 };
}

function verifyTopggV1Signature(secret, timestampSec, rawBodyBuffer, signatureHex) {
  const t = String(timestampSec);
  const bodyStr = Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer.toString("utf8") : String(rawBodyBuffer);
  const hmac = crypto.createHmac("sha256", secret);
  const digest = Buffer.from(hmac.update(`${t}.${bodyStr}`).digest("hex"), "hex");
  const sigBuf = Buffer.from(String(signatureHex).trim(), "hex");
  if (sigBuf.length !== digest.length) return false;
  return crypto.timingSafeEqual(sigBuf, digest);
}

function isTopggWebhookAuthorized(req, topggSecret) {
  const sigRaw = req.headers["x-topgg-signature"];
  const rawBuf = req._topggRawBody;
  if (sigRaw && Buffer.isBuffer(rawBuf)) {
    const parsed = parseTopggV1SignatureHeader(sigRaw);
    if (!parsed) return false;
    const tsMs = parseInt(parsed.t, 10) * 1000;
    if (!Number.isFinite(tsMs)) return false;
    if (Math.abs(Date.now() - tsMs) > TOPGG_V1_SIGNATURE_TIMESTAMP_WINDOW_MS) return false;
    return verifyTopggV1Signature(topggSecret, parsed.t, rawBuf, parsed.v1);
  }
  const receivedSecret = normalizeHeaderSecret(req.headers["authorization"] || req.headers["x-topgg-secret"] || req.headers["x-topgg-authorization"]);
  return receivedSecret === topggSecret;
}

async function startWebhookServer(client) {
  if (client._botHttpWebhookServer?.listening) return;
  if (client._discadiaVoteHttpServerStarted) return;
  if (!shouldStartBotHttpServer(client)) return;

  const express = tryRequireExpress();
  if (!express) {
    global.logger?.error?.( "[WEBHOOK] Modulo `express` non trovato. Installa le dipendenze del bot. HTTP disabilitato.");
    return;
  }

  client._discadiaVoteHttpServerStarted = true;

  const config = client.config?.discadia || {};
  const port = config.webhookPort || 3000;
  const secret = String(process.env.DISCADIA_WEBHOOK_SECRET || config.webhookSecret || "").trim();
  const topggSecret = String(process.env.TOPGG_WEBHOOK_SECRET || client?.config?.topgg?.webhookSecret || "").trim();

  const app = express();
  app.set("trust proxy", true);
  app.use(
    express.json({
      limit: "12mb",
      verify: (req, res, buf) => {
        const pathOnly = normalizeWebhookPath(req.originalUrl || req.url || "");
        if (pathOnly === "/webhooks/topgg") {
          req._topggRawBody = buf;
        }
        if (pathOnly === "/webhooks/discadia") {
          req._discadiaRawBody = buf;
        }
        if (pathOnly === "/webhooks/site-kick-sub/events" || pathOnly.endsWith("/site-kick-sub/events")) {
          req._kickSubRawBody = Buffer.isBuffer(buf) ? Buffer.from(buf) : buf;
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));

  try {
    const { mountTicketTranscriptRoutes } = require("./ticketTranscriptHttp");
    mountTicketTranscriptRoutes(app, client);
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] ticket-transcript routes:", err?.message || err);
  }

  const candidatureCorsAllowlist = expandCorsOriginAllowlist(
    parseCorsOriginAllowlist(
      String(process.env.WEBSITE_CANDIDATURE_CORS_ORIGIN || process.env.WEBSITE_PUBLIC_ORIGIN || "").trim(),
    ),
  );

  const siteCandidatureCorsMiddleware = (req, res, next) => {
    const rawPath = String(req.originalUrl || req.url || req.path || "");
    const pathStr = rawPath.split("?")[0];
    const isStatus = pathStr === "/webhooks/status" || pathStr === "/webhooks/health";
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
    const isSiteWikiHelp = pathStr.startsWith("/webhooks/site-wiki-help");
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
    // appelliApi1: subject live chat on /appelli uses these user workflow endpoints
    const isSiteUserWorkflow =
      pathStr.startsWith("/webhooks/site-user-workflows") ||
      pathStr.startsWith("/webhooks/site-user-workflow-chat");
    const isSiteStaffWorkflow =
      pathStr.startsWith("/webhooks/site-staff-workflows") ||
      pathStr.startsWith("/webhooks/site-staff-workflow-chat");
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
      !isSiteWikiHelp &&
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
      !isSiteProfileExtras &&
      !isSiteUserWorkflow &&
      !isSiteStaffWorkflow
    ) {
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
    } else if (isStatus || isSiteRules || isSiteUsers || isSiteVote || isSiteLiveEvent || isSiteKickLive || isSiteKickSub || isSiteRoles || isSiteRankCard || isSiteWikiHelp || isSiteReviews || isSiteSuggestions || isSiteBotFeedback || isSiteNotifications || isSitePayments || isSiteSeratafilmAccess || isSiteStaffAccess || isSiteHogwartsSorting) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Cache-Control, Pragma, Access-Control-Request-Private-Network");
    if (allowOrigin) res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };

  const skipSiteRoutesOnBots = ["1", "true", "yes", "on"].includes(
    String(process.env.SITE_API_EXTERNAL || "").trim().toLowerCase(),
  );
  if (!skipSiteRoutesOnBots) {
    const {
      listSitePaymentPlans,
      createSitePaymentOrder,
      captureSitePaymentOrder,
      handleSitePayPalWebhook,
    } = require("../../Utils/Web/sitePaymentsApi");
    const { mountSiteWebhookRoutes } = require("./siteWebhookRoutes");
    mountSiteWebhookRoutes(app, client, {
      normalizeHeaderSecret,
      siteCorsMiddleware: siteCandidatureCorsMiddleware,
      listSitePaymentPlans,
      createSitePaymentOrder,
      captureSitePaymentOrder,
      handleSitePayPalWebhook,
    });
  }

  if (shouldStartTopggVoteHttpWebhook(client)) {
    if (!topggSecret) {
      global.logger?.error?.( "[WEBHOOK] Top.gg: webhook abilitato ma manca TOPGG_WEBHOOK_SECRET. Imposta lo stesso valore del campo Authorization nel pannello Top.gg.");
    } else {
      app.post("/webhooks/topgg", async (req, res) => {
        try {
          if (!isTopggWebhookAuthorized(req, topggSecret)) {
            global.logger?.warn?.("[WEBHOOK] Top.gg: Unauthorized (firma v1 o Authorization non valida)");
            return res.status(401).send("Unauthorized");
          }

          const body = req.body && typeof req.body === "object" ? req.body : {};
          const evtType = String(body.type || "").toLowerCase();
          if (evtType === "test" || evtType === "webhook.test") {
            return res.status(200).send("OK");
          }
          if (evtType === "integration.create" || evtType === "integration.delete") {
            return res.status(200).send("OK");
          }

          const user_id = extractTopggVoteDiscordUserId(body);
          if (!user_id) {
            global.logger?.warn?.(
              "[WEBHOOK] Top.gg: User ID missing; body keys: " +
                (req.body && typeof req.body === "object" ? Object.keys(req.body).join(", ") : "(non-object)"),
            );
            return res.status(400).send("User ID missing");
          }

          const guildId = client.config.mainGuildId || IDs.guilds.main;
          const rawSnippet = Buffer.isBuffer(req._topggRawBody)
            ? req._topggRawBody.toString("utf8").replace(/\s+/g, " ").trim().slice(0, 240)
            : "";
          await enqueuePendingTopggVote(guildId, user_id, {
            source: "bots-http",
            rawSnippet,
          });
          return res.status(200).send("Queued");
        } catch (err) {
          global.logger?.error?.("[WEBHOOK] Top.gg: Error handling webhook", err);
          return res.status(500).send("Internal Server Error");
        }
      });
    }
  }

  if (shouldStartDiscadiaVoteHttpWebhook(client)) {
    app.post("/webhooks/discadia", (req, res) => {
      handleDiscadiaVoteWebhook(req, res, client, secret);
    });
  }

  app.get("/webhooks/status", (req, res) => {
    res.status(200).json({ status: "online", bot: client.user?.tag || "Offline" });
  });

  app.get("/webhooks/coffee/health", async (req, res) => {
    try {
      const { probeCoffeeHealth } = require("../../Utils/Web/stackHealth");
      const coffee = await probeCoffeeHealth(1500);
      return res.status(coffee.ok ? 200 : 503).json({
        ok: coffee.ok,
        status: coffee.status,
        service: "coffee",
        bot: coffee.bot,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] coffee health:", err?.message || err);
      return res.status(503).json({ ok: false, status: "error", service: "coffee" });
    }
  });

  app.get("/webhooks/health", (req, res) => {
    const { sendStackHealth } = require("../../Utils/Web/stackHealth");
    return sendStackHealth(client, req, res, { service: "bots", includeLavalink: true, includeCoffee: true });
  });

  app.use((err, req, res, next) => {
    const isJsonBodyError =
      err instanceof SyntaxError && Number(err.status) === 400 && "body" in err;
    if (!isJsonBodyError) return next(err);

        if (isDiscadiaWebhookRequest(req)) {
      global.logger?.warn?.(
        "[WEBHOOK] Discadia: JSON body parse failed, retrying from raw buffer:",
        err.message,
      );
      return handleDiscadiaVoteWebhook(req, res, client, secret);
    }

        if (!res.headersSent) {
      return res.status(400).send("Bad Request");
    }
    return undefined;
  });

  const http = require("node:http");
  const server = http.createServer(app);
  try {
    const { attachSiteSuggestionsWsServer } = require("../../Utils/Web/siteSuggestionsBroadcast");
    attachSiteSuggestionsWsServer(server);
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] WebSocket suggerimenti (init):", err?.message || err);
  }

  client._botHttpWebhookServer = server;

  server.once("error", (err) => {
    client._discadiaVoteHttpServerStarted = false;
    if (client._botHttpWebhookServer === server) client._botHttpWebhookServer = null;

    if (err?.code === "EADDRINUSE") {
      global.logger?.error?.(
        `[WEBHOOK] porta ${port} già in uso: il server HTTP del bot non e stato avviato. ` +
          "Chiudi l'altro processo sulla stessa porta oppure cambia `discadia.webhookPort`.",
      );
      return;
    }

    global.logger?.error?.("[WEBHOOK] listen failed:", err);
  });

  server.listen(port, "0.0.0.0", () => {
    global.logger?.info?.(`[WEBHOOK] HTTP server online on 0.0.0.0:${port}`);
  });
}

module.exports = {
  startWebhookServer,
  shouldStartDiscadiaVoteHttpWebhook,
  shouldStartTopggVoteHttpWebhook,
  shouldStartBotHttpServer,
  shouldStartPublicSiteReadonlyHttp,
  isCandidatureWebsiteApiEnabled,
  extractTopggVoteDiscordUserId,
  isTopggWebhookAuthorized,
};