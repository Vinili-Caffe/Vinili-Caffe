function mountProfileWebhookRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const normalizeHeaderSecret = ctx.normalizeHeaderSecret;
  const { getRankCardCustomization, getServerAvatarOnly, updateRankCardCustomization, getRankCardPreview, getPublicRankCardPreview } = require("../siteRankCardApi") as typeof import("../siteRankCardApi");
  const { getSiteWrapped } = require("../siteWrappedApi") as typeof import("../siteWrappedApi");
  const { getCustomProfileCustomization, getCustomProfileGuildEmojis, mutateCustomProfile } = require("../siteCustomProfileApi") as typeof import("../siteCustomProfileApi");
  const { getProfileExtras, mutateProfileExtras } = require("../siteProfileExtrasApi") as typeof import("../siteProfileExtrasApi");
  const { getWelcomePronouns } = require("../siteWelcomePronounsApi") as typeof import("../siteWelcomePronounsApi");
  const { handleSiteGuildJoinPost } = require("../siteGuildJoinApi") as typeof import("../siteGuildJoinApi");

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
      const { parseViewAsFromReq } = require("../siteViewAsPreview") as typeof import("../siteViewAsPreview");
      const out = await getProfileExtras(client, {
        accessToken,
        section,
        viewAs: parseViewAsFromReq(req),
        guild: String(req.query?.guild || "").trim(),
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
}

export = { mountProfileWebhookRoutes };
