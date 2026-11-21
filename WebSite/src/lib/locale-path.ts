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
import { REACT_PAGES } from "@/lib/site";
import slugsJson from "@/lib/i18n/slugs.json";

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

/* nomi delle pagine tradotti (/en/who-we-are/ ↔ /chi-siamo/): stessa logica di scripts/locale-routes.mjs */
const SLUGS = (slugsJson as { segmenti: Record<string, Record<string, string>> }).segmenti;
const toLocal = new Map<string, Map<string, string>>(); /* lingua → (percorso italiano → tradotto) */
const toItalian = new Map<string, Map<string, string>>(); /* lingua → (percorso tradotto → italiano) */
for (const lang of URL_LOCALES) {
  if (lang === "it") continue;
  const fwd = new Map<string, string>();
  const rev = new Map<string, string>();
  for (const it of REACT_PAGES) {
    const segs = it.split("/").filter(Boolean).map((s) => SLUGS[s]?.[lang] || s);
    const loc = segs.length ? `/${segs.join("/")}/` : "/";
    if (loc === it || rev.has(loc) || REACT_PAGES.has(loc)) continue;
    fwd.set(it, loc);
    rev.set(loc, it);
  }
  toLocal.set(lang, fwd);
  toItalian.set(lang, rev);
}
const withSlash = (p: string) => (p.endsWith("/") ? p : `${p}/`);

/** Percorso senza lingua e con i nomi italiani: /en/who-we-are/ → /chi-siamo/, /it → /. */
export function stripLocale(path: string): string {
  const p = String(path || "/");
  const lang = localeFromPath(p);
  const out0 = p.replace(PREFIX, "");
  const out = out0 === "" ? "/" : out0.startsWith("/") ? out0 : `/${out0}`;
  if (!lang || lang === "it") return out;
  const it = toItalian.get(lang)?.get(withSlash(out));
  if (!it) return out;
  return out.endsWith("/") ? it : it.replace(/\/$/, "");
}

/** Aggiunge la lingua (e il nome tradotto della pagina) a un link interno; lascia stare esterni, ancore e percorsi esclusi. */
export function withLocale(href: string, locale: string | null | undefined): string {
  const h = String(href ?? "");
  if (!locale || !h.startsWith("/") || h.startsWith("//")) return h;
  const at = h.search(/[?#]/);
  const path = at >= 0 ? h.slice(0, at) : h;
  const rest = at >= 0 ? h.slice(at) : "";
  const bare = stripLocale(path);
  if (SKIP.test(bare)) return bare + rest;
  const local = toLocal.get(locale)?.get(withSlash(bare)) || bare;
  return `/${locale}${local === "/" ? "/" : local}${rest}`;
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
