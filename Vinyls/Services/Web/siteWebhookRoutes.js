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
  const { handleSiteLiveEventGet } = require("../../Utils/Web/siteLiveEventApi");
  const { handleSiteRolesGet } = require("../../Utils/Web/siteRolesApi");
  const { submitSiteRoleRequest, leaveSiteRole, getSiteRoleRequestStates } = require("../../Utils/Web/siteRoleRequestApi");
  const { getRankCardCustomization, getServerAvatarOnly, updateRankCardCustomization, getRankCardPreview, getPublicRankCardPreview } = require("../../Utils/Web/siteRankCardApi");
  const { getCustomProfileCustomization, getCustomProfileGuildEmojis, mutateCustomProfile } = require("../../Utils/Web/siteCustomProfileApi");
  const { getProfileExtras, mutateProfileExtras } = require("../../Utils/Web/siteProfileExtrasApi");
  const { getWelcomePronouns } = require("../../Utils/Web/siteWelcomePronounsApi");
  const { getSiteReviews, submitSiteReview, deleteSiteReview, toggleSiteReviewLike, upsertServerReviewReply } = require("../../Utils/Web/siteReviewsApi");
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
    handleSiteNotificationsGet,
    handleSiteNotificationsMarkReadPost,
    handleSiteNotificationsClearPost,
    handleSiteNotificationsDeletePost,
    handleSiteNotificationsPushVapidGet,
    handleSiteNotificationsPushSubscribePost,
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
  const { handleSiteStaffAccessGet } = require("../../Utils/Web/siteStaffAccessApi");
  const {
    handleSiteConfessionaleGet,
    handleSiteConfessionalePost,
    handleSiteConfessionaleDeletePost,
  } = require("../../Utils/Web/siteConfessionaleApi");
  const { handleSiteStaffPauseGet, handleSiteStaffPausePost } = require("../../Utils/Web/siteStaffPauseApi");
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
    handleSiteWebTicketsTypingPost,
  } = require("../../Utils/Web/siteWebTicketsApi");
  const { handleHogwartsForbiddenBooksClaim, handleHogwartsForbiddenBooksGet, handleHogwartsForbiddenBooksPublicStatus, handleHogwartsHousePointsGet, handleHogwartsPotionsGet, handleHogwartsPotionsPost, handleHogwartsShopGet, handleHogwartsShopPurchasePost, handleHogwartsSortingBootstrap, handleHogwartsSortingEligibility, handleHogwartsSortingSubmit, handleHogwartsSortingAccessGet, handleHogwartsGringottGet, setHogwartsMutationNoStore } = require("../../Utils/Web/siteHogwartsSortingApi");
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch");
  const hogwartsMutationNoStore = (req, res, next) => {
    if (req.method === "POST" || req.method === "PATCH") setHogwartsMutationNoStore(res);
    next();
  };
  // eventoClosedApi1: pagine /evento offline → API Hogwarts spente (file sorgente restano).
  app.use("/webhooks/site-hogwarts-sorting", (req, res, next) => {
    try {
      if (isHogwartsRuntimeDisabled(client)) {
        return res.status(410).json({
          ok: false,
          error: "event_closed",
          message: "Evento Hogwarts concluso.",
        });
      }
      const ev = client?.config?.hogwartsEvent;
      if (ev && typeof ev === "object" && ev.enabled === false) {
        return res.status(410).json({
          ok: false,
          error: "event_closed",
          message: "Evento Hogwarts concluso.",
        });
      }
    } catch (_) {}
    return next();
  });
  app.use("/webhooks/site-hogwarts-sorting", hogwartsMutationNoStore);

  app.get("/webhooks/site-rules", (req, res) => {
    try {
      res.setHeader("Cache-Control", "public, max-age=120");
      return res.json(buildCommunityRulesSitePayload());
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-rules:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno. Riprova tra poco." });
    }
  });
  app.get("/webhooks/site-users", (req, res) => {
    return handleSiteUsersLeaderboardGet(client, req, res);
  });
  app.get("/webhooks/site-vote", (req, res) => {
    return handleSiteVoteGet(client, req, res);
  });
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
  app.post("/webhooks/site-notifications/push/unsubscribe", (req, res) => {
    return handleSiteNotificationsPushUnsubscribePost(client, req, res);
  });
  app.get("/webhooks/site-seratafilm-access", (req, res) => handleSiteSeratafilmAccessGet(client, req, res));
  app.get("/webhooks/site-seratafilm-film", (req, res) => handleSiteSeratafilmFilmGet(client, req, res));
  app.get("/webhooks/site-chrome-prefs", (req, res) => handleSiteChromePrefsGet(client, req, res));
  app.post("/webhooks/site-chrome-prefs", (req, res) => handleSiteChromePrefsPost(client, req, res));
  app.get("/webhooks/site-staff-access", (req, res) => handleSiteStaffAccessGet(client, req, res));
  app.get("/webhooks/site-confessionale", (req, res) => handleSiteConfessionaleGet(client, req, res));
  app.post("/webhooks/site-confessionale", (req, res) => handleSiteConfessionalePost(client, req, res));
  app.post("/webhooks/site-confessionale/:id/delete", (req, res) =>
    handleSiteConfessionaleDeletePost(client, req, res),
  );
  app.get("/webhooks/site-staff-dashboard", (req, res) => handleSiteStaffDashboardGet(client, req, res));
  app.get("/webhooks/site-staff-manage", (req, res) => handleSiteStaffManageGet(client, req, res));
  app.post("/webhooks/site-staff-manage", (req, res) => handleSiteStaffManagePost(client, req, res));
  app.get("/webhooks/site-staff-organico", (req, res) => handleSiteStaffOrganicoGet(client, req, res));
  app.post("/webhooks/site-staff-organico", (req, res) => handleSiteStaffOrganicoPost(client, req, res));
  app.get("/webhooks/site-staff-pause", (req, res) => handleSiteStaffPauseGet(client, req, res));
  app.post("/webhooks/site-staff-pause", (req, res) => handleSiteStaffPausePost(client, req, res));
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
  const { handleSiteStaffPmShopPost } = require("../../Utils/Web/siteStaffPmShopApi");
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
  app.get("/webhooks/site-hogwarts-sorting/bootstrap", (req, res) => handleHogwartsSortingBootstrap(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/access", (req, res) => handleHogwartsSortingAccessGet(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/gringott", (req, res) => handleHogwartsGringottGet(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/points", (req, res) => handleHogwartsHousePointsGet(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/potions", (req, res) => handleHogwartsPotionsGet(client, req, res));
  app.post("/webhooks/site-hogwarts-sorting/potions", (req, res) => handleHogwartsPotionsPost(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/shop", (req, res) => handleHogwartsShopGet(client, req, res));
  app.post("/webhooks/site-hogwarts-sorting/shop/purchase", (req, res) => handleHogwartsShopPurchasePost(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/forbidden-books/status", (req, res) => handleHogwartsForbiddenBooksPublicStatus(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/forbidden-books", (req, res) => handleHogwartsForbiddenBooksGet(client, req, res));
  app.post("/webhooks/site-hogwarts-sorting/forbidden-books", (req, res) => handleHogwartsForbiddenBooksClaim(client, req, res));
  app.get("/webhooks/site-hogwarts-sorting/eligibility", (req, res) =>
    handleHogwartsSortingEligibility(client, req, res),
  );
  app.post("/webhooks/site-hogwarts-sorting", (req, res) => handleHogwartsSortingSubmit(client, req, res));
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
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      const bot = String(req.query?.bot || req.query?.pane || "prod");
      const out = await getWikiHelpAccess(client, { accessToken, bot });
      return res.status(Number(out.status) || 200).json(out);
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
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
      const out = await getWelcomePronouns(client, { accessToken });
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
      const out = await getProfileExtras(client, { accessToken, section });
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
      if (out && out.ok) {
        // cinePolish1: short private cache — safe (auth-aware body via Bearer); browsers still use VcApiCache.
        res.setHeader("Cache-Control", accessToken ? "private, max-age=30" : "public, max-age=45");
      }
      return res.status(Number(out.status) || 500).json(out);
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
      if (out && out.ok) {
        res.setHeader("Cache-Control", accessToken ? "private, max-age=20" : "public, max-age=30");
      }
      return res.status(Number(out.status) || 500).json(out);
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
