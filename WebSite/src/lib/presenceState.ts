/**
 * «Cosa sta facendo» chi è sul sito, in un formato leggibile da fuori:
 * - PreMiD (estensione del browser) lo legge da <html data-vc-presence="…"> e lo mostra come stato su Discord;
 * - dentro l'Attività di Discord lo stesso stato diventa «Sta giocando a…» (vedi discordActivity).
 * Le pagine senza uno stato preciso non scrivono nulla: PreMiD usa il nome della pagina.
 *
 * Più componenti possono dire la loro (pagina del quiz e partita in corso): vince la priorità più alta,
 * a parità l'ultimo arrivato.
 */
import { useEffect, useId } from "react";

export type SitePresence = {
  /** prima riga, es. «Music Quiz · Daft Punk» */
  details: string;
  /** seconda riga, es. «Domanda 4 di 10 · 320 punti» */
  state?: string;
  /** immagine grande (https), es. la copertina del quiz */
  image?: string;
  imageText?: string;
  /** da quando (ms) — Discord mostra il tempo trascorso */
  startedAt?: number;
};

type Listener = (p: SitePresence | null) => void;
const listeners = new Set<Listener>();
const entries = new Map<string, { p: SitePresence; priority: number; at: number }>();
let seq = 0;
let current: SitePresence | null = null;

function publish() {
  let best: { p: SitePresence; priority: number; at: number } | null = null;
  for (const e of entries.values()) {
    if (!best || e.priority > best.priority || (e.priority === best.priority && e.at > best.at)) best = e;
  }
  current = best ? best.p : null;
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (current) root.dataset.vcPresence = JSON.stringify(current);
    else delete root.dataset.vcPresence;
  }
  for (const l of listeners) l(current);
}

export function onSitePresence(l: Listener) {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}

/**
 * Imposta lo stato finché il componente è sulla pagina (null = niente da dire).
 * priority: 1 pagine, 2 partita in corso.
 */
export function useSitePresence(p: SitePresence | null, priority = 1) {
  const id = useId();
  const key = p ? JSON.stringify(p) : "";
  useEffect(() => {
    if (key) entries.set(id, { p: JSON.parse(key) as SitePresence, priority, at: ++seq });
    else entries.delete(id);
    publish();
  }, [id, key, priority]);
  useEffect(
    () => () => {
      entries.delete(id);
      publish();
    },
    [id],
  );
}
