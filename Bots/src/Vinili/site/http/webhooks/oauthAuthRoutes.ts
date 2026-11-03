const crypto = require("node:crypto") as typeof import("node:crypto");
const {
  resolveDiscordOauthClientIdForSite,
  resolveDiscordOauthRedirectUriForSite,
  normalizeSiteOAuthReturnPath,
} = require("../verifyOauthPublicUrl") as typeof import("../verifyOauthPublicUrl");

/** Mounted before staff routes (original order). */
function mountDiscordMeWebhookRoutes(app?, _client?, ctx: Record<string, any> = {}) {
  const normalizeHeaderSecret = ctx.normalizeHeaderSecret;
  const { fetchDiscordOAuthMe } = require("../discordOauthMe") as typeof import("../discordOauthMe");

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
}

/** Mounted after web ticket routes (original order). */
function mountOauthStartWebhookRoutes(app?) {
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
}

export = { mountDiscordMeWebhookRoutes, mountOauthStartWebhookRoutes };
