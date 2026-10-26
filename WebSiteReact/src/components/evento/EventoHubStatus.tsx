"use client";

import { useEffect, useState } from "react";
import { fetchEventoStatus, type EventoStatus } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";

/** Stato live hub: epoca / economia / wallet (Fase 0). */
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
  const lines: string[] = [];
  if (!(st as { publicEnabled?: boolean }).publicEnabled) lines.push("NON pubblico");
  if (feat?.epoch) lines.push(`Epoca: ${feat.epoch.replace(/_/g, " ")}`);
  if (feat?.economyOn) lines.push(`Economia fase ${feat.economyPhase ?? "?"}`);
  else if (st.canParticipate) lines.push("Economia: off");
  if (st.todayAdvent) lines.push(`Avvento giorno ${st.todayAdvent}`);
  if (w?.factionId) lines.push(`Fazione: ${w.factionId}`);
  if (w) lines.push(`${w.credits.toLocaleString("it-IT")} crediti · ${w.exp.toLocaleString("it-IT")} exp`);

  return (
    <div className="mx-auto mb-6 max-w-3xl px-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0b1220]/90 to-[#1a140c]/90 px-4 py-3 ring-1 ring-[#f0e6c8]/18">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f0e6c8]/70">
          {st.publicOpen ? "Live pubblico" : st.canPreview ? "Anteprima HS · chiuso al pubblico" : "Chiuso"}
          {st.romeDate ? ` · ${st.romeDate}` : ""}
        </p>
        <p className="mt-1.5 text-sm text-crema/75">{lines.join(" · ") || "—"}</p>
      </div>
    </div>
  );
}
