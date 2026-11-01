const crypto = require("node:crypto") as typeof import("node:crypto");
const {
  resolveDiscordOauthClientIdForSite,
  resolveDiscordOauthRedirectUriForSite,
  normalizeSiteOAuthReturnPath,
} = require("../../Web/verifyOauthPublicUrl") as typeof import("../../Web/verifyOauthPublicUrl");

function isCandidatureWebsiteApiEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.WEBSITE_CANDIDATURE_HTTP || "").trim().toLowerCase());
}
const { mountWebTicketRoutes } = require("../../features/tickets/site/webTicketRoutes") as typeof import("../../features/tickets/site/webTicketRoutes");
const { mountDashboardTicketRoutes } = require("../../features/tickets/dashboard/dashboardTicketRoutes") as typeof import("../../features/tickets/dashboard/dashboardTicketRoutes");
const { mountBoardsRoutes } = require("../../features/boards/boardsRoutes") as typeof import("../../features/boards/boardsRoutes");
const { mountBachecaRoutes } = require("../../features/bacheca/bachecaRoutes") as typeof import("../../features/bacheca/bachecaRoutes");
const { mountSuggestionsRoutes } = require("../../features/suggestions/suggestionsRoutes") as typeof import("../../features/suggestions/suggestionsRoutes");
const { mountContestRoutes } = require("../../features/contest/contestRoutes") as typeof import("../../features/contest/contestRoutes");
const { mountWorkflowRoutes } = require("../../features/workflow/workflowRoutes") as typeof import("../../features/workflow/workflowRoutes");
const { mountNotificationsRoutes } = require("../../features/notifications/notificationsRoutes") as typeof import("../../features/notifications/notificationsRoutes");
const { mountStaffRoutes } = require("../../features/staff/staffRoutes") as typeof import("../../features/staff/staffRoutes");
const { mountDashboardRoutes } = require("../../features/dashboard/dashboardRoutes") as typeof import("../../features/dashboard/dashboardRoutes");










