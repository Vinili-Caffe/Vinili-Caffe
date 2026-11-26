const crypto = require("node:crypto") as typeof import("node:crypto");
const {
  resolveDiscordOauthClientIdForSite,
  resolveDiscordOauthRedirectUriForSite,
} = require("./verifyOauthPublicUrl") as typeof import("./verifyOauthPublicUrl");
const { DISCORD_OAUTH_UA } = require("./discordOauthMe") as typeof import("./discordOauthMe");

/** Cookie httpOnly: Discord AT/RT cifrati. Mai esposto a JS. */
const COOKIE_NAME = "vc_site_sess";
/** Marker Bearer inviato dal browser (non è un token Discord). */
const SESSION_MARKER = "vc_sess";
const SESSION_MAX_MS = 180 * 24 * 60 * 60 * 1000;
const REFRESH_SKEW_MS = 6 * 60 * 60 * 1000;

type SessionPayload = {
  v: 1;
  at: string;
  rt?: string;
  exp: number;
  iat: number;
};

let cachedSessionKey: Buffer | null = null;
let warnedMissingSessionSecret = false;

function resolveSessionSecret(): Buffer {
  if (cachedSessionKey) return cachedSessionKey;
  const dedicated = String(process.env.SITE_SESSION_SECRET || "").trim();
  if (dedicated) {
    cachedSessionKey = crypto.createHash("sha256").update(dedicated, "utf8").digest();
    return cachedSessionKey;
  }
  const oauth = String(
    process.env.DISCORD_OAUTH_CLIENT_SECRET || process.env.WEBSITE_OAUTH_CLIENT_SECRET || "",
  ).trim();
  if (oauth) {
    cachedSessionKey = crypto.createHash("sha256").update(oauth, "utf8").digest();
    return cachedSessionKey;
  }
  /* Mai dal bot token. Fallback efimero: sessioni valide solo fino al restart. */
  if (!warnedMissingSessionSecret) {
    warnedMissingSessionSecret = true;
    console.error(
      "[SITE-AUTH] SITE_SESSION_SECRET mancante: usa un secret dedicato (non DISCORD_TOKEN). Sessioni efimere fino al set.",
    );
  }
  cachedSessionKey = crypto.randomBytes(32);
  return cachedSessionKey;
}

function resolveOauthClientSecret(): string {
  return String(process.env.DISCORD_OAUTH_CLIENT_SECRET || process.env.WEBSITE_OAUTH_CLIENT_SECRET || "").trim();
}

function oauthPkceReady(): boolean {
  if (resolveOauthClientSecret()) return true;
  return String(process.env.SITE_OAUTH_PUBLIC_CLIENT || "").trim() === "1";
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function sealSession(payload: SessionPayload): string {
  const key = resolveSessionSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(payload), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${b64url(iv)}.${b64url(ct)}.${b64url(tag)}`;
}

function openSession(token: string): SessionPayload | null {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const iv = fromB64url(parts[0]);
    const ct = fromB64url(parts[1]);
    const tag = fromB64url(parts[2]);
    if (iv.length !== 12 || !ct.length || tag.length !== 16) return null;
    const key = resolveSessionSecret();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const obj = JSON.parse(pt) as SessionPayload;
    if (!obj || obj.v !== 1 || !String(obj.at || "").trim()) return null;
    if (Number(obj.iat) && Date.now() - Number(obj.iat) > SESSION_MAX_MS) return null;
    return {
      v: 1,
      at: String(obj.at).trim(),
      rt: obj.rt ? String(obj.rt).trim() : undefined,
      exp: Number(obj.exp) || 0,
      iat: Number(obj.iat) || Date.now(),
    };
  } catch {
    return null;
  }
}

function parseCookieHeader(raw?): Record<string, string> {
  const out: Record<string, string> = {};
  const s = String(raw || "");
  if (!s) return out;
  for (const part of s.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const k = part.slice(0, eq).trim();
    let v = part.slice(eq + 1).trim();
    if (!k) continue;
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep */
    }
    out[k] = v;
  }
  return out;
}

function readSessionFromRequest(req?): SessionPayload | null {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  return openSession(raw);
}

function cookieDomainForHost(): string | "" {
  const fromEnv = String(process.env.SITE_SESSION_COOKIE_DOMAIN || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const base = String(process.env.WEBSITE_PUBLIC_URL || process.env.WEBSITE_PUBLIC_ORIGIN || "https://www.viniliecaffe.it")
      .trim()
      .replace(/\/+$/, "");
    const host = new URL(base).hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1") return "";
    if (host.endsWith("viniliecaffe.it")) return ".viniliecaffe.it";
    return host.startsWith("www.") ? `.${host.slice(4)}` : `.${host}`;
  } catch {
    return ".viniliecaffe.it";
  }
}

function buildSetCookie(value: string, maxAgeSec: number, clear = false): string {
  const parts = [
    `${COOKIE_NAME}=${clear ? "" : encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  const domain = cookieDomainForHost();
  if (domain) parts.push(`Domain=${domain}`);
  if (clear) parts.push("Max-Age=0");
  else parts.push(`Max-Age=${Math.max(60, Math.floor(maxAgeSec))}`);
  return parts.join("; ");
}

function appendSetCookie(res: any, line: string) {
  if (!res || !line) return;
  const prev = res.getHeader?.("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", line);
    return;
  }
  if (Array.isArray(prev)) {
    res.setHeader("Set-Cookie", [...prev, line]);
    return;
  }
  res.setHeader("Set-Cookie", [String(prev), line]);
}

function setSessionCookie(res: any, payload: SessionPayload) {
  const sealed = sealSession(payload);
  const maxAgeMs = Math.min(SESSION_MAX_MS, Math.max(60_000, (payload.exp || Date.now() + SESSION_MAX_MS) - Date.now() + 7 * 24 * 60 * 60 * 1000));
  appendSetCookie(res, buildSetCookie(sealed, maxAgeMs / 1000, false));
}

function clearSessionCookie(res?) {
  appendSetCookie(res, buildSetCookie("", 0, true));
}

function isSessionMarker(raw?): boolean {
  const s = String(raw || "").trim();
  if (!s) return false;
  const bare = s.toLowerCase().startsWith("bearer ") ? s.slice(7).trim() : s;
  return bare === SESSION_MARKER;
}

async function discordTokenRequest(body: Record<string, string>) {
  const clientId = resolveDiscordOauthClientIdForSite();
  const secret = resolveOauthClientSecret();
  const form = new URLSearchParams({ ...body, client_id: clientId });
  if (secret) form.set("client_secret", secret);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": DISCORD_OAUTH_UA,
  };
  if (secret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const r = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers,
      body: form.toString(),
      signal: ac.signal,
    } as any);
    const json = (await r.json().catch(() => ({}))) as Record<string, any>;
    return { ok: r.ok, status: r.status, json };
  } finally {
    clearTimeout(t);
  }
}

