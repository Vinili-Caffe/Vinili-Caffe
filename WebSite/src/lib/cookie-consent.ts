/** Consenso cookie + boot GA / GTM / Clarity / Meta Pixel / AdSense (stessa chiave del sito vecchio). */

export const GA_MEASUREMENT_ID = "G-KPF6425N60";
export const GTM_CONTAINER_ID = "GTM-NTXR52LM";
export const CLARITY_PROJECT_ID = "zeshji2z30";
export const META_PIXEL_ID = "1684468419940079";
export const ADSENSE_CLIENT_ID = "ca-pub-9933035299522072";
export const COOKIE_CONSENT_KEY = "vc_cookie_consent";
/** Legacy del sito vecchio — letto in fallback. */
export const COOKIE_CONSENT_KEY_LEGACY = "vc_cookie_banner_ack_v3";

export type CookieConsentChoice = "accepted" | "rejected";

const CONSENT_MAX_AGE_SEC = 60 * 60 * 24 * 180; // 180 giorni, come /cookie/

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    adsbygoogle?: unknown[];
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: (...args: unknown[]) => void;
    };
    _fbq?: Window["fbq"];
    __vcGtagLoaded?: boolean;
    __vcGtmLoaded?: boolean;
    __vcClarityLoaded?: boolean;
    __vcMetaPixelLoaded?: boolean;
    __vcAdSenseLoaded?: boolean;
  }
}

function normalizeChoice(raw: string | null | undefined): CookieConsentChoice | "" {
  const v = String(raw || "").trim();
  if (v === "accepted" || v === "rejected") return v;
  return "";
}

function readStore(store: Storage | undefined, key: string): CookieConsentChoice | "" {
  try {
    if (!store) return "";
    return normalizeChoice(store.getItem(key));
  } catch {
    return "";
  }
}

function readConsentCookie(): CookieConsentChoice | "" {
  try {
    const raw = String(document.cookie || "");
    for (const key of [COOKIE_CONSENT_KEY, COOKIE_CONSENT_KEY_LEGACY]) {
      if (new RegExp(`(?:^|; )${key}=accepted(?:;|$)`).test(raw)) return "accepted";
      if (new RegExp(`(?:^|; )${key}=rejected(?:;|$)`).test(raw)) return "rejected";
    }
  } catch {
    /* ignore */
  }
  return "";
}

function cookieDomainSuffix(): string {
  try {
    const h = String(window.location.hostname || "").toLowerCase();
    if (!h || h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "";
    if (h.endsWith(".localhost")) return "";
    if (h === "viniliecaffe.it" || h.endsWith(".viniliecaffe.it")) return "; Domain=.viniliecaffe.it";
  } catch {
    /* ignore */
  }
  return "";
}

/** Legge la scelta persistita (localStorage → sessionStorage → cookie). */
export function readCookieConsent(): CookieConsentChoice | "" {
  if (typeof window === "undefined") return "";
  return (
    readStore(window.localStorage, COOKIE_CONSENT_KEY) ||
    readStore(window.sessionStorage, COOKIE_CONSENT_KEY) ||
    readStore(window.localStorage, COOKIE_CONSENT_KEY_LEGACY) ||
    readStore(window.sessionStorage, COOKIE_CONSENT_KEY_LEGACY) ||
    readConsentCookie()
  );
}

export function hasCookieChoice(): boolean {
  const c = readCookieConsent();
  return c === "accepted" || c === "rejected";
}

export function hasAnalyticsConsent(): boolean {
  return readCookieConsent() === "accepted";
}

function writeConsentCookie(name: string, value: string, maxAgeSec: number) {
  try {
    const secure = String(window.location.protocol || "").toLowerCase() === "https:" ? "; Secure" : "";
    const domain = cookieDomainSuffix();
    document.cookie = `${name}=${value}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax${secure}${domain}`;
    /* Host-only: se Domain=.viniliecaffe.it non c’era, serve anche senza Domain. */
    if (domain) {
      document.cookie = `${name}=${value}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax${secure}`;
    }
  } catch {
    /* ignore */
  }
}

/** Persiste accepted|rejected (localStorage + cookie 180g). Non carica i tag da sola. */
export function rememberCookieConsent(choice: CookieConsentChoice): void {
  const value: CookieConsentChoice = choice === "rejected" ? "rejected" : "accepted";
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.removeItem(COOKIE_CONSENT_KEY_LEGACY);
  } catch {
    /* ignore */
  }
  writeConsentCookie(COOKIE_CONSENT_KEY, value, CONSENT_MAX_AGE_SEC);
  writeConsentCookie(COOKIE_CONSENT_KEY_LEGACY, "", 0);
}

/** Azzera LS/SS + cookie (anche Domain=.viniliecaffe.it). */
export function clearCookieConsent(): void {
  if (typeof window === "undefined") return;
  for (const key of [COOKIE_CONSENT_KEY, COOKIE_CONSENT_KEY_LEGACY]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    writeConsentCookie(key, "", 0);
  }
  try {
    window.__vcGtagLoaded = false;
    window.__vcGtmLoaded = false;
    window.__vcClarityLoaded = false;
    window.__vcMetaPixelLoaded = false;
    window.__vcAdSenseLoaded = false;
  } catch {
    /* ignore */
  }
}

