function mountPropositiWebhookRoutes(app?, client?) {
  const {
    handleSitePropositiGet,
    handleSitePropositiPost,
    handleSitePropositiCommentPost,
    handleSitePropositiCommentPatch,
    handleSitePropositiCommentDelete,
    handleSitePropositiCommentLikePost,
    handleSitePropositiDeletePost,
    handleSitePropositiResolvePost,
    handleSitePropositiReopenPost,
    handleSitePropositiLikePost,
  } = require("../sitePropositiApi") as typeof import("../sitePropositiApi");

  app.get("/webhooks/site-propositi", (req?, res?) => handleSitePropositiGet(client, req, res));
  app.post("/webhooks/site-propositi", (req?, res?) => handleSitePropositiPost(client, req, res));
  app.post("/webhooks/site-propositi/:id/comments", (req?, res?) =>
    handleSitePropositiCommentPost(client, req, res),
  );
  app.patch("/webhooks/site-propositi/:id/comments/:commentId", (req?, res?) =>
    handleSitePropositiCommentPatch(client, req, res),
  );
  app.delete("/webhooks/site-propositi/:id/comments/:commentId", (req?, res?) =>
    handleSitePropositiCommentDelete(client, req, res),
  );
  app.post("/webhooks/site-propositi/:id/comments/:commentId/like", (req?, res?) =>
    handleSitePropositiCommentLikePost(client, req, res),
  );
  app.post("/webhooks/site-propositi/:id/like", (req?, res?) =>
    handleSitePropositiLikePost(client, req, res),
  );
  app.post("/webhooks/site-propositi/:id/delete", (req?, res?) =>
    handleSitePropositiDeletePost(client, req, res),
  );
  app.post("/webhooks/site-propositi/:id/resolve", (req?, res?) =>
    handleSitePropositiResolvePost(client, req, res),
  );
  app.post("/webhooks/site-propositi/:id/reopen", (req?, res?) =>
    handleSitePropositiReopenPost(client, req, res),
  );
}

export = { mountPropositiWebhookRoutes };