async function exchangeAuthorizationCode(opts: {
  code: string;
  codeVerifier: string;
  redirectUri?: string;
}) {
  const redirectUri = String(opts.redirectUri || resolveDiscordOauthRedirectUriForSite()).trim();
  if (!oauthPkceReady()) {
    return { ok: false as const, error: "oauth_not_configured", message: "PKCE non configurato (manca DISCORD_OAUTH_CLIENT_SECRET o SITE_OAUTH_PUBLIC_CLIENT=1)." };
  }
  const out = await discordTokenRequest({
    grant_type: "authorization_code",
    code: String(opts.code || "").trim(),
    redirect_uri: redirectUri,
    code_verifier: String(opts.codeVerifier || "").trim(),
  });
  if (!out.ok || !out.json?.access_token) {
    return {
      ok: false as const,
      error: String(out.json?.error || "token_exchange_failed"),
      message: String(out.json?.error_description || out.json?.message || "Scambio codice OAuth fallito."),
      status: out.status,
    };
  }
  return {
    ok: true as const,
    accessToken: String(out.json.access_token),
    refreshToken: out.json.refresh_token ? String(out.json.refresh_token) : "",
    expiresIn: Number(out.json.expires_in) || 604800,
  };
}

async function refreshAccessToken(refreshToken: string) {
  if (!oauthPkceReady() || !refreshToken) return null;
  const out = await discordTokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!out.ok || !out.json?.access_token) return null;
  return {
    accessToken: String(out.json.access_token),
    refreshToken: out.json.refresh_token ? String(out.json.refresh_token) : refreshToken,
    expiresIn: Number(out.json.expires_in) || 604800,
  };
}

function sessionFromTokens(accessToken: string, expiresInSec: number, refreshToken?: string): SessionPayload {
  const now = Date.now();
  const expMs = now + Math.max(60, Number(expiresInSec) || 604800) * 1000;
  return {
    v: 1,
    at: String(accessToken).trim(),
    rt: refreshToken ? String(refreshToken).trim() : undefined,
    exp: expMs,
    iat: now,
  };
}

/**
 * Se c’è cookie di sessione e Authorization manca / è marker / scaduto lato client,
 * inietta Bearer Discord reale (eventuale refresh silenzioso).
 */
function mountSiteAuthSessionMiddleware(app?) {
  app.use(async (req?, res?, next?) => {
    try {
      const pathStr = String(req.originalUrl || req.url || req.path || "").split("?")[0];
      if (!pathStr.startsWith("/webhooks/site-") && !pathStr.startsWith("/v1/site-")) {
        return next();
      }
      let sess = readSessionFromRequest(req);
      if (!sess) return next();

      if (sess.rt && sess.exp && sess.exp - Date.now() < REFRESH_SKEW_MS) {
        const refreshed = await refreshAccessToken(sess.rt);
        if (refreshed) {
          sess = sessionFromTokens(refreshed.accessToken, refreshed.expiresIn, refreshed.refreshToken);
          setSessionCookie(res, sess);
        }
      }

      const authRaw = String(req.headers.authorization || "").trim();
      const bare = authRaw.toLowerCase().startsWith("bearer ") ? authRaw.slice(7).trim() : authRaw;
      if (!bare || bare === SESSION_MARKER || bare.length < 20) {
        req.headers.authorization = `Bearer ${sess.at}`;
      }
    } catch (err) {
      global.logger?.warn?.("[SITE-AUTH] session middleware:", err?.message || err);
    }
    return next();
  });
}

export = {
  COOKIE_NAME,
  discordTokenRequest,
  SESSION_MARKER,
  SESSION_MAX_MS,
  oauthPkceReady,
  resolveOauthClientSecret,
  readSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  isSessionMarker,
  exchangeAuthorizationCode,
  sessionFromTokens,
  mountSiteAuthSessionMiddleware,
  resolveDiscordOauthRedirectUriForSite,
  resolveDiscordOauthClientIdForSite,
};
