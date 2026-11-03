/** Webhook HTTP: gate di avvio e server Express del bot. */
const {
  parseCorsOriginAllowlist,
  expandCorsOriginAllowlist,
  createSiteCandidatureCorsMiddleware,
} = require("./webhookCors") as typeof import("./webhookCors");
const {
  shouldStartDiscadiaVoteHttpWebhook,
  normalizeWebhookPath,
  isDiscadiaWebhookRequest,
  handleDiscadiaVoteWebhook,
  mountDiscadiaVoteWebhook,
} = require("./discadiaVoteWebhook") as typeof import("./discadiaVoteWebhook");
const {
  shouldStartTopggVoteHttpWebhook,
  mountTopggVoteWebhook,
} = require("./topggVoteWebhook") as typeof import("./topggVoteWebhook");

function tryRequireExpress() {
  try {
    return require("express");
  } catch {
    return null;
  }
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

function shouldStartBotHttpServer(client?) {
  if (isSiteApiExternal()) return true;
  return shouldStartDiscadiaVoteHttpWebhook(client) || shouldStartTopggVoteHttpWebhook(client) || isCandidatureWebsiteApiEnabled() || shouldStartPublicSiteReadonlyHttp();
}

async function startWebhookServer(client?) {
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
      verify: (req?, res?, buf?) => {
        const pathOnly = normalizeWebhookPath(req.originalUrl || req.url || "");
        if (pathOnly === "/webhooks/topgg") {
          req._topggRawBody = buf;
        }
        if (pathOnly === "/webhooks/discadia") {
          req._discadiaRawBody = buf;
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));

  try {
    const { mountTicketTranscriptRoutes } = require("../../MultiGuild/tickets/transcript/ticketTranscriptHttp") as typeof import("../../MultiGuild/tickets/transcript/ticketTranscriptHttp");
    mountTicketTranscriptRoutes(app, client);
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] ticket-transcript routes:", err?.message || err);
  }

  const candidatureCorsAllowlist = expandCorsOriginAllowlist(
    parseCorsOriginAllowlist(
      String(process.env.WEBSITE_CANDIDATURE_CORS_ORIGIN || process.env.WEBSITE_PUBLIC_ORIGIN || "").trim(),
    ),
  );

  const siteCandidatureCorsMiddleware = createSiteCandidatureCorsMiddleware(candidatureCorsAllowlist);

  /* Site HTTP: solo processo site-api (Vinili/site/http/durableSiteApiApp). Niente dual-mount sui bots. */

  mountTopggVoteWebhook(app, client, topggSecret);
  mountDiscadiaVoteWebhook(app, client, secret);

  app.get("/webhooks/status", (req?, res?) => {
    res.status(200).json({ status: "online", bot: client.user?.tag || "Offline" });
  });

  app.get("/webhooks/coffee/health", async (req?, res?) => {
    try {
      const { probeCoffeeHealth } = require("./stackHealth") as typeof import("./stackHealth");
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

  app.get("/webhooks/health", (req?, res?) => {
    const { sendStackHealth } = require("./stackHealth") as typeof import("./stackHealth");
    return sendStackHealth(client, req, res, { service: "bots", includeLavalink: true, includeCoffee: true });
  });

  app.use((err?: any, req?, res?, next?) => {
    const isJsonBodyError =
      err instanceof SyntaxError && Number((err as any).status) === 400 && "body" in err;
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

  const http = require("node:http") as typeof import("node:http");
  const server = http.createServer(app);
  try {
    const { attachSiteSuggestionsWsServer } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
    attachSiteSuggestionsWsServer(server);
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] WebSocket suggerimenti (init):", err?.message || err);
  }

  client._botHttpWebhookServer = server;

  server.once("error", (err?: any) => {
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

export = {
  startWebhookServer,
  shouldStartBotHttpServer,
  isCandidatureWebsiteApiEnabled,
};
