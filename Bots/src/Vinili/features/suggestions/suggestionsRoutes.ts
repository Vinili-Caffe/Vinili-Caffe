/** Rotte HTTP dei suggerimenti. */
function mountSuggestionsRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const { normalizeHeaderSecret, replyJsonEtag } = ctx;
  const { getSiteSuggestions, createSiteSuggestion, updateOwnSiteSuggestion, deleteOwnSiteSuggestion, addSiteSuggestionComment, updateSiteSuggestionComment, deleteSiteSuggestionComment, setSiteSuggestionCommentVote, setSiteSuggestionVote, staffAcceptSiteSuggestion, staffRejectSiteSuggestion, staffSetSiteSuggestionDecision, staffDeleteSiteSuggestion, serveSiteSuggestionFile } = require("../../Web/siteSuggestionsApi") as typeof import("../../Web/siteSuggestionsApi");

  app.get("/webhooks/site-suggestions/files/:suggestionId/:fileName", async (req?, res?) => {
    try {
      await serveSiteSuggestionFile(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions file:", err);
      if (!res.headersSent) return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-suggestions", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getSiteSuggestions(client, { accessToken, board: req.query?.board });
      return replyJsonEtag(req, res, out, {
        cacheControl: accessToken ? "private, max-age=20" : "public, max-age=30",
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions", async (req?, res?) => {
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
      const out = await createSiteSuggestion(client, {
        accessToken,
        content: body.content,
        kind: body.kind,
        tag: body.tag != null ? body.tag : body.topic,
        topic: body.topic != null ? body.topic : body.tag,
        images: body.images,
        board: body.board,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/comments/:commentId/vote", async (req?, res?) => {
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
      const out = await setSiteSuggestionCommentVote(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        commentId: req.params?.commentId,
        direction: body.direction,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions comment vote:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-suggestions/:suggestionId/comments/:commentId", async (req?, res?) => {
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
      const out = await updateSiteSuggestionComment(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        commentId: req.params?.commentId,
        content: body.content,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions comment patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.delete("/webhooks/site-suggestions/:suggestionId/comments/:commentId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteSiteSuggestionComment(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        commentId: req.params?.commentId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions comment delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/comments", async (req?, res?) => {
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
      const out = await addSiteSuggestionComment(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        content: body.content,
        parentCommentId: body.parentCommentId,
        images: Array.isArray(body.images) ? body.images : [],
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions comment:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-suggestions/:suggestionId", async (req?, res?) => {
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
      const out = await updateOwnSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        content: body.content,
        kind: body.kind,
        tag: body.tag != null ? body.tag : body.topic,
        topic: body.topic != null ? body.topic : body.tag,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.delete("/webhooks/site-suggestions/:suggestionId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteOwnSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions author delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/vote", async (req?, res?) => {
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
      const out = await setSiteSuggestionVote(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        direction: body.direction,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions vote:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/accept", async (req?, res?) => {
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
      const out = await staffAcceptSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions accept:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/reject", async (req?, res?) => {
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
      const out = await staffRejectSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions reject:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-suggestions/:suggestionId/decision", async (req?, res?) => {
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
      const out = await staffSetSiteSuggestionDecision(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
        status: body.status,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions decision:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-suggestions/:suggestionId/delete", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await staffDeleteSiteSuggestion(client, {
        accessToken,
        suggestionId: req.params?.suggestionId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
}

export = { mountSuggestionsRoutes };
