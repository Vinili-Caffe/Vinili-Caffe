function mountPublicMiscWebhookRoutes(app?, client?) {
  const { buildCommunityRulesSitePayload } = require("../communityRulesPayload") as typeof import("../communityRulesPayload");

  // Hogwarts event retired — API always 410 (finale prizes live elsewhere).
  app.use("/webhooks/site-hogwarts-sorting", (_req?, res?) => {
    return res.status(410).json({
      ok: false,
      error: "event_closed",
      message: "Evento Hogwarts concluso.",
    });
  });

  app.get("/webhooks/site-rules", (req?, res?) => {
    try {
      res.setHeader("Cache-Control", "public, max-age=120");
      return res.json(buildCommunityRulesSitePayload());
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rules:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });

  /* Icona guild main live (OG / component-embed thumb) — niente gif fissa in repo */
  {
    const { handleSiteGuildIconGet } = require("../siteGuildIconApi") as typeof import("../siteGuildIconApi");
    app.get("/webhooks/site-guild-icon", (req?, res?) => handleSiteGuildIconGet(client, req, res));
    app.head("/webhooks/site-guild-icon", (req?, res?) => handleSiteGuildIconGet(client, req, res));
  }

  /* Avatar del bot com'è adesso su Discord (logo della dashboard): redirect al CDN, cambia da solo quando cambi avatar */
  {
    const sendBotAvatar = (req?, res?) => {
      try {
        const size = [64, 128, 256].includes(Number(req?.query?.size)) ? Number(req.query.size) : 128;
        const url = client?.user?.displayAvatarURL?.({ size, extension: "png", forceStatic: false });
        if (!url) return res.status(503).json({ ok: false, error: "bot_not_ready", message: "Bot non pronto." });
        res.setHeader("Cache-Control", "public, max-age=600");
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.redirect(302, String(url));
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-bot-avatar:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    };
    app.get("/webhooks/site-bot-avatar", sendBotAvatar);
    app.head("/webhooks/site-bot-avatar", sendBotAvatar);
  }

  /* siteUserPresence1: online/idle sul sito (heartbeat + query) */
  {
    const {
      handleSiteUserPresenceHeartbeat,
      handleSiteUserPresenceQuery,
    } = require("../siteUserPresenceApi") as typeof import("../siteUserPresenceApi");
    app.post("/webhooks/site-user-presence", (req?, res?) => handleSiteUserPresenceHeartbeat(req, res));
    app.post("/webhooks/site-user-presence/query", (req?, res?) => handleSiteUserPresenceQuery(req, res));
    app.get("/webhooks/site-user-presence/query", (req?, res?) => handleSiteUserPresenceQuery(req, res));
  }
}

export = { mountPublicMiscWebhookRoutes };
