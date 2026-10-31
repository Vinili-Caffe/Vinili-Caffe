/** Rotte HTTP dei contest. */
function mountContestRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const { normalizeHeaderSecret } = ctx;
  const {
    getContestStatus,
    listEvents: listSiteContestEvents,
    getHighlight: getSiteContestHighlight,
    submitEntry: submitSiteContestEntry,
    getSwipeFeed: getSiteContestSwipeFeed,
    castSwipe: castSiteContestSwipe,
    getLeaderboard: getSiteContestLeaderboard,
    deleteEntry: deleteSiteContestEntry,
    replaceEntry: replaceSiteContestEntry,
    serveContestFile: serveSiteContestFile,
    setPublicOpen: setSiteContestPublicOpen,
    seedDemo: seedSiteContestDemo,
    clearDemo: clearSiteContestDemo,
  } = require("../../Web/siteContestApi") as typeof import("../../Web/siteContestApi");

  /* siteContestHalloween1 — unlisted contest swipe + submit */
  app.get("/webhooks/site-contest/events", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await listSiteContestEvents(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest events:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-contest/highlight", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getSiteContestHighlight(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest highlight:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-contest/:eventKey/status", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out: any = await getContestStatus(client, { eventKey: req.params.eventKey, accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest status:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-contest/:eventKey/submit", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await submitSiteContestEntry(client, {
        eventKey: req.params.eventKey,
        accessToken,
        image: body.image || body.dataUrl,
        category: body.category,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest submit:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-contest/:eventKey/feed", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const out = await getSiteContestSwipeFeed(client, {
        eventKey: req.params.eventKey,
        accessToken,
        category: req.query?.category,
        limit: req.query?.limit,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest feed:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-contest/:eventKey/swipe", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await castSiteContestSwipe(client, {
        eventKey: req.params.eventKey,
        accessToken,
        submissionId: body.submissionId || body.id,
        action: body.action,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest swipe:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-contest/:eventKey/leaderboard", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getSiteContestLeaderboard(client, {
        eventKey: req.params.eventKey,
        accessToken,
        category: req.query?.category,
        page: req.query?.page,
        pageSize: req.query?.pageSize || req.query?.limit,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest leaderboard:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-contest/:eventKey/delete", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await deleteSiteContestEntry(client, {
        eventKey: req.params.eventKey,
        accessToken,
        category: body.category,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-contest/:eventKey/replace", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await replaceSiteContestEntry(client, {
        eventKey: req.params.eventKey,
        accessToken,
        image: body.image || body.dataUrl,
        category: body.category,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest replace:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-contest/:eventKey/public-open", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out: any = await setSiteContestPublicOpen(client, {
        eventKey: req.params.eventKey,
        accessToken,
        publicOpen: body.publicOpen !== false && body.open !== false,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest public-open:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-contest/:eventKey/seed-demo", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await seedSiteContestDemo(client, {
        eventKey: req.params.eventKey,
        accessToken,
        count: body.count,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest seed-demo:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-contest/:eventKey/clear-demo", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const out = await clearSiteContestDemo(client, {
        eventKey: req.params.eventKey,
        accessToken,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest clear-demo:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-contest/files/:eventKey/:userId/:fileName", async (req?, res?) => {
    try {
      await serveSiteContestFile(req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest file:", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    }
  });
}

export = { mountContestRoutes };
