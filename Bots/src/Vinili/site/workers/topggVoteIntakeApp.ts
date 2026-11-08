const http = require("node:http") as typeof import("node:http");
const express = require("express");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const {
  loadDotEnv,
  resolveMongoUrl,
  installConsoleLogger,
} = require("./workerAppBootstrap") as typeof import("./workerAppBootstrap");
const { enqueuePendingTopggVote } = require("../http/discadiaVoteInboxService") as typeof import("../http/discadiaVoteInboxService");
const {
  extractTopggVoteDiscordUserId,
  isTopggWebhookAuthorized,
} = require("../http/webhookService") as typeof import("../http/webhookService");

loadDotEnv();
installConsoleLogger();

async function main() {
    const port = Number(process.env.TOPGG_VOTE_INTAKE_PORT || 3014) || 3014;
  const mongo = resolveMongoUrl();
  if (!mongo) {
    console.error("[TOPGG INTAKE] Missing MONGO_URL");
    process.exit(1);
  }

  const config = require("./workerAppBootstrap").loadVinylsConfig();
  const topggSecret = String(
    process.env.TOPGG_WEBHOOK_SECRET || config?.topgg?.webhookSecret || "",
  ).trim();
  if (!topggSecret) {
    console.error("[TOPGG INTAKE] Missing TOPGG_WEBHOOK_SECRET");
    process.exit(1);
  }

  if (mongoose.connection.readyState === 0) await mongoose.connect(mongo, {
    maxPoolSize: 2,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 8_000,
  });

  const guildId = String(config.mainGuildId || IDs.guilds?.main || "").trim();

  const app = express();
  app.set("trust proxy", true);
  app.use(
    express.json({
      limit: "512kb",
      verify: (req?, _res?, buf?) => {
        req._topggRawBody = buf;
      },
    }),
  );

  app.get("/webhooks/topgg/health", (_req?, res?) => {
    res.status(200).json({ ok: true, service: "topgg-vote-intake" });
  });

  app.post("/webhooks/topgg", async (req?, res?) => {
    try {
      if (!isTopggWebhookAuthorized(req, topggSecret)) {
        console.warn("[TOPGG INTAKE] Unauthorized");
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

      const userId = extractTopggVoteDiscordUserId(body);
      if (!userId) {
        console.warn(
          "[TOPGG INTAKE] User ID missing; keys:",
          body && typeof body === "object" ? Object.keys(body).join(", ") : "(non-object)",
        );
        return res.status(400).send("User ID missing");
      }

      const rawSnippet = Buffer.isBuffer(req._topggRawBody)
        ? req._topggRawBody.toString("utf8").replace(/\s+/g, " ").trim().slice(0, 240)
        : "";
      await enqueuePendingTopggVote(guildId, userId, {
        source: "intake",
        rawSnippet,
      });
      return res.status(200).send("Queued");
    } catch (err) {
      console.error("[TOPGG INTAKE]", err?.message || err);
      return res.status(500).send("Internal Server Error");
    }
  });

  const server = http.createServer(app);
  server.listen(port, "0.0.0.0", () => {
    if (require.main === module) console.log(`[VOTE-INTAKE] top.gg :${port}`);
  });
}

/* Avvio da solo oppure dentro un processo condiviso (backgroundWorkersApp / voteIntakeApp) che passa il client. */
if (require.main === module) {
  main().catch((err?) => {
    console.error("[TOPGG INTAKE] fatal:", err);
    process.exit(1);
  });
}

export = { startTopggIntake: main };
