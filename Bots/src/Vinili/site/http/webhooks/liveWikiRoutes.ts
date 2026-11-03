function mountLiveWikiWebhookRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const normalizeHeaderSecret = ctx.normalizeHeaderSecret;
  const replyJsonEtag = ctx.replyJsonEtag;
  const { handleSiteLiveEventGet } = require("../siteLiveEventApi") as typeof import("../siteLiveEventApi");

  app.get("/webhooks/site-live-event", (req?, res?) => {
    return handleSiteLiveEventGet(client, req, res);
  });
  app.get("/webhooks/site-twitch-live", (req?, res?) => {
    const { handleSiteTwitchLiveGet } = require("../siteTwitchLiveApi") as typeof import("../siteTwitchLiveApi");
    return handleSiteTwitchLiveGet(client, req, res);
  });
  app.get("/webhooks/site-twitch-live/thumb", (req?, res?) => {
    const { handleSiteTwitchLiveThumb } = require("../siteTwitchLiveApi") as typeof import("../siteTwitchLiveApi");
    return handleSiteTwitchLiveThumb(client, req, res);
  });
  app.get("/webhooks/site-wiki-help", async (req?, res?) => {
    try {
      const { getWikiHelpAccess } = require("../siteWikiHelpApi") as typeof import("../siteWikiHelpApi");
      const { parseViewAsFromReq } = require("../siteViewAsPreview") as typeof import("../siteViewAsPreview");
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
}

export = { mountLiveWikiWebhookRoutes };
