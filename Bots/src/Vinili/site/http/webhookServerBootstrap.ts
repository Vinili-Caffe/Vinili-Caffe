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

function isSiteApiProcess() {
  return ["1", "true", "yes", "on"].includes(String(process.env.SITE_API_PROCESS || "").trim().toLowerCase());
}

function isBotHttpOnGatewayForced() {
  return ["1", "true", "yes", "on"].includes(String(process.env.BOT_HTTP_ON_GATEWAY || "").trim().toLowerCase());
}

function shouldStartBotHttpServer(client?) {
  /* vote-intake / site-api own HTTP; gateway skips Express unless explicitly forced. */
  if (isSiteApiProcess()) return false;
  if (isSiteApiExternal() && !isBotHttpOnGatewayForced()) return false;
  if (isBotHttpOnGatewayForced()) {
    return (
      shouldStartDiscadiaVoteHttpWebhook(client) ||
      shouldStartTopggVoteHttpWebhook(client) ||
      isCandidatureWebsiteApiEnabled() ||
      shouldStartPublicSiteReadonlyHttp()
    );
  }
  return shouldStartDiscadiaVoteHttpWebhook(client) || shouldStartTopggVoteHttpWebhook(client) || isCandidatureWebsiteApiEnabled() || shouldStartPublicSiteReadonlyHttp();
}

/**
 * Health-only listener for host-watchdog when site-api owns real HTTP
 * (`SITE_API_EXTERNAL=1` → no Express/votes/WS on the gateway).
 */
function startGatewayHealthOnlyHttp(client?) {
  if (client?._botHttpWebhookServer?.listening) return;
  if (client?._gatewayHealthOnlyServer?.listening) return;
  if (shouldStartBotHttpServer(client)) return;
  if (isSiteApiProcess()) return;
  if (!isSiteApiExternal()) return;

  const http = require("node:http") as typeof import("node:http");
  const mongoose = require("mongoose") as typeof import("mongoose");
  const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
  const port = Number(client?.config?.discadia?.webhookPort || process.env.BOT_GATEWAY_HEALTH_PORT || 3000) || 3000;

  async function measureDiscordRestPingMs() {
    if (!client?.rest?.get) return null;
    const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");
    const t0 = Date.now();
    try {
      await client.rest.get(Routes.user("@me"));
      return Math.max(0, Date.now() - t0);
    } catch {
      return null;
    }
  }

  async function measureMongoPingMs() {
    if (!isMongoReady()) return null;
    const t0 = Date.now();
    try {
      await mongoose.connection.db.admin().ping();
      return Math.max(0, Date.now() - t0);
    } catch {
      return null;
    }
  }

  function resolveShardLabel() {
    const shardIds = Array.isArray(client?.shard?.ids)
      ? client.shard.ids.map((id?) => Number(id)).filter((id?) => Number.isInteger(id) && id >= 0)
      : [];
    if (shardIds.length) return String(shardIds[0]);
    return "0";
  }

  const server = http.createServer((req?, res?) => {
    const pathOnly = normalizeWebhookPath(req?.url || "/");
    if (req?.method === "GET" && (pathOnly === "/webhooks/health" || pathOnly === "/webhooks/status")) {
      void (async () => {
        try {
          const ok = Boolean(client?.user?.id);
          const rawGw = Number(client?.ws?.ping);
          const gatewayPingMs = Number.isFinite(rawGw) && rawGw >= 0 ? Math.round(rawGw) : null;
          const [restPingMs, mongoPingMs] = await Promise.all([measureDiscordRestPingMs(), measureMongoPingMs()]);
          const body = JSON.stringify({
            ok,
            status: ok ? "online" : "starting",
            service: "bots-vinyls-gateway",
            bot: client?.user?.tag || null,
            gatewayPingMs,
            restPingMs,
            mongoPingMs,
            shard: resolveShardLabel(),
            uptimeSec: Math.floor(process.uptime()),
            memMb: Math.round((process.memoryUsage().rss || 0) / (1024 * 1024)),
            ts: new Date().toISOString(),
          });
          res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
          res.end(body);
        } catch (err) {
          global.logger?.error?.("[WEBHOOK] gateway health-only:", err?.message || err);
          res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, status: "error", service: "bots-vinyls-gateway" }));
        }
      })();
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  client._gatewayHealthOnlyServer = server;
  server.once("error", (err?: any) => {
    if (client._gatewayHealthOnlyServer === server) client._gatewayHealthOnlyServer = null;
    if (err?.code === "EADDRINUSE") {
      global.logger?.error?.(
        `[WEBHOOK] health-only: porta ${port} già in uso (gateway senza Express).`,
      );
      return;
    }
    global.logger?.error?.("[WEBHOOK] health-only listen failed:", err);
  });
  server.listen(port, "0.0.0.0", () => {
    if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
      global.logger?.info?.(`[WEBHOOK] gateway health-only on 0.0.0.0:${port} (SITE_API_EXTERNAL)`);
    }
  });
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
  /* anteprima "visualizza come ruolo" (header X-VC-View-As): contesto per tutta la richiesta */
  {
    const { mountViewAsContext } = require("../../../shared/runtime/viewAsContext") as typeof import("../../../shared/runtime/viewAsContext");
    mountViewAsContext(app);
  }

  try {
    const { mountTicketTranscriptRoutes } = require("../../../MultiGuild/tickets/transcript/ticketTranscriptHttp") as typeof import("../../../MultiGuild/tickets/transcript/ticketTranscriptHttp");
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
  startGatewayHealthOnlyHttp,
  shouldStartBotHttpServer,
  isCandidatureWebsiteApiEnabled,
};
