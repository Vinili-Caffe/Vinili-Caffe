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
  } = require("../../Web/siteBoardsApi") as typeof import("../../Web/siteBoardsApi");
  app.get("/webhooks/site-user-boards", (req?, res?) => {
    const { handleSiteUserBoardsGet } = require("../../Web/siteUserBoardsApi") as typeof import("../../Web/siteUserBoardsApi");
    return handleSiteUserBoardsGet(client, req, res);
  });
  app.delete("/webhooks/site-user-boards", (req?, res?) => {
    const { handleSiteUserBoardsDelete } = require("../../Web/siteUserBoardsApi") as typeof import("../../Web/siteUserBoardsApi");
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
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      let allowClosed = String(req.query?.allowClosed || "") === "1";
      if (accessToken && !allowClosed) {
        try {
          const { assertWebsiteStaffAccess } = require("../../Web/siteStaffAccessApi") as typeof import("../../Web/siteStaffAccessApi");
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
  app.get("/webhooks/site-boards/listings/:slug", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      let allowClosed = String(req.query?.allowClosed || "") === "1";
      if (accessToken && !allowClosed) {
        try {
          const { assertWebsiteStaffAccess } = require("../../Web/siteStaffAccessApi") as typeof import("../../Web/siteStaffAccessApi");
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
