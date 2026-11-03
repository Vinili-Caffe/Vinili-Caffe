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
