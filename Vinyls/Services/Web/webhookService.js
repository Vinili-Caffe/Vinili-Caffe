const crypto = require("node:crypto");
const IDs = require("../../Utils/Config/ids");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers");

/** Allineato a @top-gg/sdk (structs/Webhook.ts): finestra anti-replay in ms. */
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
  return (
    shouldStartDiscadiaVoteHttpWebhook(client) ||
    shouldStartTopggVoteHttpWebhook(client) ||
    isCandidatureWebsiteApiEnabled() ||
    shouldStartPublicSiteReadonlyHttp()
  );
}

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

/** Normalizza una voce .env (virgolette, spazi, slash finale) → stringa `origin` come la manda il browser. */
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

/** Es. `https://sito.it,http://localhost:3000` → il browser richiede `Access-Control-Allow-Origin` uguale all'Origin della pagina. */
function parseCorsOriginAllowlist(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => normalizeCorsOriginEntry(s))
    .filter(Boolean);
}

/** `localhost` e `127.0.0.1` sono origini diverse per il browser: se ne elenchi una, accettiamo anche l’altra (stessa porta). */
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
      /* ignore */
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

/** Se in allowlist c’è almeno un http(s)://localhost… (qualsiasi porta), accetta qualsiasi porta loopback in richiesta (evita 5173 vs 3000 in dev). */
function corsAllowlistPermitsAnyLoopbackDevOrigin(allowlist) {
  return allowlist.some((o) => isLoopbackBrowserOriginUrl(o));
}

function extractVoteWebhookUserId(body) {
  if (!body || typeof body !== "object") return null;
  if (typeof body.user === "string") {
    const u = String(body.user).trim();
    if (/^\d{17,22}$/.test(u)) return u;
  }
  const candidates = [
    body.user_id,
    body.userId,
    body.id,
    body.voter_id,
    body.voterId,
    body.discord_id,
    body.discordId,
    body.user?.id,
    body.voter?.id,
    body.member?.id,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const id = String(c).trim();
    if (/^\d{17,22}$/.test(id)) return id;
  }
  return null;
}

/** Top.gg API v1: `vote.create` / `webhook.test` → Discord ID in `data.user.platform_id`. */
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

/** Stesso algoritmo di @top-gg/sdk Webhook._parseRequest: messaggio `${t}.${rawBodyUtf8}`. */
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
  const receivedSecret = normalizeHeaderSecret(
    req.headers["authorization"] || req.headers["x-topgg-secret"] || req.headers["x-topgg-authorization"],
  );
  return receivedSecret === topggSecret;
}

async function startWebhookServer(client) {
  if (client._discadiaVoteHttpServerStarted) return;
  if (!shouldStartBotHttpServer(client)) return;

  const express = tryRequireExpress();
  if (!express) {
    global.logger?.error?.(
      "[WEBHOOK] Modulo `express` non trovato. Installa le dipendenze del bot (es. `npm install` in Vinyls). HTTP disabilitato.",
    );
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
      limit: "512kb",
      verify: (req, res, buf) => {
        const pathOnly = String(req.originalUrl || req.url || "").split("?")[0];
        if (pathOnly === "/webhooks/topgg") {
          req._topggRawBody = buf;
        }
      },
    }),
  );

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
    if (!isCandidature && !isUnban && !isSiteRules && !isSiteUsers && !isSiteVote && !isSiteLiveEvent && !isSiteRoles && !isSiteRankCard && !isSiteReviews) return next();
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
    } else if (isSiteRules || isSiteUsers || isSiteVote || isSiteLiveEvent || isSiteRoles || isSiteRankCard || isSiteReviews) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Access-Control-Request-Private-Network",
    );
    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };

  if (isCandidatureWebsiteApiEnabled()) {
    app.use(siteCandidatureCorsMiddleware);
    const {
      submitCandidatureWebsite,
      getCandidatureEligibilitySummary,
    } = require("../../Events/interaction/candidatureApplicationHandlers");
    const {
      getWebsiteUnbanEligibility,
      submitWebsiteUnban,
    } = require("../../Events/interaction/unbanWebsiteHandlers");
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
      global.logger?.error?.(
        "[WEBHOOK] Top.gg: webhook abilitato ma manca TOPGG_WEBHOOK_SECRET (o topgg.webhookSecret in config). Imposta lo stesso valore del campo Authorization nel pannello Top.gg.",
      );
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
  const { getRankCardCustomization, updateRankCardCustomization } = require("../../Utils/Web/siteRankCardApi");
  const { getSiteReviews, submitSiteReview } = require("../../Utils/Web/siteReviewsApi");
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

  app.listen(port, "0.0.0.0", () => {
  });
}

module.exports = {
  startWebhookServer,
  shouldStartDiscadiaVoteHttpWebhook,
  shouldStartTopggVoteHttpWebhook,
  shouldStartBotHttpServer,
  shouldStartPublicSiteReadonlyHttp,
  isCandidatureWebsiteApiEnabled,
};
