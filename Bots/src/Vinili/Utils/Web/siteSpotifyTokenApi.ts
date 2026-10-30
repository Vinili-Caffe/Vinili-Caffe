const SPOTIFY_ACCOUNTS_TOKEN_URL = "https://accounts.spotify.com/api/token";

function spotifySeratafilmClientId() {
  return String(process.env.SPOTIFY_SERATAFILM_CLIENT_ID || "").trim();
}

function spotifySeratafilmRedirectAllowlist() {
  return String(process.env.SPOTIFY_SERATAFILM_REDIRECT_URI || "")
    .split(",")
    .map((s?) => String(s || "").trim())
    .filter(Boolean);
}

async function spotifyTokenFormPost(bodyParams?) {
  const body = new URLSearchParams(bodyParams);
  const res = await fetch(SPOTIFY_ACCOUNTS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function handleSiteSpotifyTokenExchangePost(req?, res?) {
  try {
    const serverClientId = spotifySeratafilmClientId();
    if (!serverClientId) {
      return res.status(503).json({ ok: false, error: "misconfigured", message: "SPOTIFY_SERATAFILM_CLIENT_ID mancante." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const code = String(body.code || "").trim();
    const codeVerifier = String(body.codeVerifier || "").trim();
    const redirectUri = String(body.redirectUri || "").trim();
    const clientId = String(body.clientId || "").trim();
    if (!code || !codeVerifier || !redirectUri) {
      return res.status(400).json({ ok: false, error: "bad_request", message: "Parametri code, codeVerifier e redirectUri richiesti." });
    }
    if (clientId !== serverClientId) {
      return res.status(400).json({ ok: false, error: "client_mismatch", message: "clientId non valido." });
    }
    const allowed = spotifySeratafilmRedirectAllowlist();
    if (!allowed.length) {
      return res.status(503).json({
        ok: false,
        error: "misconfigured",
        message: "SPOTIFY_SERATAFILM_REDIRECT_URI mancante sul server.",
      });
    }
    if (!allowed.includes(redirectUri)) {
      return res.status(400).json({ ok: false, error: "invalid_redirect_uri", message: "redirectUri non consentito." });
    }
    const out = await spotifyTokenFormPost({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: serverClientId,
      code_verifier: codeVerifier,
    });
    if (!out.ok) {
      global.logger?.warn?.("[WEBHOOK] site-spotify-token exchange:", out.status, out.json?.error || out.json);
      return res.status(400).json({
        ok: false,
        error: "spotify_token",
        message: String(out.json?.error_description || out.json?.error || "Scambio token fallito."),
      });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      access_token: out.json.access_token,
      expires_in: out.json.expires_in,
      refresh_token: out.json.refresh_token,
      token_type: out.json.token_type,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-spotify-token exchange:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteSpotifyTokenRefreshPost(req?, res?) {
  try {
    const serverClientId = spotifySeratafilmClientId();
    if (!serverClientId) {
      return res.status(503).json({ ok: false, error: "misconfigured", message: "SPOTIFY_SERATAFILM_CLIENT_ID mancante." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const refreshToken = String(body.refreshToken || "").trim();
    const clientId = String(body.clientId || "").trim();
    if (!refreshToken) {
      return res.status(400).json({ ok: false, error: "bad_request", message: "refreshToken richiesto." });
    }
    if (clientId !== serverClientId) {
      return res.status(400).json({ ok: false, error: "client_mismatch", message: "clientId non valido." });
    }
    const out = await spotifyTokenFormPost({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: serverClientId,
    });
    if (!out.ok) {
      global.logger?.warn?.("[WEBHOOK] site-spotify-token refresh:", out.status, out.json?.error || out.json);
      return res.status(401).json({
        ok: false,
        error: "spotify_refresh",
        message: String(out.json?.error_description || out.json?.error || "Refresh fallito."),
      });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      access_token: out.json.access_token,
      expires_in: out.json.expires_in,
      refresh_token: out.json.refresh_token || refreshToken,
      token_type: out.json.token_type,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-spotify-token refresh:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteSpotifyTokenExchangePost,
  handleSiteSpotifyTokenRefreshPost,
};