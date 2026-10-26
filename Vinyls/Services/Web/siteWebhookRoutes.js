const crypto = require("node:crypto");
const {
  resolveDiscordOauthClientIdForSite,
  resolveDiscordOauthRedirectUriForSite,
  normalizeSiteOAuthReturnPath,
} = require("../../Utils/Web/verifyOauthPublicUrl");

function isCandidatureWebsiteApiEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.WEBSITE_CANDIDATURE_HTTP || "").trim().toLowerCase());
}

function mountSiteWebhookRoutes(app, client, deps) {
  const normalizeHeaderSecret = deps.normalizeHeaderSecret;
  const siteCandidatureCorsMiddleware = deps.siteCorsMiddleware;
  const listSitePaymentPlans = deps.listSitePaymentPlans;
  const createSitePaymentOrder = deps.createSitePaymentOrder;
  const captureSitePaymentOrder = deps.captureSitePaymentOrder;
  const handleSitePayPalWebhook = deps.handleSitePayPalWebhook;
  /* pageTune1: ETag/304 su GET pubblici boards/wiki/reviews/suggestions */
  const { sendJsonWithEtag, weakEtagFromJson } = require("../../Utils/Web/siteHttpEtag");
  function replyJsonEtag(req, res, out, opts = {}) {
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
  function applyStaffApiNoStore(req, res, next) {
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
    res.json = function staffNoStoreJson(body) {
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
    const { submitCandidatureWebsite, getCandidatureEligibilitySummary } = require("../../Events/interaction/candidatureApplicationHandlers");
    const { getWebsiteUnbanEligibility, submitWebsiteUnban } = require("../../Events/interaction/unbanWebsiteHandlers");
    const {
      getWebsiteUnmuteEligibility,
      submitWebsiteUnmute,
    } = require("../../Events/interaction/unmuteWebsiteHandlers");
    app.get("/webhooks/site-candidature/eligibility", async (req, res) => {
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
    app.post("/webhooks/site-candidature", async (req, res) => {
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
    app.get("/webhooks/site-unban/eligibility", async (req, res) => {
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
    app.post("/webhooks/site-unban", async (req, res) => {
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
    app.get("/webhooks/site-unmute/eligibility", async (req, res) => {
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
    app.post("/webhooks/site-unmute", async (req, res) => {
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
    app.get("/webhooks/site-candidature/eligibility", (req, res) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-candidature", (req, res) => res.status(503).json(candidatureDisabledBody));
    app.get("/webhooks/site-unban/eligibility", (req, res) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-unban", (req, res) => res.status(503).json(candidatureDisabledBody));
    app.get("/webhooks/site-unmute/eligibility", (req, res) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-unmute", (req, res) => res.status(503).json(candidatureDisabledBody));
    global.logger?.warn?.(
      "[WEBHOOK] API sito disattive: WEBSITE_CANDIDATURE_HTTP disattivo — GET/POST su /webhooks/site-candidature, /webhooks/site-unban e /webhooks/site-unmute rispondono 503.",
    );
  }

  const { buildCommunityRulesSitePayload } = require("../../Utils/Web/communityRulesPayload");
  const { handleSiteUsersLeaderboardGet } = require("../../Utils/Web/siteUsersLeaderboardApi");
  const { handleSiteVoteGet } = require("../../Utils/Web/siteVoteApi");
  const { handleSiteWordleTodayGet, handleSiteWordleGuessPost } = require("../../Utils/Web/siteWordleApi");
  const { handleSiteLiveEventGet } = require("../../Utils/Web/siteLiveEventApi");
  const { handleSiteRolesGet } = require("../../Utils/Web/siteRolesApi");
  const { submitSiteRoleRequest, leaveSiteRole, getSiteRoleRequestStates } = require("../../Utils/Web/siteRoleRequestApi");
  const { getRankCardCustomization, getServerAvatarOnly, updateRankCardCustomization, getRankCardPreview, getPublicRankCardPreview } = require("../../Utils/Web/siteRankCardApi");
  const { getCustomProfileCustomization, getCustomProfileGuildEmojis, mutateCustomProfile } = require("../../Utils/Web/siteCustomProfileApi");
  const { getProfileExtras, mutateProfileExtras } = require("../../Utils/Web/siteProfileExtrasApi");
  const { getWelcomePronouns } = require("../../Utils/Web/siteWelcomePronounsApi");
  const { handleSiteGuildJoinPost } = require("../../Utils/Web/siteGuildJoinApi");
  const { getSiteReviews, submitSiteReview, deleteSiteReview, toggleSiteReviewLike, upsertServerReviewReply } = require("../../Utils/Web/siteReviewsApi");
  const {
    getBoardsPublicConfig,
    listBoardTags,
    listListings,
    getListingBySlug,
    createListing,
    patchListing,
    submitListing,
    generateInvite,
    guildBoardDefaults,
    probeBoardLink,
    uploadBoardBanner,
    serveBoardBannerFile,
    listMine,
    getMyListingById,
    deleteMyListing,
    refreshMyListing,
    listClaimableServers,
    voteListing,
    bumpListing,
    reportListing,
    listListingReviews,
    createListingReview,
    toggleListingReviewLike,
    reportListingReview,
    upsertListingReviewReply,
    startListingVoteSession,
    progressListingVoteSession,
    setListingVoteReminder,
    ensureBoardsVoteReminderScheduler,
    modListPending,
    getListingForStaffReview,
    modDecide,
    ensureBoardsStatsScheduler,
    clientIp: boardsClientIp,
  } = require("../../Utils/Web/siteBoardsApi");
  try {
    ensureBoardsStatsScheduler(client);
  } catch (_) {}
  const { getSiteSuggestions, createSiteSuggestion, updateOwnSiteSuggestion, deleteOwnSiteSuggestion, addSiteSuggestionComment, updateSiteSuggestionComment, deleteSiteSuggestionComment, setSiteSuggestionCommentVote, setSiteSuggestionVote, staffAcceptSiteSuggestion, staffRejectSiteSuggestion, staffSetSiteSuggestionDecision, staffDeleteSiteSuggestion, serveSiteSuggestionFile } = require("../../Utils/Web/siteSuggestionsApi");
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
  } = require("../../Utils/Web/siteBotFeedbackApi");
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
  } = require("../../Utils/Web/siteContestApi");
  const {
    handleSiteNotificationsGet,
    handleSiteNotificationsMarkReadPost,
    handleSiteNotificationsClearPost,
    handleSiteNotificationsDeletePost,
    handleSiteNotificationsPushVapidGet,
    handleSiteNotificationsPushSubscribePost,
    handleSiteNotificationsPushShownPost,
    handleSiteNotificationsPushUnsubscribePost,
  } = require("../../Utils/Web/siteInAppNotificationsApi");
  const { completeSiteVerify } = require("../../Utils/Web/siteVerifyApi");
  const {
    handleSiteSeratafilmAccessGet,
    handleSiteSeratafilmFilmGet,
  } = require("../../Utils/Web/siteSeratafilmAccessApi");
  const {
    handleSiteChromePrefsGet,
    handleSiteChromePrefsPost,
  } = require("../../Utils/Web/siteChromePrefsApi");
  const { handleSiteCookieConsentGet } = require("../../Utils/Web/siteCookieConsentApi");
  const { fetchDiscordOAuthMe } = require("../../Utils/Web/discordOauthMe");
  const { handleSiteStaffAccessGet } = require("../../Utils/Web/siteStaffAccessApi");
  const {
    handleSiteConfessionaleGet,
    handleSiteConfessionalePost,
    handleSiteConfessionaleCommentPost,
    handleSiteConfessionaleDeletePost,
    handleSiteConfessionaleResolvePost,
    handleSiteConfessionaleReopenPost,
  } = require("../../Utils/Web/siteConfessionaleApi");
  const { handleSiteStaffPauseGet, handleSiteStaffPausePost } = require("../../Utils/Web/siteStaffPauseApi");
  const {
    handleSiteStaffCompitiGet,
    handleSiteStaffCompitiPost,
    handleSiteStaffCompitiFileGet,
  } = require("../../Utils/Web/siteStaffCompitiApi");
  const { handleSiteStaffProfileGet } = require("../../Utils/Web/siteStaffProfileApi");
  const { handleSiteStaffGuideGet } = require("../../Utils/Web/siteStaffGuideApi");
  const { handleSiteStaffDashboardGet } = require("../../Utils/Web/siteStaffDashboardApi");
  const { handleSiteStaffManageGet, handleSiteStaffManagePost } = require("../../Utils/Web/siteStaffManageApi");
  const { handleSiteStaffOrganicoGet, handleSiteStaffOrganicoPost } = require("../../Utils/Web/siteStaffOrganicoApi");
  const { handleSiteStaffWorkflowGet, handleSiteStaffWorkflowPost } = require("../../Utils/Web/siteStaffWorkflowApi");
  const { handleSiteStaffPmActionsPost } = require("../../Utils/Web/siteStaffPmActionsApi");
  const { handleSiteStaffValTradePost } = require("../../Utils/Web/siteStaffValTradeApi");
  const { handleSiteStaffModLookupGet } = require("../../Utils/Web/siteStaffModApi");
  const {
    handleSiteStaffPmHubGet,
    handleSiteStaffTicketsGet,
    handleSiteStaffSerataFilmGet,
    handleSiteStaffSerataFilmPost,
  } = require("../../Utils/Web/siteStaffToolsApi");
  const {
    handleSiteWebTicketsMetaGet,
    handleSiteWebTicketsEmojisGet,
    handleSiteWebTicketsMentionsGet,
    handleSiteWebTicketsResolvePost,
    handleSiteWebTicketsCommandsGet,
    handleSiteWebTicketsListGet,
    handleSiteWebTicketsCreatePost,
    handleSiteWebTicketsDetailGet,
    handleSiteWebTicketsMessagePost,
    handleSiteWebTicketsMessagePatch,
    handleSiteWebTicketsMessageDelete,
    handleSiteWebTicketsReactionPost,
    handleSiteWebTicketsClaimPost,
    handleSiteWebTicketsUnclaimPost,
    handleSiteWebTicketsClosePost,
    handleSiteWebTicketsMembersPost,
    handleSiteWebTicketsMembersRemovePost,
    handleSiteWebTicketsTransferPost,
    handleSiteWebTicketsCategoryPost,
    handleSiteWebTicketsRenamePost,
    handleSiteWebTicketsCloseRequestPost,
    handleSiteWebTicketsCloseRequestAcceptPost,
    handleSiteWebTicketsCloseRequestRejectPost,
    handleSiteWebTicketsCommandPost,
    handleSiteWebTicketsRatePost,
    handleSiteWebTicketsFileGet,
    handleSiteWebTicketsPresencePost,
    handleSiteWebTicketsReadPost,
    handleSiteWebTicketsTypingPost,
  } = require("../../Utils/Web/siteWebTicketsApi");
  // Hogwarts event retired — API always 410 (finale prizes live elsewhere).
  app.use("/webhooks/site-hogwarts-sorting", (_req, res) => {
    return res.status(410).json({
      ok: false,
      error: "event_closed",
      message: "Evento Hogwarts concluso.",
    });
  });

  app.get("/webhooks/site-rules", (req, res) => {
    try {
      res.setHeader("Cache-Control", "public, max-age=120");
      return res.json(buildCommunityRulesSitePayload());
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rules:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });

  /* siteUserPresence1: online/idle sul sito (heartbeat + query) */
  {
    const {
      handleSiteUserPresenceHeartbeat,
      handleSiteUserPresenceQuery,
    } = require("../../Utils/Web/siteUserPresenceApi");
    app.post("/webhooks/site-user-presence", (req, res) => handleSiteUserPresenceHeartbeat(req, res));
    app.post("/webhooks/site-user-presence/query", (req, res) => handleSiteUserPresenceQuery(req, res));
    app.get("/webhooks/site-user-presence/query", (req, res) => handleSiteUserPresenceQuery(req, res));
  }

  app.get("/webhooks/site-users", (req, res) => {
    return handleSiteUsersLeaderboardGet(client, req, res);
  });
  app.get("/webhooks/site-vote", (req, res) => {
    return handleSiteVoteGet(client, req, res);
  });
  app.get("/webhooks/site-wordle/today", (req, res) => handleSiteWordleTodayGet(client, req, res));
  app.post("/webhooks/site-wordle/guess", (req, res) => handleSiteWordleGuessPost(client, req, res));
  /* wordleStatsSync1: statistiche Wordle sul profilo (stesse su telefono e PC) */
  app.get("/webhooks/site-wordle/stats", (req, res) => require("../../Utils/Web/siteWordleStatsApi").handleSiteWordleStatsGet(client, req, res));
  app.post("/webhooks/site-wordle/stats", (req, res) => require("../../Utils/Web/siteWordleStatsApi").handleSiteWordleStatsPost(client, req, res));
  /* wordleDailySync1: partita del giorno sul profilo (no rifarla da altro device) */
  app.get("/webhooks/site-wordle/daily", (req, res) => require("../../Utils/Web/siteWordleDailyApi").handleSiteWordleDailyGet(client, req, res));
  app.post("/webhooks/site-wordle/daily", (req, res) => require("../../Utils/Web/siteWordleDailyApi").handleSiteWordleDailyPost(client, req, res));
  app.get("/webhooks/site-notifications", (req, res) => {
    return handleSiteNotificationsGet(client, req, res);
  });
  app.post("/webhooks/site-notifications/read", (req, res) => {
    return handleSiteNotificationsMarkReadPost(client, req, res);
  });
  app.post("/webhooks/site-notifications/clear", (req, res) => {
    return handleSiteNotificationsClearPost(client, req, res);
  });
  app.post("/webhooks/site-notifications/delete", (req, res) => {
    return handleSiteNotificationsDeletePost(client, req, res);
  });
  app.get("/webhooks/site-notifications/push/vapid-public-key", (req, res) => {
    return handleSiteNotificationsPushVapidGet(client, req, res);
  });
  app.post("/webhooks/site-notifications/push/subscribe", (req, res) => {
    return handleSiteNotificationsPushSubscribePost(client, req, res);
  });
  app.post("/webhooks/site-notifications/push/shown", (req, res) => {
    return handleSiteNotificationsPushShownPost(client, req, res);
  });
  app.post("/webhooks/site-notifications/push/unsubscribe", (req, res) => {
    return handleSiteNotificationsPushUnsubscribePost(client, req, res);
  });
  app.get("/webhooks/site-seratafilm-access", (req, res) => handleSiteSeratafilmAccessGet(client, req, res));
  app.get("/webhooks/site-seratafilm-film", (req, res) => handleSiteSeratafilmFilmGet(client, req, res));
  app.get("/webhooks/site-chrome-prefs", (req, res) => handleSiteChromePrefsGet(client, req, res));
  app.post("/webhooks/site-chrome-prefs", (req, res) => handleSiteChromePrefsPost(client, req, res));
  /* siteClientErrors1: errori JavaScript dei visitatori → logs/site-client-errors.log */
  app.post("/webhooks/site-client-error", (req, res) => {
    const { handleSiteClientErrorPost } = require("../../Utils/Web/siteClientErrorsApi");
    return handleSiteClientErrorPost(req, res);
  });
  app.get("/webhooks/site-client-error/recent", (req, res) => {
    const { handleSiteClientErrorRecent } = require("../../Utils/Web/siteClientErrorsApi");
    return handleSiteClientErrorRecent(req, res);
  });
  app.get("/webhooks/site-cookie-consent", (req, res) => handleSiteCookieConsentGet(client, req, res));
  /* siteBoot1: me skim + unread + theme/prefs in un round-trip */
  try {
    const { handleSiteBootGet } = require("../../Utils/Web/siteBootApi");
    app.get("/webhooks/site-boot", (req, res) => handleSiteBootGet(client, req, res));
  } catch (eBootRoute) {
    global.logger?.warn?.("[WEBHOOK] site-boot mount skipped:", eBootRoute?.message || eBootRoute);
  }
  /* discordMeProxy1: browser → same-origin proxy (evita CORS/500 discord.com in console) */
  app.get("/webhooks/site-discord-me", async (req, res) => {
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
  app.get("/webhooks/site-staff-access", (req, res) => handleSiteStaffAccessGet(client, req, res));
  app.get("/webhooks/site-confessionale", (req, res) => handleSiteConfessionaleGet(client, req, res));
  app.post("/webhooks/site-confessionale", (req, res) => handleSiteConfessionalePost(client, req, res));
  app.post("/webhooks/site-confessionale/:id/comments", (req, res) =>
    handleSiteConfessionaleCommentPost(client, req, res),
  );
  app.post("/webhooks/site-confessionale/:id/delete", (req, res) =>
    handleSiteConfessionaleDeletePost(client, req, res),
  );
  app.post("/webhooks/site-confessionale/:id/resolve", (req, res) =>
    handleSiteConfessionaleResolvePost(client, req, res),
  );
  app.post("/webhooks/site-confessionale/:id/reopen", (req, res) =>
    handleSiteConfessionaleReopenPost(client, req, res),
  );
  app.get("/webhooks/site-staff-dashboard", (req, res) => handleSiteStaffDashboardGet(client, req, res));
  app.get("/webhooks/site-staff-manage", (req, res) => handleSiteStaffManageGet(client, req, res));
  app.post("/webhooks/site-staff-manage", (req, res) => handleSiteStaffManagePost(client, req, res));
  app.get("/webhooks/site-staff-organico", (req, res) => handleSiteStaffOrganicoGet(client, req, res));
  app.post("/webhooks/site-staff-organico", (req, res) => handleSiteStaffOrganicoPost(client, req, res));
  app.get("/webhooks/site-staff-pause", (req, res) => handleSiteStaffPauseGet(client, req, res));
  app.post("/webhooks/site-staff-pause", (req, res) => handleSiteStaffPausePost(client, req, res));
  app.get("/webhooks/site-staff-compiti", (req, res) => handleSiteStaffCompitiGet(client, req, res));
  app.post("/webhooks/site-staff-compiti", (req, res) => handleSiteStaffCompitiPost(client, req, res));
  app.get("/webhooks/site-staff-compiti/files/:weekKey/:userId/:fileName", (req, res) =>
    handleSiteStaffCompitiFileGet(client, req, res),
  );
  app.get("/webhooks/site-staff-profile", (req, res) => handleSiteStaffProfileGet(client, req, res));
  app.get("/webhooks/site-staff-pm-hub", (req, res) => handleSiteStaffPmHubGet(client, req, res));
  app.get("/webhooks/site-staff-tickets", (req, res) => handleSiteStaffTicketsGet(client, req, res));
  app.get("/webhooks/site-staff-seratafilm", (req, res) => handleSiteStaffSerataFilmGet(client, req, res));
  app.post("/webhooks/site-staff-seratafilm", (req, res) => handleSiteStaffSerataFilmPost(client, req, res));
  app.get("/webhooks/site-staff-guide", (req, res) => handleSiteStaffGuideGet(client, req, res));
  app.get("/webhooks/site-staff-workflows", (req, res) => handleSiteStaffWorkflowGet(client, req, res));
  app.post("/webhooks/site-staff-workflows", (req, res) => handleSiteStaffWorkflowPost(client, req, res));
  const {
    handleSiteStaffWorkflowChatGet,
    handleSiteStaffWorkflowChatPost,
    handleSiteStaffWorkflowChatReadPost,
    handleSiteStaffWorkflowChatReactionPost,
    handleSiteStaffWorkflowChatEmojisGet,
    handleSiteStaffWorkflowChatFileGet,
    handleSiteStaffWorkflowChatSubjectPost,
    handleSiteStaffWorkflowChatMessagePatch,
    handleSiteStaffWorkflowChatMessageDelete,
    handleSiteStaffWorkflowChatTypingPost,
    handleSiteStaffWorkflowChatMentionsGet,
  } = require("../../Utils/Web/siteStaffWorkflowChatApi");
  app.get("/webhooks/site-staff-workflow-chat/emojis", (req, res) => handleSiteStaffWorkflowChatEmojisGet(client, req, res));
  app.get("/webhooks/site-staff-workflow-chat/mentions", (req, res) =>
    handleSiteStaffWorkflowChatMentionsGet(client, req, res),
  );
  app.post("/webhooks/site-staff-workflow-chat/typing", (req, res) =>
    handleSiteStaffWorkflowChatTypingPost(client, req, res),
  );
  app.post("/webhooks/site-staff-workflow-chat/read", (req, res) =>
    handleSiteStaffWorkflowChatReadPost(client, req, res),
  );
  app.get("/webhooks/site-staff-workflow-chat/files/:folderKey/:fileName", (req, res) =>
    handleSiteStaffWorkflowChatFileGet(client, req, res),
  );
  app.post("/webhooks/site-staff-workflow-chat/reactions", (req, res) =>
    handleSiteStaffWorkflowChatReactionPost(client, req, res),
  );
  app.post("/webhooks/site-staff-workflow-chat/subject", (req, res) =>
    handleSiteStaffWorkflowChatSubjectPost(client, req, res),
  );
  app.patch("/webhooks/site-staff-workflow-chat/messages/:messageId", (req, res) =>
    handleSiteStaffWorkflowChatMessagePatch(client, req, res),
  );
  app.delete("/webhooks/site-staff-workflow-chat/messages/:messageId", (req, res) =>
    handleSiteStaffWorkflowChatMessageDelete(client, req, res),
  );
  app.get("/webhooks/site-staff-workflow-chat", (req, res) => handleSiteStaffWorkflowChatGet(client, req, res));
  app.post("/webhooks/site-staff-workflow-chat", (req, res) => handleSiteStaffWorkflowChatPost(client, req, res));
  const { handleSiteUserWorkflowsGet } = require("../../Utils/Web/siteUserWorkflowApi");
  app.get("/webhooks/site-user-workflows", (req, res) => handleSiteUserWorkflowsGet(client, req, res));
  app.get("/webhooks/site-user-workflow-chat/emojis", (req, res) => handleSiteStaffWorkflowChatEmojisGet(client, req, res));
  app.get("/webhooks/site-user-workflow-chat/mentions", (req, res) =>
    handleSiteStaffWorkflowChatMentionsGet(client, req, res),
  );
  app.post("/webhooks/site-user-workflow-chat/typing", (req, res) =>
    handleSiteStaffWorkflowChatTypingPost(client, req, res),
  );
  app.post("/webhooks/site-user-workflow-chat/read", (req, res) =>
    handleSiteStaffWorkflowChatReadPost(client, req, res),
  );
  app.get("/webhooks/site-user-workflow-chat/files/:folderKey/:fileName", (req, res) =>
    handleSiteStaffWorkflowChatFileGet(client, req, res),
  );
  app.post("/webhooks/site-user-workflow-chat/reactions", (req, res) =>
    handleSiteStaffWorkflowChatReactionPost(client, req, res),
  );
  app.patch("/webhooks/site-user-workflow-chat/messages/:messageId", (req, res) =>
    handleSiteStaffWorkflowChatMessagePatch(client, req, res),
  );
  app.delete("/webhooks/site-user-workflow-chat/messages/:messageId", (req, res) =>
    handleSiteStaffWorkflowChatMessageDelete(client, req, res),
  );
  app.get("/webhooks/site-user-workflow-chat", (req, res) => handleSiteStaffWorkflowChatGet(client, req, res));
  app.post("/webhooks/site-user-workflow-chat", (req, res) => handleSiteStaffWorkflowChatPost(client, req, res));
  app.post("/webhooks/site-staff-pm-actions", (req, res) => handleSiteStaffPmActionsPost(client, req, res));
  const {
    handleSiteStaffPmShopPost,
    handleSiteStaffPmShopGet,
  } = require("../../Utils/Web/siteStaffPmShopApi");
  app.get("/webhooks/site-staff-pm-shop", (req, res) => handleSiteStaffPmShopGet(client, req, res));
  app.post("/webhooks/site-staff-pm-shop", (req, res) => handleSiteStaffPmShopPost(client, req, res));
  const {
    handleSiteStaffPmPointsRemovedGet,
    handleSiteStaffPmPointsRemovedPost,
  } = require("../../Utils/Web/siteStaffPmPointsRemovedApi");
  app.get("/webhooks/site-staff-pm-points-removed", (req, res) =>
    handleSiteStaffPmPointsRemovedGet(client, req, res),
  );
  app.post("/webhooks/site-staff-pm-points-removed", (req, res) =>
    handleSiteStaffPmPointsRemovedPost(client, req, res),
  );
  app.post("/webhooks/site-staff-valtrade", (req, res) => handleSiteStaffValTradePost(client, req, res));
  app.get("/webhooks/site-staff-mod", (req, res) => handleSiteStaffModLookupGet(client, req, res));

  app.get("/webhooks/site-web-tickets/meta", (req, res) => {
    try {
      return handleSiteWebTicketsMetaGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets meta:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/presence", async (req, res) => {
    try {
      return await handleSiteWebTicketsPresencePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets presence:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/typing", async (req, res) => {
    try {
      return await handleSiteWebTicketsTypingPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets typing:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/emojis", async (req, res) => {
    try {
      return await handleSiteWebTicketsEmojisGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets emojis:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/mentions", async (req, res) => {
    try {
      return await handleSiteWebTicketsMentionsGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets mentions:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/resolve", async (req, res) => {
    try {
      return await handleSiteWebTicketsResolvePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets resolve:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/commands", async (req, res) => {
    try {
      return await handleSiteWebTicketsCommandsGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets commands:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/files/:ticketId/:fileName", async (req, res) => {
    try {
      return await handleSiteWebTicketsFileGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets file:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets", async (req, res) => {
    try {
      return await handleSiteWebTicketsListGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets", async (req, res) => {
    try {
      return await handleSiteWebTicketsCreatePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets create:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-web-tickets/:ticketId", async (req, res) => {
    try {
      return await handleSiteWebTicketsDetailGet(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets detail:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/read", async (req, res) => {
    try {
      return await handleSiteWebTicketsReadPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets read:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/messages", async (req, res) => {
    try {
      return await handleSiteWebTicketsMessagePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets message:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.patch("/webhooks/site-web-tickets/:ticketId/messages/:messageId", async (req, res) => {
    try {
      return await handleSiteWebTicketsMessagePatch(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets message patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.delete("/webhooks/site-web-tickets/:ticketId/messages/:messageId", async (req, res) => {
    try {
      return await handleSiteWebTicketsMessageDelete(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets message delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/messages/:messageId/reactions", async (req, res) => {
    try {
      return await handleSiteWebTicketsReactionPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets reaction:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/claim", async (req, res) => {
    try {
      return await handleSiteWebTicketsClaimPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets claim:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/unclaim", async (req, res) => {
    try {
      return await handleSiteWebTicketsUnclaimPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets unclaim:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/close", async (req, res) => {
    try {
      return await handleSiteWebTicketsClosePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets close:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/members", async (req, res) => {
    try {
      return await handleSiteWebTicketsMembersPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets members:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/members/remove", async (req, res) => {
    try {
      return await handleSiteWebTicketsMembersRemovePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets members remove:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/transfer", async (req, res) => {
    try {
      return await handleSiteWebTicketsTransferPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets transfer:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/category", async (req, res) => {
    try {
      return await handleSiteWebTicketsCategoryPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets category:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/rename", async (req, res) => {
    try {
      return await handleSiteWebTicketsRenamePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets rename:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/close-request", async (req, res) => {
    try {
      return await handleSiteWebTicketsCloseRequestPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets close-request:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/close-request/accept", async (req, res) => {
    try {
      return await handleSiteWebTicketsCloseRequestAcceptPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets close-request accept:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/close-request/reject", async (req, res) => {
    try {
      return await handleSiteWebTicketsCloseRequestRejectPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets close-request reject:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/rate", async (req, res) => {
    try {
      return await handleSiteWebTicketsRatePost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets rate:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.post("/webhooks/site-web-tickets/:ticketId/command", async (req, res) => {
    try {
      return await handleSiteWebTicketsCommandPost(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-web-tickets command:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });

  app.get("/webhooks/site-payments/plans", (req, res) => {
    try {
      return res.status(200).json({ ok: true, items: listSitePaymentPlans() });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-payments plans:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-payments/create-order", async (req, res) => {
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
      const out = await createSitePaymentOrder(client, {
        accessToken,
        planKey: body.planKey,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-payments create-order:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-payments/capture-order", async (req, res) => {
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
      const out = await captureSitePaymentOrder(client, {
        accessToken,
        orderId: body.orderId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-payments capture-order:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-payments/paypal-webhook", async (req, res) => {
    return handleSitePayPalWebhook(client, req, res);
  });
  app.post("/webhooks/site-verify/complete", async (req, res) => {
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
      const out = await completeSiteVerify(client, {
        accessToken,
        guildId: body.guildId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-verify complete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-verify/oauth-start", (req, res) => {
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
  app.get("/webhooks/site-live-event", (req, res) => {
    return handleSiteLiveEventGet(client, req, res);
  });
  app.get("/webhooks/site-kick-live", (req, res) => {
    const { handleSiteKickLiveGet } = require("../../Utils/Web/siteKickLiveApi");
    return handleSiteKickLiveGet(client, req, res);
  });
  app.get("/webhooks/site-twitch-live", (req, res) => {
    const { handleSiteTwitchLiveGet } = require("../../Utils/Web/siteTwitchLiveApi");
    return handleSiteTwitchLiveGet(client, req, res);
  });
  app.get("/webhooks/site-twitch-live/thumb", (req, res) => {
    const { handleSiteTwitchLiveThumb } = require("../../Utils/Web/siteTwitchLiveApi");
    return handleSiteTwitchLiveThumb(client, req, res);
  });
  app.get("/webhooks/site-kick-live/stream.m3u8", (req, res) => {
    const { handleSiteKickLiveStreamPlaylist } = require("../../Utils/Web/siteKickLiveApi");
    return handleSiteKickLiveStreamPlaylist(client, req, res);
  });
  app.get("/webhooks/site-kick-live/preview.mp4", (req, res) => {
    const { handleSiteKickLivePreviewMp4 } = require("../../Utils/Web/siteKickLiveApi");
    return handleSiteKickLivePreviewMp4(client, req, res);
  });
  app.get("/webhooks/site-kick-live/thumb", (req, res) => {
    const { handleSiteKickLiveThumb } = require("../../Utils/Web/siteKickLiveApi");
    return handleSiteKickLiveThumb(client, req, res);
  });
  app.get("/webhooks/site-kick-live/proxy", (req, res) => {
    const { handleSiteKickLiveProxy } = require("../../Utils/Web/siteKickLiveApi");
    return handleSiteKickLiveProxy(client, req, res);
  });
  app.get("/webhooks/site-kick-sub/oauth-callback", (req, res) => {
    const { handleKickSubOAuthCallback } = require("../../Utils/Web/kickSubscriberWebhookApi");
    return handleKickSubOAuthCallback(client, req, res);
  });
  app.get("/webhooks/site-kick-sub/oauth-start", (req, res) => {
    const { handleKickSubOAuthStartGet } = require("../../Utils/Web/kickSubscriberWebhookApi");
    return handleKickSubOAuthStartGet(client, req, res);
  });
  app.get("/webhooks/site-kick-sub/status", (req, res) => {
    const { handleKickSubStatusGet } = require("../../Utils/Web/kickSubscriberWebhookApi");
    return handleKickSubStatusGet(client, req, res);
  });
  app.post("/webhooks/site-kick-sub/unlink", (req, res) => {
    const { handleKickSubUnlinkPost } = require("../../Utils/Web/kickSubscriberWebhookApi");
    return handleKickSubUnlinkPost(client, req, res);
  });
  app.post("/webhooks/site-kick-sub/events", (req, res) => {
    const { handleKickSubEventsWebhook } = require("../../Utils/Web/kickSubscriberWebhookApi");
    return handleKickSubEventsWebhook(client, req, res);
  });
  app.get("/webhooks/site-wiki-help", async (req, res) => {
    try {
      const { getWikiHelpAccess } = require("../../Utils/Web/siteWikiHelpApi");
      const { parseViewAsFromReq } = require("../../Utils/Web/siteViewAsPreview");
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const bot = String(req.query?.bot || req.query?.pane || "prod");
      const viewAs = parseViewAsFromReq(req);
      const out = await getWikiHelpAccess(client, { accessToken, bot, viewAs });
      const cats = Array.isArray(out?.catalog?.categories) ? out.catalog.categories.length : 0;
      try {
        if (accessToken) {
          const fs = require("fs");
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
  app.get("/webhooks/site-roles", (req, res) => {
    return handleSiteRolesGet(client, req, res);
  });
  app.get("/webhooks/site-roles/request-state", async (req, res) => {
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
  app.post("/webhooks/site-roles/request", async (req, res) => {
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
  app.post("/webhooks/site-roles/leave", async (req, res) => {
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
  app.get("/webhooks/site-rank-card", async (req, res) => {
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
  app.post("/webhooks/site-rank-card", async (req, res) => {
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
  app.post("/webhooks/site-rank-card-preview", async (req, res) => {
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
  app.get("/webhooks/site-rank-card-public", async (req, res) => {
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
  app.get("/webhooks/site-custom-profile", async (req, res) => {
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
  app.get("/webhooks/site-custom-profile/emojis", async (req, res) => {
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
  app.post("/webhooks/site-custom-profile", async (req, res) => {
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
  app.get("/webhooks/site-welcome-pronouns", async (req, res) => {
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
  app.post("/webhooks/site-guild-join", (req, res) => handleSiteGuildJoinPost(client, req, res));
  app.get("/webhooks/site-profile-extras", async (req, res) => {
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
      const { parseViewAsFromReq } = require("../../Utils/Web/siteViewAsPreview");
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
  app.post("/webhooks/site-profile-extras", async (req, res) => {
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
  app.get("/webhooks/site-reviews", async (req, res) => {
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
  app.post("/webhooks/site-reviews", async (req, res) => {
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
  app.delete("/webhooks/site-reviews/:reviewId", async (req, res) => {
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
  app.post("/webhooks/site-reviews/:reviewId/like", async (req, res) => {
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
  app.post("/webhooks/site-reviews/:reviewId/server-reply", async (req, res) => {
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

  /* Vinili Boards — /webhooks/site-boards/... */
  /* boardsSchedaMissUi1: miss atteso → HTTP 200 (body.status resta 404) così la console non spammand 404 */
  function boardsSoftGetHttpStatus(out) {
    const code = Number(out && out.status) || 500;
    if (out && out.ok) return 200;
    const err = String((out && out.error) || "");
    if (err === "not_found" || err === "pending_not_public") return 200;
    return code;
  }
  app.get("/webhooks/site-boards/config", async (req, res) => {
    try {
      const out = getBoardsPublicConfig(client);
      return replyJsonEtag(req, res, out, { cacheControl: "public, max-age=30" });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards config:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/tags", async (req, res) => {
    try {
      const out = await listBoardTags(client, {
        q: req.query?.q,
        limit: req.query?.limit,
      });
      return replyJsonEtag(req, res, out, { cacheControl: "public, max-age=20" });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards tags:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/listings", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      let allowClosed = String(req.query?.allowClosed || "") === "1";
      if (accessToken && !allowClosed) {
        try {
          const { assertWebsiteStaffAccess } = require("../../Utils/Web/siteStaffAccessApi");
          const staff = await assertWebsiteStaffAccess(client, accessToken);
          if (staff?.ok) allowClosed = true;
        } catch (_) {}
      }
      const out = await listListings(client, {
        kind: req.query?.kind,
        q: req.query?.q,
        tag: req.query?.tag,
        category: req.query?.category,
        locale: req.query?.locale,
        guildTag: req.query?.guildTag || req.query?.guildtag,
        sort: req.query?.sort,
        page: req.query?.page,
        perPage: req.query?.perPage,
        allowClosed,
      });
      return replyJsonEtag(req, res, out, {
        cacheControl: allowClosed ? "private, max-age=15" : "public, max-age=30",
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards listings:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/listings/:slug", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      let allowClosed = String(req.query?.allowClosed || "") === "1";
      if (accessToken && !allowClosed) {
        try {
          const { assertWebsiteStaffAccess } = require("../../Utils/Web/siteStaffAccessApi");
          const staff = await assertWebsiteStaffAccess(client, accessToken);
          if (staff?.ok) allowClosed = true;
        } catch (_) {}
      }
      const out = await getListingBySlug(client, req.params?.slug, {
        allowClosed,
        /* boardsPendingRedirect1: owner può aprire slug/id pending */
        accessToken: accessToken || "",
      });
      return res.status(boardsSoftGetHttpStatus(out)).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards listing:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings", async (req, res) => {
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
      const out = await createListing(client, { accessToken, ...body });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards create:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.patch("/webhooks/site-boards/listings/:id", async (req, res) => {
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
      const out = await patchListing(client, {
        accessToken,
        listingId: req.params?.id,
        patch: body,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards patch:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings/:id/submit", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await submitListing(client, {
        accessToken,
        listingId: req.params?.id,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards submit:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings/:id/generate-invite", async (req, res) => {
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
      const out = await generateInvite(client, {
        accessToken,
        listingId: req.params?.id,
        guildId: body.guildId || body.discordId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards generate-invite:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/generate-invite", async (req, res) => {
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
      const out = await generateInvite(client, {
        accessToken,
        guildId: body.guildId || body.discordId,
        listingId: body.listingId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards generate-invite:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/guild-defaults", async (req, res) => {
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
      const out = await guildBoardDefaults(client, {
        accessToken,
        guildId: body.guildId || body.discordId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards guild-defaults:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsLinkCheck1 */
  app.post("/webhooks/site-boards/probe-link", async (req, res) => {
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
      const out = await probeBoardLink(client, {
        accessToken,
        kind: body.kind || body.type,
        value: body.value || body.url || body.handle,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards probe-link:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsVoteFlow1 */
  try {
    ensureBoardsVoteReminderScheduler(client);
  } catch (_) {}
  app.post("/webhooks/site-boards/listings/:id/vote-session", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await startListingVoteSession(client, {
        accessToken,
        listingId: req.params?.id,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards vote-session:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings/:id/vote-progress", async (req, res) => {
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
      const out = await progressListingVoteSession(client, {
        accessToken,
        listingId: req.params?.id,
        sessionId: body.sessionId,
        step: body.step,
        markStart: body.markStart === true,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards vote-progress:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings/:id/vote", async (req, res) => {
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
      const out = await voteListing(
        client,
        {
          accessToken,
          listingId: req.params?.id,
          sessionId: body.sessionId,
          turnstileToken: body.turnstileToken || body["cf-turnstile-response"],
          remind: body.remind === true || body.reminder === true,
        },
        { ip: boardsClientIp(req) },
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards vote:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings/:id/vote-reminder", async (req, res) => {
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
      const out = await setListingVoteReminder(client, {
        accessToken,
        listingId: req.params?.id,
        enable: body.enable !== false && body.remind !== false,
        remind: body.remind,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards vote-reminder:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings/:id/bump", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await bumpListing(
        client,
        { accessToken, listingId: req.params?.id },
        { ip: boardsClientIp(req) },
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards bump:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings/:id/report", async (req, res) => {
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
      const out = await reportListing(client, {
        accessToken,
        listingId: req.params?.id,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards report:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsListingReviews1 */
  app.get("/webhooks/site-boards/listings/:id/reviews", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization) || "";
      const out = await listListingReviews(client, {
        accessToken,
        listingId: req.params?.id,
        sort: req.query?.sort,
        page: req.query?.page,
        perPage: req.query?.perPage,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards reviews list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings/:id/reviews", async (req, res) => {
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
      const out = await createListingReview(
        client,
        {
          accessToken,
          listingId: req.params?.id,
          rating: body.rating,
          content: body.content || body.text,
        },
        { ip: boardsClientIp(req) },
      );
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards reviews create:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/reviews/:id/like", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await toggleListingReviewLike(client, {
        accessToken,
        reviewId: req.params?.id,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards review like:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/reviews/:id/report", async (req, res) => {
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
      const out = await reportListingReview(client, {
        accessToken,
        reviewId: req.params?.id,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards review report:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsReviewReply1 */
  app.post("/webhooks/site-boards/reviews/:id/reply", async (req, res) => {
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
      const out = await upsertListingReviewReply(client, {
        accessToken,
        reviewId: req.params?.id,
        content: body.content || body.text,
        clear: body.clear === true || body.delete === true,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards review reply:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsBannerUpload1 */
  app.get("/webhooks/site-boards/files/:userId/:fileName", async (req, res) => {
    try {
      await serveBoardBannerFile(req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards banner file:", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    }
  });

  /* siteContestHalloween1 — unlisted contest swipe + submit */
  app.get("/webhooks/site-contest/events", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await listSiteContestEvents(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest events:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-contest/highlight", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getSiteContestHighlight(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest highlight:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-contest/:eventKey/status", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getContestStatus(client, { eventKey: req.params.eventKey, accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest status:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-contest/:eventKey/submit", async (req, res) => {
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
  app.get("/webhooks/site-contest/:eventKey/feed", async (req, res) => {
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
  app.post("/webhooks/site-contest/:eventKey/swipe", async (req, res) => {
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
  app.get("/webhooks/site-contest/:eventKey/leaderboard", async (req, res) => {
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
  app.post("/webhooks/site-contest/:eventKey/delete", async (req, res) => {
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
  app.post("/webhooks/site-contest/:eventKey/replace", async (req, res) => {
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
  app.post("/webhooks/site-contest/:eventKey/public-open", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await setSiteContestPublicOpen(client, {
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
  app.post("/webhooks/site-contest/:eventKey/seed-demo", async (req, res) => {
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
  app.post("/webhooks/site-contest/:eventKey/clear-demo", async (req, res) => {
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
  app.get("/webhooks/site-contest/files/:eventKey/:userId/:fileName", async (req, res) => {
    try {
      await serveSiteContestFile(req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-contest file:", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    }
  });

  /* starWarsEvento: HS-only finché publicEnabled=false */
  {
    const sw = require("../../Utils/Web/siteStarWarsEventoApi");
    app.get("/webhooks/site-evento", (req, res) => sw.handleSiteEventoStatusGet(client, req, res));
    app.get("/webhooks/site-evento/avvento", (req, res) => sw.handleSiteEventoAvventoGet(client, req, res));
    app.post("/webhooks/site-evento/avvento/claim", (req, res) => sw.handleSiteEventoAvventoClaimPost(client, req, res));
    app.get("/webhooks/site-evento/calendar", (req, res) => sw.handleSiteEventoCalendarGet(client, req, res));
    app.get("/webhooks/site-evento/smistamento", (req, res) => sw.handleSiteEventoSmistamentoGet(client, req, res));
    app.post("/webhooks/site-evento/smistamento", (req, res) => sw.handleSiteEventoSmistamentoPost(client, req, res));
    app.get("/webhooks/site-evento/shop", (req, res) => sw.handleSiteEventoShopGet(client, req, res));
    app.post("/webhooks/site-evento/shop/buy", (req, res) => sw.handleSiteEventoShopBuyPost(client, req, res));
    app.post("/webhooks/site-evento/shop/attack", (req, res) => sw.handleSiteEventoShopAttackPost(client, req, res));
    app.get("/webhooks/site-evento/minigames", (req, res) => sw.handleSiteEventoMinigamesGet(client, req, res));
    app.post("/webhooks/site-evento/crate/open", (req, res) => sw.handleSiteEventoCrateOpenPost(client, req, res));
    app.get("/webhooks/site-evento/accademia", (req, res) => sw.handleSiteEventoAccademiaGet(client, req, res));
    app.post("/webhooks/site-evento/accademia", (req, res) => sw.handleSiteEventoAccademiaPost(client, req, res));
    app.get("/webhooks/site-evento/gara", (req, res) => sw.handleSiteEventoGaraGet(client, req, res));
    app.post("/webhooks/site-evento/gara", (req, res) => sw.handleSiteEventoGaraPost(client, req, res));
    app.get("/webhooks/site-evento/miniera", (req, res) => sw.handleSiteEventoMinieraGet(client, req, res));
    app.post("/webhooks/site-evento/miniera", (req, res) => sw.handleSiteEventoMinieraPost(client, req, res));
    app.get("/webhooks/site-evento/pei", (req, res) => sw.handleSiteEventoPeiGet(client, req, res));
    app.get("/webhooks/site-evento/traditore", (req, res) => sw.handleSiteEventoTraditoreGet(client, req, res));
    app.post("/webhooks/site-evento/traditore", (req, res) => sw.handleSiteEventoTraditorePost(client, req, res));
    app.post("/webhooks/site-evento/phase-end", (req, res) => sw.handleSiteEventoPhaseEndPost(client, req, res));
  }

  app.post("/webhooks/site-boards/me/banner-upload", async (req, res) => {
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
      const out = await uploadBoardBanner(client, {
        accessToken,
        image: body.image || body.dataUrl || body.bannerImage,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards banner-upload:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/me/listings", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listMine(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards me:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsMinePreview1: GET scheda owner per anteprima pending/draft */
  app.get("/webhooks/site-boards/me/listings/:id", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getMyListingById(client, {
        accessToken,
        listingId: req.params?.id,
      });
      return res.status(boardsSoftGetHttpStatus(out)).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards me get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsMineDelete1: DELETE scheda owner (bozza / ritiro) */
  app.delete("/webhooks/site-boards/me/listings/:id", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await deleteMyListing(client, {
        accessToken,
        listingId: req.params?.id,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards me delete:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsOwnerTools1: POST refresh Discord istantaneo (owner) */
  app.post("/webhooks/site-boards/me/listings/:id/refresh", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await refreshMyListing(client, {
        accessToken,
        listingId: req.params?.id,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards me refresh:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/me/claimable-servers", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await listClaimableServers(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards claimable:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/mod/listings", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await modListPending(client, {
        accessToken,
        status: req.query?.status,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards mod list:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  /* boardsRevPreview1: GET anteprima staff per id (pending ok) */
  app.get("/webhooks/site-boards/mod/listings/:id", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getListingForStaffReview(client, {
        accessToken,
        listingId: req.params?.id,
      });
      return res.status(boardsSoftGetHttpStatus(out)).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards mod get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/mod/listings/:id", async (req, res) => {
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
      const out = await modDecide(client, {
        accessToken,
        listingId: req.params?.id,
        decision: body.decision,
        reason: body.reason,
        notes: body.notes,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards mod decide:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  app.get("/webhooks/site-discussion-images/:scope/:docId/:fileName", (req, res) => {
    try {
      require("../../Utils/Web/siteDiscussionImages").serveDiscussionImage(req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-discussion image:", err);
      if (!res.headersSent) res.status(500).end();
    }
  });

  app.get("/webhooks/site-suggestions/files/:suggestionId/:fileName", async (req, res) => {
    try {
      await serveSiteSuggestionFile(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-suggestions file:", err);
      if (!res.headersSent) return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-suggestions", async (req, res) => {
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
  app.post("/webhooks/site-suggestions", async (req, res) => {
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
  app.post("/webhooks/site-suggestions/:suggestionId/comments/:commentId/vote", async (req, res) => {
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
  app.patch("/webhooks/site-suggestions/:suggestionId/comments/:commentId", async (req, res) => {
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
  app.delete("/webhooks/site-suggestions/:suggestionId/comments/:commentId", async (req, res) => {
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
  app.post("/webhooks/site-suggestions/:suggestionId/comments", async (req, res) => {
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
  app.patch("/webhooks/site-suggestions/:suggestionId", async (req, res) => {
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
  app.delete("/webhooks/site-suggestions/:suggestionId", async (req, res) => {
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
  app.post("/webhooks/site-suggestions/:suggestionId/vote", async (req, res) => {
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
  app.post("/webhooks/site-suggestions/:suggestionId/accept", async (req, res) => {
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
  app.post("/webhooks/site-suggestions/:suggestionId/reject", async (req, res) => {
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
  app.patch("/webhooks/site-suggestions/:suggestionId/decision", async (req, res) => {
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
  app.post("/webhooks/site-suggestions/:suggestionId/delete", async (req, res) => {
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

  app.get("/webhooks/site-bot-feedback/files/:feedbackId/:fileName", async (req, res) => {
    try {
      await serveBotFeedbackFile(client, req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback file:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-bot-feedback", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const out = await getBotFeedbackList(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-bot-feedback get:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-bot-feedback", async (req, res) => {
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
  app.patch("/webhooks/site-bot-feedback/:feedbackId", async (req, res) => {
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
  app.delete("/webhooks/site-bot-feedback/:feedbackId", async (req, res) => {
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
  app.post("/webhooks/site-bot-feedback/:feedbackId/comments", async (req, res) => {
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
  app.post("/webhooks/site-bot-feedback/:feedbackId/vote", async (req, res) => {
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
  app.patch("/webhooks/site-bot-feedback/:feedbackId/decision", async (req, res) => {
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
  app.post("/webhooks/site-bot-feedback/:feedbackId/delete", async (req, res) => {
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

  const {
    listDashboardGuilds,
    getDashboardGuildOverview,
    getDashboardAccess,
    verifyDashboardGuildAccess,
  } = require("../../Utils/Web/siteDashboardApi");
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
  } = require("../../Utils/Web/siteDashboardPartnershipApi");
  const {
    getDashboardTickets,
    patchDashboardTickets,
    listDashboardTickets,
    listDashboardTranscripts,
    getDashboardTranscriptHtml,
  } = require("../../Utils/Web/siteDashboardTicketsApi");
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
  } = require("../../Utils/Web/siteDashboardTicketPanelsApi");
  const {
    listDashboardTicketTeams,
    searchDashboardTicketTeamMembers,
    createDashboardTicketTeam,
    updateDashboardTicketTeam,
    deleteDashboardTicketTeam,
  } = require("../../Utils/Web/siteDashboardTicketTeamsApi");
  const {
    listDashboardTicketBlacklist,
    addDashboardTicketBlacklist,
    deleteDashboardTicketBlacklist,
  } = require("../../Utils/Web/siteDashboardTicketBlacklistApi");
  const {
    listDashboardTicketForms,
    createDashboardTicketForm,
    updateDashboardTicketForm,
    deleteDashboardTicketForm,
  } = require("../../Utils/Web/siteDashboardTicketFormsApi");
  const { getDashboardPartnershipLeaderboard } = require("../../Utils/Web/siteDashboardLeaderboardApi");
  const {
    getDashboardGuildSettings,
    patchDashboardGuildSettings,
  } = require("../../Utils/Web/siteDashboardGuildSettingsApi");
  const {
    getDashboardGuildCommands,
    patchDashboardGuildCommands,
  } = require("../../Utils/Web/siteDashboardGuildCommandsApi");
  const {
    listDashboardStaffNotifications,
    markDashboardStaffNotificationsRead,
  } = require("../../Utils/Web/siteDashboardStaffNotificationsApi");
  const {
    listDashboardBotban,
    addDashboardBotban,
    removeDashboardBotban,
  } = require("../../Utils/Web/siteDashboardBotbanApi");
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
  } = require("../../Utils/Web/siteDashboardBotDevApi");
  const {
    getDashboardTenantProfile,
    patchDashboardTenantProfile,
  } = require("../../Utils/Web/siteDashboardTenantProfileApi");
  const { getDashboardAccountSummary } = require("../../Utils/Web/siteDashboardAccountApi");
  const { exportSelfGdprData, eraseSelfGdprData } = require("../../Utils/Web/siteDashboardGdprApi");
  const { getPremiumCredits, spendCreditsForTenantPremium } = require("../Community/premiumCreditsService");
  const { fetchDiscordUser } = require("../../Utils/Web/siteDashboardApi");
  app.get("/webhooks/site-dashboard/access", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/notifications", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/notifications/read", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/botban", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/botban", async (req, res) => {
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
  app.delete("/webhooks/site-dashboard/botban/:kind/:id", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/dev/overview", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/dev/guilds", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/dev/events", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/dev/leave", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/dev/guild-botban", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/dev/owner-botban", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/dev/reset-guild", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/dev/revoke-premium", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/dev/credits", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/dev/credits", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/profile", async (req, res) => {
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
  app.patch("/webhooks/site-dashboard/profile", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/account", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/account/gdpr/export", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/account/gdpr/erase", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/credits", async (req, res) => {
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
  app.post("/webhooks/site-dashboard/credits/spend", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/guilds", async (req, res) => {
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
        const fs = require("fs");
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
  app.get("/webhooks/site-dashboard/guilds/:guildId", async (req, res) => {
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
  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership", async (req, res) => {
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
  app.patch("/webhooks/site-dashboard/guilds/:guildId/partnership", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership/migration", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/leaderboard", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/partnership/migration", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/partnership/migration/undo", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership/blacklist", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/partnership/blacklist", async (req, res) => {
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

  app.delete("/webhooks/site-dashboard/guilds/:guildId/partnership/blacklist/:targetGuildId", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership/managers", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/partnership/history", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/partnership/managers/:userId/points", async (req, res) => {
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

  app.delete("/webhooks/site-dashboard/guilds/:guildId/partnership", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets", async (req, res) => {
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

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/list", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/teams", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/teams/members/search", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/teams", async (req, res) => {
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

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets/teams/:teamId", async (req, res) => {
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

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/teams/:teamId", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/blacklist", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/blacklist", async (req, res) => {
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

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/blacklist/:entryId", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/forms", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/forms", async (req, res) => {
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

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets/forms/:formId", async (req, res) => {
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

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/forms/:formId", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/panels", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/panels", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/panels/sync", async (req, res) => {
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

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets/panels/:panelId", async (req, res) => {
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

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/panels/:panelId", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/panels/:panelId/publish", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/multipanels", async (req, res) => {
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

  app.patch("/webhooks/site-dashboard/guilds/:guildId/tickets/multipanels/:multiId", async (req, res) => {
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

  app.delete("/webhooks/site-dashboard/guilds/:guildId/tickets/multipanels/:multiId", async (req, res) => {
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

  app.post("/webhooks/site-dashboard/guilds/:guildId/tickets/multipanels/:multiId/publish", async (req, res) => {
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

  async function handleDashboardTranscriptsList(req, res) {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/tickets/transcripts/:ticketId", async (req, res) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getDashboardTranscriptHtml(
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/settings", async (req, res) => {
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

  app.patch("/webhooks/site-dashboard/guilds/:guildId/settings", async (req, res) => {
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

  app.get("/webhooks/site-dashboard/guilds/:guildId/commands", async (req, res) => {
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

  app.patch("/webhooks/site-dashboard/guilds/:guildId/commands", async (req, res) => {
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

}

module.exports = { mountSiteWebhookRoutes, isCandidatureWebsiteApiEnabled };
