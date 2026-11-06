"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crosshair, Minus, Plus, Shield, Sparkles, X, Zap } from "lucide-react";
import { EventoTroopIcon } from "@/components/evento/EventoTroopIcon";
import { EventoUtilityIcon } from "@/components/evento/EventoUtilityIcon";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { cn } from "@/lib/cn";

export type WarDeployUnit = {
  id: string;
  label: string;
  power: number;
  available: number;
};

type Props = {
  mode: "attack" | "defend";
  units: WarDeployUnit[];
  bactaQty: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: { deploy: Record<string, number>; useBacta: boolean }) => void;
};

export function EventoWarDeployModal({ mode, units, bactaQty, busy, onClose, onConfirm }: Props) {
  const attack = mode === "attack";
  const [qty, setQty] = useState<Record<string, number>>({});
  const [useBacta, setUseBacta] = useState(false);

  useBodyScrollLock(true);

  useEffect(() => {
    const init: Record<string, number> = {};
    for (const u of units) init[u.id] = 0;
    setQty(init);
    setUseBacta(false);
  }, [units, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const selectedCount = useMemo(
    () => Object.values(qty).reduce((a, n) => a + Math.max(0, Math.floor(n || 0)), 0),
    [qty],
  );
  const selectedPower = useMemo(
    () => units.reduce((a, u) => a + Math.max(0, Math.floor(qty[u.id] || 0)) * u.power, 0),
    [units, qty],
  );
  const hangarPower = useMemo(() => units.reduce((a, u) => a + u.available * u.power, 0), [units]);
  const powerPct = hangarPower > 0 ? Math.min(100, (selectedPower / hangarPower) * 100) : 0;

  function bump(id: string, delta: number) {
    const unit = units.find((u) => u.id === id);
    if (!unit) return;
    setQty((prev) => {
      const cur = Math.max(0, Math.floor(prev[id] || 0));
      const next = Math.max(0, Math.min(unit.available, cur + delta));
      return { ...prev, [id]: next };
    });
  }

  function setAll(max: boolean) {
    const next: Record<string, number> = {};
    for (const u of units) next[u.id] = max ? u.available : 0;
    setQty(next);
  }

  function confirm() {
    if (selectedCount < 1 || busy) return;
    const deploy: Record<string, number> = {};
    for (const [id, n] of Object.entries(qty)) {
      const v = Math.max(0, Math.floor(Number(n) || 0));
      if (v > 0) deploy[id] = v;
    }
    onConfirm({ deploy, useBacta: attack && useBacta && bactaQty > 0 });
  }

  const accent = attack
    ? {
        glow: "rgba(168,58,44,0.55)",
        bar: "from-[#a83a2c] via-[#d4523a] to-[#f0a05a]",
        btn: "from-[#a83a2c] via-[#d4523a] to-[#f0a05a]",
        ring: "ring-rose-400/35",
        title: "Schiera l'assalto",
        Icon: Crosshair,
        iconCls: "text-rose-300",
      }
    : {
        glow: "rgba(56,189,248,0.45)",
        bar: "from-sky-600 via-sky-400 to-cyan-300",
        btn: "from-sky-600 via-sky-400 to-cyan-300",
        ring: "ring-sky-400/35",
        title: "Schiera la difesa",
        Icon: Shield,
        iconCls: "text-sky-300",
      };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          aria-label="Chiudi"
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          disabled={busy}
          onClick={onClose}
        />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="war-deploy-title"
          initial={{ opacity: 0, y: 56, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 32, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className={cn(
            "relative z-[1] mb-0 flex max-h-[min(92dvh,920px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[2rem] bg-[#0a0c14] shadow-[0_24px_80px_var(--war-glow)] ring-1 sm:mb-6 sm:rounded-[2rem]",
            accent.ring,
          )}
          style={{ ["--war-glow" as string]: accent.glow }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: attack
                ? "radial-gradient(ellipse 90% 55% at 50% -15%, rgba(168,58,44,0.42), transparent 62%), radial-gradient(ellipse 55% 40% at 100% 110%, rgba(234,88,12,0.16), transparent)"
                : "radial-gradient(ellipse 90% 55% at 50% -15%, rgba(56,189,248,0.36), transparent 62%), radial-gradient(ellipse 55% 40% at 0% 110%, rgba(34,197,94,0.1), transparent)",
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,248,231,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,248,231,0.07) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage: "radial-gradient(ellipse at 50% 20%, black 15%, transparent 72%)",
            }}
            aria-hidden
          />

          <header className="relative flex items-start justify-between gap-3 border-b border-crema/10 px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <h2
                id="war-deploy-title"
                className="flex items-center gap-2.5 font-display text-3xl font-semibold tracking-wide text-crema sm:text-4xl"
              >
                <accent.Icon className={cn("size-7 shrink-0 sm:size-8", accent.iconCls)} aria-hidden />
                {accent.title}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-crema/60">
                Decidi quante forze rischiare ora. Il resto resta al sicuro nell&apos;hangar.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full bg-crema/5 p-2 text-crema/70 ring-1 ring-crema/15 transition hover:bg-crema/10 hover:text-crema focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caramel"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>

          <div className="relative border-b border-crema/10 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-sans text-4xl font-semibold tabular-nums tracking-tight text-crema">
                  <Zap className={cn("size-7", accent.iconCls)} aria-hidden />
                  {selectedPower.toLocaleString("it-IT")}
                  <span className="text-base font-medium text-crema/50">potenza</span>
                </p>
                <p className="mt-1 text-xs text-crema/50">
                  {selectedCount.toLocaleString("it-IT")} unità schierate · hangar{" "}
                  {hangarPower.toLocaleString("it-IT")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !units.length}
                  onClick={() => setAll(true)}
                  className="rounded-full bg-crema/5 px-3 py-1.5 text-xs font-semibold text-crema/80 ring-1 ring-crema/15 transition hover:bg-crema/10 disabled:opacity-40"
                >
                  Tutto
                </button>
                <button
                  type="button"
                  disabled={busy || selectedCount < 1}
                  onClick={() => setAll(false)}
                  className="rounded-full bg-crema/5 px-3 py-1.5 text-xs font-semibold text-crema/80 ring-1 ring-crema/15 transition hover:bg-crema/10 disabled:opacity-40"
                >
                  Azzera
                </button>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-crema/10">
              <motion.div
                className={cn("h-full rounded-full bg-gradient-to-r", accent.bar)}
                initial={false}
                animate={{ width: `${powerPct}%` }}
                transition={{ type: "spring", stiffness: 240, damping: 30 }}
              />
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {!units.length ? (
              <p className="rounded-2xl bg-crema/[0.04] px-4 py-10 text-center text-sm text-crema/55 ring-1 ring-crema/10">
                Hangar vuoto: non puoi schierare nulla.
              </p>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {units.map((u, i) => {
                  const n = Math.max(0, Math.floor(qty[u.id] || 0));
                  const active = n > 0;
                  return (
                    <motion.li
                      key={u.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(0.35, i * 0.035), duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      className={cn(
                        "relative overflow-hidden rounded-2xl bg-black/50 p-3 ring-1 transition",
                        active
                          ? attack
                            ? "ring-rose-400/45 shadow-[0_12px_28px_rgba(168,58,44,0.22)]"
                            : "ring-sky-400/45 shadow-[0_12px_28px_rgba(56,189,248,0.18)]"
                          : "ring-crema/10",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <EventoTroopIcon unitId={u.id} size="md" alt={u.label} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-crema">{u.label}</p>
                          <p className="mt-0.5 text-xs text-crema/50">
                            ×{u.available} · {u.power} pot. / u
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy || n < 1}
                              onClick={() => bump(u.id, -1)}
                              aria-label={`Togli ${u.label}`}
                              className="inline-flex size-9 items-center justify-center rounded-full bg-crema/5 text-crema ring-1 ring-crema/15 transition hover:bg-crema/10 disabled:opacity-30"
                            >
                              <Minus className="size-4" aria-hidden />
                            </button>
                            <span className="min-w-[2.5rem] text-center font-sans text-xl font-semibold tabular-nums text-crema">
                              {n}
                            </span>
                            <button
                              type="button"
                              disabled={busy || n >= u.available}
                              onClick={() => bump(u.id, 1)}
                              aria-label={`Aggiungi ${u.label}`}
                              className="inline-flex size-9 items-center justify-center rounded-full bg-crema/5 text-crema ring-1 ring-crema/15 transition hover:bg-crema/10 disabled:opacity-30"
                            >
                              <Plus className="size-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              disabled={busy || u.available < 1}
                              onClick={() => setQty((p) => ({ ...p, [u.id]: u.available }))}
                              className="ml-auto rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-crema/55 ring-1 ring-crema/10 transition hover:bg-crema/5 disabled:opacity-30"
                            >
                              Max
                            </button>
                          </div>
                        </div>
                      </div>
                      {active ? (
                        <p className="mt-2 text-right text-[0.7rem] tabular-nums text-crema/45">
                          {(n * u.power).toLocaleString("it-IT")} potenza
                        </p>
                      ) : null}
                    </motion.li>
                  );
                })}
              </ul>
            )}

            {attack && bactaQty > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setUseBacta((v) => !v)}
                aria-pressed={useBacta}
                className={cn(
                  "mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 transition",
                  useBacta
                    ? "bg-emerald-500/15 ring-emerald-400/40 shadow-[0_12px_28px_rgba(52,211,153,0.18)]"
                    : "bg-black/45 ring-crema/10 hover:bg-black/60",
                )}
              >
                <EventoUtilityIcon itemId="bacta" size="md" alt="Bacta" className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-crema">
                    <Sparkles className="size-3.5 text-emerald-300" aria-hidden />
                    Inietta Bacta prima dell&apos;assalto
                  </p>
                  <p className="mt-0.5 text-xs text-crema/55">
                    Cura l&apos;arsenale (×{bactaQty} disponibili), poi schieri le forze scelte.
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider",
                    useBacta ? "bg-emerald-400/20 text-emerald-200" : "bg-crema/5 text-crema/45",
                  )}
                >
                  {useBacta ? "Attivo" : "Off"}
                </span>
              </button>
            ) : null}
          </div>

          <footer className="relative border-t border-crema/10 bg-black/50 px-5 py-4 sm:px-6">
            <button
              type="button"
              disabled={busy || selectedCount < 1}
              onClick={confirm}
              className={cn(
                "relative w-full overflow-hidden rounded-full bg-gradient-to-r py-3.5 text-sm font-bold tracking-wide text-ink shadow-[0_12px_40px_var(--war-glow)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40",
                accent.btn,
              )}
            >
              <span className="relative z-[1]">
                {busy
                  ? "Trasmissione…"
                  : attack
                    ? `Lancia l'attacco · ${selectedCount} unità`
                    : `Conferma difesa · ${selectedCount} unità`}
              </span>
              <motion.span
                className="pointer-events-none absolute inset-y-0 w-1/3 bg-crema/30"
                style={{ filter: "blur(14px)" }}
                animate={{ x: ["-130%", "340%"] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
                aria-hidden
              />
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
