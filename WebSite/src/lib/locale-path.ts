"use client";

/**
 * Lingua nell'indirizzo: /it/faq/, /en/faq/…
 *
 * Le pagine esistono una volta sola (export statico); su Vercel `/:lingua/:percorso` viene servito
 * come `/:percorso` (vercel.json, e next.config in sviluppo). Qui:
 *  - `stripLocale` toglie la lingua dal percorso, così il resto del sito ragiona come prima;
 *  - `useSitePathname` è `usePathname` senza lingua;
 *  - `withLocale` aggiunge la lingua ai link interni.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export const URL_LOCALES = ["it", "en", "es", "fr", "de", "pt", "ru", "zh", "ja", "ko", "ar", "nl", "pl", "tr", "hi", "id", "uk", "vi", "ro", "sv"] as const;
export type UrlLocale = (typeof URL_LOCALES)[number];

const PREFIX = new RegExp(`^/(${URL_LOCALES.join("|")})(?=/|$)`);

/* percorsi che restano senza lingua: login Discord, widget in altri siti, file */
const SKIP = /^\/(oauth|auth|vetrina\/embed|webhooks|api|_next|images|audio|js|status-kuma|ticket-transcript)(\/|$)|\.[a-z0-9]{2,5}$/i;

/** Lingua scritta nel percorso, se c'è. */
export function localeFromPath(path: string): UrlLocale | null {
  const m = String(path || "").match(PREFIX);
  return m ? (m[1] as UrlLocale) : null;
}

/** Percorso senza lingua: /en/faq/ → /faq/, /it → /. */
export function stripLocale(path: string): string {
  const p = String(path || "/");
  const out = p.replace(PREFIX, "");
  return out === "" ? "/" : out.startsWith("/") ? out : `/${out}`;
}

/** Aggiunge la lingua a un link interno (lascia stare esterni, ancore e percorsi esclusi). */
export function withLocale(href: string, locale: string | null | undefined): string {
  const h = String(href ?? "");
  if (!locale || !h.startsWith("/") || h.startsWith("//")) return h;
  const at = h.search(/[?#]/);
  const path = at >= 0 ? h.slice(0, at) : h;
  const rest = at >= 0 ? h.slice(at) : "";
  const bare = stripLocale(path);
  if (SKIP.test(bare)) return bare + rest;
  return `/${locale}${bare === "/" ? "/" : bare}${rest}`;
}

/** Il percorso va tenuto senza lingua? (login, widget, file) */
export function skipsLocale(path: string): boolean {
  return SKIP.test(stripLocale(path));
}

/** Percorso attuale del browser senza lingua. */
export function sitePathname(): string {
  if (typeof location === "undefined") return "/";
  return stripLocale(location.pathname);
}

/** usePathname senza la lingua davanti: per confronti con le pagine del sito. */
export function useSitePathname(): string {
  return stripLocale(usePathname() || "/");
}

/** Evento per i link: la lingua dell'indirizzo è cambiata. */
export const URL_LOCALE_EVENT = "vc:url-locale";

let current: string | null = null;
export function currentUrlLocale(): string | null {
  return current;
}
export function setCurrentUrlLocale(locale: string | null) {
  if (current === locale) return;
  current = locale;
  try {
    window.dispatchEvent(new CustomEvent(URL_LOCALE_EVENT, { detail: locale }));
  } catch {
    /* ignore */
  }
}

/** Lingua attuale per i link, disponibile dopo il primo disegno (così l'HTML statico resta uguale). */
export function useUrlLocale(): string | null {
  const [loc, setLoc] = useState<string | null>(null);
  useEffect(() => {
    setLoc(current);
    const on = (e: Event) => setLoc(((e as CustomEvent).detail as string) || null);
    window.addEventListener(URL_LOCALE_EVENT, on);
    return () => window.removeEventListener(URL_LOCALE_EVENT, on);
  }, []);
  return loc;
}
