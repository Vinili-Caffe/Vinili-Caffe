function mountReviewsWebhookRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const normalizeHeaderSecret = ctx.normalizeHeaderSecret;
  const replyJsonEtag = ctx.replyJsonEtag;
  const { getSiteReviews, submitSiteReview, deleteSiteReview, toggleSiteReviewLike, upsertServerReviewReply } = require("../siteReviewsApi") as typeof import("../siteReviewsApi");

  app.get("/webhooks/site-reviews", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const kind = String((req.query && req.query.kind) || "").trim();
      const out = await getSiteReviews(client, { accessToken, kind });
      return replyJsonEtag(req, res, out, {
        cacheControl: accessToken ? "private, max-age=30" : "public, max-age=45",
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-reviews", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await submitSiteReview(client, {
        accessToken,
        kind: body.kind,
        rating: body.rating,
        content: body.content,
        staffUserId: body.staffUserId,
        contentLang: body.contentLang || body.lang,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.delete("/webhooks/site-reviews/:reviewId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteSiteReview(client, {
        accessToken,
        reviewId: req.params?.reviewId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-reviews/:reviewId/like", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await toggleSiteReviewLike(client, {
        accessToken,
        reviewId: req.params?.reviewId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews like:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-reviews/:reviewId/server-reply", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await upsertServerReviewReply(client, {
        accessToken,
        reviewId: req.params?.reviewId,
        content: body.content,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-reviews server-reply:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
}

export = { mountReviewsWebhookRoutes };
