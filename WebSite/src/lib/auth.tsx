"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isGuestPreview, subscribeViewAs } from "./view-as";

// Login Discord: OAuth implicit (response_type=token). Token in localStorage (fino a 180 giorni).
// Le API del sito lo ricevono come "Authorization: Bearer …".
// State/return OAuth anche in sessionStorage (round-trip Discord / ITP).
//
// Parità oauthPromptNone1 / logoutToOAuth1 / oauthHashKill1 / oauthSession180d1:
// - click login → prompt=none; soft error → consent
// - logout utente → Discord authorize (consent)
// - sessione locale max 180 giorni; Discord può invalidare prima → 401 → logout
// - oauthAutoRenew1: il token di Discord scade molto prima (login implicito, niente refresh):
//   a meno di 1 giorno dalla scadenza, o al primo 401, rinnovo silenzioso con prompt=none
//   (nessuna domanda se si è ancora collegati a Discord nel browser); se Discord chiede conferma → solo logout

const CLIENT_ID = "1329118940110127204";
const SCOPES = "identify guilds";
const TOKEN_KEY = "vc_discord_access_token";
const EXPIRES_KEY = "vc_discord_expires_at";
const USER_KEY = "vc_beta_discord_user";
const STATE_KEY = "vc_beta_oauth_state";
const PENDING_RETURN_KEY = "vc_oauth_pending_return_v1";
const ATTEMPTED_NONE_KEY = "vc_oauth_attempted_none_v1";
/** Boot head (pwa-resume) salva l’hash OAuth qui: su iOS a volte sparisce prima dell’hydrate. */
const OAUTH_HASH_CAPTURE_KEY = "vc_oauth_hash_capture_v1";
const STATE_MAX_AGE_MS = 30 * 60 * 1000;
/** Sessione sito in localStorage: fino a 180 giorni (policy cookie/privacy). */
const SESSION_MAX_MS = 180 * 24 * 60 * 60 * 1000;
/** Scadenza vera del token secondo Discord (expires_in). */
const DISCORD_EXP_KEY = "vc_discord_token_expires_at";
/** Ultimo rinnovo automatico tentato (evita giri continui verso Discord). */
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

/** Token/user in localStorage (persistono tra tab/chiusure, max SESSION_MAX_MS). */
const AUTH_PERSIST_KEYS = new Set([TOKEN_KEY, EXPIRES_KEY, USER_KEY, DISCORD_EXP_KEY]);

function authGet(k: string): string | null {
  if (AUTH_PERSIST_KEYS.has(k)) {
    const ls = read(k);
    if (ls != null) return ls;
    // migrazione one-shot da sessionStorage (periodo oauthSessionStorage1)
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
    ssSet(k, null); // niente doppio storage
    return;
  }
  write(k, v);
}

function storedToken(): string | null {
  const t = authGet(TOKEN_KEY);
  const exp = Number(authGet(EXPIRES_KEY) || 0);
  if (!t || (exp && exp < Date.now() + 60_000)) return null;
  return t;
}

function clearLocalSession() {
  authSet(TOKEN_KEY, null);
  authSet(EXPIRES_KEY, null);
  authSet(USER_KEY, null);
  authSet(DISCORD_EXP_KEY, null);
  ssSet(TOKEN_KEY, null);
  ssSet(EXPIRES_KEY, null);
  ssSet(USER_KEY, null);
}

function normalizeReturnPath(raw?: string | null): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) return "";
  if (s.startsWith("//")) return "";
  // "/\evil.com" o caratteri di controllo: il browser li legge come "//evil.com" → redirect esterno
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

