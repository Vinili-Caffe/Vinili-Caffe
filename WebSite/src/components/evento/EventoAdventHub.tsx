"use client";

import { AdventCalendar } from "@/components/evento/AdventCalendar";
import { isEventoAvventoSeasonOpen } from "@/lib/evento-starwars";

/** Avvento sparso sull’hub — solo in stagione (1–25 dic). */
export function EventoAdventHub() {
  if (!isEventoAvventoSeasonOpen()) return null;
  return <AdventCalendar />;
}
