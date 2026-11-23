"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { apiUrl } from "./api";
import { isGuestPreview, subscribeViewAs } from "./view-as";
import { activityAuth, bootDiscordActivityProxy, isDiscordActivity } from "./discordActivity";

// Login Discord: OAuth authorization code + PKCE quando il backend è pronto;
// altrimenti implicit → bind una tantum in cookie httpOnly (niente AT in localStorage).
// Le API ricevono Authorization: Bearer vc_sess + credentials; il server legge il cookie.

/** Marker opaco: non è un token Discord. Il cookie httpOnly porta l’AT reale. */
export const SESSION_MARKER = "vc_sess";

const CLIENT_ID = "1329118940110127204";
const SCOPES = "identify guilds";
/** Legacy: cancellato al boot (migrazione fuori da localStorage). */
const TOKEN_KEY = "vc_discord_access_token";
const EXPIRES_KEY = "vc_discord_expires_at";
const USER_KEY = "vc_beta_discord_user";
const STATE_KEY = "vc_beta_oauth_state";
const PENDING_RETURN_KEY = "vc_oauth_pending_return_v1";
const ATTEMPTED_NONE_KEY = "vc_oauth_attempted_none_v1";
const OAUTH_HASH_CAPTURE_KEY = "vc_oauth_hash_capture_v1";
const OAUTH_QUERY_CAPTURE_KEY = "vc_oauth_query_capture_v1";
const PKCE_VERIFIER_KEY = "vc_oauth_pkce_verifier_v1";
const SESSION_FLAG_KEY = "vc_site_session_v1";
const STATE_MAX_AGE_MS = 30 * 60 * 1000;
const SESSION_MAX_MS = 180 * 24 * 60 * 60 * 1000;
const DISCORD_EXP_KEY = "vc_discord_token_expires_at";
const AUTO_RENEW_AT_KEY = "vc_oauth_auto_renew_at_v1";
const AUTO_RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;
const AUTO_RENEW_MIN_GAP_MS = 10 * 60 * 1000;

export type DiscordUser = { id: string; username: string; global_name?: string | null; avatar?: string | null };

type OAuthPrompt = "none" | "consent";

type LogoutOpts = {
  /** Se true (default): dopo il clear apri Discord authorize con prompt=consent. False per 401/sessione scaduta. */
  toLogin?: boolean;
};

type AuthState = {
  ready: boolean;
  token: string | null;
  user: DiscordUser | null;
  error: string | null;
  /** Sempre prompt=none; se Discord chiede interazione si ripete con consent. */
  login: () => void;
  logout: (opts?: LogoutOpts) => void;
};

/** a = rinnovo automatico (se Discord chiede conferma non si insiste) */
type OAuthStatePayload = { n: string; r: string; t: number; a?: 1 };

const AuthContext = createContext<AuthState | null>(null);

const SOFT_OAUTH_ERRORS = new Set(["login_required", "consent_required", "interaction_required"]);

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};

const ssGet = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const ssSet = (k: string, v: string | null) => {
  try {
    if (v == null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {}
};

const AUTH_PERSIST_KEYS = new Set([EXPIRES_KEY, USER_KEY, DISCORD_EXP_KEY, SESSION_FLAG_KEY]);

function authGet(k: string): string | null {
  if (AUTH_PERSIST_KEYS.has(k)) {
    const ls = read(k);
    if (ls != null) return ls;
    const ss = ssGet(k);
    if (ss != null) {
      write(k, ss);
      ssSet(k, null);
      return ss;
    }
    return null;
  }
  return read(k);
}

function authSet(k: string, v: string | null) {
  if (AUTH_PERSIST_KEYS.has(k)) {
    write(k, v);
    ssSet(k, null);
    return;
  }
  write(k, v);
}

function wipeLegacyAccessToken() {
  write(TOKEN_KEY, null);
  ssSet(TOKEN_KEY, null);
}

function clearLocalSession() {
  wipeLegacyAccessToken();
  authSet(EXPIRES_KEY, null);
  authSet(USER_KEY, null);
  authSet(DISCORD_EXP_KEY, null);
  authSet(SESSION_FLAG_KEY, null);
  ssSet(TOKEN_KEY, null);
  ssSet(EXPIRES_KEY, null);
  ssSet(USER_KEY, null);
  ssSet(PKCE_VERIFIER_KEY, null);
  write(PKCE_VERIFIER_KEY, null);
}

function storedSessionAlive(): boolean {
  if (authGet(SESSION_FLAG_KEY) !== "1") return false;
  const exp = Number(authGet(EXPIRES_KEY) || 0);
  if (exp && exp < Date.now() + 60_000) return false;
  return true;
}

function b64urlBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64urlBytes(raw);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64urlBytes(new Uint8Array(digest)) };
}

