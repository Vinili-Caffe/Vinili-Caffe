"use client";

import { useEffect, useState } from "react";
import { fetchEventoStatus, type EventoStatus } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";

/** Stato live hub: epoca / economia / wallet. */
export function EventoHubStatus() {
  const { token, ready } = useAuth();
  const [st, setSt] = useState<EventoStatus | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetchEventoStatus(token).then((r) => {
      if (alive) setSt(r);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  if (!st?.ok) return null;

  const feat = st.features;
  const w = st.wallet;
  const chips: string[] = [];
  if (!(st as { publicEnabled?: boolean }).publicEnabled) chips.push("Chiuso al pubblico");
  if (feat?.epoch) chips.push(feat.epoch.replace(/_/g, " "));
  if (feat?.economyOn) chips.push(`Economia fase ${feat.economyPhase ?? "?"}`);
  else if (st.canParticipate) chips.push("Economia off");
  if (st.todayAdvent) chips.push(`Avvento giorno ${st.todayAdvent}`);
  if (w?.factionId) chips.push(`Fazione ${w.factionId}`);

  return (
    <div className="mx-auto mb-6 max-w-4xl px-6">
      <EventoPanel glow="blue">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <EventoKicker>
              {st.publicOpen ? "Live pubblico" : st.canPreview ? "Anteprima High Staff" : "Chiuso"}
              {st.romeDate ? ` · ${st.romeDate}` : ""}
            </EventoKicker>
            <p className="mt-2 text-sm text-[#f0e6c8]/7">
              {chips.length ? chips.join(" · ") : "Stato evento"}
            </p>
          </div>
          {w ? (
            <div className="text-right">
              <p className="font-display text-2xl text-[#e4c76b] tabular-nums">
                {w.credits.toLocaleString("it-IT")}
              </p>
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-[#f0e6c8]/45">
                crediti · {w.exp.toLocaleString("it-IT")} exp
              </p>
            </div>
          ) : null}
        </div>
      </EventoPanel>
    </div>
  );
}
