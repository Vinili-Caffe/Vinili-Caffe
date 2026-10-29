/** Evento stagionale Star Wars — hub `/evento/` + sottopagine.
 *  Accesso: SOLO High Staff finché `EVENTO_PUBLIC_ENABLED` è false.
 *  Quando si aprirà al pubblico: avvento + smistamento (+ hub) dal 1° dic Rome.
 */

import { page } from "@/lib/site";
import type { StaffAccess } from "@/lib/staff";

export const EVENTO_KICKER = "Una galassia lontana lontana";
export const EVENTO_BRAND = "Star Wars";

/**
 * Bypass chrome sito su /evento e /puzzle: navbar VC → nav evento + tema SW.
 * (Accesso pagine resta HS / finestra pubblica — questo è solo immersione UI.)
 */
export const EVENTO_CHROME_BYPASS = true;

/**
 * Master switch sito: false = NESSUN accesso pubblico (né menu, né gate pagine).
 * Allineato a `starWarsEvent.publicEnabled` sul bot (default false).
 */
export const EVENTO_PUBLIC_ENABLED = false;

/** Apertura pubblica (Rome): 1 dicembre 2026 00:00 — attiva solo se EVENTO_PUBLIC_ENABLED. */
export const EVENTO_PUBLIC_OPEN = {
  timeZone: "Europe/Rome",
  year: 2026,
  month: 12,
  day: 1,
} as const;

/** Fazioni smistamento (analoghe alle case Hogwarts). */
export const EVENTO_FACTIONS = [
  {
    id: "repubblica",
    name: "Repubblica",
    blurb: "Ordine, senato e flotta della Repubblica Galattica.",
  },
  {
    id: "separatisti",
    name: "Separatisti",
    blurb: "Confederazione dei Sistemi Indipendenti.",
  },
] as const;

export type EventoFactionId = (typeof EVENTO_FACTIONS)[number]["id"];

export type EventoPageId =
  | "hub"
  | "avvento"
  | "smistamento"
  | "accademia"
  | "gara"
  | "miniera"
  | "puzzle";

export type EventoNavItem = {
  id: EventoPageId;
  href: string;
  label: string;
  teaser: string;
  soon?: boolean;
  /** Visibile/aperta al pubblico dopo EVENTO_PUBLIC_OPEN (oltre che High Staff). */
  publicFromOpen?: boolean;
};

/** Nav hub evento (puzzle solo da qui → `/puzzle/`, non in menu Giochi). */
export const EVENTO_NAV: EventoNavItem[] = [
  {
    id: "hub",
    href: page("/evento/"),
    label: "Hub",
    teaser: "Centro dell’evento: calendario, fazioni e accessi alle attività.",
    publicFromOpen: true,
  },
  {
    id: "avvento",
    href: page("/evento/avvento/"),
    label: "Avvento",
    teaser: "Calendario dell’avvento: 25 giorni di casse e crediti.",
    publicFromOpen: true,
  },
  {
    id: "smistamento",
    href: page("/evento/smistamento/"),
    label: "Smistamento",
    teaser: "Scegli la tua fazione: Repubblica o Separatisti.",
    publicFromOpen: true,
  },
  {
    id: "accademia",
    href: page("/evento/accademia/"),
    label: "Accademia",
    teaser: "Prove a tempo: mira e colpisci i bersagli sul sito.",
  },
  {
    id: "gara",
    href: page("/evento/gara/"),
    label: "Gara",
    teaser: "Podracing Championship — scelta sguscio e gare.",
  },
  {
    id: "miniera",
    href: page("/evento/miniera/"),
    label: "Miniera",
    teaser: "Estrazione Kyber — cristalli giornalieri.",
  },
  {
    id: "puzzle",
    href: page("/puzzle/"),
    label: "Puzzle",
    teaser: "Puzzle galassia (High Staff) — da completare.",
  },
];

export const EVENTO_PATHS = EVENTO_NAV.filter((n) => n.id !== "puzzle").map((n) => n.href);

export function eventoPageMeta(id: EventoPageId) {
  const item = EVENTO_NAV.find((n) => n.id === id) || EVENTO_NAV[0]!;
  return {
    path: item.href,
    title: item.id === "hub" ? `Evento ${EVENTO_BRAND}` : item.label,
    description: item.teaser,
  };
}

export function isEventoHighStaff(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
): boolean {
  if (!access) return false;
  return Boolean(access.isHighStaff || access.canManage || access.highStaff);
}

/** Pubblico solo se master switch ON + dopo il 1° dic Rome. */
export function isEventoPublicWindowOpen(now = new Date()): boolean {
  if (!EVENTO_PUBLIC_ENABLED) return false;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: EVENTO_PUBLIC_OPEN.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hh = Number(parts.hour === "24" ? "0" : parts.hour);
  if (y > EVENTO_PUBLIC_OPEN.year) return true;
  if (y < EVENTO_PUBLIC_OPEN.year) return false;
  if (m > EVENTO_PUBLIC_OPEN.month) return true;
  if (m < EVENTO_PUBLIC_OPEN.month) return false;
  if (d > EVENTO_PUBLIC_OPEN.day) return true;
  if (d < EVENTO_PUBLIC_OPEN.day) return false;
  return hh >= 0;
}

export function isEventoPagePublic(pageId: EventoPageId): boolean {
  const item = EVENTO_NAV.find((n) => n.id === pageId);
  return Boolean(item?.publicFromOpen);
}

/** High Staff sempre; pubblico solo dopo apertura e solo pagine `publicFromOpen`. */
export function canAccessEventoPage(
  pageId: EventoPageId,
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): boolean {
  if (isEventoHighStaff(access)) return true;
  if (pageId === "puzzle") return false;
  if (!isEventoPublicWindowOpen(now)) return false;
  return isEventoPagePublic(pageId);
}

/** Voce menu sito: SOON finché non HS e non è aperta la finestra pubblica. */
export function canSeeEventoInNav(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): boolean {
  return isEventoHighStaff(access) || isEventoPublicWindowOpen(now);
}

export function eventoNavForViewer(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): EventoNavItem[] {
  const hs = isEventoHighStaff(access);
  const pub = isEventoPublicWindowOpen(now);
  return EVENTO_NAV.filter((item) => {
    if (item.id === "puzzle") return hs;
    if (hs) return true;
    return pub && item.publicFromOpen;
  });
}