export function isSessionMarker(token?: string | null): boolean {
  return String(token || "").trim() === SESSION_MARKER;
}

/**
 * 401 dalle API del sito: svuota la sessione locale e prova rinnovo silenzioso.
 */
export function handleUnauthorizedSession() {
  clearLocalSession();
  void fetch(apiUrl("/webhooks/site-auth/logout"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  }).catch(() => {});
  try {
    if (typeof window !== "undefined" && canAutoRenew() && window.top === window.self) {
      void startOAuth("none", location.pathname + location.search, true);
    }
  } catch {
    /* ignore */
  }
}

function normalizeReturnPath(raw?: string | null): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) return "";
  if (s.startsWith("//")) return "";
  if (/[\\\u0000-\u001f]/.test(s)) return "";
  try {
    if (new URL(s, location.origin).origin !== location.origin) return "";
  } catch {
    return "";
  }
  return s.slice(0, 512);
}

function parseStateRaw(raw: string | null): Partial<OAuthStatePayload> {
  const s = String(raw || "").trim();
  if (!s) return {};
  try {
    let decoded = s;
    try {
      if (/%[0-9A-Fa-f]{2}/.test(s)) decoded = decodeURIComponent(s);
    } catch {
      decoded = s;
    }
    try {
      if (/%[0-9A-Fa-f]{2}/.test(decoded)) decoded = decodeURIComponent(decoded);
    } catch {
      /* keep */
    }
    const obj = JSON.parse(decoded) as Partial<OAuthStatePayload>;
    return {
      n: String(obj?.n || "").trim(),
      r: normalizeReturnPath(obj?.r),
      t: Number(obj?.t || 0),
      ...(obj?.a === 1 ? { a: 1 as const } : {}),
    };
  } catch {
    return { r: normalizeReturnPath(s) };
  }
}

let pkceMetaCache: { at: number; pkce: boolean } | null = null;

async function fetchPkceReady(): Promise<boolean> {
  if (pkceMetaCache && Date.now() - pkceMetaCache.at < 60_000) return pkceMetaCache.pkce;
  try {
    const r = await fetch(apiUrl("/webhooks/site-auth/oauth/meta"), { cache: "no-store", credentials: "include" });
    const d = (await r.json().catch(() => null)) as { pkce?: boolean } | null;
    const pkce = Boolean(d?.pkce);
    pkceMetaCache = { at: Date.now(), pkce };
    return pkce;
  } catch {
    return false;
  }
}

async function buildAuthorizeUrl(prompt: OAuthPrompt, statePayload: OAuthStatePayload, pkce: boolean) {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${location.origin}/`,
    response_type: pkce ? "code" : "token",
    scope: SCOPES,
    prompt,
    state: JSON.stringify(statePayload),
  });
  if (pkce) {
    const { verifier, challenge } = await makePkce();
    ssSet(PKCE_VERIFIER_KEY, verifier);
    write(PKCE_VERIFIER_KEY, verifier);
    q.set("code_challenge", challenge);
    q.set("code_challenge_method", "S256");
  } else {
    ssSet(PKCE_VERIFIER_KEY, null);
    write(PKCE_VERIFIER_KEY, null);
  }
  return `https://discord.com/oauth2/authorize?${q}`;
}

function canAutoRenew() {
  const last = Number(read(AUTO_RENEW_AT_KEY) || 0);
  return !last || Date.now() - last > AUTO_RENEW_MIN_GAP_MS;
}

