function mountEventoWebhookRoutes(app?, client?) {
  /* starWarsEvento: HS-only finché publicEnabled=false (archivio: non far cadere site-api se il pack è rotto) */
  try {
    const sw = require("../../../../../archivio/starwars/src/Vinili/Web/siteStarWarsEventoApi") as any;
    app.get("/webhooks/site-evento", (req?, res?) => sw.handleSiteEventoStatusGet(client, req, res));
    app.get("/webhooks/site-evento/avvento", (req?, res?) => sw.handleSiteEventoAvventoGet(client, req, res));
    app.post("/webhooks/site-evento/avvento/claim", (req?, res?) => sw.handleSiteEventoAvventoClaimPost(client, req, res));
    app.get("/webhooks/site-evento/calendar", (req?, res?) => sw.handleSiteEventoCalendarGet(client, req, res));
    app.get("/webhooks/site-evento/smistamento", (req?, res?) => sw.handleSiteEventoSmistamentoGet(client, req, res));
    app.post("/webhooks/site-evento/smistamento", (req?, res?) => sw.handleSiteEventoSmistamentoPost(client, req, res));
    app.get("/webhooks/site-evento/shop", (req?, res?) => sw.handleSiteEventoShopGet(client, req, res));
    app.post("/webhooks/site-evento/shop/buy", (req?, res?) => sw.handleSiteEventoShopBuyPost(client, req, res));
    app.post("/webhooks/site-evento/shop/attack", (req?, res?) => sw.handleSiteEventoShopAttackPost(client, req, res));
    app.get("/webhooks/site-evento/minigames", (req?, res?) => sw.handleSiteEventoMinigamesGet(client, req, res));
    app.post("/webhooks/site-evento/crate/open", (req?, res?) => sw.handleSiteEventoCrateOpenPost(client, req, res));
    app.post("/webhooks/site-evento/items/use", (req?, res?) => sw.handleSiteEventoItemUsePost(client, req, res));
    app.get("/webhooks/site-evento/accademia", (req?, res?) => sw.handleSiteEventoAccademiaGet(client, req, res));
    app.post("/webhooks/site-evento/accademia", (req?, res?) => sw.handleSiteEventoAccademiaPost(client, req, res));
    app.get("/webhooks/site-evento/gara", (req?, res?) => sw.handleSiteEventoGaraGet(client, req, res));
    app.post("/webhooks/site-evento/gara", (req?, res?) => sw.handleSiteEventoGaraPost(client, req, res));
    app.get("/webhooks/site-evento/miniera", (req?, res?) => sw.handleSiteEventoMinieraGet(client, req, res));
    app.post("/webhooks/site-evento/miniera", (req?, res?) => sw.handleSiteEventoMinieraPost(client, req, res));
    app.get("/webhooks/site-evento/puzzle", (req?, res?) => sw.handleSiteEventoPuzzleGet(client, req, res));
    app.post("/webhooks/site-evento/puzzle", (req?, res?) => sw.handleSiteEventoPuzzlePost(client, req, res));
    app.get("/webhooks/site-evento/pei", (req?, res?) => sw.handleSiteEventoPeiGet(client, req, res));
    app.get("/webhooks/site-evento/traditore", (req?, res?) => sw.handleSiteEventoTraditoreGet(client, req, res));
    app.post("/webhooks/site-evento/traditore", (req?, res?) => sw.handleSiteEventoTraditorePost(client, req, res));
    app.post("/webhooks/site-evento/phase-end", (req?, res?) => sw.handleSiteEventoPhaseEndPost(client, req, res));
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] starWars site-evento mount skipped:", err?.message || err);
  }
}

export = { mountEventoWebhookRoutes };
