const crypto = require("node:crypto") as typeof import("node:crypto");
const {
  resolveDiscordOauthClientIdForSite,
  resolveDiscordOauthRedirectUriForSite,
  normalizeSiteOAuthReturnPath,
} = require("../verifyOauthPublicUrl") as typeof import("../verifyOauthPublicUrl");
const {
  COOKIE_NAME,
  SESSION_MARKER,
  oauthPkceReady,
  readSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  exchangeAuthorizationCode,
  sessionFromTokens,
  resolveOauthClientSecret,
} = require("../siteAuthSession") as typeof import("../siteAuthSession");

/** Mounted before staff routes (original order). */
function mountDiscordMeWebhookRoutes(app?, _client?, ctx: Record<string, any> = {}) {
  const normalizeHeaderSecret = ctx.normalizeHeaderSecret;
  const { fetchDiscordOAuthMe } = require("../discordOauthMe") as typeof import("../discordOauthMe");

  /* discordMeProxy1: browser → same-origin proxy (evita CORS/500 discord.com in console) */
  app.get("/webhooks/site-discord-me", async (req?, res?) => {
    try {
      /* apiJankCut1: private short TTL — allinea process cache oauth (~90s), meno RTT Discord */
      res.set("Cache-Control", "private, max-age=45, stale-while-revalidate=120");
      res.set("Vary", "Authorization, Cookie");
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "401" });
      }
      const out = await fetchDiscordOAuthMe(accessToken, { timeoutMs: 9000 });
      if (!out.ok || !out.me) {
        if (Number(out.status) === 401) clearSessionCookie(res);
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

function mountSiteAuthOauthRoutes(app?, _client?, ctx: Record<string, any> = {}) {
  const normalizeHeaderSecret = ctx.normalizeHeaderSecret;
  const { fetchDiscordOAuthMe } = require("../discordOauthMe") as typeof import("../discordOauthMe");

  app.get("/webhooks/site-auth/oauth/meta", (_req?, res?) => {
    res.set("Cache-Control", "no-store");
    const pkce = oauthPkceReady();
    return res.status(200).json({
      ok: true,
      pkce,
      marker: SESSION_MARKER,
      cookie: COOKIE_NAME,
      redirectUri: resolveDiscordOauthRedirectUriForSite(),
      clientId: resolveDiscordOauthClientIdForSite(),
      hasClientSecret: Boolean(resolveOauthClientSecret()),
    });
  });

  /** Authorization code + PKCE → cookie httpOnly (nessun AT in JSON). */
  app.post("/webhooks/site-auth/oauth/exchange", async (req?, res?) => {
    try {
      res.set("Cache-Control", "no-store");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const code = String(body.code || "").trim();
      const codeVerifier = String(body.code_verifier || body.codeVerifier || "").trim();
      const redirectUri = String(body.redirect_uri || body.redirectUri || "").trim() || resolveDiscordOauthRedirectUriForSite();
      if (!code || !codeVerifier) {
        return res.status(400).json({ ok: false, error: "missing_params", message: "code e code_verifier richiesti." });
      }
      const exchanged = await exchangeAuthorizationCode({ code, codeVerifier, redirectUri });
      if (!exchanged.ok) {
        return res.status(Number(exchanged.status) || 400).json({
          ok: false,
          error: exchanged.error,
          message: exchanged.message,
        });
      }
      const sess = sessionFromTokens(exchanged.accessToken, exchanged.expiresIn, exchanged.refreshToken);
      const meOut = await fetchDiscordOAuthMe(sess.at, { timeoutMs: 9000 });
      if (!meOut.ok || !meOut.me) {
        return res.status(Number(meOut.status) || 503).json({
          ok: false,
          error: meOut.error || "discord_unreachable",
          message: meOut.message || "Impossibile verificare l'utente Discord.",
        });
      }
      setSessionCookie(res, sess);
      return res.status(200).json({
        ok: true,
        marker: SESSION_MARKER,
        user: meOut.me,
        expiresAt: sess.exp,
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-auth oauth/exchange:", err);
      return res.status(503).json({ ok: false, error: "internal", message: "503" });
    }
  });

  /**
   * Migrazione / fallback implicit: il browser manda l’AT una sola volta;
   * il server lo mette in cookie httpOnly e il client lo cancella da localStorage.
   */
  app.post("/webhooks/site-auth/session/bind", async (req?, res?) => {
    try {
      res.set("Cache-Control", "no-store");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const accessToken =
        String(body.access_token || body.accessToken || "").trim() ||
        normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken || accessToken === SESSION_MARKER) {
        return res.status(400).json({ ok: false, error: "missing_token", message: "access_token richiesto." });
      }
      const expiresIn = Number(body.expires_in || body.expiresIn || 0);
      const meOut = await fetchDiscordOAuthMe(accessToken, { timeoutMs: 9000 });
      if (!meOut.ok || !meOut.me) {
        return res.status(Number(meOut.status) || 401).json({
          ok: false,
          error: meOut.error || "invalid_token",
          message: meOut.message || "Token Discord non valido.",
        });
      }
      const sess = sessionFromTokens(accessToken, expiresIn > 0 ? expiresIn : 604800);
      setSessionCookie(res, sess);
      return res.status(200).json({
        ok: true,
        marker: SESSION_MARKER,
        user: meOut.me,
        expiresAt: sess.exp,
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-auth session/bind:", err);
      return res.status(503).json({ ok: false, error: "internal", message: "503" });
    }
  });

  app.get("/webhooks/site-auth/session", async (req?, res?) => {
    try {
      res.set("Cache-Control", "no-store");
      const sess = readSessionFromRequest(req);
      const accessToken = sess?.at || normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken || accessToken === SESSION_MARKER) {
        return res.status(401).json({ ok: false, error: "missing_session", marker: SESSION_MARKER });
      }
      const meOut = await fetchDiscordOAuthMe(accessToken, { timeoutMs: 9000 });
      if (!meOut.ok || !meOut.me) {
        if (Number(meOut.status) === 401) clearSessionCookie(res);
        return res.status(Number(meOut.status) || 503).json({
          ok: false,
          error: meOut.error || "discord_unreachable",
          message: meOut.message || "503",
        });
      }
      return res.status(200).json({
        ok: true,
        marker: SESSION_MARKER,
        user: meOut.me,
        expiresAt: sess?.exp || null,
      });
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-auth session:", err);
      return res.status(503).json({ ok: false, error: "internal", message: "503" });
    }
  });

  app.post("/webhooks/site-auth/logout", (_req?, res?) => {
    res.set("Cache-Control", "no-store");
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
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
    const usePkce = oauthPkceReady();
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: usePkce ? "code" : "token",
      scope: "identify",
      prompt: "none",
      state,
    });
    let verifierScript = "";
    if (usePkce) {
      const verifier = b64url(crypto.randomBytes(32));
      const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
      q.set("code_challenge", challenge);
      q.set("code_challenge_method", "S256");
      verifierScript =
        "try{sessionStorage.setItem(\"vc_oauth_pkce_verifier_v1\"," +
        JSON.stringify(verifier) +
        ");}catch(e){}";
    }
    const authorizeUrl = `https://discord.com/oauth2/authorize?${q.toString()}`;
    const nonceJson = JSON.stringify(nonce);
    const urlJson = JSON.stringify(authorizeUrl);
    const html =
      "<!DOCTYPE html><html lang=\"it\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>Discord</title></head><body>" +
      "<script>(function(){var n=" +
      nonceJson +
      ";try{sessionStorage.setItem(\"vc_oauth_state_nonce_v1\",n);sessionStorage.setItem(\"vc_oauth_attempted_none_v1\",\"1\");}catch(e){}" +
      verifierScript +
      "location.replace(" +
      urlJson +
      ");})();<\/script></body></html>";
    res.status(200).type("text/html; charset=utf-8").send(html);
  });
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export = { mountDiscordMeWebhookRoutes, mountOauthStartWebhookRoutes, mountSiteAuthOauthRoutes };