/**
 * Abilita Google Analytics / GTM dopo «Accetta».
 * gtag + gtm.js stanno già nel layout; qui si aggiorna il Consent Mode (vale anche per GTM).
 */
export function loadGtagIfConsented(): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  }

  try {
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
    window.dataLayer.push({ event: "vc_consent_granted" });
  } catch {
    /* ignore */
  }

  if (window.__vcGtagLoaded) return;
  window.__vcGtagLoaded = true;

  try {
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      anonymize_ip: true,
      send_page_view: true,
    });
  } catch {
    /* ignore */
  }
}

/** Microsoft Clarity — solo dopo consenso (heatmaps / session replay). */
export function loadClarityIfConsented(): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  if (window.__vcClarityLoaded || document.getElementById("vc-clarity")) {
    window.__vcClarityLoaded = true;
    return;
  }
  window.__vcClarityLoaded = true;

  /* Snippet ufficiale Clarity */
  type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };
  const w = window as unknown as { clarity?: ClarityFn };
  w.clarity =
    w.clarity ||
    function (...args: unknown[]) {
      const fn = w.clarity as ClarityFn;
      (fn.q = fn.q || []).push(args);
    };
  const t = document.createElement("script");
  t.async = true;
  t.id = "vc-clarity";
  t.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
  const y = document.getElementsByTagName("script")[0];
  if (y?.parentNode) y.parentNode.insertBefore(t, y);
  else (document.head || document.documentElement).appendChild(t);
}

/** Meta Pixel — solo dopo consenso. */
export function loadMetaPixelIfConsented(): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  if (window.__vcMetaPixelLoaded) return;
  window.__vcMetaPixelLoaded = true;

  if (document.getElementById("vc-meta-pixel")) {
    try {
      window.fbq?.("track", "PageView");
    } catch {
      /* ignore */
    }
    return;
  }

  const f = window;
  if (!f.fbq) {
    const n = function (...args: unknown[]) {
      const fn = n as NonNullable<Window["fbq"]>;
      if (fn.callMethod) fn.callMethod(...args);
      else (fn.queue = fn.queue || []).push(args);
    } as NonNullable<Window["fbq"]>;
    f.fbq = n;
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
  }

  const s = document.createElement("script");
  s.async = true;
  s.id = "vc-meta-pixel";
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  const first = document.getElementsByTagName("script")[0];
  if (first?.parentNode) first.parentNode.insertBefore(s, first);
  else (document.head || document.documentElement).appendChild(s);

  try {
    window.fbq!("init", META_PIXEL_ID);
    window.fbq!("track", "PageView");
  } catch {
    /* ignore */
  }

  if (!document.getElementById("vc-meta-pixel-noscript")) {
    const img = document.createElement("img");
    img.id = "vc-meta-pixel-noscript";
    img.height = 1;
    img.width = 1;
    img.style.display = "none";
    img.alt = "";
    img.src = `https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`;
    document.body.appendChild(img);
  }
}

/** Google AdSense — solo dopo consenso (monetizzazione / annunci). */
export function loadAdSenseIfConsented(): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  if (window.__vcAdSenseLoaded || document.getElementById("vc-adsense")) {
    window.__vcAdSenseLoaded = true;
    return;
  }
  window.__vcAdSenseLoaded = true;
  window.adsbygoogle = window.adsbygoogle || [];

  const s = document.createElement("script");
  s.async = true;
  s.id = "vc-adsense";
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
  const first = document.getElementsByTagName("script")[0];
  if (first?.parentNode) first.parentNode.insertBefore(s, first);
  else (document.head || document.documentElement).appendChild(s);
}

/** Accetta: abilita GA + Clarity + Meta Pixel + AdSense. */
export function loadAnalyticsIfConsented(): void {
  loadGtagIfConsented();
  loadClarityIfConsented();
  loadMetaPixelIfConsented();
  loadAdSenseIfConsented();
}

/** Nega storage di misurazione / ads (script già caricati restano, ma stop eventi). */
export function revokeAnalyticsConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  } catch {
    /* ignore */
  }
  try {
    window.clarity?.("consent", false);
  } catch {
    /* ignore */
  }
}

/** Page view GA su navigazione client. */
export function trackPageView(path: string): void {
  if (typeof window === "undefined") return;
  if (!window.__vcGtagLoaded || typeof window.gtag !== "function") return;
  if (!hasAnalyticsConsent()) return;
  try {
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  } catch {
    /* ignore */
  }
}

/** PageView Meta su navigazione client (dopo init). */
export function trackMetaPageView(): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  if (!window.__vcMetaPixelLoaded || typeof window.fbq !== "function") return;
  try {
    window.fbq("track", "PageView");
  } catch {
    /* ignore */
  }
}

/** Pagine legali: niente banner (come il sito vecchio). */
export function isCookieBannerSkippedPath(pathname: string): boolean {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  return (
    path === "/cookie" ||
    path === "/privacy" ||
    path === "/terms" ||
    path === "/copyright" ||
    path === "/dati"
  );
}
