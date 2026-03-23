const express = require("express");
const IDs = require("../../Utils/Config/ids");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers");

async function startWebhookServer(client) {
  const config = client.config?.discadia || {};
  const port = config.webhookPort || 3000;
  const secret = config.webhookSecret || "";

  const app = express();
  app.use(express.json());

  // Webhook Discadia
  app.post("/webhooks/discadia", async (req, res) => {
    try {
      // Verifica del Secret (opzionale ma consigliato)
      if (secret) {
        const receivedSecret = req.headers["authorization"] || req.headers["x-discadia-secret"];
        if (receivedSecret !== secret) {
          global.logger?.warn?.("[WEBHOOK] Discadia: Unauthorized request (secret mismatch)");
          return res.status(401).send("Unauthorized");
        }
      }

      const { user_id } = req.body;
      if (!user_id) {
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

      // Esegui la logica del voto
      const handled = await processDiscadiaVote(guild, user, client);
      if (handled) {
        global.logger?.info?.("[WEBHOOK] Discadia: Processed vote for " + user.tag + " (" + user_id + ")");
        return res.status(200).send("Vote Processed");
      } else {
        return res.status(500).send("Vote processing failed");
      }
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] Discadia: Error handling webhook", err);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/webhooks/status", (req, res) => {
    res.status(200).json({ status: "online", bot: client.user?.tag || "Offline" });
  });

  app.listen(port, () => {
    global.logger?.info?.("[WEBHOOK] Server listening on port " + port);
  });
}

module.exports = { startWebhookServer };