async function startOAuth(prompt: OAuthPrompt, returnTo?: string, auto = false) {
  const n = crypto.getRandomValues(new Uint32Array(4)).join("");
  const r =
    normalizeReturnPath(returnTo) ||
    normalizeReturnPath(location.pathname + location.search) ||
    "/";
  const t = Date.now();
  const payload: OAuthStatePayload = auto ? { n, r, t, a: 1 } : { n, r, t };
  if (auto) write(AUTO_RENEW_AT_KEY, String(t));
  ssSet(STATE_KEY, JSON.stringify(payload));
  write(STATE_KEY, JSON.stringify(payload));
  write(PENDING_RETURN_KEY, r);
  ssSet(PENDING_RETURN_KEY, r);
  if (prompt === "none") {
    ssSet(ATTEMPTED_NONE_KEY, "1");
    write(ATTEMPTED_NONE_KEY, "1");
  } else {
    ssSet(ATTEMPTED_NONE_KEY, null);
    write(ATTEMPTED_NONE_KEY, null);
  }
  const pkce = await fetchPkceReady();
  location.assign(await buildAuthorizeUrl(prompt, payload, pkce));
}

function resolveReturnPath(got: Partial<OAuthStatePayload>, expected: Partial<OAuthStatePayload> | null): string {
  return (
    normalizeReturnPath(got.r) ||
    normalizeReturnPath(expected?.r) ||
    normalizeReturnPath(ssGet(PENDING_RETURN_KEY)) ||
    normalizeReturnPath(read(PENDING_RETURN_KEY)) ||
    "/"
  );
}

function clearOAuthTransient() {
  ssSet(STATE_KEY, null);
  write(STATE_KEY, null);
  ssSet(PENDING_RETURN_KEY, null);
  write(PENDING_RETURN_KEY, null);
  ssSet(ATTEMPTED_NONE_KEY, null);
  write(ATTEMPTED_NONE_KEY, null);
}

function acceptOAuthState(
  got: Partial<OAuthStatePayload>,
  expected: Partial<OAuthStatePayload> | null,
  bothStoragesAgree = false,
): boolean {
  if (got.n && expected?.n) {
    return got.n === expected.n;
  }
  if (!bothStoragesAgree) return false;
  const ts = Number(got.t || expected?.t || 0);
  const fresh = Number.isFinite(ts) && ts > 0 && Math.abs(Date.now() - ts) <= STATE_MAX_AGE_MS;
  if (fresh && (normalizeReturnPath(got.r) || normalizeReturnPath(expected?.r))) return true;
  return false;
}

function readExpectedState(): { expected: Partial<OAuthStatePayload> | null; bothStoragesAgree: boolean } {
  try {
    const ssRaw = ssGet(STATE_KEY);
    const lsRaw = read(STATE_KEY);
    return {
      expected: parseStateRaw(ssRaw || lsRaw),
      bothStoragesAgree: Boolean(ssRaw && lsRaw && ssRaw === lsRaw),
    };
  } catch {
    return { expected: null, bothStoragesAgree: false };
  }
}

async function bindAccessToken(accessToken: string, expiresIn: number): Promise<{ user: DiscordUser; expiresAt: number } | null> {
  const r = await fetch(apiUrl("/webhooks/site-auth/session/bind"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, expires_in: expiresIn > 0 ? expiresIn : undefined }),
  });
  const d = (await r.json().catch(() => null)) as { ok?: boolean; user?: DiscordUser; expiresAt?: number } | null;
  if (!r.ok || !d?.ok || !d.user?.id) return null;
  wipeLegacyAccessToken();
  authSet(SESSION_FLAG_KEY, "1");
  authSet(EXPIRES_KEY, String(Date.now() + SESSION_MAX_MS));
  authSet(DISCORD_EXP_KEY, d.expiresAt ? String(d.expiresAt) : expiresIn > 0 ? String(Date.now() + expiresIn * 1000) : null);
  authSet(USER_KEY, JSON.stringify(d.user));
  return { user: d.user, expiresAt: Number(d.expiresAt) || 0 };
}

