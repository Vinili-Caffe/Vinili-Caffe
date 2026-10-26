/**
 * Origine API.
 * - Produzione con `USE_API_ORIGIN`: `https://api.viniliecaffe.it`
 * - `next dev` / localhost: rewrite same-origin o fallback www
 * - `API_FETCH_BOOT` in layout: riscrive fetch `/webhooks/` e `/v1/` prima di React
 */
import { API_ORIGIN, SITE_ORIGIN, USE_API_ORIGIN } from "./site";

export function isLocalDevHost(host?: string): boolean {
  const h = String(host ?? (typeof location !== "undefined" ? location.hostname : "")).toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
}

/**
 * Su localhost forziamo www solo se non c’è già un proxy same-origin
 * (rewrite next / serve-out). Imposta `window.__VC_API_FORCE_WWW = true` per forzare.
 */
export function apiOrigin(): string {
  if (typeof location === "undefined") {
    return USE_API_ORIGIN ? API_ORIGIN : "";
  }
  if (isLocalDevHost(location.hostname)) {
    try {
      if ((window as unknown as { __VC_API_FORCE_WWW?: boolean }).__VC_API_FORCE_WWW === true) {
        return SITE_ORIGIN;
      }
    } catch {}
    return "";
  }
  return USE_API_ORIGIN ? API_ORIGIN : "";
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    if (!USE_API_ORIGIN) return path;
    try {
      const u = new URL(path);
      const host = u.hostname.toLowerCase();
      if (
        (host === "www.viniliecaffe.it" || host === "viniliecaffe.it") &&
        (u.pathname.startsWith("/webhooks/") || u.pathname.startsWith("/v1/"))
      ) {
        return `${API_ORIGIN}${u.pathname}${u.search}${u.hash}`;
      }
    } catch {}
    return path;
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = apiOrigin();
  return base ? `${base}${p}` : p;
}

/** Inline boot: patch `fetch` verso API_ORIGIN (solo se flag on). */
export const API_FETCH_BOOT = USE_API_ORIGIN
  ? `(function(){try{var O=${JSON.stringify(API_ORIGIN)};var f=window.fetch.bind(window);function rewrite(u){try{if(!u)return u;if(u.charAt(0)==="/"&&(u.indexOf("/webhooks/")===0||u.indexOf("/v1/")===0))return O+u;var m=u.match(/^https:\\/\\/(www\\.)?viniliecaffe\\.it(\\/(?:webhooks|v1)\\/.*)$/i);if(m)return O+m[2];}catch(e){}return u;}window.fetch=function(i,n){try{if(typeof i==="string"){i=rewrite(i);}else if(typeof Request!=="undefined"&&i instanceof Request){var nu=rewrite(i.url);if(nu!==i.url)i=new Request(nu,i);}}catch(e){}return f(i,n);};}catch(e){}})();`
  : "";
