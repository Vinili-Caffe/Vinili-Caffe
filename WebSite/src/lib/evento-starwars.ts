/** Evento stagionale Star Wars — hub `/evento/` + sottopagine.
 *  Accesso: SOLO High Staff finché `EVENTO_PUBLIC_ENABLED` è false.
 *  Pagine attività: calendariato a mezzogiorno Rome (allineato a starWarsEventCalendar).
 */

import { page } from "@/lib/site";
import type { StaffAccess } from "@/lib/staff";
import { adventSlotForRomeDate } from "@/lib/evento-avvento";

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

/** Apertura pubblica evento (Rome): 1 dicembre 2026 12:00. */
export const EVENTO_PUBLIC_OPEN = {
  timeZone: "Europe/Rome",
  year: 2026,
  month: 12,
  day: 1,
  hour: 12,
  minute: 0,
} as const;

/** Chiusura totale evento (Rome): 28 febbraio 2027 21:00 — anche HS / nav / pagine. */
export const EVENTO_PUBLIC_CLOSE = {
  timeZone: "Europe/Rome",
  year: 2027,
  month: 2,
  day: 28,
  hour: 21,
  minute: 0,
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
  | "fazione"
  | "classifiche"
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
  /** Se true, richiede anche la finestra feature (mezzogiorno). */
  featureGated?: boolean;
  /** Voce sotto dropdown “Eventi” (Accademia/Gara/Miniera/Puzzle). */
  eventiMenu?: boolean;
};

/** Finestre Rome `YYYY-MM-DDTHH:mm` — end esclusivo; null = non chiude. */
type FeatureWindow = { start: string; end: string | null };

const FEATURE_WINDOWS: Partial<Record<EventoPageId, FeatureWindow[]>> = {
  smistamento: [{ start: "2026-12-01T12:00", end: "2027-02-28T21:00" }],
  hub: [{ start: "2026-12-01T00:00", end: "2027-02-28T21:00" }],
  fazione: [{ start: "2026-12-01T00:00", end: "2027-02-28T21:00" }],
  classifiche: [{ start: "2026-12-01T00:00", end: "2027-02-28T21:00" }],
  gara: [{ start: "2026-12-04T12:00", end: "2026-12-09T12:00" }],
  miniera: [{ start: "2027-01-03T12:00", end: "2027-01-05T12:00" }],
  accademia: [{ start: "2027-01-13T12:00", end: "2027-01-22T12:00" }],
  puzzle: [{ start: "2027-02-03T12:00", end: "2027-02-08T12:00" }],
};

/** Nav hub evento (puzzle solo da qui → `/puzzle/`, non in menu Giochi).
 *  Smistamento non è più una voce: obbligatorio all’ingresso hub. */
