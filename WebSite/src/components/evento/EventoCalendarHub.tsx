"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Gift } from "lucide-react";
import { AdventCalendar } from "@/components/evento/AdventCalendar";
import { EventoMonthCalendar } from "@/components/evento/EventoMonthCalendar";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { EventoPanel } from "@/components/evento/EventoUi";
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
          <h2 className="text-center font-display text-2xl font-semibold uppercase tracking-[0.22em] text-caramel sm:text-3xl">
            {adventOk && mode === "avvento" ? "Calendario Avvento" : "Calendario Attività"}
          </h2>

          {adventOk ? (
            <div
              role="tablist"
              aria-label="Vista calendario"
              className="inline-flex rounded-2xl bg-black/45 p-1 ring-1 ring-[#c9a227]/25"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "avvento"}
                onClick={() => setMode("avvento")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  mode === "avvento"
                    ? "bg-gradient-to-r from-[#c9a227]/90 to-[#e4c76b] text-[#0a1020] shadow-[0_0_20px_-6px_rgba(201,162,39,0.7)]"
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
                    ? "bg-gradient-to-r from-[#2ea8ff]/90 to-[#7dd3fc] text-[#0a1020] shadow-[0_0_20px_-6px_rgba(46,168,255,0.55)]"
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
