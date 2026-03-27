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

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
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
  if (!shouldStartDiscadiaVoteHttpWebhook(client)) return;

  const express = tryRequireExpress();
  if (!express) {
    global.logger?.error?.(
      "[WEBHOOK] Modulo `express` non trovato. Installa le dipendenze del bot (es. `npm install` in Vinyls). HTTP Discadia disabilitato.",
    );
    return;
  }

  client._discadiaVoteHttpServerStarted = true;

  const config = client.config?.discadia || {};
  const port = config.webhookPort || 3000;
  const secret = String(process.env.DISCADIA_WEBHOOK_SECRET || config.webhookSecret || "").trim();

  const app = express();
  app.use(express.json());

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
    global.logger?.info?.("[WEBHOOK] Discadia vote HTTP listening on port " + port + " (POST /webhooks/discadia)");
  });
}

module.exports = { startWebhookServer, shouldStartDiscadiaVoteHttpWebhook };