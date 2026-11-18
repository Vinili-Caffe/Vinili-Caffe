/**
 * Origine API.
 * - Produzione: same-origin `/webhooks/*` (rewrite Vercel) se `USE_API_ORIGIN` è false
 * - Con `USE_API_ORIGIN`: fetch diretto su `https://api.viniliecaffe.it` (CORS)
 * - `API_FETCH_BOOT`: credentials include + (opz.) rewrite verso API_ORIGIN
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

/** Inline boot: patch `fetch` verso API_ORIGIN + credentials include (cookie httpOnly sessione).
 *  status-kuma resta pubblico (ACAO *) → credentials omit, altrimenti CORS blocca. */
export const API_FETCH_BOOT = USE_API_ORIGIN
  ? `(function(){try{var O=${JSON.stringify(API_ORIGIN)};var f=window.fetch.bind(window);function rewrite(u){try{if(!u)return u;if(u.charAt(0)==="/"&&(u.indexOf("/webhooks/")===0||u.indexOf("/v1/")===0||u.indexOf("/status-kuma/")===0))return O+u;var m=u.match(/^https:\\/\\/(www\\.)?viniliecaffe\\.it(\\/(?:webhooks|v1|status-kuma)\\/.*)$/i);if(m)return O+m[2];}catch(e){}return u;}function isStatusKuma(u){try{return/\\/status-kuma\\//.test(String(u||""));}catch(e){return false}}function needsCreds(u){try{if(!u||isStatusKuma(u))return false;if(u.indexOf(O)===0)return true;if(u.charAt(0)==="/"&&(u.indexOf("/webhooks/")===0||u.indexOf("/v1/")===0))return true;return/\\/(webhooks|v1)\\//.test(u);}catch(e){return false}}window.fetch=function(i,n){try{var u="";if(typeof i==="string"){u=i;i=rewrite(i);u=i;}else if(typeof Request!=="undefined"&&i instanceof Request){var nu=rewrite(i.url);u=nu;if(nu!==i.url)i=new Request(nu,i);}else{u=String(i&&i.url||"");}if(isStatusKuma(u)){n=Object.assign({},n||{});n.credentials="omit";}else if(needsCreds(u)){n=Object.assign({},n||{});if(n.credentials==null||n.credentials==="omit"||n.credentials==="same-origin")n.credentials="include";}}catch(e){}return f(i,n);};}catch(e){}})();`
  : `(function(){try{var f=window.fetch.bind(window);function isStatusKuma(u){try{return/\\/status-kuma\\//.test(String(u||""));}catch(e){return false}}function needsCreds(u){try{if(!u||isStatusKuma(u))return false;return/\\/(webhooks|v1)\\//.test(u);}catch(e){return false}}window.fetch=function(i,n){try{var u=typeof i==="string"?i:(i&&i.url)||"";if(isStatusKuma(u)){n=Object.assign({},n||{});n.credentials="omit";}else if(needsCreds(u)){n=Object.assign({},n||{});if(n.credentials==null||n.credentials==="omit"||n.credentials==="same-origin")n.credentials="include";}}catch(e){}return f(i,n);};}catch(e){}})();`;
