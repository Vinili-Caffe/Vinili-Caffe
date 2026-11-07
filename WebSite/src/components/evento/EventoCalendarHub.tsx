"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Gift } from "lucide-react";
import { AdventCalendar } from "@/components/evento/AdventCalendar";
import { EventoMonthCalendar } from "@/components/evento/EventoMonthCalendar";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { EventoKicker, EventoPanel, EventoTitle } from "@/components/evento/EventoUi";
import { canShowEventoAvventoOnHub } from "@/lib/evento-starwars";
import { cn } from "@/lib/cn";

type Mode = "avvento" | "attivita";

/** Hub: switch Avvento ↔ Attività; dal 26 dic solo attività. */
export function EventoCalendarHub() {
  const { ready, access } = useEventoStaffAccess();
  const adventOk = canShowEventoAvventoOnHub(access);
  const [mode, setMode] = useState<Mode>(adventOk ? "avvento" : "attivita");

  useEffect(() => {
    if (!adventOk && mode === "avvento") setMode("attivita");
  }, [adventOk, mode]);

  if (!ready) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 pb-12">
      <EventoPanel glow="gold" className="!p-4 sm:!p-5">
        <div className="mb-5 flex flex-col items-center gap-3">
          <EventoKicker>Programma · stagione</EventoKicker>
          <EventoTitle className="text-center text-2xl uppercase tracking-[0.22em] sm:text-3xl">
            {adventOk && mode === "avvento" ? "Calendario Avvento" : "Calendario Attività"}
          </EventoTitle>

          {adventOk ? (
            <div
              role="tablist"
              aria-label="Vista calendario"
              className="inline-flex rounded-2xl bg-black/45 p-1 ring-1 ring-cyan-300/25"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "avvento"}
                onClick={() => setMode("avvento")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  mode === "avvento"
                    ? "bg-gradient-to-r from-amber-300/90 via-[#e4c76b] to-amber-200 text-ink shadow-[0_0_20px_-6px_rgba(240,215,140,0.55)]"
                    : "text-crema/55 hover:text-crema/85",
                )}
              >
                <Gift className="size-3.5" aria-hidden />
                Avvento
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "attivita"}
                onClick={() => setMode("attivita")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  mode === "attivita"
                    ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/35 shadow-[0_0_20px_-6px_rgba(56,189,248,0.45)]"
                    : "text-crema/55 hover:text-crema/85",
                )}
              >
                <CalendarDays className="size-3.5" aria-hidden />
                Attività
              </button>
            </div>
          ) : null}
        </div>

        {adventOk && mode === "avvento" ? <AdventCalendar embedded /> : <EventoMonthCalendar embedded />}
      </EventoPanel>
    </div>
  );
}
