/**
 * Attività Discord: l'SDK dà un `code`; qui si scambia col token (secret e/o PKCE).
 * Sul server oggi c’è SITE_OAUTH_PUBLIC_CLIENT=1 senza client secret → serve code_verifier.
 * redirect_uri placeholder delle Activities: https://127.0.0.1 (portale OAuth2 → Redirects).
 * Un solo tentativo: il code OAuth è monouso.
 */
const { discordTokenRequest } = require("./siteAuthSession") as typeof import("./siteAuthSession");

async function handleSiteActivityTokenPost(req?: any, res?: any) {
  try {
    const code = String(req.body?.code || "").trim();
    const codeVerifier = String(req.body?.code_verifier || req.body?.codeVerifier || "").trim();
    if (!/^[A-Za-z0-9_-]{8,256}$/.test(code)) {
      global.logger?.warn?.(`[activity] bad_code len=${code.length}`);
      return res.status(400).json({ ok: false, error: "bad_code" });
    }
    if (!codeVerifier) {
      global.logger?.warn?.("[activity] missing code_verifier (PKCE obbligatorio senza client secret)");
      return res.status(400).json({ ok: false, error: "missing_pkce" });
    }

    const out = await discordTokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://127.0.0.1",
      code_verifier: codeVerifier,
    });
    const token = String(out.json?.access_token || "");
    if (!out.ok || !token) {
      const err = String(out.json?.error || "");
      const desc = String(out.json?.error_description || out.json?.message || "").slice(0, 160);
      global.logger?.warn?.(`[activity] scambio fallito: ${out.status} ${err} ${desc}`);
      return res.status(401).json({
        ok: false,
        error: "exchange_failed",
        discord: err || undefined,
        message: desc || undefined,
      });
    }
    return res.json({ ok: true, access_token: token, expires_in: Number(out.json?.expires_in || 0) || undefined });
  } catch (err: any) {
    global.logger?.warn?.("[activity] token:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

export = { handleSiteActivityTokenPost };
