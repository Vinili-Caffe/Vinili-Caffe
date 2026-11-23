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
];

const TOKEN_KEY = "vc_activity_token";
const USER_KEY = "vc_activity_user";

export function isDiscordActivity() {
  if (typeof window === "undefined") return false;
  return /\.discordsays\.com$/i.test(window.location.hostname);
}

type Sdk = import("@discord/embedded-app-sdk").DiscordSDK;
let sdkPromise: Promise<Sdk> | null = null;
let authPromise: Promise<{ token: string; user: DiscordUser } | null> | null = null;

/** riscrive gli indirizzi esterni sugli indirizzi del proxy di Discord */
function mapUrl(raw: string) {
  try {
    const u = new URL(raw, window.location.href);
    if (u.origin === window.location.origin) return raw;
    const m = ACTIVITY_URL_MAPPINGS.find((x) => u.host === x.target);
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
  /* new Audio(url) e audio.src = url */
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

function getSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      /* l'SDK legge frame_id e instance_id dall'indirizzo: se una pagina li perde (ricarica, cambio lingua) si rimettono */
      const qs = new URLSearchParams(window.location.search);
      if (qs.get("frame_id")) ssSet("vc_activity_qs", window.location.search);
      else {
        const saved = ssGet("vc_activity_qs");
        if (saved) window.history.replaceState(window.history.state, "", window.location.pathname + saved + window.location.hash);
      }
      const mod = await import("@discord/embedded-app-sdk");
      mod.patchUrlMappings(ACTIVITY_URL_MAPPINGS, { patchFetch: true, patchWebSocket: true, patchXhr: true });
      patchMediaSources();
      const sdk = new mod.DiscordSDK(ACTIVITY_CLIENT_ID);
      await sdk.ready();
      return sdk;
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

async function exchangeCode(code: string): Promise<string | null> {
  const r = await fetch("/webhooks/site-activity/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { access_token?: string } | null;
  return j?.access_token || null;
}

/**
 * Login dentro Discord. Al primo avvio Discord chiede il consenso (una volta), poi il token resta per la sessione:
 * cambiando pagina o ricaricando si riusa senza richiederlo.
 */
export function activityAuth(): Promise<{ token: string; user: DiscordUser } | null> {
  if (!authPromise) {
    authPromise = (async () => {
      try {
        const sdk = await getSdk();
        let token = ssGet(TOKEN_KEY);
        if (token) {
          const again = await sdk.commands.authenticate({ access_token: token }).catch(() => null);
          if (again?.user) return finish(sdk, token, again.user as unknown as DiscordUser);
          ssSet(TOKEN_KEY, null);
        }
        const { code } = await sdk.commands.authorize({
          client_id: ACTIVITY_CLIENT_ID,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify", "guilds", "rpc.activities.write"],
        });
        token = await exchangeCode(code);
        if (!token) return null;
        const auth = await sdk.commands.authenticate({ access_token: token });
        if (!auth?.user) return null;
        return finish(sdk, token, auth.user as unknown as DiscordUser);
      } catch {
        return null;
      }
    })();
  }
  return authPromise;
}

function finish(sdk: Sdk, token: string, raw: DiscordUser) {
  const user: DiscordUser = { id: raw.id, username: raw.username, global_name: raw.global_name ?? null, avatar: raw.avatar ?? null };
  ssSet(TOKEN_KEY, token);
  ssSet(USER_KEY, JSON.stringify(user));
  startPresenceBridge(sdk);
  return { token, user };
}

/* lo stato su Discord segue quello del sito (Music Quiz: quiz, domanda, punti) */
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
            large_image: p.image && /^https:\/\//.test(p.image) ? p.image : "https://cdn.viniliecaffe.it/images/logo-disco.png",
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

/** la prima pagina dell'Attività è il Music Quiz */
export function activityStartPath(pathname: string) {
  return /^\/(?:[a-z]{2}\/)?$/.test(pathname) ? "/music-quiz/" : null;
}