export const EVENTO_NAV: EventoNavItem[] = [
  {
    id: "hub",
    href: page("/evento/"),
    label: "Hub",
    teaser: "Centro di comando: inventari, livello, fazione e attività.",
    publicFromOpen: true,
  },
  {
    id: "fazione",
    href: page("/evento/fazione/"),
    label: "Fazione",
    teaser: "Hub della tua fazione: banca, arsenale e inventario condiviso.",
    publicFromOpen: true,
  },
  {
    id: "classifiche",
    href: page("/evento/classifiche/"),
    label: "Classifiche",
    teaser: "Ologrammi di guerra: EXP fazione, PEI e top piloti della stagione.",
    publicFromOpen: true,
  },
  {
    id: "accademia",
    href: page("/evento/accademia/"),
    label: "Accademia",
    teaser: "Prove a tempo: mira e colpisci i bersagli sul sito.",
    publicFromOpen: true,
    featureGated: true,
    eventiMenu: true,
  },
  {
    id: "gara",
    href: page("/evento/gara/"),
    label: "Podracing Championship",
    teaser: "",
    publicFromOpen: true,
    featureGated: true,
    eventiMenu: true,
  },
  {
    id: "miniera",
    href: page("/evento/miniera/"),
    label: "Estrazione Kyber",
    teaser: "",
    publicFromOpen: true,
    featureGated: true,
    eventiMenu: true,
  },
  {
    id: "puzzle",
    href: page("/puzzle/"),
    label: "Puzzle di Kessel",
    teaser: "",
    publicFromOpen: true,
    featureGated: true,
    eventiMenu: true,
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

function romeStamp(now = new Date()): string {
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
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

function eventoCloseStamp(): string {
  return `${EVENTO_PUBLIC_CLOSE.year}-${String(EVENTO_PUBLIC_CLOSE.month).padStart(2, "0")}-${String(EVENTO_PUBLIC_CLOSE.day).padStart(2, "0")}T${String(EVENTO_PUBLIC_CLOSE.hour).padStart(2, "0")}:${String(EVENTO_PUBLIC_CLOSE.minute).padStart(2, "0")}`;
}

function eventoOpenStamp(): string {
  return `${EVENTO_PUBLIC_OPEN.year}-${String(EVENTO_PUBLIC_OPEN.month).padStart(2, "0")}-${String(EVENTO_PUBLIC_OPEN.day).padStart(2, "0")}T${String(EVENTO_PUBLIC_OPEN.hour).padStart(2, "0")}:${String(EVENTO_PUBLIC_OPEN.minute).padStart(2, "0")}`;
}

/** Stagione evento ancora attiva (prima della chiusura 28 feb 21:00 Rome). */
export function isEventoSeasonOpen(now = new Date()): boolean {
  return romeStamp(now) < eventoCloseStamp();
}

/** Pubblico solo se master switch ON + dopo il 1° dic 12:00 Rome e prima della chiusura. */
export function isEventoPublicWindowOpen(now = new Date()): boolean {
  if (!EVENTO_PUBLIC_ENABLED) return false;
  if (!isEventoSeasonOpen(now)) return false;
  return romeStamp(now) >= eventoOpenStamp();
}

/** Avvento solo 1–25 dic 2026 (Rome). Dal 26 sparisce da nav e pagine. */
export function isEventoAvventoSeasonOpen(now = new Date()): boolean {
  return adventSlotForRomeDate(now) != null;
}

/** Dal 26 dic 2026 (Rome) l’avvento è chiuso per tutti. */
export function isEventoAvventoEnded(now = new Date()): boolean {
  const stamp = romeStamp(now).slice(0, 10);
  return stamp >= "2026-12-26";
}

/**
 * Hub: avvento + switcher.
 * - 1–25 dic: sì
 * - prima del 1 dic: solo High Staff (anteprima)
 * - dal 26 dic: no (solo attività)
 */
export function canShowEventoAvventoOnHub(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): boolean {
  if (isEventoAvventoEnded(now)) return false;
  if (isEventoAvventoSeasonOpen(now)) return true;
  return isEventoHighStaff(access);
}

/** Feature calendar (mezzogiorno) — hub/fazione fino a chiusura evento; avvento solo in stagione. */
export function isEventoFeatureUnlocked(pageId: EventoPageId, now = new Date()): boolean {
  if (!isEventoSeasonOpen(now)) return false;
  if (pageId === "avvento") return isEventoAvventoSeasonOpen(now);
  const windows = FEATURE_WINDOWS[pageId];
  if (!windows?.length) return pageId === "hub" || pageId === "fazione";
  const stamp = romeStamp(now);
  return windows.some((w) => stamp >= w.start && (w.end == null || stamp < w.end));
}

/** Feature già conclusa (niente blur: sparisce dal menu). Prima dell’apertura → false. */
export function isEventoFeatureEnded(pageId: EventoPageId, now = new Date()): boolean {
  if (!isEventoSeasonOpen(now)) return true;
  if (pageId === "avvento") return isEventoAvventoEnded(now);
  const windows = FEATURE_WINDOWS[pageId];
  if (!windows?.length) return false;
  const stamp = romeStamp(now);
  const activeOrUpcoming = windows.some((w) => w.end == null || stamp < w.end);
  return !activeOrUpcoming;
}

export function isEventoPagePublic(pageId: EventoPageId): boolean {
  const item = EVENTO_NAV.find((n) => n.id === pageId);
  return Boolean(item?.publicFromOpen);
}

/**
 * High Staff sempre (anteprima).
 * Pubblico: finestra evento + pagina public + feature calendar sbloccata.
 */
export function canAccessEventoPage(
  pageId: EventoPageId,
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): boolean {
  /* Chiusura totale 28 feb 21:00 — anche High Staff. */
  if (!isEventoSeasonOpen(now)) return false;
  /* Avvento: chiuso dal 26; prima del 1 dic solo HS; in stagione ok. */
  if (pageId === "avvento") {
    if (isEventoAvventoEnded(now)) return false;
    if (!isEventoAvventoSeasonOpen(now) && !isEventoHighStaff(access)) return false;
  }
  if (isEventoHighStaff(access)) return true;
  if (!isEventoPublicWindowOpen(now)) return false;
  if (!isEventoPagePublic(pageId)) return false;
  return isEventoFeatureUnlocked(pageId, now);
}

/** Voce menu sito: SOON finché non HS e non è aperta la finestra pubblica. */
export function canSeeEventoInNav(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): boolean {
  if (!isEventoSeasonOpen(now)) return false;
  return isEventoHighStaff(access) || isEventoPublicWindowOpen(now);
}

export type EventoNavItemView = EventoNavItem & { locked: boolean };

/** Tutte le voci evento: blur se non ancora aperte; spariscono a fine finestra (HS le tiene). */
export function eventoNavForViewer(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): EventoNavItemView[] {
  if (!isEventoSeasonOpen(now)) return [];
  const hs = isEventoHighStaff(access);
  const pub = isEventoPublicWindowOpen(now);
  return EVENTO_NAV.map((item) => {
    const unlocked = hs || (pub && isEventoPagePublic(item.id) && isEventoFeatureUnlocked(item.id, now));
    return { ...item, locked: !unlocked };
  }).filter((item) => {
    /* HS: tutte le voci evento sbloccate (anche fuori calendario). */
    if (hs) return true;
    if (isEventoFeatureEnded(item.id, now)) return false;
    if (!pub) return false;
    if (!item.publicFromOpen) return false;
    return true;
  });
}

/** Hub (+ eventuali voci top-level, senza dropdown Eventi). */
export function eventoPrimaryNavForViewer(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): EventoNavItemView[] {
  return eventoNavForViewer(access, now).filter((item) => !item.eventiMenu);
}

/** Accademia / Gara / Miniera / Puzzle → dropdown “Eventi”. */
export function eventoEventiNavForViewer(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): EventoNavItemView[] {
  return eventoNavForViewer(access, now).filter((item) => item.eventiMenu);
}
