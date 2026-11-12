/** Rotte HTTP della dashboard dei server (impostazioni, comandi, partnership, classifica, crediti, account, dev). */
function mountDashboardRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const { normalizeHeaderSecret } = ctx;
  const {
    listDashboardGuilds,
    getDashboardGuildOverview,
    getDashboardAccess,
    verifyDashboardGuildAccess,
  } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
  const {
    getDashboardPartnership,
    patchDashboardPartnership,
    leaveDashboardPartnership,
    getDashboardPartnershipMigration,
    startDashboardPartnershipMigration,
    undoDashboardPartnershipMigration,
    getDashboardPartnershipBlacklist,
    addDashboardPartnershipBlacklist,
    removeDashboardPartnershipBlacklist,
    getDashboardPartnershipManagers,
    adjustDashboardPartnershipManagerPoints,
    getDashboardPartnershipHistory,
  } = require("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi");
  const { getDashboardPartnershipLeaderboard } = require("./siteDashboardLeaderboardApi") as typeof import("./siteDashboardLeaderboardApi");
  const {
    getDashboardGuildSettings,
    patchDashboardGuildSettings,
    previewDashboardQuoteStyle,
  } = require("./siteDashboardGuildSettingsApi") as typeof import("./siteDashboardGuildSettingsApi");
  const {
    exportDashboardGuildConfig,
    importDashboardGuildConfig,
  } = require("./siteDashboardGuildConfigApi") as typeof import("./siteDashboardGuildConfigApi");
  const {
    getDashboardGuildCommands,
    patchDashboardGuildCommands,
  } = require("./siteDashboardGuildCommandsApi") as typeof import("./siteDashboardGuildCommandsApi");
  const {
    getDashboardModeration,
    patchDashboardModeration,
    getDashboardModerationCases,
  } = require("./siteDashboardModerationApi") as typeof import("./siteDashboardModerationApi");
  const {
    listDashboardStaffNotifications,
    markDashboardStaffNotificationsRead,
  } = require("./siteDashboardStaffNotificationsApi") as typeof import("./siteDashboardStaffNotificationsApi");
  const {
    listDashboardBotban,
    addDashboardBotban,
    removeDashboardBotban,
  } = require("./siteDashboardBotbanApi") as typeof import("./siteDashboardBotbanApi");
  const {
    getDashboardBotDevOverview,
    listDashboardBotDevGuilds,
    listDashboardBotDevEvents,
    postDashboardBotDevLeaveGuild,
    postDashboardBotDevGuildBotban,
    postDashboardBotDevOwnerBotban,
    postDashboardBotDevResetGuild,
    postDashboardBotDevRevokePremium,
    getDashboardBotDevCredits,
    postDashboardBotDevCredits,
    getDashboardBotDevUser,
  } = require("./siteDashboardBotDevApi") as typeof import("./siteDashboardBotDevApi");
  const {
    getDashboardTenantProfile,
    patchDashboardTenantProfile,
  } = require("./siteDashboardTenantProfileApi") as typeof import("./siteDashboardTenantProfileApi");
  const { getDashboardAccountSummary } = require("./siteDashboardAccountApi") as typeof import("./siteDashboardAccountApi");
  const { exportSelfGdprData, eraseSelfGdprData } = require("./siteDashboardGdprApi") as typeof import("./siteDashboardGdprApi");
  const { getPremiumCredits, getPremiumCreditsHistory, spendCreditsForTenantPremium } = require("../../../Vinili/Community/services/premiumCreditsService") as typeof import("../../../Vinili/Community/services/premiumCreditsService");
  const { fetchDiscordUser } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
  app.get("/webhooks/site-dashboard/access", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardAccess(client, accessToken);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard access:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/notifications", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardStaffNotifications(client, accessToken);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard notifications:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/notifications/read", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await markDashboardStaffNotificationsRead(client, accessToken);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard notifications read:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/botban", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardBotban(client, accessToken, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard botban list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/botban", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await addDashboardBotban(client, accessToken, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard botban add:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.delete("/webhooks/site-dashboard/botban/:kind/:id", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await removeDashboardBotban(
        client,
        accessToken,
        req.params?.kind,
        req.params?.id,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard botban remove:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  {
    const C = () => require("./dashboardCommunityApi") as typeof import("./dashboardCommunityApi");
    const base = "/webhooks/site-dashboard/guilds/:guildId/community";
    const wrap = (label: string, fn: (token: string, req?) => Promise<any>) => async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out: any = await fn(accessToken, req);
        return res.status(Number(out?.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.(`[WEBHOOK] site-dashboard community ${label}:`, err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    };
    const gid = (req?) => req.params?.guildId;
    app.get(base, wrap("get", (t, req) => C().getDashboardCommunity(client, t, gid(req))));
    app.put(`${base}/messages`, wrap("msg put", (t, req) => C().putMessage(client, t, gid(req), req.body)));
    app.delete(`${base}/messages/:id`, wrap("msg del", (t, req) => C().deleteMessage(client, t, gid(req), req.params?.id, String(req.query?.discord || "") === "1")));
    app.post(`${base}/messages/:id/send`, wrap("msg send", (t, req) => C().sendMessageNow(client, t, gid(req), req.params?.id, req.body)));
    app.post(`${base}/messages/:id/schedule`, wrap("msg schedule", (t, req) => C().scheduleMessage(client, t, gid(req), req.params?.id, req.body)));
    app.put(`${base}/commands`, wrap("cmd put", (t, req) => C().putCommand(client, t, gid(req), req.body)));
    app.delete(`${base}/commands/:id`, wrap("cmd del", (t, req) => C().deleteCommand(client, t, gid(req), req.params?.id)));
    app.put(`${base}/role-panels`, wrap("roles put", (t, req) => C().putRolePanel(client, t, gid(req), req.body)));
    app.delete(`${base}/role-panels/:id`, wrap("roles del", (t, req) => C().deleteRolePanel(client, t, gid(req), req.params?.id)));
    app.post(`${base}/role-panels/:id/publish`, wrap("roles publish", (t, req) => C().publishRolePanel(client, t, gid(req), req.params?.id)));
    app.patch(`${base}/welcome`, wrap("welcome patch", (t, req) => C().patchWelcome(client, t, gid(req), req.body)));
    app.post(`${base}/welcome/test`, wrap("welcome test", (t, req) => C().testWelcome(client, t, gid(req), req.body)));
    const X = () => require("./dashboardCommunityExtraApi") as typeof import("./dashboardCommunityExtraApi");
    app.put(`${base}/auto-responders`, wrap("ar put", (t, req) => X().putAutoResponder(client, t, gid(req), req.body)));
    app.delete(`${base}/auto-responders/:id`, wrap("ar del", (t, req) => X().deleteAutoResponder(client, t, gid(req), req.params?.id)));
    app.get(`${base}/modules-status`, wrap("modules status", (t, req) => X().modulesStatus(client, t, gid(req))));
    app.get(`${base}/modules`, wrap("modules", (t, req) => X().listModuleSwitches(client, t, gid(req))));
    app.put(`${base}/modules`, wrap("modules put", (t, req) => X().setModuleSwitch(client, t, gid(req), req.body)));
    app.get(`${base}/announcements`, wrap("announcements", (t, req) => X().getAnnouncements(client, t, gid(req))));
    app.patch(`${base}/announcements`, wrap("announcements patch", (t, req) => X().patchAnnouncements(client, t, gid(req), req.body)));
    app.get(`${base}/bump-votes`, wrap("bump votes", (t, req) => X().getBumpVotes(client, t, gid(req))));
    app.patch(`${base}/bump-votes`, wrap("bump votes patch", (t, req) => X().patchBumpVotes(client, t, gid(req), req.body)));
    app.post(`${base}/bump-votes/token`, wrap("bump votes token", (t, req) => X().regenBumpVotesToken(client, t, gid(req))));
    app.get(`${base}/bump-votes/leaderboard`, wrap("bump votes board", (t, req) => X().bumpVotesLeaderboard(client, t, gid(req))));
    app.post(`${base}/bump-votes/leaderboard/reset`, wrap("bump votes reset", (t, req) => X().resetBumpVotesLeaderboard(client, t, gid(req), req.body)));
    /* webhook dei voti per server (URL con token, da incollare su Top.gg / Discadia) */
    app.post("/webhooks/guild-votes/:guildId/:service/:token", async (req?, res?) => {
      try {
        const { handleVoteWebhook } = require("../../services/bumpVotesRuntime") as typeof import("../../services/bumpVotesRuntime");
        const out = await handleVoteWebhook(client, req.params?.guildId, req.params?.service, req.params?.token, req.body);
        return res.status(out.status).send(out.text);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] guild votes:", err);
        return res.status(500).send("Internal Server Error");
      }
    });
    app.get(`${base}/main-automations`, wrap("main automations", (t, req) => X().listMainAutomations(client, t, gid(req))));
    app.put(`${base}/main-automations`, wrap("main automations put", (t, req) => X().setMainAutomation(client, t, gid(req), req.body)));
    app.get(`${base}/chat-reminders`, wrap("chat reminders", (t, req) => X().listChatReminders(client, t, gid(req))));
    app.put(`${base}/chat-reminders`, wrap("chat reminders put", (t, req) => X().putChatReminders(client, t, gid(req), req.body)));
    app.get(`${base}/counters/values`, wrap("counter values", (t, req) => X().counterValues(client, t, gid(req))));
    app.post(`${base}/counters`, wrap("counter new", (t, req) => X().createCounter(client, t, gid(req), req.body)));
    app.patch(`${base}/counters/:id`, wrap("counter patch", (t, req) => X().patchCounter(client, t, gid(req), req.params?.id, req.body)));
    app.delete(`${base}/counters/:id`, wrap("counter del", (t, req) => X().deleteCounter(client, t, gid(req), req.params?.id)));
    app.patch(`${base}/server-logs`, wrap("logs patch", (t, req) => X().patchServerLogs(client, t, gid(req), req.body)));
    app.get(`${base}/giveaways`, wrap("gw list", (t, req) => X().listGiveaways(client, t, gid(req))));
    app.post(`${base}/giveaways`, wrap("gw new", (t, req) => X().createGiveaway(client, t, gid(req), req.body)));
    app.patch(`${base}/giveaways/:messageId`, wrap("gw edit", (t, req) => X().editGiveaway(client, t, gid(req), req.params?.messageId, req.body)));
    app.post(`${base}/giveaways/:messageId/end`, wrap("gw end", (t, req) => X().giveawayAction(client, t, gid(req), req.params?.messageId, "end")));
    app.post(`${base}/giveaways/:messageId/reroll`, wrap("gw reroll", (t, req) => X().giveawayAction(client, t, gid(req), req.params?.messageId, "reroll")));
    app.delete(`${base}/giveaways/:messageId`, wrap("gw del", (t, req) => X().giveawayAction(client, t, gid(req), req.params?.messageId, "delete")));
    app.get(`${base}/polls`, wrap("poll list", (t, req) => X().listPolls(client, t, gid(req))));
    app.post(`${base}/polls`, wrap("poll new", (t, req) => X().createPoll(client, t, gid(req), req.body)));
    app.post(`${base}/polls/:id/end`, wrap("poll end", (t, req) => X().endPoll(client, t, gid(req), req.params?.id)));
    app.delete(`${base}/polls/:id`, wrap("poll del", (t, req) => X().deletePoll(client, t, gid(req), req.params?.id, String(req.query?.discord || "") === "1")));
  }

  app.get("/webhooks/site-dashboard/guilds/:guildId/health", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
      }
      const { getDashboardHealth } = require("./dashboardHealthApi") as typeof import("./dashboardHealthApi");
      const out: any = await getDashboardHealth(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard health:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/guilds/:guildId/stats", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
      }
      const { getDashboardStats } = require("./dashboardStatsApi") as typeof import("./dashboardStatsApi");
      const out: any = await getDashboardStats(client, accessToken, req.params?.guildId, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard stats:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/guilds/:guildId/audit", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
      }
      const { getDashboardAudit } = require("./dashboardAuditLog") as typeof import("./dashboardAuditLog");
      const out: any = await getDashboardAudit(client, accessToken, req.params?.guildId, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard audit:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/dev/user", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
      }
      const out = await getDashboardBotDevUser(client, accessToken, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev user:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/dev/overview", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardBotDevOverview(client, accessToken);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev overview:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/dev/guilds", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardBotDevGuilds(client, accessToken, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev guilds:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/dev/events", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardBotDevEvents(client, accessToken, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev events:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/dev/leave", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await postDashboardBotDevLeaveGuild(client, accessToken, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev leave:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/dev/guild-botban", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await postDashboardBotDevGuildBotban(client, accessToken, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev guild-botban:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/dev/owner-botban", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await postDashboardBotDevOwnerBotban(client, accessToken, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev owner-botban:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/dev/reset-guild", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await postDashboardBotDevResetGuild(client, accessToken, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev reset-guild:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/dev/revoke-premium", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await postDashboardBotDevRevokePremium(client, accessToken, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev revoke-premium:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/dev/credits", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardBotDevCredits(client, accessToken, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev credits get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/dev/credits", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await postDashboardBotDevCredits(client, accessToken, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard dev credits post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/profile", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardTenantProfile(client, accessToken);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard profile:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-dashboard/profile", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await patchDashboardTenantProfile(client, accessToken, req.body || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard profile patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/account", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardAccountSummary(client, accessToken);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard account:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/account/gdpr/export", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await exportSelfGdprData(client, accessToken);
      if (!out.ok) {
        if (out.retryAfterMs) res.setHeader("Retry-After", String(Math.ceil(out.retryAfterMs / 1000)));
        return res.status(Number(out.status) || 500).json(out);
      }
      if (out.tooLarge || !out.jsonText) {
        return res.status(200).json({
          ok: true,
          tooLarge: true,
          filename: out.filename,
          byteSize: out.byteSize,
          summary: out.summary,
          message:
            "Export troppo grande per il download diretto. Contatta il supporto per un export manuale.",
        });
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${String(out.filename || "gdpr-export.json").replace(/"/g, "")}"`);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(out.jsonText);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard gdpr export:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/account/gdpr/erase", async (req?, res?) => {
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
      const out = await eraseSelfGdprData(client, accessToken, body);
      if (!out.ok && out.retryAfterMs) {
        res.setHeader("Retry-After", String(Math.ceil(out.retryAfterMs / 1000)));
      }
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard gdpr erase:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/credits", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const user = await fetchDiscordUser(accessToken);
      if (!user.ok) {
        return res.status(Number(user.status) || 401).json(user);
      }
      const credits = await getPremiumCredits(user.userId);
      return res.status(200).json({
        ok: true,
        credits,
        userId: user.userId,
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard credits:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/credits/history", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const user = await fetchDiscordUser(accessToken);
      if (!user.ok) {
        return res.status(Number(user.status) || 401).json(user);
      }
      const [credits, history] = await Promise.all([
        getPremiumCredits(user.userId),
        getPremiumCreditsHistory(user.userId, 50),
      ]);
      return res.status(200).json({ ok: true, credits, history });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard credits history:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-dashboard/credits/spend", async (req?, res?) => {
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
      const access = await verifyDashboardGuildAccess(client, accessToken, body.guildId);
      if (!access.ok) {
        return res.status(Number(access.status) || 403).json(access);
      }
      const result = await spendCreditsForTenantPremium(access.userId, access.guildId, body.months, {
        client,
      });
      if (!result.ok) {
        const err = String(result.error || "spend_failed");
        const messages = {
          insufficient: "Crediti insufficienti. Compra un pacchetto e riprova.",
          bad_guild: "Server non valido.",
          invalid_plan: "Piano non valido.",
          grant_failed: "Attivazione Premium non riuscita.",
        };
        return res.status(400).json({
          ok: false,
          error: err,
          message: messages[err] || "Attivazione non riuscita.",
          credits: result.credits,
          plan: result.plan || null,
        });
      }
      return res.status(200).json({
        ok: true,
        credits: result.credits,
        premium: result.premium,
        plan: result.plan,
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard credits spend:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/guilds", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listDashboardGuilds(client, accessToken);
      try {
        /* vcGuildsDebugLog1 */
        const fs = require("fs") as typeof import("fs");
        const body = JSON.stringify(out);
        fs.appendFileSync(
          "/tmp/vc_guilds_debug.log",
          JSON.stringify({
            t: Date.now(),
            status: out && out.status,
            ok: out && out.ok,
            error: out && out.error,
            message: out && out.message,
            n: Array.isArray(out && out.guilds) ? out.guilds.length : null,
            len: Buffer.byteLength(body),
            viewAs: String(req.headers["x-vc-view-as"] || ""),
          }) + "\n",
        );
      } catch (eLog) {}
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard guilds:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/guilds/:guildId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardGuildOverview(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard guild:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const fresh = String(req.query?.fresh || req.query?.refresh || "").trim().toLowerCase();
      const forcePickers = fresh === "1" || fresh === "true" || fresh === "yes";
      const out = await getDashboardPartnership(client, accessToken, req.params?.guildId, { forcePickers });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-dashboard/guilds/:guildId/partnership", async (req?, res?) => {
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
      const out = await patchDashboardPartnership(client, accessToken, req.params?.guildId, body);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership/migration", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardPartnershipMigration(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership migration get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/leaderboard", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardPartnershipLeaderboard(client, accessToken, req.params?.guildId, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard leaderboard get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/partnership/migration", async (req?, res?) => {
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
      const out = await startDashboardPartnershipMigration(client, accessToken, req.params?.guildId, body);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership migration post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/partnership/migration/undo", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await undoDashboardPartnershipMigration(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership migration undo:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership/blacklist", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardPartnershipBlacklist(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership blacklist get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/partnership/blacklist", async (req?, res?) => {
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
      const out = await addDashboardPartnershipBlacklist(client, accessToken, req.params?.guildId, body);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership blacklist post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.delete("/webhooks/site-dashboard/guilds/:guildId/partnership/blacklist/:targetGuildId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await removeDashboardPartnershipBlacklist(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.targetGuildId,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership blacklist delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership/managers", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardPartnershipManagers(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership managers get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership/history", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardPartnershipHistory(client, accessToken, req.params?.guildId, {
        days: req.query?.days,
        page: req.query?.page,
        pageSize: req.query?.pageSize || req.query?.limit,
      });
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.set("Pragma", "no-cache");
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership history get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/partnership/managers/:userId/points", async (req?, res?) => {
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
      const out = await adjustDashboardPartnershipManagerPoints(
        client,
        accessToken,
        req.params?.guildId,
        req.params?.userId,
        body,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership managers points:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.delete("/webhooks/site-dashboard/guilds/:guildId/partnership", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await leaveDashboardPartnership(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard partnership leave:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/settings", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardGuildSettings(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard settings get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.patch("/webhooks/site-dashboard/guilds/:guildId/settings", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await patchDashboardGuildSettings(
        client,
        accessToken,
        req.params?.guildId,
        req.body,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard settings patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/config/export", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await exportDashboardGuildConfig(client, accessToken, req.params?.guildId);
      if (!out || out.ok !== true) {
        return res.status(Number(out?.status) || 500).json(out || { ok: false, error: "export_failed" });
      }
      const filename = String(out.filename || `vinili-config-${req.params?.guildId || "guild"}.json`);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(JSON.stringify(out.config, null, 2));
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard config export:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/config/import", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await importDashboardGuildConfig(client, accessToken, req.params?.guildId, req.body);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard config import:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.post("/webhooks/site-dashboard/guilds/:guildId/boards/quote-preview", async (req?, res?) => {
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
      const out = await previewDashboardQuoteStyle(client, accessToken, req.params?.guildId, body.quoteStyle);
      if (!out || out.ok !== true || !out.image) {
        return res.status(Number(out?.status) || 500).json(out || { ok: false, error: "preview_failed" });
      }
      res.setHeader("Content-Type", String(out.mimeType || "image/png"));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.status(200).send(out.image);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard quote-preview:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/commands", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardGuildCommands(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard commands get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.patch("/webhooks/site-dashboard/guilds/:guildId/commands", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await patchDashboardGuildCommands(
        client,
        accessToken,
        req.params?.guildId,
        req.body,
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard commands patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/moderation", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardModeration(client, accessToken, req.params?.guildId);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard moderation get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.patch("/webhooks/site-dashboard/guilds/:guildId/moderation", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await patchDashboardModeration(client, accessToken, req.params?.guildId, req.body);
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard moderation patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-dashboard/guilds/:guildId/moderation/cases", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardModerationCases(client, accessToken, req.params?.guildId, req.query || {});
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-dashboard moderation cases:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
}

export = { mountDashboardRoutes };
