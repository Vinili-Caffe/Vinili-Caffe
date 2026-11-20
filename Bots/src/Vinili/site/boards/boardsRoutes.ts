/** Rotte HTTP delle bacheche e delle bacheche del profilo. */
function mountBoardsRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const { replyJsonEtag, normalizeHeaderSecret } = ctx;
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
    modListPending,
    getListingForStaffReview,
    modDecide,
    clientIp: boardsClientIp,
  } = require("./siteBoardsApi") as typeof import("./siteBoardsApi");
  app.get("/webhooks/site-user-boards", (req?, res?) => {
    const { handleSiteUserBoardsGet } = require("./siteUserBoardsApi") as typeof import("./siteUserBoardsApi");
    return handleSiteUserBoardsGet(client, req, res);
  });
  app.delete("/webhooks/site-user-boards", (req?, res?) => {
    const { handleSiteUserBoardsDelete } = require("./siteUserBoardsApi") as typeof import("./siteUserBoardsApi");
    return handleSiteUserBoardsDelete(client, req, res);
  });

  /* Vinili Boards — /webhooks/site-boards/... */
  /* boardsSchedaMissUi1: miss atteso → HTTP 200 (body.status resta 404) così la console non spammand 404 */
  function boardsSoftGetHttpStatus(out?) {
    const code = Number(out && out.status) || 500;
    if (out && out.ok) return 200;
    const err = String((out && out.error) || "");
    if (err === "not_found" || err === "pending_not_public") return 200;
    return code;
  }

  /* Vetrina in anteprima (publicOpen=false): accesso SOLO all'high staff, su tutte le rotte
     tranne la config pubblica e i file caricati. Niente più bypass con ?allowClosed=1. */
  const highStaffCache = new Map<string, { ok: boolean; at: number }>();
  async function isBoardsHighStaff(token?: string) {
    const t = String(token || "").trim();
    if (!t) return false;
    const hit = highStaffCache.get(t);
    if (hit && Date.now() - hit.at < 60_000) return hit.ok;
    let ok = false;
    try {
      const { assertWebsiteStaffAccess } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
      const { STAFF_HIGH_STAFF_ELIGIBLE_KEYS, memberHasAnyRoleKey } = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");
      const out: any = await assertWebsiteStaffAccess(client, t);
      ok = Boolean(out?.ok && out.member && memberHasAnyRoleKey(out.member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS));
    } catch (_) {
      ok = false;
    }
    if (highStaffCache.size > 500) highStaffCache.clear();
    highStaffCache.set(t, { ok, at: Date.now() });
    return ok;
  }
  app.use("/webhooks/site-boards", async (req?, res?, next?) => {
    try {
      if (req.method === "OPTIONS") return next();
      const sub = String(req.path || "");
      /* l'API dei bot (statistiche con la chiave) funziona anche con la vetrina in anteprima */
      if (sub === "/config" || sub.startsWith("/files/") || sub.startsWith("/api/")) return next();
      const { boardsConfig } = require("./boardReviews") as typeof import("./boardReviews");
      const cfg: any = boardsConfig(client);
      if (!cfg?.enabled || cfg.publicOpen) return next();
      const token = normalizeHeaderSecret(req.headers.authorization);
      if (await isBoardsHighStaff(token)) {
        req.vcBoardsHighStaff = true;
        return next();
      }
      return res.status(403).json({
        ok: false,
        status: 403,
        error: "preview_high_staff_only",
        message: "La Vetrina è in anteprima: accesso riservato all'high staff.",
        publicOpen: false,
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards gate:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/config", async (req?, res?) => {
    try {
      const out = getBoardsPublicConfig(client);
      return replyJsonEtag(req, res, out, { cacheControl: "public, max-age=30" });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards config:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/tags", async (req?, res?) => {
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
  app.get("/webhooks/site-boards/listings", async (req?, res?) => {
    try {
      /* anteprima: lo lascia passare solo il controllo high staff qui sopra */
      const allowClosed = Boolean(req.vcBoardsHighStaff);
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
  app.get("/webhooks/site-boards/listings/:slug", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      /* anteprima: lo lascia passare solo il controllo high staff qui sopra */
      const allowClosed = Boolean(req.vcBoardsHighStaff);
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
  /* ── statistiche della scheda ── */
  app.post("/webhooks/site-boards/listings/:id/track", async (req?, res?) => {
    try {
      const { trackListingEvent } = require("./boardAnalytics") as typeof import("./boardAnalytics");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out: any = await trackListingEvent(
        client,
        { listingId: req.params?.id, event: body.event, source: body.source, lead: body.lead, device: body.device },
        { ip: boardsClientIp(req), headers: req.headers },
      );
      return res.status(Number(out?.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards track:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/me/listings/:id/analytics", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi per vedere le statistiche." });
      const { getListingAnalytics } = require("./boardAnalytics") as typeof import("./boardAnalytics");
      const out: any = await getListingAnalytics(client, {
        accessToken,
        listingId: req.params?.id,
        days: req.query?.days,
        isHighStaff: Boolean(req.vcBoardsHighStaff) || (await isBoardsHighStaff(accessToken)),
      });
      return res.status(Number(out?.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards analytics:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  /* ── voti nel server della scheda (impostazioni della scheda, non del modulo Voti) ── */
  try {
    const { ensureRoleSweep } = require("./boardVoteHook") as typeof import("./boardVoteHook");
    ensureRoleSweep(client);
  } catch (_) {}
  const voteHookRoute = (path: string, run: (H: any, accessToken: string, req: any) => Promise<any>) =>
    async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
        const H = require("./boardVoteHook") as typeof import("./boardVoteHook");
        const out: any = await run(H, accessToken, req);
        return res.status(Number(out?.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.(`[WEBHOOK] site-boards ${path}:`, err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    };
  app.get("/webhooks/site-boards/me/listings/:id/vote-hook", voteHookRoute("vote-hook", (H, accessToken, req) => H.getVoteHook(client, { accessToken, listingId: req.params?.id })));
  app.patch(
    "/webhooks/site-boards/me/listings/:id/vote-hook",
    voteHookRoute("vote-hook save", (H, accessToken, req) => H.saveVoteHook(client, { accessToken, listingId: req.params?.id, config: req.body?.config })),
  );
  app.post(
    "/webhooks/site-boards/me/listings/:id/vote-hook/test",
    voteHookRoute("vote-hook test", (H, accessToken, req) => H.testVoteHook(client, { accessToken, listingId: req.params?.id, config: req.body?.config })),
  );

  /* ── recensioni nel server della scheda ── */
  const reviewHookRoute = (path: string, run: (H: any, accessToken: string, req: any) => Promise<any>) =>
    async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
        const H = require("./boardReviewHook") as typeof import("./boardReviewHook");
        const out: any = await run(H, accessToken, req);
        return res.status(Number(out?.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.(`[WEBHOOK] site-boards ${path}:`, err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    };
  app.get("/webhooks/site-boards/me/listings/:id/review-hook", reviewHookRoute("review-hook", (H, accessToken, req) => H.getReviewHook(client, { accessToken, listingId: req.params?.id })));
  app.patch(
    "/webhooks/site-boards/me/listings/:id/review-hook",
    reviewHookRoute("review-hook save", (H, accessToken, req) => H.saveReviewHook(client, { accessToken, listingId: req.params?.id, config: req.body?.config })),
  );
  app.post(
    "/webhooks/site-boards/me/listings/:id/review-hook/test",
    reviewHookRoute("review-hook test", (H, accessToken, req) => H.testReviewHook(client, { accessToken, listingId: req.params?.id, config: req.body?.config })),
  );

  /* ── schede bot: chiave API, comandi, server di supporto ── */
  try {
    /* ID del bot per la sua scheda (recensioni di /recensioni/) + import una tantum delle recensioni già scritte */
    const markBot = () => {
      if (client?.user?.id) (global as any).__vcBoardsBotId = String(client.user.id);
      const { importSiteBotReviewsOnce } = require("./boardReviews") as typeof import("./boardReviews");
      void importSiteBotReviewsOnce().catch(() => null);
      const { backfillBotIcons } = require("./boardBotApi") as typeof import("./boardBotApi");
      void backfillBotIcons(client).catch(() => null);
    };
    setTimeout(markBot, 30_000).unref?.();
  } catch (_) {}
  const botRoute = (path: string, run: (B: any, accessToken: string, req: any) => Promise<any>) =>
    async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
        const B = require("./boardBotApi") as typeof import("./boardBotApi");
        const out: any = await run(B, accessToken, req);
        return res.status(Number(out?.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.(`[WEBHOOK] site-boards ${path}:`, err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    };
  app.get("/webhooks/site-boards/bot-defaults", botRoute("bot-defaults", (B, accessToken, req) => B.botDefaults(client, { accessToken, botId: req.query?.id })));
  app.get("/webhooks/site-boards/me/listings/:id/bot-api", botRoute("bot-api", (B, accessToken, req) => B.getBotApi(client, { accessToken, listingId: req.params?.id })));
  app.post("/webhooks/site-boards/me/listings/:id/bot-api/key", botRoute("bot-api key", (B, accessToken, req) => B.regenerateBotApiKey(client, { accessToken, listingId: req.params?.id })));
  app.put(
    "/webhooks/site-boards/me/listings/:id/commands",
    botRoute("commands", (B, accessToken, req) => B.saveBotCommands(client, { accessToken, listingId: req.params?.id, commands: req.body?.commands })),
  );
  app.get("/webhooks/site-boards/me/listings/:id/support", botRoute("support list", (B, accessToken, req) => B.listSupportCandidates(client, { accessToken, listingId: req.params?.id })));
  app.put(
    "/webhooks/site-boards/me/listings/:id/support",
    botRoute("support set", (B, accessToken, req) => B.setSupportServer(client, { accessToken, listingId: req.params?.id, serverListingId: req.body?.serverListingId })),
  );
  /* il bot del proprietario manda numero di server e comandi: Authorization: <chiave> */
  app.post("/webhooks/site-boards/api/bots/stats", async (req?, res?) => {
    try {
      const B = require("./boardBotApi") as typeof import("./boardBotApi");
      const raw = String(req.headers.authorization || "").trim().replace(/^Bearers+/i, "");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out: any = await B.postBotStats(client, { key: raw, ...body });
      return res.status(Number(out?.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards api stats:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });

  /* ── bump nel server della scheda (ringraziamento, ruolo, promemoria) ── */
  try {
    const { ensureBumpReminderSweep } = require("./boardBumpHook") as typeof import("./boardBumpHook");
    ensureBumpReminderSweep(client);
  } catch (_) {}
  app.get("/webhooks/site-boards/me/listings/:id/bump-hook", voteHookRoute("bump-hook", async (_H, accessToken, req) => {
    const H = require("./boardBumpHook") as typeof import("./boardBumpHook");
    return H.getBumpHook(client, { accessToken, listingId: req.params?.id });
  }));
  app.patch("/webhooks/site-boards/me/listings/:id/bump-hook", voteHookRoute("bump-hook save", async (_H, accessToken, req) => {
    const H = require("./boardBumpHook") as typeof import("./boardBumpHook");
    return H.saveBumpHook(client, { accessToken, listingId: req.params?.id, config: req.body?.config });
  }));
  app.post("/webhooks/site-boards/me/listings/:id/bump-hook/test", voteHookRoute("bump-hook test", async (_H, accessToken, req) => {
    const H = require("./boardBumpHook") as typeof import("./boardBumpHook");
    return H.testBumpHook(client, { accessToken, listingId: req.params?.id, config: req.body?.config, which: req.body?.which });
  }));

  /* ── passaggio della scheda ad un altro utente ── */
  const transferRoute = (path: string, run: (T: any, accessToken: string, req: any) => Promise<any>) =>
    async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi con Discord." });
        const T = require("./boardTransfer") as typeof import("./boardTransfer");
        const out: any = await run(T, accessToken, req);
        return res.status(Number(out?.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.(`[WEBHOOK] site-boards ${path}:`, err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    };
  app.get("/webhooks/site-boards/me/transfer-user", transferRoute("transfer-user", (T, accessToken, req) => T.lookupTransferUser(client, { accessToken, userId: req.query?.userId })));
  app.get("/webhooks/site-boards/me/transfers", transferRoute("transfers", (T, accessToken) => T.listIncomingTransfers(client, { accessToken })));
  app.post(
    "/webhooks/site-boards/me/listings/:id/transfer",
    transferRoute("transfer", (T, accessToken, req) => T.requestTransfer(client, { accessToken, listingId: req.params?.id, toUserId: req.body?.toUserId })),
  );
  app.delete("/webhooks/site-boards/me/listings/:id/transfer", transferRoute("transfer cancel", (T, accessToken, req) => T.cancelTransfer(client, { accessToken, listingId: req.params?.id })));
  app.post(
    "/webhooks/site-boards/me/transfers/:id/respond",
    transferRoute("transfer respond", (T, accessToken, req) => T.respondTransfer(client, { accessToken, listingId: req.params?.id, accept: req.body?.accept === true })),
  );

  /* schede collegate: bot nel server / server con il bot */
  app.get("/webhooks/site-boards/listings/:id/related", async (req?, res?) => {
    try {
      const { getRelatedListings } = require("./boardRelated") as typeof import("./boardRelated");
      const out: any = await getRelatedListings(client, req.params?.id);
      if (out?.ok) res.setHeader("Cache-Control", "public, max-age=600");
      return res.status(Number(out?.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards related:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.get("/webhooks/site-boards/listings/:id/activity", async (req?, res?) => {
    try {
      const { getListingActivity } = require("./boardActivity") as typeof import("./boardActivity");
      const out: any = await getListingActivity(client, req.params?.id);
      if (out?.ok) res.setHeader("Cache-Control", "public, max-age=600");
      return res.status(Number(out?.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards activity:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-boards/listings", async (req?, res?) => {
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
  app.patch("/webhooks/site-boards/listings/:id", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/submit", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/generate-invite", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/generate-invite", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/guild-defaults", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/probe-link", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/vote-session", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/vote-progress", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/vote", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/vote-reminder", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/bump", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/report", async (req?, res?) => {
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
  app.get("/webhooks/site-boards/listings/:id/reviews", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/listings/:id/reviews", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/reviews/:id/like", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/reviews/:id/report", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/reviews/:id/reply", async (req?, res?) => {
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
  app.get("/webhooks/site-boards/files/:userId/:fileName", async (req?, res?) => {
    try {
      await serveBoardBannerFile(req, res);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-boards banner file:", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    }
  });

  app.post("/webhooks/site-boards/me/banner-upload", async (req?, res?) => {
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
  app.get("/webhooks/site-boards/me/listings", async (req?, res?) => {
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
  app.get("/webhooks/site-boards/me/listings/:id", async (req?, res?) => {
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
  app.delete("/webhooks/site-boards/me/listings/:id", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/me/listings/:id/refresh", async (req?, res?) => {
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
  app.get("/webhooks/site-boards/me/claimable-servers", async (req?, res?) => {
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
  app.get("/webhooks/site-boards/mod/listings", async (req?, res?) => {
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
  app.get("/webhooks/site-boards/mod/listings/:id", async (req?, res?) => {
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
  app.post("/webhooks/site-boards/mod/listings/:id", async (req?, res?) => {
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
}

export = { mountBoardsRoutes };
