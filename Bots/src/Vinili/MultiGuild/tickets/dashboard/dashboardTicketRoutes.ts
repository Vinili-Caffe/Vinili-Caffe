/** Rotte HTTP della dashboard dei server: ticket (pannelli, team, moduli, blacklist). */
function mountDashboardTicketRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const { normalizeHeaderSecret } = ctx;
  const {
    getDashboardTickets,
    patchDashboardTickets,
    listDashboardTickets,
    listDashboardTranscripts,
    getDashboardTranscriptHtml,
  } = require("./siteDashboardTicketsApi") as typeof import("./siteDashboardTicketsApi");
  const {
    listDashboardTicketPanels,
    createDashboardTicketPanel,
    updateDashboardTicketPanel,
    deleteDashboardTicketPanel,
    createDashboardTicketMultiPanel,
    updateDashboardTicketMultiPanel,
    deleteDashboardTicketMultiPanel,
    publishDashboardTicketPanel,
    publishDashboardTicketMultiPanel,
    syncDashboardTicketPanels,
  } = require("./siteDashboardTicketPanelsApi") as typeof import("./siteDashboardTicketPanelsApi");
  const {
    listDashboardTicketTeams,
    searchDashboardTicketTeamMembers,
    createDashboardTicketTeam,
    updateDashboardTicketTeam,
    deleteDashboardTicketTeam,
  } = require("./siteDashboardTicketTeamsApi") as typeof import("./siteDashboardTicketTeamsApi");
  const {
    listDashboardTicketBlacklist,
    addDashboardTicketBlacklist,
    deleteDashboardTicketBlacklist,
  } = require("./siteDashboardTicketBlacklistApi") as typeof import("./siteDashboardTicketBlacklistApi");
  const {
    listDashboardTicketForms,
    createDashboardTicketForm,
    updateDashboardTicketForm,
    deleteDashboardTicketForm,
  } = require("./siteDashboardTicketFormsApi") as typeof import("./siteDashboardTicketFormsApi");

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardTickets(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard tickets get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await patchDashboardTickets(client, accessToken, req.params?.guildId, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard tickets patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/list", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardTickets(client, accessToken, req.params?.guildId, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard tickets list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/teams", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardTicketTeams(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket teams list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/teams/members/search", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await searchDashboardTicketTeamMembers(
        client,
        accessToken,
        req.params?.guildId,
        req.query || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket teams member search:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/teams", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await createDashboardTicketTeam(client, accessToken, req.params?.guildId, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket teams create:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets/teams/:teamId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await updateDashboardTicketTeam(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.teamId,
        req.body || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket teams patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/teams/:teamId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteDashboardTicketTeam(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.teamId,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket teams delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/blacklist", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardTicketBlacklist(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket blacklist list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/blacklist", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await addDashboardTicketBlacklist(
        client,
        accessToken,
        req.params?.guildId,
        req.body || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket blacklist add:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/blacklist/:entryId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteDashboardTicketBlacklist(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.entryId,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket blacklist delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/forms", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardTicketForms(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket forms list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/forms", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await createDashboardTicketForm(
        client,
        accessToken,
        req.params?.guildId,
        req.body || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket forms create:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets/forms/:formId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await updateDashboardTicketForm(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.formId,
        req.body || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket forms update:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/forms/:formId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteDashboardTicketForm(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.formId,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket forms delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/panels", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardTicketPanels(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket panels list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/panels", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await createDashboardTicketPanel(client, accessToken, req.params?.guildId, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket panels create:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/panels/sync", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await syncDashboardTicketPanels(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket panels sync:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets/panels/:panelId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await updateDashboardTicketPanel(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.panelId,
        req.body || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket panels update:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/panels/:panelId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteDashboardTicketPanel(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.panelId,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket panels delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/panels/:panelId/publish", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await publishDashboardTicketPanel(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.panelId,
        req.body || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket panels publish:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/multipanels", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await createDashboardTicketMultiPanel(client, accessToken, req.params?.guildId, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket multipanels create:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets/multipanels/:multiId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await updateDashboardTicketMultiPanel(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.multiId,
        req.body || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket multipanels update:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/multipanels/:multiId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteDashboardTicketMultiPanel(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.multiId,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket multipanels delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/multipanels/:multiId/publish", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await publishDashboardTicketMultiPanel(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.multiId,
        req.body || {},
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket multipanels publish:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  async function handleDashboardTranscriptsList(req?, res?) {
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
      const query = {
        ...(req.query && typeof req.query === "object" ? req.query : {}),
        ...body,
      };
      const out = await listDashboardTranscripts(client, accessToken, req.params?.guildId, query);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard tickets transcripts:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  }

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/transcripts", handleDashboardTranscriptsList);
  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/transcripts", handleDashboardTranscriptsList);

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/transcripts/:ticketId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out: any = await getDashboardTranscriptHtml(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.ticketId,
      );
      if (!out.ok) return res.status(Number(out.status) || 500).json(out);
            if (out.apiUrl || out.redirectUrl) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json({
          ok: true,
          apiUrl: out.apiUrl || null,
          redirectUrl: out.redirectUrl || null,
          ticketId: out.ticketId || null,
          ticketNumber: out.ticketNumber != null ? out.ticketNumber : null,
        });
      }
      res.setHeader("Content-Type", out.contentType || "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(out.body || "");
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard ticket transcript html:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
}

export = { mountDashboardTicketRoutes };
