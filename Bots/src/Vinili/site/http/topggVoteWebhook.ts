/** Webhook HTTP: voto Top.gg (firma v1, user id, route). */
const crypto = require("node:crypto") as typeof import("node:crypto");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { enqueuePendingTopggVote } = require("./discadiaVoteInboxService") as typeof import("./discadiaVoteInboxService");
const { extractVoteWebhookUserId, normalizeHeaderSecret } = require("./discadiaVoteWebhook") as typeof import("./discadiaVoteWebhook");

const TOPGG_V1_SIGNATURE_TIMESTAMP_WINDOW_MS = 30_000;

function shouldStartTopggVoteHttpWebhook(client?) {
  if (["1", "true", "yes", "on"].includes(String(process.env.TOPGG_VOTE_HTTP_EXTERNAL || "").trim().toLowerCase())) {
    return false;
  }
  const env = String(process.env.TOPGG_VOTE_HTTP_WEBHOOK || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(env)) return true;
  if (["0", "false", "no", "off"].includes(env)) return false;
  return Boolean(client?.config?.topgg?.httpVoteWebhookEnabled);
}

function extractTopggVoteDiscordUserId(body?) {
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

function parseTopggV1SignatureHeader(raw?) {
  if (raw == null) return null;
  const s = Array.isArray(raw) ? raw[0] : String(raw);
  const parts = s.split(",").map((p?) => p.trim()).filter(Boolean);
  const map: Record<string, any> = {};
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

function verifyTopggV1Signature(secret?, timestampSec?, rawBodyBuffer?, signatureHex?) {
  const t = String(timestampSec);
  const bodyStr = Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer.toString("utf8") : String(rawBodyBuffer);
  const hmac = crypto.createHmac("sha256", secret);
  const digest = Buffer.from(hmac.update(`${t}.${bodyStr}`).digest("hex"), "hex");
  const sigBuf = Buffer.from(String(signatureHex).trim(), "hex");
  if (sigBuf.length !== digest.length) return false;
  return crypto.timingSafeEqual(sigBuf, digest);
}

function isTopggWebhookAuthorized(req?, topggSecret?) {
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

function mountTopggVoteWebhook(app?, client?, topggSecret?) {
  if (!shouldStartTopggVoteHttpWebhook(client)) return;
  if (!topggSecret) {
    global.logger?.error?.( "[WEBHOOK] Top.gg: webhook abilitato ma manca TOPGG_WEBHOOK_SECRET. Imposta lo stesso valore del campo Authorization nel pannello Top.gg.");
    return;
  }
  app.post("/webhooks/topgg", async (req?, res?) => {
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

export = {
  shouldStartTopggVoteHttpWebhook,
  extractTopggVoteDiscordUserId,
  isTopggWebhookAuthorized,
  mountTopggVoteWebhook,
};
