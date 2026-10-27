"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
} from "@/components/evento/EventoUi";

const KYBER_HEX: Record<string, { glow: string; core: string; label: string }> = {
  blu: { glow: "#1d8fff", core: "#5eb6ff", label: "Blu" },
  verde: { glow: "#12c26b", core: "#4dff9a", label: "Verde" },
};

function styleFor(color: string) {
  const key = String(color || "").toLowerCase();
  if (key.includes("verd") || key.includes("green")) return KYBER_HEX.verde!;
  return KYBER_HEX.blu!;
}

export function MinieraGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [canDig, setCanDig] = useState(false);
  const [finds, setFinds] = useState<Array<{ color: string; rare: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ color: string; rare: boolean } | null>(null);
  const [strike, setStrike] = useState(0);

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
    setStrike((n) => n + 1);
    await new Promise((r) => setTimeout(r, 420));
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

  const lastStyle = last ? styleFor(last.color) : null;

  return (
    <div className="mx-auto max-w-lg space-y-5 px-6">
      <EventoPanel className="!overflow-hidden !p-0" glow="gold">
        {/* scena caverna */}
        <div className="relative aspect-[5/4] overflow-hidden bg-[#05070f]">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 120%, #1a2744 0%, #0a1020 45%, #05070f 80%), repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(46,168,255,0.04) 18px, rgba(46,168,255,0.04) 19px)",
            }}
            aria-hidden
          />
          {/* stalattiti */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-6" aria-hidden>
            {[18, 28, 22, 32, 20].map((h, i) => (
              <span
                key={i}
                className="block w-3 rounded-b-full bg-gradient-to-b from-[#1a2744] to-transparent opacity-80"
                style={{ height: h }}
              />
            ))}
          </div>

          {/* cristalli ambiente */}
          <span className="absolute bottom-[28%] left-[18%] size-3 rotate-12 rounded-sm bg-[#2ea8ff]/50 blur-[1px] shadow-[0_0_16px_#2ea8ff]" />
          <span className="absolute bottom-[36%] right-[22%] size-2.5 -rotate-6 rounded-sm bg-[#12c26b]/45 blur-[1px] shadow-[0_0_14px_#12c26b]" />

          <div className="absolute inset-x-0 top-4 text-center">
            <EventoKicker>Miniera di Ilum</EventoKicker>
            <p className="mt-1 font-display text-3xl text-crema">{remaining}</p>
            <p className="text-xs uppercase tracking-[0.22em] text-crema/45">estrazioni rimaste</p>
          </div>

          <AnimatePresence mode="wait">
            {last && lastStyle ? (
              <motion.div
                key={`${last.color}-${strike}`}
                className="absolute inset-x-0 bottom-[22%] flex flex-col items-center"
                initial={{ y: 40, opacity: 0, scale: 0.6 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 220, damping: 16 }}
              >
                <Gem
                  className={cn("size-16", last.rare && "animate-pulse")}
                  style={{ color: lastStyle.core, fill: `${lastStyle.glow}66`, filter: `drop-shadow(0 0 18px ${lastStyle.glow})` }}
                />
                <p className="mt-2 font-display text-xl text-crema">
                  Kyber {lastStyle.label}
                  {last.rare ? " · raro" : ""}
                </p>
              </motion.div>
            ) : (
              <motion.p
                key="idle"
                className="absolute inset-x-0 bottom-[28%] text-center text-sm text-crema/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Colpisci il filone di ghiaccio…
              </motion.p>
            )}
          </AnimatePresence>

          <motion.div
            key={strike}
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
            initial={{ rotate: -25, y: 8 }}
            animate={busy ? { rotate: [-25, 35, -10], y: [8, -6, 8] } : { rotate: -18, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Pickaxe className="size-12 text-sand drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]" />
          </motion.div>
        </div>

        <div className="border-t border-sand/10 px-4 py-4 text-center sm:px-5">
          <EventoBtn className="w-full sm:w-auto" disabled={!canDig || busy} onClick={() => void dig()}>
            {busy ? "Scavo…" : "Scava Kyber"}
          </EventoBtn>
          <p className="mt-2 text-xs text-crema/45">Solo cristalli blu e verde — come nella lore Jedi.</p>
        </div>
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
                  className="flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-center text-sm"
                  style={{
                    background: `linear-gradient(160deg, ${s.glow}33, rgba(5,7,15,0.9))`,
                    boxShadow: `inset 0 0 0 1px ${s.glow}66`,
                  }}
                >
                  <Gem className="size-6" style={{ color: s.core, fill: `${s.glow}55` }} />
                  <span className="font-medium text-crema">{s.label}</span>
                  {f.rare ? <span className="text-[0.6rem] uppercase tracking-wider text-sand">raro</span> : null}
                </li>
              );
            })}
          </ul>
        </EventoPanel>
      ) : null}
    </div>
  );
}
