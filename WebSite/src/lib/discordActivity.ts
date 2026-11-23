/**
 * Il sito aperto come «Attività» dentro Discord (canali vocali, pulsante 🚀).
 *
 * Discord carica il sito da https://<id app>.discordsays.com passando dal suo proxy:
 * - le richieste al sito (/webhooks/…) vanno già bene;
 * - quelle verso altri siti (anteprime e copertine di Deezer, avatar di Discord, API) vanno riscritte
 *   sugli indirizzi impostati nel portale sviluppatori («URL Mappings»), altrimenti Discord le blocca;
 * - il login passa da Discord: codice → il nostro server lo scambia → token usato come al solito.
 * Lo stato «sta giocando a…» si aggiorna da setSitePresence (lo stesso che legge PreMiD sul sito).
 */
import type { DiscordUser } from "./auth";
import { onSitePresence, type SitePresence } from "./presenceState";

export const ACTIVITY_CLIENT_ID = "1329118940110127204";

/** prefissi da configurare uguali nel portale sviluppatori → URL Mappings */
export const ACTIVITY_URL_MAPPINGS = [
  { prefix: "/dzpreview", target: "cdnt-preview.dzcdn.net" },
  { prefix: "/dzimg", target: "cdn-images.dzcdn.net" },
  { prefix: "/dzimg2", target: "e-cdns-images.dzcdn.net" },
  { prefix: "/discordcdn", target: "cdn.discordapp.com" },
  { prefix: "/vcapi", target: "api.viniliecaffe.it" },
  { prefix: "/vccdn", target: "cdn.viniliecaffe.it" },
  /* fallback se qualche hotlink flagcdn resta nel codice; le bandiere UI usano /flags/ same-origin */
  { prefix: "/flagcdn", target: "flagcdn.com" },
  { prefix: "/qrserver", target: "api.qrserver.com" },
];

const TOKEN_KEY = "vc_activity_token";
const USER_KEY = "vc_activity_user";
const AUTH_TIMEOUT_MS = 12_000;
/** Consent UI in Discord: l'utente può metterci più di 12s */
const AUTH_CONSENT_TIMEOUT_MS = 120_000;

export function isDiscordActivity() {
  if (typeof window === "undefined") return false;
  return /\.discordsays\.com$/i.test(window.location.hostname);
}

type Sdk = import("@discord/embedded-app-sdk").DiscordSDK;
export type ActivityAuthResult =
  | { token: string; user: DiscordUser }
  | { token: null; user: null; error: string };
let sdkPromise: Promise<Sdk> | null = null;
let authPromise: Promise<ActivityAuthResult> | null = null;
let patchedEarly = false;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** riscrive gli indirizzi esterni sugli indirizzi del proxy di Discord */
function mapUrl(raw: string) {
  try {
    const u = new URL(raw, window.location.href);
    if (u.origin === window.location.origin) return raw;
    const m = ACTIVITY_URL_MAPPINGS.find((x) => u.host === x.target || u.hostname === x.target);
    return m ? `${m.prefix}${u.pathname}${u.search}` : raw;
  } catch {
    return raw;
  }
}

/* <img> e <audio> non passano da fetch: si sistemano le loro src appena compaiono o cambiano */
function patchMediaSources() {
  const fix = (el: Element) => {
    if (!(el instanceof HTMLImageElement || el instanceof HTMLMediaElement || el instanceof HTMLSourceElement)) return;
    const src = el.getAttribute("src");
    if (src && /^https?:\/\//i.test(src)) {
      const mapped = mapUrl(src);
      if (mapped !== src) el.setAttribute("src", mapped);
    }
  };
  document.querySelectorAll("img,audio,video,source").forEach(fix);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "attributes") fix(m.target as Element);
      m.addedNodes.forEach((n) => {
        if (n instanceof Element) {
          fix(n);
          n.querySelectorAll?.("img,audio,video,source").forEach(fix);
        }
      });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
  if (desc?.set && desc.get) {
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() {
        return desc.get!.call(this);
      },
      set(v: string) {
        desc.set!.call(this, typeof v === "string" && /^https?:\/\//i.test(v) ? mapUrl(v) : v);
      },
    });
  }
}