function mountSiteWebhookRoutes(app?, client?, deps?) {
  const normalizeHeaderSecret = deps.normalizeHeaderSecret;
  const siteCandidatureCorsMiddleware = deps.siteCorsMiddleware;
  /* pageTune1: ETag/304 su GET pubblici boards/wiki/reviews/suggestions */
  const { sendJsonWithEtag, weakEtagFromJson } = require("../../Web/siteHttpEtag") as typeof import("../../Web/siteHttpEtag");
  function replyJsonEtag(req?, res?, out?, opts: Record<string, any> = {}) {
    const status = Number(out && out.status) || Number(opts.status) || 200;
    if (!out || out.ok === false) {
      return res.status(status).json(out);
    }
    if (opts.cacheControl) res.setHeader("Cache-Control", opts.cacheControl);
    if (opts.extraHeaders && typeof opts.extraHeaders === "object") {
      for (const [k, v] of Object.entries(opts.extraHeaders)) {
        if (v != null) res.setHeader(k, String(v));
      }
    }
    return sendJsonWithEtag(req, res, out, {
      status,
      cacheControl: opts.cacheControl,
      etag: weakEtagFromJson(out),
    });
  }

  /* siteApiW8: notif/access/summary/organico/pause/dashboard/tickets tengono ETag (304); resto staff no-store */
  function applyStaffApiNoStore(req?, res?, next?) {
    const p = String(req.path || req.url || "");
    const url = String(req.url || "");
    const isNotif = p.startsWith("/webhooks/site-notifications");
    const isStaff = p.startsWith("/webhooks/site-staff");
    if (!isNotif && !isStaff) {
      return next();
    }
    const allowEtag =
      isNotif ||
      p === "/webhooks/site-staff-access" ||
      p.startsWith("/webhooks/site-staff-access/") ||
      p === "/webhooks/site-staff-organico" ||
      p.startsWith("/webhooks/site-staff-organico/") ||
      p === "/webhooks/site-staff-pause" ||
      p.startsWith("/webhooks/site-staff-pause/") ||
      p === "/webhooks/site-staff-dashboard" ||
      p.startsWith("/webhooks/site-staff-dashboard/") ||
      p === "/webhooks/site-staff-tickets" ||
      p.startsWith("/webhooks/site-staff-tickets/") ||
      (p.startsWith("/webhooks/site-staff-workflows") && /(?:\?|&)queue=summary(?:&|$)/.test(url));

    if (allowEtag) {
      /* no-cache + keep ETag; handlers may upgrade Cache-Control / answer 304 */
      res.set("Cache-Control", "private, no-cache");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      return next();
    }

    res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    try {
      res.removeHeader("ETag");
    } catch (e0) {}
    const prevWriteHead = res.writeHead;
    res.writeHead = function staffNoStoreWriteHead() {
      try {
        res.removeHeader("ETag");
        res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } catch (eWh) {}
      return prevWriteHead.apply(this, arguments);
    };
    const prevJson = res.json.bind(res);
    res.json = function staffNoStoreJson(body?) {
      try {
        res.removeHeader("ETag");
        res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
      } catch (e1) {}
      return prevJson(body);
    };
    return next();
  }
  app.use(applyStaffApiNoStore);

  if (isCandidatureWebsiteApiEnabled()) {
    app.use(siteCandidatureCorsMiddleware);
    const { submitCandidatureWebsite, getCandidatureEligibilitySummary } = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
    const { getWebsiteUnbanEligibility, submitWebsiteUnban } = require("../../Events/interaction/unbanWebsiteHandlers") as typeof import("../../Events/interaction/unbanWebsiteHandlers");
    const {
      getWebsiteUnmuteEligibility,
      submitWebsiteUnmute,
    } = require("../../Events/interaction/unmuteWebsiteHandlers") as typeof import("../../Events/interaction/unmuteWebsiteHandlers");
    app.get("/webhooks/site-candidature/eligibility", async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out = await getCandidatureEligibilitySummary(client, accessToken);
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-candidature eligibility:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.post("/webhooks/site-candidature", async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const type = body.type;
        const answers = body.answers;
        const out = await submitCandidatureWebsite(client, { accessToken, type, answers });
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-candidature:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.get("/webhooks/site-unban/eligibility", async (req?, res?) => {
      try {
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.set("Pragma", "no-cache");
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out = await getWebsiteUnbanEligibility(client, accessToken);
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unban eligibility:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.post("/webhooks/site-unban", async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const out = await submitWebsiteUnban(client, {
          accessToken,
          answers: body.answers,
          acceptedRules: body.acceptedRules,
        });
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unban:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.get("/webhooks/site-unmute/eligibility", async (req?, res?) => {
      try {
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.set("Pragma", "no-cache");
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out = await getWebsiteUnmuteEligibility(client, accessToken);
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unmute eligibility:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.post("/webhooks/site-unmute", async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const out = await submitWebsiteUnmute(client, {
          accessToken,
          answers: body.answers,
          acceptedRules: body.acceptedRules,
        });
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unmute:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
  } else {
    const candidatureDisabledBody = {
      ok: false,
      error: "candidature_http_disabled",
      message:
        "API candidature sito disattivata: nel .env del bot imposta WEBSITE_CANDIDATURE_HTTP=1 e riavvia. Se il sito statico e il bot usano la stessa porta (es. tutto su 3000), il POST colpisce `serve` e non Express: avvia il sito su un'altra porta (es. 5173) e lascia la webhookPort al bot.",
    };
    app.use(siteCandidatureCorsMiddleware);
    app.get("/webhooks/site-candidature/eligibility", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-candidature", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.get("/webhooks/site-unban/eligibility", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-unban", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.get("/webhooks/site-unmute/eligibility", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-unmute", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    global.logger?.warn?.(
      "[WEBHOOK] API sito disattive: WEBSITE_CANDIDATURE_HTTP disattivo — GET/POST su /webhooks/site-candidature, /webhooks/site-unban e /webhooks/site-unmute rispondono 503.",
    );
  }

  const { buildCommunityRulesSitePayload } = require("../../Web/communityRulesPayload") as typeof import("../../Web/communityRulesPayload");
  const { handleSiteUsersLeaderboardGet } = require("../../Web/siteUsersLeaderboardApi") as typeof import("../../Web/siteUsersLeaderboardApi");
  const { handleSiteVoteGet } = require("../../Web/siteVoteApi") as typeof import("../../Web/siteVoteApi");
  const { handleSiteWordleTodayGet, handleSiteWordleGuessPost } = require("../../Web/siteWordleApi") as typeof import("../../Web/siteWordleApi");
  const { handleSiteLiveEventGet } = require("../../Web/siteLiveEventApi") as typeof import("../../Web/siteLiveEventApi");
  const { handleSiteRolesGet } = require("../../Web/siteRolesApi") as typeof import("../../Web/siteRolesApi");
  const { submitSiteRoleRequest, leaveSiteRole, getSiteRoleRequestStates } = require("../../Web/siteRoleRequestApi") as typeof import("../../Web/siteRoleRequestApi");
  const { getRankCardCustomization, getServerAvatarOnly, updateRankCardCustomization, getRankCardPreview, getPublicRankCardPreview } = require("../../Web/siteRankCardApi") as typeof import("../../Web/siteRankCardApi");
  const { getSiteWrapped } = require("../../Web/siteWrappedApi") as typeof import("../../Web/siteWrappedApi");
  const { getCustomProfileCustomization, getCustomProfileGuildEmojis, mutateCustomProfile } = require("../../Web/siteCustomProfileApi") as typeof import("../../Web/siteCustomProfileApi");
  const { getProfileExtras, mutateProfileExtras } = require("../../Web/siteProfileExtrasApi") as typeof import("../../Web/siteProfileExtrasApi");
  const { getWelcomePronouns } = require("../../Web/siteWelcomePronounsApi") as typeof import("../../Web/siteWelcomePronounsApi");
  const { handleSiteGuildJoinPost } = require("../../Web/siteGuildJoinApi") as typeof import("../../Web/siteGuildJoinApi");
  const { getSiteReviews, submitSiteReview, deleteSiteReview, toggleSiteReviewLike, upsertServerReviewReply } = require("../../Web/siteReviewsApi") as typeof import("../../Web/siteReviewsApi");
  const {
    ensureBoardsVoteReminderScheduler,
    ensureBoardsStatsScheduler,
  } = require("../../features/boards/siteBoardsApi") as typeof import("../../features/boards/siteBoardsApi");
  try {
    ensureBoardsStatsScheduler(client);
  } catch (_) {}
  const {
    getBotFeedbackList,
    createBotFeedback,
    updateOwnBotFeedback,
    deleteOwnBotFeedback,
    addBotFeedbackComment,
    setBotFeedbackVote,
    staffSetBotFeedbackDecision,
    staffDeleteBotFeedback,
    serveBotFeedbackFile,
  } = require("../../Web/siteBotFeedbackApi") as typeof import("../../Web/siteBotFeedbackApi");
  const {
    handleSiteSeratafilmAccessGet,
    handleSiteSeratafilmFilmGet,
  } = require("../../Web/siteSeratafilmAccessApi") as typeof import("../../Web/siteSeratafilmAccessApi");
  const {
    handleSiteChromePrefsGet,
    handleSiteChromePrefsPost,
  } = require("../../Web/siteChromePrefsApi") as typeof import("../../Web/siteChromePrefsApi");
  const { handleSiteCookieConsentGet } = require("../../Web/siteCookieConsentApi") as typeof import("../../Web/siteCookieConsentApi");
  const { fetchDiscordOAuthMe } = require("../../Web/discordOauthMe") as typeof import("../../Web/discordOauthMe");
  const {
    handleSiteConfessionaleGet,
    handleSiteConfessionalePost,
    handleSiteConfessionaleCommentPost,
    handleSiteConfessionaleDeletePost,
    handleSiteConfessionaleResolvePost,
    handleSiteConfessionaleReopenPost,
  } = require("../../Web/siteConfessionaleApi") as typeof import("../../Web/siteConfessionaleApi");
  // Hogwarts event retired — API always 410 (finale prizes live elsewhere).
  app.use("/webhooks/site-hogwarts-sorting", (_req?, res?) => {
    return res.status(410).json({
      ok: false,
      error: "event_closed",
      message: "Evento Hogwarts concluso.",
    });
  });

  app.get("/webhooks/site-rules", (req?, res?) => {
    try {
      res.setHeader("Cache-Control", "public, max-age=120");
      return res.json(buildCommunityRulesSitePayload());
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rules:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });

  /* Icona guild main live (OG / component-embed thumb) — niente gif fissa in repo */
  {
    const { handleSiteGuildIconGet } = require("../../Web/siteGuildIconApi") as typeof import("../../Web/siteGuildIconApi");
    app.get("/webhooks/site-guild-icon", (req?, res?) => handleSiteGuildIconGet(client, req, res));
    app.head("/webhooks/site-guild-icon", (req?, res?) => handleSiteGuildIconGet(client, req, res));
  }

  /* siteUserPresence1: online/idle sul sito (heartbeat + query) */
  {
    const {
      handleSiteUserPresenceHeartbeat,
      handleSiteUserPresenceQuery,
    } = require("../../Web/siteUserPresenceApi") as typeof import("../../Web/siteUserPresenceApi");
    app.post("/webhooks/site-user-presence", (req?, res?) => handleSiteUserPresenceHeartbeat(req, res));
    app.post("/webhooks/site-user-presence/query", (req?, res?) => handleSiteUserPresenceQuery(req, res));
    app.get("/webhooks/site-user-presence/query", (req?, res?) => handleSiteUserPresenceQuery(req, res));
  }

  app.get("/webhooks/site-users", (req?, res?) => {
    return handleSiteUsersLeaderboardGet(client, req, res);
  });
  mountBoardsRoutes(app, client, { replyJsonEtag, normalizeHeaderSecret });
  mountBachecaRoutes(app, client);
  app.get("/webhooks/site-vote", (req?, res?) => {
    return handleSiteVoteGet(client, req, res);
  });
  app.get("/webhooks/site-wordle/today", (req?, res?) => handleSiteWordleTodayGet(client, req, res));
  app.post("/webhooks/site-wordle/guess", (req?, res?) => handleSiteWordleGuessPost(client, req, res));
  /* wordleStatsSync1: statistiche Wordle sul profilo (stesse su telefono e PC) */
  app.get("/webhooks/site-wordle/stats", (req?, res?) => require("../../Web/siteWordleStatsApi").handleSiteWordleStatsGet(client, req, res));
  app.post("/webhooks/site-wordle/stats", (req?, res?) => require("../../Web/siteWordleStatsApi").handleSiteWordleStatsPost(client, req, res));
  /* wordleDailySync1: partita del giorno sul profilo (no rifarla da altro device) */
  app.get("/webhooks/site-wordle/daily", (req?, res?) => require("../../Web/siteWordleDailyApi").handleSiteWordleDailyGet(client, req, res));
  app.post("/webhooks/site-wordle/daily", (req?, res?) => require("../../Web/siteWordleDailyApi").handleSiteWordleDailyPost(client, req, res));
  mountNotificationsRoutes(app, client);
  app.get("/webhooks/site-seratafilm-access", (req?, res?) => handleSiteSeratafilmAccessGet(client, req, res));
  app.get("/webhooks/site-seratafilm-film", (req?, res?) => handleSiteSeratafilmFilmGet(client, req, res));
  app.get("/webhooks/site-chrome-prefs", (req?, res?) => handleSiteChromePrefsGet(client, req, res));
  app.post("/webhooks/site-chrome-prefs", (req?, res?) => handleSiteChromePrefsPost(client, req, res));
  /* siteClientErrors1: errori JavaScript dei visitatori → logs/site-client-errors.log */
  app.post("/webhooks/site-client-error", (req?, res?) => {
    const { handleSiteClientErrorPost } = require("../../Web/siteClientErrorsApi") as typeof import("../../Web/siteClientErrorsApi");
    return handleSiteClientErrorPost(req, res);
  });
  app.get("/webhooks/site-client-error/recent", (req?, res?) => {
    const { handleSiteClientErrorRecent } = require("../../Web/siteClientErrorsApi") as typeof import("../../Web/siteClientErrorsApi");
    return handleSiteClientErrorRecent(req, res);
  });
  app.get("/webhooks/site-cookie-consent", (req?, res?) => handleSiteCookieConsentGet(client, req, res));
  /* siteBoot1: me skim + unread + theme/prefs in un round-trip */
  try {
    const { handleSiteBootGet } = require("../../Web/siteBootApi") as typeof import("../../Web/siteBootApi");
    app.get("/webhooks/site-boot", (req?, res?) => handleSiteBootGet(client, req, res));
  } catch (eBootRoute) {
    global.logger?.warn?.("[WEBHOOK] site-boot mount skipped:", eBootRoute?.message || eBootRoute);
  }
  /* discordMeProxy1: browser → same-origin proxy (evita CORS/500 discord.com in console) */
  app.get("/webhooks/site-discord-me", async (req?, res?) => {
    try {
      /* apiJankCut1: private short TTL — allinea process cache oauth (~90s), meno RTT Discord */
      res.set("Cache-Control", "private, max-age=45, stale-while-revalidate=120");
      res.set("Vary", "Authorization");
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "401" });
      }
      const out = await fetchDiscordOAuthMe(accessToken, { timeoutMs: 9000 });
      if (!out.ok || !out.me) {
        return res.status(Number(out.status) || 503).json({
          ok: false,
          error: out.error || "discord_unreachable",
          message: out.message || "503",
        });
      }
      return res.status(200).json(out.me);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-discord-me:", err);
      return res.status(503).json({ ok: false, error: "internal", message: "503" });
    }
  });
  mountStaffRoutes(app, client);
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
  mountWorkflowRoutes(app, client);
  const { handleSiteUserWorkflowsGet } = require("../../Web/siteUserWorkflowApi") as typeof import("../../Web/siteUserWorkflowApi");
  app.get("/webhooks/site-user-workflows", (req?, res?) => handleSiteUserWorkflowsGet(client, req, res));
  mountWebTicketRoutes(app, client);

  app.get("/webhooks/site-verify/oauth-start", (req?, res?) => {
    const clientId = resolveDiscordOauthClientIdForSite();
    const redirectUri = resolveDiscordOauthRedirectUriForSite();
    if (!clientId || !redirectUri) {
      res
        .status(503)
        .type("text/plain; charset=utf-8")
        .send("OAuth sito non configurato sul bot. Imposta DISCORD_OAUTH_CLIENT_ID e DISCORD_OAUTH_REDIRECT_URI (o WEBSITE_*).");
      return;
    }
    const fromR = normalizeSiteOAuthReturnPath(req.query?.r);
    const gid = String(req.query?.guildId || req.query?.guild || "").trim();
    const returnPath =
      fromR ||
      (/^\d{17,22}$/.test(gid) ? `/?siteVerifyGuild=${encodeURIComponent(gid)}` : "/");
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = encodeURIComponent(JSON.stringify({ r: returnPath, n: nonce, t: Date.now() }));
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: "identify",
      prompt: "none",
      state,
    });
    const authorizeUrl = `https://discord.com/oauth2/authorize?${q.toString()}`;
    const nonceJson = JSON.stringify(nonce);
    const urlJson = JSON.stringify(authorizeUrl);
    const html =
      "<!DOCTYPE html><html lang=\"it\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>Discord</title></head><body>" +
      "<script>(function(){var n=" +
      nonceJson +
      ";try{sessionStorage.setItem(\"vc_oauth_state_nonce_v1\",n);sessionStorage.setItem(\"vc_oauth_attempted_none_v1\",\"1\");}catch(e){}location.replace(" +
      urlJson +
      ");})();<\/script></body></html>";
    res.status(200).type("text/html; charset=utf-8").send(html);
  });
  app.get("/webhooks/site-live-event", (req?, res?) => {
    return handleSiteLiveEventGet(client, req, res);
  });
  app.get("/webhooks/site-twitch-live", (req?, res?) => {
    const { handleSiteTwitchLiveGet } = require("../../Web/siteTwitchLiveApi") as typeof import("../../Web/siteTwitchLiveApi");
    return handleSiteTwitchLiveGet(client, req, res);
  });
  app.get("/webhooks/site-twitch-live/thumb", (req?, res?) => {
    const { handleSiteTwitchLiveThumb } = require("../../Web/siteTwitchLiveApi") as typeof import("../../Web/siteTwitchLiveApi");
    return handleSiteTwitchLiveThumb(client, req, res);
  });
  app.get("/webhooks/site-wiki-help", async (req?, res?) => {
    try {
      const { getWikiHelpAccess } = require("../../Web/siteWikiHelpApi") as typeof import("../../Web/siteWikiHelpApi");
      const { parseViewAsFromReq } = require("../../Web/siteViewAsPreview") as typeof import("../../Web/siteViewAsPreview");
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const bot = String(req.query?.bot || req.query?.pane || "prod");
      const viewAs = parseViewAsFromReq(req);
      const out = await getWikiHelpAccess(client, { accessToken, bot, viewAs });
      const cats = Array.isArray(out?.catalog?.categories) ? out.catalog.categories.length : 0;
      try {
        if (accessToken) {
          const fs = require("fs") as typeof import("fs");
          const line =
            JSON.stringify({
              at: new Date().toISOString(),
              bot: out?.bot,
              ok: out?.ok,
              guest: out?.guest,
              userId: out?.userId || null,
              viewAs: out?.viewAs || null,
              cats,
              cmd: out?.catalog?.commandCount ?? null,
              authError: out?.authError || null,
            }) + "\n";
          fs.appendFileSync("/tmp/vc_wiki_auth_hits.log", line);
        }
      } catch (_) {}
      return replyJsonEtag(req, res, out, {
        cacheControl: accessToken ? "private, max-age=60" : "public, max-age=120",
        extraHeaders: { "X-VC-Wiki-Cats": String(cats) },
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-wiki-help:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-roles", (req?, res?) => {
    return handleSiteRolesGet(client, req, res);
  });
  app.get("/webhooks/site-roles/request-state", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getSiteRoleRequestStates(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-roles request-state:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-roles/request", async (req?, res?) => {
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
      const out = await submitSiteRoleRequest(client, {
        accessToken,
        roleId: body.roleId,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-roles request:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-roles/leave", async (req?, res?) => {
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
      const out = await leaveSiteRole(client, {
        accessToken,
        roleId: body.roleId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-roles leave:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-rank-card", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const avatarOnly =
        String(req.query?.avatarOnly || req.query?.fields || "")
          .trim()
          .toLowerCase() === "1" ||
        String(req.query?.fields || "")
          .trim()
          .toLowerCase() === "avatar";
      const out = avatarOnly
        ? await getServerAvatarOnly(client, { accessToken })
        : await getRankCardCustomization(client, { accessToken });
      if (avatarOnly && out?.ok) {
        res.setHeader("Cache-Control", "private, max-age=120");
      }
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rank-card get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-wrapped", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getSiteWrapped(client, { accessToken });
      if (out?.ok) res.setHeader("Cache-Control", "private, max-age=60");
      else res.setHeader("Cache-Control", "no-store");
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-wrapped get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-rank-card", async (req?, res?) => {
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
      const out = await updateRankCardCustomization(client, {
        accessToken,
        mode: body.mode,
        theme: body.theme,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rank-card post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-rank-card-preview", async (req?, res?) => {
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
      const out = await getRankCardPreview(client, {
        accessToken,
        theme: body.theme,
      });
      if (!out || out.ok !== true || !out.image) {
        return res.status(Number(out?.status) || 500).json(out || { ok: false, error: "preview_failed" });
      }
      res.setHeader("Content-Type", String(out.mimeType || "image/png"));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.status(200).send(out.image);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rank-card-preview post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-rank-card-public", async (req?, res?) => {
    try {
      const userId = String((req.query && req.query.userId) || "").trim();
      const out = await getPublicRankCardPreview(client, { userId });
      if (!out || out.ok !== true || !out.image) {
        return res.status(Number(out?.status) || 500).json(out || { ok: false, error: "preview_failed" });
      }
      res.setHeader("Content-Type", String(out.mimeType || "image/png"));
      /* rankCardSpeed1: browser 3min + SWR; server ha anche cache memoria 2min */
      res.setHeader("Cache-Control", "public, max-age=180, stale-while-revalidate=600");
      if (out.cache) res.setHeader("X-VC-Rank-Cache", String(out.cache));
      return res.status(200).send(out.image);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rank-card-public get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-custom-profile", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getCustomProfileCustomization(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-custom-profile get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-custom-profile/emojis", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const force = String(req.query?.fresh || "") === "1" || String(req.query?.force || "") === "1";
      const out = await getCustomProfileGuildEmojis(client, { accessToken, force });
      if (out && out.ok) res.setHeader("Cache-Control", "private, max-age=60");
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-custom-profile emojis:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-custom-profile", async (req?, res?) => {
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
      const out = await mutateCustomProfile(client, {
        accessToken,
        target: body.target,
        action: body.action,
        name: body.name,
        baseName: body.baseName,
        mode: body.mode,
        hex: body.hex,
        hex2: body.hex2,
        value: body.value,
        emoji: body.emoji,
        memberId: body.memberId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-custom-profile post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-welcome-pronouns", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
          badge: "Benvenut* su",
          gender: "u",
          i18nKey: "home.welcome",
          source: "fallback",
        });
      }
      const fresh =
        String(req.query?.fresh || "").trim() === "1" ||
        String(req.query?.fresh || "").trim().toLowerCase() === "true";
      const out = await getWelcomePronouns(client, { accessToken, fresh });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-welcome-pronouns get:", err);
      return res.status(500).json({
        ok: false,
        error: "internal",
        message: "Errore interno.",
        badge: "Benvenut* su",
        gender: "u",
        i18nKey: "home.welcome",
        source: "fallback",
      });
    }
  });
  app.post("/webhooks/site-guild-join", (req?, res?) => handleSiteGuildJoinPost(client, req, res));
  app.get("/webhooks/site-profile-extras", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const section = String(req.query?.section || req.query?.target || "").trim();
      const { parseViewAsFromReq } = require("../../Web/siteViewAsPreview") as typeof import("../../Web/siteViewAsPreview");
      const out = await getProfileExtras(client, {
        accessToken,
        section,
        viewAs: parseViewAsFromReq(req),
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-profile-extras get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-profile-extras", async (req?, res?) => {
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
      const out = await mutateProfileExtras(client, { accessToken, ...body });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-profile-extras post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
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
  /* boardsVoteFlow1 */
  try {
    ensureBoardsVoteReminderScheduler(client);
  } catch (_) {}
  mountContestRoutes(app, client, { normalizeHeaderSecret });

  /* starWarsEvento: HS-only finché publicEnabled=false */
  {
    const sw = require("../../Web/siteStarWarsEventoApi") as typeof import("../../Web/siteStarWarsEventoApi");
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
    app.get("/webhooks/site-evento/accademia", (req?, res?) => sw.handleSiteEventoAccademiaGet(client, req, res));
    app.post("/webhooks/site-evento/accademia", (req?, res?) => sw.handleSiteEventoAccademiaPost(client, req, res));
    app.get("/webhooks/site-evento/gara", (req?, res?) => sw.handleSiteEventoGaraGet(client, req, res));
    app.post("/webhooks/site-evento/gara", (req?, res?) => sw.handleSiteEventoGaraPost(client, req, res));
    app.get("/webhooks/site-evento/miniera", (req?, res?) => sw.handleSiteEventoMinieraGet(client, req, res));
    app.post("/webhooks/site-evento/miniera", (req?, res?) => sw.handleSiteEventoMinieraPost(client, req, res));
    app.get("/webhooks/site-evento/pei", (req?, res?) => sw.handleSiteEventoPeiGet(client, req, res));
    app.get("/webhooks/site-evento/traditore", (req?, res?) => sw.handleSiteEventoTraditoreGet(client, req, res));
    app.post("/webhooks/site-evento/traditore", (req?, res?) => sw.handleSiteEventoTraditorePost(client, req, res));
    app.post("/webhooks/site-evento/phase-end", (req?, res?) => sw.handleSiteEventoPhaseEndPost(client, req, res));
  }

  app.get("/webhooks/site-discussion-images/:scope/:docId/:fileName", (req?, res?) => {
    try {
      require("../../Web/siteDiscussionImages").serveDiscussionImage(req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-discussion image:", err);
      if (!res.headersSent) res.status(500).end();
    }
  });
  mountSuggestionsRoutes(app, client, { normalizeHeaderSecret, replyJsonEtag });

  app.get("/webhooks/site-bot-feedback/files/:feedbackId/:fileName", async (req?, res?) => {
    try {
      await serveBotFeedbackFile(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback file:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-bot-feedback", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getBotFeedbackList(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-bot-feedback", async (req?, res?) => {
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
      const out = await createBotFeedback(client, {
        accessToken,
        content: body.content,
        kind: body.kind,
        images: body.images,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback post:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-bot-feedback/:feedbackId", async (req?, res?) => {
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
      const out = await updateOwnBotFeedback(client, {
        accessToken,
        feedbackId: req.params?.feedbackId,
        content: body.content,
        kind: body.kind,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.delete("/webhooks/site-bot-feedback/:feedbackId", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteOwnBotFeedback(client, {
        accessToken,
        feedbackId: req.params?.feedbackId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-bot-feedback/:feedbackId/comments", async (req?, res?) => {
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
      const out = await addBotFeedbackComment(client, {
        accessToken,
        feedbackId: req.params?.feedbackId,
        content: body.content,
        parentCommentId: body.parentCommentId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback comment:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-bot-feedback/:feedbackId/vote", async (req?, res?) => {
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
      const out = await setBotFeedbackVote(client, {
        accessToken,
        feedbackId: req.params?.feedbackId,
        direction: body.direction,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback vote:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-bot-feedback/:feedbackId/decision", async (req?, res?) => {
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
      const out = await staffSetBotFeedbackDecision(client, {
        accessToken,
        feedbackId: req.params?.feedbackId,
        status: body.status,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback decision:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-bot-feedback/:feedbackId/delete", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await staffDeleteBotFeedback(client, {
        accessToken,
        feedbackId: req.params?.feedbackId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback staff delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  mountDashboardRoutes(app, client, { normalizeHeaderSecret });
  mountDashboardTicketRoutes(app, client, { normalizeHeaderSecret });

}

export = { mountSiteWebhookRoutes };
