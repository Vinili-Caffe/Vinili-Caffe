function mountConfessionaleWebhookRoutes(app?, client?) {
  const {
    handleSiteConfessionaleGet,
    handleSiteConfessionalePost,
    handleSiteConfessionaleCommentPost,
    handleSiteConfessionaleDeletePost,
    handleSiteConfessionaleResolvePost,
    handleSiteConfessionaleReopenPost,
  } = require("../siteConfessionaleApi") as typeof import("../siteConfessionaleApi");

  app.get("/webhooks/site-confessionale", (req?, res?) => handleSiteConfessionaleGet(client, req, res));
  app.post("/webhooks/site-confessionale", (req?, res?) => handleSiteConfessionalePost(client, req, res));
  app.post("/webhooks/site-confessionale/:id/comments", (req?, res?) =>
    handleSiteConfessionaleCommentPost(client, req, res),
  );
  app.post("/webhooks/site-confessionale/:id/delete", (req?, res?) =>
    handleSiteConfessionaleDeletePost(client, req, res),
  );
  app.post("/webhooks/site-confessionale/:id/resolve", (req?, res?) =>
    handleSiteConfessionaleResolvePost(client, req, res),
  );
  app.post("/webhooks/site-confessionale/:id/reopen", (req?, res?) =>
    handleSiteConfessionaleReopenPost(client, req, res),
  );
}

export = { mountConfessionaleWebhookRoutes };
