const IDs = require("../../Utils/Config/ids");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers");

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

function isCandidatureWebsiteApiEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.WEBSITE_CANDIDATURE_HTTP || "").trim().toLowerCase());
}

function shouldStartBotHttpServer(client) {
  return shouldStartDiscadiaVoteHttpWebhook(client) || isCandidatureWebsiteApiEnabled();
}

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

/** Es. `https://sito.it,http://localhost:3000` → il browser richiede `Access-Control-Allow-Origin` uguale all'Origin della pagina. */
function parseCorsOriginAllowlist(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
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

function extractVoteWebhookUserId(body) {
  if (!body || typeof body !== "object") return null;
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
    if (/^\d{17,20}$/.test(id)) return id;
  }
  return null;
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

  const app = express();
  app.use(express.json({ limit: "512kb" }));

  if (isCandidatureWebsiteApiEnabled()) {
    const candidatureCorsAllowlist = expandCorsOriginAllowlist(
      parseCorsOriginAllowlist(
        String(process.env.WEBSITE_CANDIDATURE_CORS_ORIGIN || process.env.WEBSITE_PUBLIC_ORIGIN || "").trim(),
      ),
    );
    app.use((req, res, next) => {
      const rawPath = String(req.originalUrl || req.url || req.path || "");
      const pathStr = rawPath.split("?")[0];
      if (!pathStr.startsWith("/webhooks/site-candidature")) return next();
      const origin = String(req.headers.origin || "").trim();
      let allowOrigin = "";
      if (origin && candidatureCorsAllowlist.includes(origin)) {
        allowOrigin = origin;
      } else if (origin && candidatureCorsAllowlist.length === 0) {
        try {
          const u = new URL(origin);
          const h = u.hostname.toLowerCase();
          if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") allowOrigin = origin;
        } catch {
          /* ignore */
        }
      }
      if (allowOrigin) {
        res.setHeader("Access-Control-Allow-Origin", allowOrigin);
        res.append("Vary", "Origin");
      }
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });
    const {
      submitCandidatureWebsite,
      getCandidatureEligibilitySummary,
    } = require("../../Events/interaction/candidatureApplicationHandlers");
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
    global.logger?.info?.(
      "[WEBHOOK] Candidature sito: GET /webhooks/site-candidature/eligibility, POST /webhooks/site-candidature (Bearer)",
    );
  }

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
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);

      if (!guild) {
        global.logger?.error?.("[WEBHOOK] Discadia: Guild not found for ID " + guildId);
        return res.status(500).send("Guild not found");
      }

      const user = await client.users.fetch(user_id).catch(() => null);
      if (!user) {
        global.logger?.warn?.("[WEBHOOK] Discadia: User not found for ID " + user_id);
        return res.status(404).send("User not found");
      }

      const handled = await processDiscadiaVote(guild, user, client);
      if (handled) {
        return res.status(200).send("Vote Processed");
      }
      return res.status(500).send("Vote processing failed");
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] Discadia: Error handling webhook", err);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/webhooks/status", (req, res) => {
    res.status(200).json({ status: "online", bot: client.user?.tag || "Offline" });
  });

  app.listen(port, () => {
    global.logger?.info?.(
      "[WEBHOOK] HTTP listening on port " +
        port +
        (shouldStartDiscadiaVoteHttpWebhook(client) ? " (POST /webhooks/discadia)" : "") +
        (isCandidatureWebsiteApiEnabled()
          ? " (GET /webhooks/site-candidature/eligibility, POST /webhooks/site-candidature)"
          : ""),
    );
  });
}

module.exports = {
  startWebhookServer,
  shouldStartDiscadiaVoteHttpWebhook,
  shouldStartBotHttpServer,
  isCandidatureWebsiteApiEnabled,
};