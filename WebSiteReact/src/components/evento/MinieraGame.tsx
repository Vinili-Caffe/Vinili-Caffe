"use client";

import { useCallback, useEffect, useState } from "react";
import { Gem, Pickaxe } from "lucide-react";
import { digEventoMiniera, fetchEventoMiniera } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  EventoBtn,
  EventoKicker,
  EventoLoginGate,
  EventoPanel,
  EventoSkeleton,
  EventoTitle,
} from "@/components/evento/EventoUi";

/** Solo blu/verde — Kyber naturali Jedi. */
const KYBER_HEX: Record<string, { glow: string; core: string; label: string }> = {
  blu: { glow: "#1d8fff", core: "#5eb6ff", label: "Blu" },
  verde: { glow: "#12c26b", core: "#4dff9a", label: "Verde" },
};

function styleFor(color: string) {
  const key = String(color || "").toLowerCase();
  if (key.includes("verd") || key.includes("green")) return KYBER_HEX.verde!;
  if (key.includes("blu") || key.includes("blue")) return KYBER_HEX.blu!;
  return KYBER_HEX[key] || KYBER_HEX.blu!;
}

function CrystalFace({ color, rare, size = "md" }: { color: string; rare?: boolean; size?: "sm" | "md" | "lg" }) {
  const s = styleFor(color);
  const dim = size === "lg" ? "size-14" : size === "sm" ? "size-7" : "size-10";
  return (
    <span
      className={cn("relative inline-flex items-center justify-center", dim)}
      style={{ filter: `drop-shadow(0 0 10px ${s.glow})` }}
      aria-hidden
    >
      <Gem
        className={cn(dim, rare && "animate-pulse")}
        strokeWidth={1.75}
        style={{ color: s.core, fill: `${s.glow}55` }}
      />
    </span>
  );
}

export function MinieraGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [canDig, setCanDig] = useState(false);
  const [finds, setFinds] = useState<Array<{ color: string; rare: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ color: string; rare: boolean } | null>(null);

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoMiniera(token);
    setLoading(false);
    if (!st?.ok) {
      showToast(st?.message || "Miniera non disponibile.", true);
      return;
    }
    setRemaining(st.remaining ?? 0);
    setCanDig(Boolean(st.canDig));
    setFinds(st.finds || []);
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function dig() {
    if (!token || busy || !canDig) return;
    setBusy(true);
    const out = await digEventoMiniera(token);
    setBusy(false);
    if (!out?.ok) {
      showToast(out?.message || "Estrazione fallita.", true);
      return;
    }
    setLast(out.find || null);
    setRemaining(out.remaining ?? 0);
    setCanDig((out.remaining ?? 0) > 0);
    if (out.find) setFinds((f) => [...f, out.find!]);
    const label = styleFor(out.find?.color || "").label;
    showToast(out.find?.rare ? `Kyber ${label} RARO!` : `Kyber ${label}`);
  }

  if (loading) return <EventoSkeleton className="mx-auto max-w-lg px-6" />;
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate label="Accedi per scavare cristalli Kyber nella miniera di Ilum." onLogin={login} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-6">
      <EventoPanel className="text-center" glow="gold">
        <Pickaxe className="mx-auto size-9 text-sand" aria-hidden />
        <EventoKicker>Estrazioni oggi</EventoKicker>
        <EventoTitle>{remaining}</EventoTitle>
        <p className="mt-1 text-sm text-crema/65">rimaste · Kyber blu o verde</p>

        {last ? (
          <div
            className="mx-auto mt-5 max-w-xs rounded-2xl p-4 ring-1"
            style={{
              background: `linear-gradient(145deg, ${styleFor(last.color).glow}44, rgba(5,7,15,0.85))`,
              boxShadow: `0 0 28px ${styleFor(last.color).glow}55`,
              borderColor: `${styleFor(last.color).glow}88`,
            }}
          >
            <CrystalFace color={last.color} rare={last.rare} size="lg" />
            <p className="mt-2 font-display text-xl text-crema">
              {styleFor(last.color).label}
              {last.rare ? " · raro" : ""}
            </p>
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-crema/55">Ultimo ritrovamento</p>
          </div>
        ) : null}

        <EventoBtn className="mt-6 w-full sm:w-auto" disabled={!canDig || busy} onClick={() => void dig()}>
          {busy ? "Scavo…" : "Scava"}
        </EventoBtn>
      </EventoPanel>

      {finds.length ? (
        <EventoPanel glow="none">
          <EventoKicker>Bottino di oggi</EventoKicker>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {finds.map((f, i) => {
              const s = styleFor(f.color);
              return (
                <li
                  key={`${f.color}-${i}`}
                  className="flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-center text-sm ring-1"
                  style={{
                    background: `linear-gradient(160deg, ${s.glow}33, rgba(5,7,15,0.9))`,
                    boxShadow: `inset 0 0 0 1px ${s.glow}66`,
                  }}
                >
                  <CrystalFace color={f.color} rare={f.rare} size="sm" />
                  <span className="font-medium text-crema">{s.label}</span>
                  {f.rare ? (
                    <span className="text-[0.6rem] uppercase tracking-wider text-sand">raro</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </EventoPanel>
      ) : null}
    </div>
  );
}
