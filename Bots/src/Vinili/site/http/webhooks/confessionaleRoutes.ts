function mountConfessionaleWebhookRoutes(app?, client?) {
  const {
    handleSiteConfessionaleGet,
    handleSiteConfessionalePost,
    handleSiteConfessionaleCommentPost,
    handleSiteConfessionaleCommentPatch,
    handleSiteConfessionaleCommentDelete,
    handleSiteConfessionaleCommentLikePost,
    handleSiteConfessionaleDeletePost,
    handleSiteConfessionaleResolvePost,
    handleSiteConfessionaleReopenPost,
    handleSiteConfessionaleLikePost,
  } = require("../siteConfessionaleApi") as typeof import("../siteConfessionaleApi");

  app.get("/webhooks/site-confessionale", (req?, res?) => handleSiteConfessionaleGet(client, req, res));
  app.post("/webhooks/site-confessionale", (req?, res?) => handleSiteConfessionalePost(client, req, res));
  app.post("/webhooks/site-confessionale/:id/comments", (req?, res?) =>
    handleSiteConfessionaleCommentPost(client, req, res),
  );
  app.patch("/webhooks/site-confessionale/:id/comments/:commentId", (req?, res?) =>
    handleSiteConfessionaleCommentPatch(client, req, res),
  );
  app.delete("/webhooks/site-confessionale/:id/comments/:commentId", (req?, res?) =>
    handleSiteConfessionaleCommentDelete(client, req, res),
  );
  app.post("/webhooks/site-confessionale/:id/comments/:commentId/like", (req?, res?) =>
    handleSiteConfessionaleCommentLikePost(client, req, res),
  );
  app.post("/webhooks/site-confessionale/:id/like", (req?, res?) =>
    handleSiteConfessionaleLikePost(client, req, res),
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
