const crypto = require("node:crypto");
const IDs = require("../../Utils/Config/ids");
const { resolveDiscordOauthClientIdForSite, resolveDiscordOauthRedirectUriForSite, normalizeSiteOAuthReturnPath } = require("../../Utils/Web/verifyOauthPublicUrl");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers");
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

function shouldStartBotHttpServer(client) {
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

function extractVoteWebhookUserId(body) {
  if (!body || typeof body !== "object") return null;
  if (typeof body.user === "string") {
    const u = String(body.user).trim();
    if (/^\d{17,22}$/.test(u)) return u;
  }
  const candidates = [body.user_id, body.userId, body.id, body.voter_id, body.voterId, body.discord_id, body.discordId, body.user?.id, body.voter?.id, body.member?.id];
  for (const c of candidates) {
    if (c == null) continue;
    const id = String(c).trim();
    if (/^\d{17,22}$/.test(id)) return id;
  }
  return null;
}

function extractTopggVoteDiscordUserId(body) {
  if (!body || typeof body !== "object") return null;
  const type = String(body.type || "").toLowerCase();
  if (type === "vote.create" || type === "webhook.test") {
    const pid = body.data?.user?.platform_id;
    if (pid != null) {
      const id = String(pid).trim();
      if (/^\d{17,22}$/.test(id)) return id;
    }
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
  app.use(
    express.json({
      limit: "12mb",
      verify: (req, res, buf) => {
        const pathOnly = String(req.originalUrl || req.url || "").split("?")[0];
        if (pathOnly === "/webhooks/topgg") {
          req._topggRawBody = buf;
        }
      },
    }),
  );

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
    const isCandidature = pathStr.startsWith("/webhooks/site-candidature");
    const isUnban = pathStr.startsWith("/webhooks/site-unban");
    const isSiteRules = pathStr.startsWith("/webhooks/site-rules");
    const isSiteUsers = pathStr.startsWith("/webhooks/site-users");
    const isSiteVote = pathStr.startsWith("/webhooks/site-vote");
    const isSiteLiveEvent = pathStr.startsWith("/webhooks/site-live-event");
    const isSiteRoles = pathStr.startsWith("/webhooks/site-roles");
    const isSiteRankCard = pathStr.startsWith("/webhooks/site-rank-card");
    const isSiteReviews = pathStr.startsWith("/webhooks/site-reviews");
    const isSiteSuggestions = pathStr.startsWith("/webhooks/site-suggestions");
    const isSiteNotifications = pathStr.startsWith("/webhooks/site-notifications");
    const isSiteForum = pathStr.startsWith("/webhooks/site-forum");
    const isSiteVerify = pathStr.startsWith("/webhooks/site-verify");
    const isSitePayments = pathStr.startsWith("/webhooks/site-payments");
    const isSiteSeratafilmAccess = pathStr.startsWith("/webhooks/site-seratafilm-access");
    const isSiteHogwartsSorting = pathStr.startsWith("/webhooks/site-hogwarts-sorting");
    if (!isCandidature && !isUnban && !isSiteRules && !isSiteUsers && !isSiteVote && !isSiteLiveEvent && !isSiteRoles && !isSiteRankCard && !isSiteReviews && !isSiteSuggestions && !isSiteNotifications && !isSiteForum && !isSiteVerify && !isSitePayments && !isSiteSeratafilmAccess && !isSiteHogwartsSorting) return next();
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
    } else if (isSiteRules || isSiteUsers || isSiteVote || isSiteLiveEvent || isSiteRoles || isSiteRankCard || isSiteReviews || isSiteSuggestions || isSiteNotifications || isSitePayments || isSiteSeratafilmAccess || isSiteHogwartsSorting) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Access-Control-Request-Private-Network");
    if (allowOrigin) res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };

  if (isCandidatureWebsiteApiEnabled()) {
    app.use(siteCandidatureCorsMiddleware);
    const { submitCandidatureWebsite, getCandidatureEligibilitySummary } = require("../../Events/interaction/candidatureApplicationHandlers");
    const { getWebsiteUnbanEligibility, submitWebsiteUnban } = require("../../Events/interaction/unbanWebsiteHandlers");
    app.get("/webhooks/site-candidature/eligibility", async (req, res) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out = await getCandidatureEligibilitySummary(client, accessToken);
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-candidature eligibility:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.post("/webhooks/site-candidature", async (req, res) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const type = body.type;
        const answers = body.answers;
        const out = await submitCandidatureWebsite(client, { accessToken, type, answers });
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-candidature:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.get("/webhooks/site-unban/eligibility", async (req, res) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out = await getWebsiteUnbanEligibility(client, accessToken);
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unban eligibility:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.post("/webhooks/site-unban", async (req, res) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const out = await submitWebsiteUnban(client, {
          accessToken,
          answers: body.answers,
          acceptedRules: body.acceptedRules,
        });
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unban:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
  } else {
    const candidatureDisabledBody = {
      ok: false,
      error: "candidature_http_disabled",
      message:
        "API candidature sito disattivata: nel .env del bot imposta WEBSITE_CANDIDATURE_HTTP=1 e riavvia. Se il sito statico e il bot usano la stessa porta (es. tutto su 3000), il POST colpisce `serve` e non Express: avvia il sito su un'altra porta (es. 5173) e lascia la webhookPort al bot.",
    };
    app.use(siteCandidatureCorsMiddleware);
    app.get("/webhooks/site-candidature/eligibility", (req, res) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-candidature", (req, res) => res.status(503).json(candidatureDisabledBody));
    app.get("/webhooks/site-unban/eligibility", (req, res) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-unban", (req, res) => res.status(503).json(candidatureDisabledBody));
    global.logger?.warn?.(
      "[WEBHOOK] API sito disattive: WEBSITE_CANDIDATURE_HTTP disattivo — GET/POST su /webhooks/site-candidature e /webhooks/site-unban rispondono 503.",
    );
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
          const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
          if (!guild) {
            global.logger?.error?.("[WEBHOOK] Top.gg: Guild not found for ID " + guildId);
            return res.status(500).send("Guild not found");
          }

          const user = await client.users.fetch(user_id).catch(() => null);
          if (!user) {
            global.logger?.warn?.("[WEBHOOK] Top.gg: User not found for ID " + user_id);
            return res.status(404).send("User not found");
          }

          const handled = await processDiscadiaVote(guild, user, client, { voteListing: "topgg" });
          if (handled) {
            return res.status(200).send("Vote Processed");
          }
          return res.status(500).send("Vote processing failed");
        } catch (err) {
          global.logger?.error?.("[WEBHOOK] Top.gg: Error handling webhook", err);
          return res.status(500).send("Internal Server Error");
        }
      });
    }
  }

  const { buildCommunityRulesSitePayload } = require("../../Utils/Web/communityRulesPayload");
  const { handleSiteUsersLeaderboardGet } = require("../../Utils/Web/siteUsersLeaderboardApi");
  const { handleSiteVoteGet } = require("../../Utils/Web/siteVoteApi");
  const { handleSiteLiveEventGet } = require("../../Utils/Web/siteLiveEventApi");
  const { handleSiteRolesGet } = require("../../Utils/Web/siteRolesApi");
  const { submitSiteRoleRequest } = require("../../Utils/Web/siteRoleRequestApi");
  const { getRankCardCustomization, updateRankCardCustomization, getRankCardPreview, getPublicRankCardPreview } = require("../../Utils/Web/siteRankCardApi");
  const { getSiteReviews, submitSiteReview, deleteSiteReview, toggleSiteReviewLike, upsertServerReviewReply } = require("../../Utils/Web/siteReviewsApi");
  const { getSiteSuggestions, createSiteSuggestion, updateOwnSiteSuggestion, deleteOwnSiteSuggestion, addSiteSuggestionComment, updateSiteSuggestionComment, deleteSiteSuggestionComment, setSiteSuggestionCommentVote, setSiteSuggestionVote, staffAcceptSiteSuggestion, staffRejectSiteSuggestion, staffDeleteSiteSuggestion } = require("../../Utils/Web/siteSuggestionsApi");
  const { handleSiteNotificationsGet, handleSiteNotificationsMarkReadPost, handleSiteNotificationsClearPost } = require("../../Utils/Web/siteInAppNotificationsApi");
  const { getSiteForumThreads, getSiteForumThreadMessages, getSiteForumThreadMessagesAuthed, createSiteForumThread, createSiteForumMessage, updateSiteForumThread } = require("../../Utils/Web/siteForumApi");
  const { completeSiteVerify } = require("../../Utils/Web/siteVerifyApi");
  const { handleSiteSeratafilmAccessGet } = require("../../Utils/Web/siteSeratafilmAccessApi");
  const { handleHogwartsForbiddenBooksClaim, handleHogwartsForbiddenBooksGet, handleHogwartsHousePointsGet, handleHogwartsPotionsGet, handleHogwartsPotionsPost, handleHogwartsShopGet, handleHogwartsShopPurchasePost, handleHogwartsSortingBootstrap, handleHogwartsSortingEligibility, handleHogwartsSortingSubmit, handleHogwartsSortingAccessGet, handleHogwartsGringottGet } = require("../../Utils/Web/siteHogwartsSortingApi");

  app.get("/webhooks/site-rules", (req, res) => {
    try {
      res.setHeader("Cache-Control", "public, max-age=120");
      return res.json(buildCommunityRulesSitePayload());
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rules:", err);
      return res.status(500).json({ ok: false, error: "internal" });
    }
  });
  app.get("/webhooks/site-users", (req, res) => {
    return handleSiteUsersLeaderboardGet(client, req, res);
  });
  app.get("/webhooks/site-vote", (req, res) => {
    return handleSiteVoteGet(client, req, res);
  });
  app.get("/webhooks/site-notifications", (req, res) => {
    return handleSiteNotificationsGet(client, req, res);
  });
  app.post("/webhooks/site-notifications/read", (req, res) => {
    return handleSiteNotificationsMarkReadPost(client, req, res);
  });
  app.post("/webhooks/site-notifications/clear", (req, res) => {
    return handleSiteNotificationsClearPost(client, req, res);
  });
  app.get("/webhooks/site-seratafilm-access", (req, res) => handleSiteSeratafilmAccessGet(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/bootstrap", (req, res) => handleHogwartsSortingBootstrap(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/access", (req, res) => handleHogwartsSortingAccessGet(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/gringott", (req, res) => handleHogwartsGringottGet(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/points", (req, res) => handleHogwartsHousePointsGet(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/potions", (req, res) => handleHogwartsPotionsGet(client, req, res));
  app.post("/webhooks/site-hogwarts-sorting/potions", (req, res) => handleHogwartsPotionsPost(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/shop", (req, res) => handleHogwartsShopGet(client, req, res));
  app.post("/webhooks/site-hogwarts-sorting/shop/purchase", (req, res) => handleHogwartsShopPurchasePost(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/forbidden-books", (req, res) => handleHogwartsForbiddenBooksGet(client, req, res));
  app.post("/webhooks/site-hogwarts-sorting/forbidden-books", (req, res) => handleHogwartsForbiddenBooksClaim(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/eligibility", (req, res) =>
    handleHogwartsSortingEligibility(client, req, res),
  );
  app.post("/webhooks/site-hogwarts-sorting", (req, res) => handleHogwartsSortingSubmit(client, req, res));
  app.get("/webhooks/site-payments/plans", (req, res) => {
    try {
      return res.status(200).json({ ok: true, items: listSitePaymentPlans() });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-payments plans:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-payments/create-order", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await createSitePaymentOrder(client, {
        accessToken,
        planKey: body.planKey,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-payments create-order:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-payments/capture-order", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await captureSitePaymentOrder(client, {
        accessToken,
        orderId: body.orderId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-payments capture-order:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-payments/paypal-webhook", async (req, res) => {
    return handleSitePayPalWebhook(client, req, res);
  });
  app.post("/webhooks/site-verify/complete", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await completeSiteVerify(client, {
        accessToken,
        guildId: body.guildId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-verify complete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-verify/oauth-start", (req, res) => {
    const clientId = resolveDiscordOauthClientIdForSite();
    const redirectUri = resolveDiscordOauthRedirectUriForSite();
    if (!clientId || !redirectUri) {
      res
        .status(503)
        .type("text/plain; charset=utf-8")
        .send("OAuth sito non configurato sul bot. Imposta DISCORD_OAUTH_CLIENT_ID e DISCORD_OAUTH_REDIRECT_URI (o WEBSITE_*).");
      return;
    }
    const fromR = normalizeSiteOAuthReturnPath(req.query?.r);
    const gid = String(req.query?.guildId || req.query?.guild || "").trim();
    const returnPath =
      fromR ||
      (/^\d{17,22}$/.test(gid) ? `/verify/?guildId=${encodeURIComponent(gid)}` : "/verify/");
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = encodeURIComponent(JSON.stringify({ r: returnPath, n: nonce, t: Date.now() }));
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: "identify",
      state,
    });
    const authorizeUrl = `https://discord.com/oauth2/authorize?${q.toString()}`;
    const nonceJson = JSON.stringify(nonce);
    const urlJson = JSON.stringify(authorizeUrl);
    const html =
      "<!DOCTYPE html><html lang=\"it\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>Discord</title></head><body>" +
      "<script>(function(){var n=" +
      nonceJson +
      ";try{sessionStorage.setItem(\"vc_oauth_state_nonce_v1\",n);}catch(e){}location.replace(" +
      urlJson +
      ");})();<\/script></body></html>";
    res.status(200).type("text/html; charset=utf-8").send(html);
  });
  app.get("/webhooks/site-forum", async (req, res) => {
    try {
      const out = await getSiteForumThreads(client, { limit: req.query?.limit });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-forum get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-forum/:threadId/messages", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const load = accessToken ? getSiteForumThreadMessagesAuthed : getSiteForumThreadMessages;
      const out = await load(client, {
        accessToken,
        threadId: req.params?.threadId,
        limit: req.query?.limit,
        before: req.query?.before,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-forum messages get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-forum", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const tagIds = Array.isArray(body.tagIds)
        ? body.tagIds
        : typeof body.tagIds === "string"
          ? body.tagIds.split(",")
          : [];
      const out = await createSiteForumThread(client, {
        accessToken,
        title: body.title,
        content: body.content,
        media: body.media,
        tagIds,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-forum post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-forum/:threadId/messages", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await createSiteForumMessage(client, {
        accessToken,
        threadId: req.params?.threadId,
        content: body.content,
        media: body.media,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-forum message post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-forum/:threadId", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await updateSiteForumThread(client, {
        accessToken,
        threadId: req.params?.threadId,
        title: body.title,
        content: body.content,
        archived: body.archived,
        locked: body.locked,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-forum thread patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-live-event", (req, res) => {
    return handleSiteLiveEventGet(client, req, res);
  });
  app.get("/webhooks/site-roles", (req, res) => {
    return handleSiteRolesGet(client, req, res);
  });
  app.post("/webhooks/site-roles/request", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await submitSiteRoleRequest(client, {
        accessToken,
        roleId: body.roleId,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-roles request:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-rank-card", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getRankCardCustomization(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rank-card get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-rank-card", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await updateRankCardCustomization(client, {
        accessToken,
        mode: body.mode,
        theme: body.theme,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rank-card post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-rank-card-preview", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await getRankCardPreview(client, {
        accessToken,
        theme: body.theme,
      });
      if (!out || out.ok !== true || !out.image) {
        return res.status(Number(out?.status) || 500).json(out || { ok: false, error: "preview_failed" });
      }
      res.setHeader("Content-Type", String(out.mimeType || "image/png"));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.status(200).send(out.image);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rank-card-preview post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-rank-card-public", async (req, res) => {
    try {
      const userId = String((req.query && req.query.userId) || "").trim();
      const out = await getPublicRankCardPreview(client, { userId });
      if (!out || out.ok !== true || !out.image) {
        return res.status(Number(out?.status) || 500).json(out || { ok: false, error: "preview_failed" });
      }
      res.setHeader("Content-Type", String(out.mimeType || "image/png"));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.status(200).send(out.image);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rank-card-public get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-reviews", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getSiteReviews(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-reviews", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await submitSiteReview(client, {
        accessToken,
        kind: body.kind,
        rating: body.rating,
        content: body.content,
        staffUserId: body.staffUserId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.delete("/webhooks/site-reviews/:reviewId", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteSiteReview(client, {
        accessToken,
        reviewId: req.params?.reviewId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-reviews/:reviewId/like", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await toggleSiteReviewLike(client, {
        accessToken,
        reviewId: req.params?.reviewId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews like:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-reviews/:reviewId/server-reply", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await upsertServerReviewReply(client, {
        accessToken,
        reviewId: req.params?.reviewId,
        content: body.content,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews server-reply:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-suggestions", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getSiteSuggestions(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await createSiteSuggestion(client, {
        accessToken,
        content: body.content,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/comments/:commentId/vote", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await setSiteSuggestionCommentVote(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        commentId: req.params?.commentId,
        direction: body.direction,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions comment vote:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-suggestions/:suggestionId/comments/:commentId", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await updateSiteSuggestionComment(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        commentId: req.params?.commentId,
        content: body.content,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions comment patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.delete("/webhooks/site-suggestions/:suggestionId/comments/:commentId", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteSiteSuggestionComment(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        commentId: req.params?.commentId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions comment delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/comments", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await addSiteSuggestionComment(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        content: body.content,
        parentCommentId: body.parentCommentId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions comment:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-suggestions/:suggestionId", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await updateOwnSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        content: body.content,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.delete("/webhooks/site-suggestions/:suggestionId", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteOwnSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions author delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/vote", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await setSiteSuggestionVote(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        direction: body.direction,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions vote:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/accept", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await staffAcceptSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions accept:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/reject", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await staffRejectSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions reject:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/delete", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await staffDeleteSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  if (shouldStartDiscadiaVoteHttpWebhook(client)) {
  app.post("/webhooks/discadia", async (req, res) => {
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

      const user_id = extractVoteWebhookUserId(req.body);
      if (!user_id) {
        global.logger?.warn?.(
          "[WEBHOOK] Discadia: User ID missing; body keys: " +
            (req.body && typeof req.body === "object" ? Object.keys(req.body).join(", ") : "(non-object)"),
        );
        return res.status(400).send("User ID missing");
      }

      const guildId = client.config.mainGuildId || IDs.guilds.main;
        const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));

      if (!guild) {
        global.logger?.error?.("[WEBHOOK] Discadia: Guild not found for ID " + guildId);
        return res.status(500).send("Guild not found");
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
      return res.status(500).send("Vote processing failed");
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] Discadia: Error handling webhook", err);
      return res.status(500).send("Internal Server Error");
    }
  });
  }

  app.get("/webhooks/status", (req, res) => {
    res.status(200).json({ status: "online", bot: client.user?.tag || "Offline" });
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

module.exports = { startWebhookServer, shouldStartDiscadiaVoteHttpWebhook, shouldStartTopggVoteHttpWebhook, shouldStartBotHttpServer, shouldStartPublicSiteReadonlyHttp, isCandidatureWebsiteApiEnabled };