/** Appena siamo su discordsays: patch URL prima ancora del ready dell'SDK (logo/CDN). */
export async function bootDiscordActivityProxy() {
  if (!isDiscordActivity() || patchedEarly) return;
  patchedEarly = true;
  try {
    const mod = await import("@discord/embedded-app-sdk");
    mod.patchUrlMappings(ACTIVITY_URL_MAPPINGS, { patchFetch: true, patchWebSocket: true, patchXhr: true });
    patchMediaSources();
  } catch {
    /* senza SDK le immagini CDN restano rotte finché non ci sono le mappature /vccdn */
  }
}

function getSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      try {
        await bootDiscordActivityProxy();
        /* l'SDK legge frame_id e instance_id dall'indirizzo: se una pagina li perde si rimettono */
        const qs = new URLSearchParams(window.location.search);
        if (qs.get("frame_id")) ssSet("vc_activity_qs", window.location.search);
        else {
          const saved = ssGet("vc_activity_qs");
          if (saved && !qs.get("frame_id")) {
            window.history.replaceState(window.history.state, "", window.location.pathname + saved + window.location.hash);
          }
        }
        if (!new URLSearchParams(window.location.search).get("frame_id")) {
          throw new Error("missing_frame_id");
        }
        const hostId = window.location.hostname.match(/^(\d+)\.discordsays\.com$/i)?.[1];
        if (hostId && hostId !== ACTIVITY_CLIENT_ID) {
          throw new Error(`client_id_mismatch:${hostId}`);
        }
        const mod = await import("@discord/embedded-app-sdk");
        const sdk = new mod.DiscordSDK(ACTIVITY_CLIENT_ID);
        await withTimeout(sdk.ready(), AUTH_TIMEOUT_MS, "sdk.ready");
        return sdk;
      } catch (err) {
        /* Non riusare una promise fallita: retry (tap Accedi) deve ripartire */
        sdkPromise = null;
        throw err;
      }
    })();
  }
  return sdkPromise;
}

