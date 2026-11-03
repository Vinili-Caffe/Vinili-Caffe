function mountDiscussionImagesWebhookRoutes(app?) {
  app.get("/webhooks/site-discussion-images/:scope/:docId/:fileName", (req?, res?) => {
    try {
      require("../siteDiscussionImages").serveDiscussionImage(req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-discussion image:", err);
      if (!res.headersSent) res.status(500).end();
    }
  });
}

export = { mountDiscussionImagesWebhookRoutes };
