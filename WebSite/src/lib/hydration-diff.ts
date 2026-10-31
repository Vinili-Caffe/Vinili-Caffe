/**
 * Errore React #418 (pagina del server diversa da quella del browser): in produzione React non dice
 * quale testo cambia. Uno script in fondo al <body> salva il testo di <main> come arriva dal server;
 * all'errore lo si confronta con quello disegnato dal browser e si manda al registro solo il punto
 * dove i due iniziano a differire (pochi caratteri, niente altro).
 */

/* a HTML letto tutto (le parti in streaming sono già al loro posto); se React arriva prima, niente confronto */
export const SSR_TEXT_SNAPSHOT_BOOT =
  'try{var s=function(){if(window.__VC_SSR_MAIN!=null)return;var m=document.querySelector("main");window.__VC_SSR_MAIN=m?m.textContent||"":""};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",s,{once:true}):s()}catch(e){}';

const AROUND = 60;

export function isHydrationMismatch(message: string) {
  return /Minified React error #4(18|19|23|25)\b|Hydration failed|hydrat/i.test(String(message || ""));
}

/** Primo punto in cui il testo del server e quello del browser differiscono, oppure null. */
export function describeHydrationDiff(): string | null {
  try {
    const ssr = String((window as unknown as { __VC_SSR_MAIN?: string }).__VC_SSR_MAIN ?? "");
    const live = document.querySelector("main")?.textContent || "";
    if (!ssr || ssr === live) return null;
    let i = 0;
    while (i < ssr.length && i < live.length && ssr[i] === live[i]) i += 1;
    const cut = (s: string) => s.slice(Math.max(0, i - AROUND), i + AROUND).replace(/\s+/g, " ");
    return JSON.stringify({ at: i, ssrLen: ssr.length, liveLen: live.length, server: cut(ssr), browser: cut(live) });
  } catch {
    return null;
  }
}
