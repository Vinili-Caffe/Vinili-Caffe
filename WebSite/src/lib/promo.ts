// Sconti a orario sui pacchetti di Donazioni e Sponsor (ora di Roma).
// Ogni finestra si accende e si spegne da sola: per aggiungerne una, metti una riga in PROMOS.
// Pagina statica: in costruzione e al primo disegno vale l'ora della build (stesso HTML), poi il browser passa all'ora vera.
// Anteprima: ?promo=<id> sull'indirizzo (es. /donazioni/?promo=blackfriday) mostra quello sconto anche fuori orario.

import { useSyncExternalStore } from "react";

export type Promo = {
  id: string;
  percent: number;
  /** nome corto (timbri, bollini) */
  name: string;
  title: string;
  text: string;
  /** colore di accento della grafica Black Friday */
  accent: string;
  /** inizio e fine (ISO con fuso): fine esclusa */
  start: string;
  ends: string;
  /** cosa arriva dopo (riga sotto il conto alla rovescia) */
  next?: string;
};

export const PROMOS: Promo[] = [
  {
    id: "pre-blackfriday",
    percent: 25,
    name: "Pre Black Friday",
    title: "Pre Black Friday",
    text: "-25% su tutti i pacchetti di donazioni e sponsor.",
    accent: "#f0b46e",
    start: "2026-11-16T12:00:00+01:00",
    ends: "2026-11-27T00:00:00+01:00",
    next: "Poi arriva il Black Friday: -50%.",
  },
  {
    id: "blackfriday",
    percent: 50,
    name: "Black Friday",
    title: "Black Friday",
    text: "Metà prezzo su tutti i pacchetti di donazioni e sponsor.",
    accent: "#ffd23f",
    start: "2026-11-27T00:00:00+01:00",
    ends: "2026-12-04T12:00:00+01:00",
  },
];

/** Sconto attivo in quel momento (null = nessuno). */
export function promoAt(ms: number): Promo | null {
  return PROMOS.find((p) => ms >= Date.parse(p.start) && ms < Date.parse(p.ends) && p.percent > 0) || null;
}

/** Anteprima forzata dall'indirizzo (?promo=blackfriday). */
function previewPromo(): Promo | null {
  try {
    const id = new URLSearchParams(window.location.search).get("promo");
    return id ? PROMOS.find((p) => p.id === id) || null : null;
  } catch {
    return null;
  }
}

export const isPromoPreview = () => typeof window !== "undefined" && Boolean(previewPromo());

const BUILD_AT = Number(process.env.NEXT_PUBLIC_BUILD_AT) || 0;

/* il browser ricontrolla ogni 30 secondi e al cambio di finestra, così il prezzo cambia da solo all'ora giusta */
function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 30_000);
  const next = PROMOS.flatMap((p) => [Date.parse(p.start), Date.parse(p.ends)])
    .filter((t) => t > Date.now())
    .sort((x, y) => x - y)[0];
  const edge = next && next - Date.now() < 2 ** 31 - 1 ? window.setTimeout(cb, next - Date.now() + 50) : 0;
  window.addEventListener("popstate", cb);
  return () => {
    window.clearInterval(id);
    if (edge) window.clearTimeout(edge);
    window.removeEventListener("popstate", cb);
  };
}
const snapshot = () => previewPromo() || promoAt(Date.now());
const serverSnapshot = () => (BUILD_AT ? promoAt(BUILD_AT) : null);

/** Sconto attivo adesso (si aggiorna da solo quando inizia o finisce). */
export function usePromo(): Promo | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Prezzo scontato, arrotondato al centesimo. */
export const promoPrice = (n: number, promo: Promo | null) => (promo ? Math.round(n * (100 - promo.percent)) / 100 : n);

export const promoEndsLabel = (promo: Promo | null) => {
  if (!promo) return null;
  /* a mezzanotte in punto si dice "il giorno prima a mezzanotte", più chiaro di "alle 0" */
  const midnight = promo.ends.includes("T00:00");
  const end = new Date(Date.parse(promo.ends) - (midnight ? 1 : 0));
  const day = end.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long" });
  if (midnight) return `${day} a mezzanotte`;
  const time = end.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "numeric", minute: "2-digit" }).replace(":00", "");
  return `${day} alle ${time}`;
};