async function exchangeAuthCode(code: string): Promise<{ user: DiscordUser; expiresAt: number } | null> {
  const verifier = ssGet(PKCE_VERIFIER_KEY) || read(PKCE_VERIFIER_KEY) || "";
  if (!verifier) return null;
  const r = await fetch(apiUrl("/webhooks/site-auth/oauth/exchange"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      redirect_uri: `${location.origin}/`,
    }),
  });
  ssSet(PKCE_VERIFIER_KEY, null);
  write(PKCE_VERIFIER_KEY, null);
  const d = (await r.json().catch(() => null)) as { ok?: boolean; user?: DiscordUser; expiresAt?: number } | null;
  if (!r.ok || !d?.ok || !d.user?.id) return null;
  wipeLegacyAccessToken();
  authSet(SESSION_FLAG_KEY, "1");
  authSet(EXPIRES_KEY, String(Date.now() + SESSION_MAX_MS));
  authSet(DISCORD_EXP_KEY, d.expiresAt ? String(d.expiresAt) : null);
  authSet(USER_KEY, JSON.stringify(d.user));
  return { user: d.user, expiresAt: Number(d.expiresAt) || 0 };
}

export function avatarUrl(u: DiscordUser, size = 64) {
  if (u.avatar) {
    const ext = u.avatar.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=${size}`;
  }
  const idx = Number((BigInt(u.id) >> BigInt(22)) % BigInt(6));
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

export const displayName = (u: DiscordUser) => u.global_name || u.username;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guest = useSyncExternalStore(subscribeViewAs, isGuestPreview, () => false);

  const logout = useCallback((opts?: LogoutOpts) => {
    const toLogin = opts?.toLogin !== false;
    clearLocalSession();
    setToken(null);
    setUser(null);
    try {
      sessionStorage.removeItem("vc_activity_token");
      sessionStorage.removeItem("vc_activity_user");
    } catch {
      /* ignore */
    }
    void fetch(apiUrl("/webhooks/site-auth/logout"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    }).catch(() => {});
    if (toLogin) {
      if (isDiscordActivity()) {
        void activityAuth({ force: true, prompt: "consent" }).then((got) => {
          if (got.token && got.user) {
            startTransition(() => {
              setToken(got.token);
              setUser(got.user);
              setReady(true);
              setError(null);
            });
          } else {
            startTransition(() => {
              setReady(true);
              setError(`Login Activity: ${"error" in got ? got.error : "fallito"}`);
            });
          }
        });
        return;
      }
      void startOAuth("consent");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const finishAnonymous = () => {
      if (cancelled) return;
      authSet(USER_KEY, null);
      authSet(SESSION_FLAG_KEY, null);
      startTransition(() => {
        setToken(null);
        setUser(null);
        setReady(true);
      });
    };

    const applySession = (me: DiscordUser) => {
      if (cancelled) return;
      wipeLegacyAccessToken();
      authSet(SESSION_FLAG_KEY, "1");
      authSet(USER_KEY, JSON.stringify(me));
      if (!authGet(EXPIRES_KEY)) authSet(EXPIRES_KEY, String(Date.now() + SESSION_MAX_MS));
      startTransition(() => {
        setToken(SESSION_MARKER);
        setUser(me);
        setReady(true);
      });
    };

    (async () => {
      /* Dentro Discord (Attività): login con l'SDK — niente location.replace (READY una sola volta per iframe). */
      if (isDiscordActivity()) {
        void bootDiscordActivityProxy();
        const got = await activityAuth();
        if (cancelled) return;
        if (got.token && got.user) {
          startTransition(() => {
            setToken(got.token);
            setUser(got.user);
            setReady(true);
          });
        } else {
          if ("error" in got && got.error) {
            console.warn("[activity] boot auth:", got.error);
            startTransition(() => setError(`Activity: ${got.error}`));
          }
          finishAnonymous();
        }
        return;
      }

      /* Migrazione one-shot: AT legacy in localStorage → cookie httpOnly, poi wipe. */
      try {
        const legacy = String(read(TOKEN_KEY) || ssGet(TOKEN_KEY) || "").trim();
        if (legacy && legacy !== SESSION_MARKER && legacy.length > 20) {
          const expAt = Number(authGet(DISCORD_EXP_KEY) || 0);
          const expiresIn = expAt > Date.now() ? Math.floor((expAt - Date.now()) / 1000) : 0;
          const bound = await bindAccessToken(legacy, expiresIn);
          wipeLegacyAccessToken();
          if (bound && !cancelled) {
            startTransition(() => {
              setToken(SESSION_MARKER);
              setUser(bound.user);
              setReady(true);
            });
            return;
          }
        } else {
          wipeLegacyAccessToken();
        }
      } catch {
        wipeLegacyAccessToken();
      }

      /* Query callback (code flow) oppure capture boot. */
      let query = new URLSearchParams();
      try {
        query = new URLSearchParams(location.search || "");
      } catch {
        query = new URLSearchParams();
      }
      const queryLooksOauth = query.has("code") || query.has("error");
      if (!queryLooksOauth) {
        try {
          const cap = String(ssGet(OAUTH_QUERY_CAPTURE_KEY) || "").replace(/^\?/, "");
          if (/(?:^|&)(code|error)=/.test(cap)) query = new URLSearchParams(cap);
        } catch {
          /* ignore */
        }
      }
      try {
        ssSet(OAUTH_QUERY_CAPTURE_KEY, null);
      } catch {
        /* ignore */
      }

      /* Hash callback (implicit legacy / fallback). */
      let rawHash = "";
      try {
        rawHash = String(location.hash || "").replace(/^#/, "");
      } catch {
        rawHash = "";
      }
      const hashLooksOauth = /(?:^|&)(access_token|error)=/.test(rawHash);
      if (!hashLooksOauth) {
        try {
          const cap = String(ssGet(OAUTH_HASH_CAPTURE_KEY) || "").replace(/^#/, "");
          if (/(?:^|&)(access_token|error)=/.test(cap)) rawHash = cap;
        } catch {
          /* ignore */
        }
      }
      try {
        ssSet(OAUTH_HASH_CAPTURE_KEY, null);
      } catch {
        /* ignore */
      }
      const hash = new URLSearchParams(rawHash);

      if (query.has("code") || query.has("error") || hash.has("access_token") || hash.has("error")) {
        const { expected, bothStoragesAgree } = readExpectedState();
        const got = parseStateRaw(query.get("state") || hash.get("state"));
        let returnTo: string | null = null;

        if (query.has("error") || hash.has("error")) {
          const err = String(query.get("error") || hash.get("error") || "").toLowerCase();
          const attemptedNone = ssGet(ATTEMPTED_NONE_KEY) === "1" || read(ATTEMPTED_NONE_KEY) === "1";
          const ret = resolveReturnPath(got, expected);
          history.replaceState(null, "", location.pathname + stripOauthSearch(location.search));

          const autoRenew = got.a === 1 || expected?.a === 1;
          if (autoRenew) {
            clearOAuthTransient();
            clearLocalSession();
          } else if (attemptedNone && SOFT_OAUTH_ERRORS.has(err)) {
            clearOAuthTransient();
            await startOAuth("consent", ret);
            return;
          } else {
            clearOAuthTransient();
            setError(err === "access_denied" ? "Accesso annullato." : "Login non riuscito, riprova.");
          }
        } else if (!acceptOAuthState(got, expected, bothStoragesAgree)) {
          clearOAuthTransient();
          setError("Login non valido (sessione scaduta), riprova.");
          history.replaceState(null, "", location.pathname + stripOauthSearch(location.search));
        } else if (query.has("code")) {
          const bound = await exchangeAuthCode(String(query.get("code") || ""));
          history.replaceState(null, "", location.pathname + stripOauthSearch(location.search));
          clearOAuthTransient();
          if (!bound) {
            setError("Login non riuscito, riprova.");
          } else {
            returnTo = resolveReturnPath(got, expected);
            if (!cancelled) {
              startTransition(() => {
                setToken(SESSION_MARKER);
                setUser(bound.user);
              });
            }
          }
        } else if (hash.has("access_token")) {
          const t = hash.get("access_token")!;
          const expiresIn = Number(hash.get("expires_in") || 0);
          history.replaceState(null, "", location.pathname + location.search);
          const bound = await bindAccessToken(t, expiresIn);
          clearOAuthTransient();
          if (!bound) {
            setError("Login non riuscito, riprova.");
          } else {
            returnTo = resolveReturnPath(got, expected);
            if (!cancelled) {
              startTransition(() => {
                setToken(SESSION_MARKER);
                setUser(bound.user);
              });
            }
          }
        }

        if (returnTo && returnTo.startsWith("/") && returnTo !== location.pathname + location.search) {
          location.assign(returnTo);
          return;
        }
        if (!cancelled) startTransition(() => setReady(true));
        return;
      }

      /* Sessione cookie già attiva? */
      if (!storedSessionAlive()) {
        finishAnonymous();
        return;
      }

      const discordExp = Number(authGet(DISCORD_EXP_KEY) || 0);
      if (discordExp && discordExp - Date.now() < AUTO_RENEW_BEFORE_MS && canAutoRenew() && window.top === window.self) {
        /* Con refresh server-side il cookie si rinnova da solo; prompt=none solo se manca molto. */
        const skew = discordExp - Date.now();
        if (skew < 2 * 60 * 60 * 1000) {
          await startOAuth("none", location.pathname + location.search, true);
          return;
        }
      }

      let cached: DiscordUser | null = null;
      try {
        const c = JSON.parse(authGet(USER_KEY) || "null");
        if (c?.id) cached = c;
      } catch {}
      if (cached && !cancelled) {
        startTransition(() => {
          setToken(SESSION_MARKER);
          setUser(cached);
        });
      }

      try {
        const r = await fetch(apiUrl("/webhooks/site-auth/session"), {
          credentials: "include",
          cache: "no-store",
          headers: { Authorization: `Bearer ${SESSION_MARKER}`, Accept: "application/json" },
        });
        if (r.status === 401) {
          clearLocalSession();
          if (canAutoRenew() && window.top === window.self) {
            await startOAuth("none", location.pathname + location.search, true);
            return;
          }
          if (!cancelled) logout({ toLogin: false });
          else finishAnonymous();
          return;
        }
        if (!r.ok) {
          if (cached) {
            if (!cancelled) startTransition(() => setReady(true));
            return;
          }
          finishAnonymous();
          return;
        }
        const d = (await r.json()) as { user?: DiscordUser };
        if (d?.user?.id) applySession(d.user);
        else if (cached) {
          if (!cancelled) startTransition(() => setReady(true));
        } else finishAnonymous();
      } catch {
        if (cached) {
          if (!cancelled) startTransition(() => setReady(true));
        } else finishAnonymous();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [logout]);

  const login = useCallback(() => {
    /* Nell'Activity Discord l'OAuth redirect del sito non funziona: va l'SDK Embedded. */
    if (isDiscordActivity()) {
      startTransition(() => {
        setReady(false);
        setError(null);
      });
      void activityAuth({ force: true, prompt: "consent" }).then((got) => {
        if (got.token && got.user) {
          startTransition(() => {
            setToken(got.token);
            setUser(got.user);
            setReady(true);
            setError(null);
          });
        } else {
          startTransition(() => {
            setToken(null);
            setUser(null);
            setReady(true);
            setError(`Login Activity: ${"error" in got ? got.error : "non riuscito"}`);
          });
        }
      });
      return;
    }
    void startOAuth("none");
  }, []);

  const shownToken = guest ? null : token;
  const shownUser = guest ? null : user;
  const value = useMemo(
    () => ({ ready, token: shownToken, user: shownUser, error, login, logout }),
    [ready, shownToken, shownUser, error, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function stripOauthSearch(search: string): string {
  try {
    const u = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    ["code", "state", "error", "error_description", "access_token", "token_type", "expires_in"].forEach((k) => u.delete(k));
    const out = u.toString();
    return out ? `?${out}` : "";
  } catch {
    return "";
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuori da <AuthProvider>");
  return ctx;
}