function buildAuthorizeUrl(prompt: OAuthPrompt, statePayload: OAuthStatePayload) {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${location.origin}/`,
    response_type: "token",
    scope: SCOPES,
    prompt,
    state: JSON.stringify(statePayload),
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/** Rinnovo automatico possibile? (non più di uno ogni 10 minuti) */
function canAutoRenew() {
  const last = Number(read(AUTO_RENEW_AT_KEY) || 0);
  return !last || Date.now() - last > AUTO_RENEW_MIN_GAP_MS;
}

function startOAuth(prompt: OAuthPrompt, returnTo?: string, auto = false) {
  const n = crypto.getRandomValues(new Uint32Array(4)).join("");
  const r =
    normalizeReturnPath(returnTo) ||
    normalizeReturnPath(location.pathname + location.search) ||
    "/";
  const t = Date.now();
  const payload: OAuthStatePayload = auto ? { n, r, t, a: 1 } : { n, r, t };
  if (auto) write(AUTO_RENEW_AT_KEY, String(t));
  // session + local: local sopravvive quando Discord apre un contesto in-app diverso
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
  location.assign(buildAuthorizeUrl(prompt, payload));
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

/** Nonce match oppure state con returnPath + timestamp fresco (Safari/ITP / Discord in-app). */
function acceptOAuthState(got: Partial<OAuthStatePayload>, expected: Partial<OAuthStatePayload> | null): boolean {
  if (expected?.n && got.n && expected.n === got.n) return true;
  const ts = Number(got.t || expected?.t || 0);
  const fresh = Number.isFinite(ts) && ts > 0 && Math.abs(Date.now() - ts) <= STATE_MAX_AGE_MS;
  if (fresh && (normalizeReturnPath(got.r) || normalizeReturnPath(expected?.r))) return true;
  return false;
}

export function avatarUrl(u: DiscordUser, size = 64) {
  if (u.avatar) {
    const ext = u.avatar.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=${size}`;
  }
  // avatar predefinito di Discord
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
    if (toLogin) {
      // logoutToOAuth1: subito Discord authorize (consent), return path = pagina corrente
      startOAuth("consent");
    }
  }, []);

  // ritorno da Discord: #access_token=…&expires_in=…&state=…  (oppure #error=…)
  useEffect(() => {
    /* oauthHashCapture1: preferisci location.hash; fallback capture del boot (iOS/PWA). */
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
    let returnTo: string | null = null;
    if (hash.has("access_token") || hash.has("error")) {
      let expected: Partial<OAuthStatePayload> | null = null;
      try {
        expected = parseStateRaw(ssGet(STATE_KEY) || read(STATE_KEY));
      } catch {
        expected = null;
      }
      const got = parseStateRaw(hash.get("state"));

      if (hash.has("error")) {
        const err = String(hash.get("error") || "").toLowerCase();
        const attemptedNone = ssGet(ATTEMPTED_NONE_KEY) === "1" || read(ATTEMPTED_NONE_KEY) === "1";
        const ret = resolveReturnPath(got, expected);
        history.replaceState(null, "", location.pathname + location.search);

        const autoRenew = got.a === 1 || expected?.a === 1;
        if (autoRenew) {
          /* rinnovo automatico non riuscito senza interazione: sessione chiusa, niente schermata di Discord */
          clearOAuthTransient();
          clearLocalSession();
        } else if (attemptedNone && SOFT_OAUTH_ERRORS.has(err)) {
          // oauthPromptNone1: soft error dopo prompt=none → ripeti con consent (stesso return path)
          clearOAuthTransient();
          startOAuth("consent", ret);
          return;
        } else {
          clearOAuthTransient();
          setError(err === "access_denied" ? "Accesso annullato." : "Login non riuscito, riprova.");
        }
      } else if (!acceptOAuthState(got, expected)) {
        clearOAuthTransient();
        setError("Login non valido (sessione scaduta), riprova.");
        history.replaceState(null, "", location.pathname + location.search);
      } else {
        const t = hash.get("access_token")!;
        /* Sessione locale fino a 180gg (policy); Discord può invalidare prima → 401 → logout. */
        authSet(TOKEN_KEY, t);
        authSet(EXPIRES_KEY, String(Date.now() + SESSION_MAX_MS));
        /* scadenza vera di Discord: serve per rinnovarlo prima che scada */
        const expiresIn = Number(hash.get("expires_in") || 0);
        authSet(DISCORD_EXP_KEY, expiresIn > 0 ? String(Date.now() + expiresIn * 1000) : null);
        setToken(t);
        returnTo = resolveReturnPath(got, expected);
        clearOAuthTransient();
        // via il token dall'indirizzo (non deve restare in cronologia)
        history.replaceState(null, "", location.pathname + location.search);
      }

      // Discord rimanda sempre a "/": riporta alla pagina da cui si è partiti (anche da app)
      if (returnTo && returnTo.startsWith("/") && returnTo !== location.pathname + location.search) {
        location.assign(returnTo);
        return;
      }
    }

    /* in transizione: le parti della pagina caricate dopo (bacheca, voti, recensioni…) finiscono prima di agganciarsi
       all'HTML e poi ricevono l'utente; altrimenti React le trova diverse dall'HTML (errore #418 per chi è loggato) */
    const t = storedToken();
    if (!t) {
      authSet(USER_KEY, null);
      startTransition(() => {
        setToken(null);
        setReady(true);
      });
      return;
    }
    /* oauthAutoRenew1: token vicino alla scadenza di Discord → rinnovalo ora, in silenzio */
    const discordExp = Number(authGet(DISCORD_EXP_KEY) || 0);
    if (discordExp && discordExp - Date.now() < AUTO_RENEW_BEFORE_MS && canAutoRenew() && window.top === window.self) {
      startOAuth("none", location.pathname + location.search, true);
      return;
    }
    let cached: DiscordUser | null = null;
    try {
      const c = JSON.parse(authGet(USER_KEY) || "null");
      if (c?.id) cached = c;
    } catch {}
    startTransition(() => {
      setToken(t);
      if (cached) setUser(cached);
    });
    fetch("/webhooks/site-discord-me", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          /* token scaduto per Discord: prima prova a rinnovarlo da solo, poi eventualmente esci */
          if (canAutoRenew() && window.top === window.self) {
            startOAuth("none", location.pathname + location.search, true);
            return;
          }
          return logout({ toLogin: false });
        }
        if (!r.ok) return;
        const me = (await r.json()) as DiscordUser;
        if (me?.id) {
          startTransition(() => setUser(me));
          authSet(USER_KEY, JSON.stringify(me));
        }
      })
      .catch(() => {})
      .finally(() => startTransition(() => setReady(true)));
  }, [logout]);

  const login = useCallback(() => {
    // oauthPromptNone1: click → prompt=none (silenzioso se Discord ha già la sessione)
    startOAuth("none");
  }, []);

  const shownToken = guest ? null : token;
  const shownUser = guest ? null : user;
  const value = useMemo(
    () => ({ ready, token: shownToken, user: shownUser, error, login, logout }),
    [ready, shownToken, shownUser, error, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuori da <AuthProvider>");
  return ctx;
}
