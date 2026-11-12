/** Consenso cookie + boot Google Analytics (stessa chiave del sito vecchio). */

export const GA_MEASUREMENT_ID = "G-KPF6425N60";
export const COOKIE_CONSENT_KEY = "vc_cookie_consent";
/** Legacy del sito vecchio — letto in fallback. */
export const COOKIE_CONSENT_KEY_LEGACY = "vc_cookie_banner_ack_v3";

export type CookieConsentChoice = "accepted" | "rejected";

const CONSENT_MAX_AGE_SEC = 60 * 60 * 24 * 180; // 180 giorni, come /cookie/

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __vcGtagLoaded?: boolean;
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

/** Persiste accepted|rejected (localStorage + cookie 180g). Non carica gtag da sola. */
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
  } catch {
    /* ignore */
  }
}

/**
 * Carica gtag/js SOLO se consenso accettato.
 * Mai prima del consenso; idempotente.
 */
export function loadGtagIfConsented(): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  if (window.__vcGtagLoaded) return;
  window.__vcGtagLoaded = true;

  window.dataLayer = window.dataLayer || [];
  // Stesso pattern dello snippet Google: coda dataLayer prima dello script.
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    anonymize_ip: true,
    send_page_view: true,
  });

  if (document.getElementById("vc-gtag")) return;

  const s = document.createElement("script");
  s.async = true;
  s.id = "vc-gtag";
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  (document.head || document.documentElement).appendChild(s);
}

/** Page view su navigazione client (dopo che gtag è già bootato). */
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