function ssGet(k: string) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function ssSet(k: string, v: string | null) {
  try {
    if (v == null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
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

async function exchangeCode(code: string, codeVerifier: string): Promise<{ token: string | null; detail: string }> {
  const r = await withTimeout(
    fetch("/webhooks/site-activity/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
    }),
    12_000,
    "exchange",
  ).catch((e) => {
    throw new Error(`exchange_network:${e instanceof Error ? e.message : e}`);
  });
  const j = (await r.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    discord?: string;
    message?: string;
  } | null;
  if (!r.ok || !j?.access_token) {
    return {
      token: null,
      detail: `exchange_http_${r.status}:${j?.discord || j?.error || j?.message || "fail"}`,
    };
  }
  return { token: j.access_token, detail: "ok" };
}

type ActivityAuthOpts = {
  /** Forza un nuovo authorize (es. tap su «Accedi»). */
  force?: boolean;
  /** Default: prova none, poi consent. Con force usa subito consent. */
  prompt?: "none" | "consent";
};

async function authorizeCode(sdk: Sdk, mode: "none" | "consent", pkce: { challenge: string }) {
  /* SDK tipizza prompt solo come 'none' | undefined — undefined = UI di consenso Discord. */
  const ms = mode === "consent" ? AUTH_CONSENT_TIMEOUT_MS : AUTH_TIMEOUT_MS;
  const { code } = await withTimeout(
    sdk.commands.authorize({
      client_id: ACTIVITY_CLIENT_ID,
      response_type: "code",
      state: "",
      ...(mode === "none" ? { prompt: "none" as const } : {}),
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
      /* allineato al getting-started ufficiale Discord Activities */
      scope: ["identify", "guilds", "applications.commands"],
    }),
    ms,
    `authorize:${mode}`,
  );
  return code;
}

/**
 * Login dentro Discord. Timeout duro: se Discord non risponde non lasciamo il sito su «Caricamento…» per sempre.
 * Non usare l’OAuth redirect del sito: nell’iframe Activity non funziona.
 */
export function activityAuth(opts?: ActivityAuthOpts): Promise<ActivityAuthResult> {
  if (opts?.force) authPromise = null;
  if (!authPromise) {
    authPromise = (async () => {
      try {
        const sdk = await getSdk();
        let token = opts?.force ? null : ssGet(TOKEN_KEY);
        if (token) {
          const again = await withTimeout(
            sdk.commands.authenticate({ access_token: token }),
            8_000,
            "authenticate",
          ).catch(() => null);
          if (again?.user) return finish(sdk, token, again.user as unknown as DiscordUser);
          ssSet(TOKEN_KEY, null);
        }
        const prefer = opts?.prompt || (opts?.force ? "consent" : "none");
        const pkce = await makePkce();
        let code: string | null = null;
        try {
          code = await authorizeCode(sdk, prefer, pkce);
        } catch (err) {
          if (prefer === "none") {
            console.warn("[activity] authorize none fallita, ritento con consent:", err);
            code = await authorizeCode(sdk, "consent", pkce);
          } else {
            throw err;
          }
        }
        const ex = await exchangeCode(code, pkce.verifier);
        if (!ex.token) {
          authPromise = null;
          return { token: null, user: null, error: ex.detail };
        }
        token = ex.token;
        const auth = await withTimeout(
          sdk.commands.authenticate({ access_token: token }),
          8_000,
          "authenticate2",
        );
        if (!auth?.user) {
          authPromise = null;
          return { token: null, user: null, error: "authenticate_failed" };
        }
        return finish(sdk, token, auth.user as unknown as DiscordUser);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[activity] auth fallita:", err);
        authPromise = null;
        return { token: null, user: null, error: msg || "auth_failed" };
      }
    })();
  }
  return authPromise;
}

function finish(sdk: Sdk, token: string, raw: DiscordUser): { token: string; user: DiscordUser } {
  const user: DiscordUser = { id: raw.id, username: raw.username, global_name: raw.global_name ?? null, avatar: raw.avatar ?? null };
  ssSet(TOKEN_KEY, token);
  ssSet(USER_KEY, JSON.stringify(user));
  startPresenceBridge(sdk);
  return { token, user };
}

let bridged = false;
function startPresenceBridge(sdk: Sdk) {
  if (bridged) return;
  bridged = true;
  let last = "";
  const push = (p: SitePresence | null) => {
    const activity = p
      ? {
          type: 0,
          details: p.details.slice(0, 128),
          ...(p.state ? { state: p.state.slice(0, 128) } : {}),
          ...(p.startedAt ? { timestamps: { start: Math.floor(p.startedAt) } } : {}),
          assets: {
            large_image: p.image && /^https:\/\//.test(p.image) ? mapUrl(p.image) : mapUrl("https://cdn.viniliecaffe.it/images/logo-disco.png"),
            large_text: p.imageText || "Vinili & Caffè",
          },
        }
      : { type: 0, details: "Su Vinili & Caffè" };
    const key = JSON.stringify(activity);
    if (key === last) return;
    last = key;
    void sdk.commands.setActivity({ activity: activity as never }).catch(() => {});
  };
  onSitePresence(push);
}

/** la prima pagina dell'Attività è il Music Quiz (con lingua, così non c'è un secondo redirect) */
export function activityStartPath(pathname: string) {
  if (!/^\/(?:[a-z]{2}\/)?$/.test(pathname)) return null;
  const m = pathname.match(/^\/([a-z]{2})\//);
  const lang = m?.[1] || "it";
  return `/${lang}/music-quiz/`;
}
