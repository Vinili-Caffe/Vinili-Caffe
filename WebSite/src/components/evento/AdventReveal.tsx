"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { ADVENT_CRATE_LABELS, type AdventCrateId } from "@/lib/evento-avvento";
import { cn } from "@/lib/cn";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { EventoCrateArt } from "@/components/evento/EventoCrateArt";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";

export type AdventGranted =
  | { type: "crate"; crateId: string; qty?: number; label?: string }
  | { type: "premium_credits"; amount: number };

function CreditsBurst({ amount }: { amount: number }) {
  return (
    <motion.div
      className="relative mx-auto flex h-28 w-28 flex-col items-center justify-center sm:h-32 sm:w-32"
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 14 }}
    >
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#c9a227]/45 to-[#2ea8ff]/15 blur-md" />
      <EventoCreditsIcon size="hero" className="relative drop-shadow-[0_0_22px_rgba(201,162,39,0.75)]" />
      <span className="relative mt-1 font-display text-xl font-bold tabular-nums text-[#e4c76b]">
        {amount.toLocaleString("it-IT")}
      </span>
    </motion.div>
  );
}

/** Overlay: cassa che si apre subito → premio (porta già flippata sulla casella). */
export function AdventReveal({
  day,
  label,
  granted,
  onClose,
}: {
  day: number;
  label: string;
  granted: AdventGranted[];
  onClose: () => void;
}) {
  const items = useMemo(() => {
    if (granted?.length) return granted;
    return [] as AdventGranted[];
  }, [granted]);

  const [phase, setPhase] = useState<"door" | "crates" | "open" | "done">("crates");
  const [openIdx, setOpenIdx] = useState(-1);
  useBodyScrollLock(true);

  useEffect(() => {
    /* Skip porta: la casella hub ha già flippato → cassa chiusa → apre subito. */
    const t = window.setTimeout(() => setPhase("open"), 420);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "open") return;
    if (!items.length) {
      setPhase("done");
      return;
    }
    let i = 0;
    setOpenIdx(0);
    const id = window.setInterval(() => {
      i += 1;
      if (i >= items.length) {
        window.clearInterval(id);
        window.setTimeout(() => setPhase("done"), 650);
        return;
      }
      setOpenIdx(i);
    }, 900);
    return () => window.clearInterval(id);
  }, [phase, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const current = openIdx >= 0 ? items[openIdx] : null;

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.button
        type="button"
        aria-label="Chiudi"
        className="absolute inset-0 bg-[#05070f]/85 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />

      <motion.div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-gradient-to-b from-[#121a32] to-[#05070f] p-5 ring-1 ring-[#c9a227]/35 sm:p-7"
        initial={{ scale: 0.86, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-white/5 p-2 text-crema/70 ring-1 ring-white/10 hover:bg-white/10"
          aria-label="Chiudi"
        >
          <X className="size-4" />
        </button>

        <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">
          Giorno {day}
        </p>
        <h3 className="mt-1 text-center font-display text-2xl font-semibold text-crema sm:text-3xl">{label}</h3>

        <div className="relative mt-6 min-h-[11rem]">
          <AnimatePresence mode="wait">
            {phase === "door" ? (
              <motion.div
                key="door"
                className="mx-auto flex h-40 w-36 flex-col items-center justify-end"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <motion.div
                  className="relative h-36 w-32 overflow-hidden rounded-xl bg-gradient-to-br from-[#1a2744] to-[#0a1020] ring-2 ring-[#c9a227]/50"
                  style={{ perspective: 800 }}
                >
                  <motion.div
                    className="absolute inset-0 origin-left bg-gradient-to-br from-[#c9a227]/40 via-[#2a1c14] to-[#0a1020]"
                    initial={{ rotateY: 0 }}
                    animate={{ rotateY: -105 }}
                    transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      transformStyle: "preserve-3d",
                      boxShadow: "inset -8px 0 20px rgba(0,0,0,0.45)",
                    }}
                  >
                    <span className="absolute left-3 top-3 font-display text-3xl text-crema/90">{day}</span>
                    <span className="absolute bottom-3 left-3 right-3 line-clamp-2 text-[0.65rem] text-crema/60">
                      {label}
                    </span>
                  </motion.div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="size-8 text-[#e4c76b]" />
                  </div>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="loot"
                className="flex flex-col items-center"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {current?.type === "premium_credits" ? (
                  <CreditsBurst amount={current.amount} />
                ) : current?.type === "crate" ? (
                  <EventoCrateArt
                    crateId={String(current.crateId)}
                    open={phase === "open" || phase === "done"}
                    qty={current.qty}
                    size="md"
                  />
                ) : (
                  <Sparkles className="size-12 text-[#e4c76b]" />
                )}

                <AnimatePresence mode="wait">
                  {(phase === "open" || phase === "done") && current ? (
                    <motion.div
                      key={`lbl-${openIdx}`}
                      className="mt-4 text-center"
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8 }}
                    >
                      <p className="font-display text-xl font-semibold text-[#e4c76b]">
                        {current.type === "premium_credits"
                          ? `${current.amount.toLocaleString("it-IT")} crediti`
                          : current.label ||
                            ADVENT_CRATE_LABELS[current.crateId as AdventCrateId] ||
                            "Cassa"}
                      </p>
                      {current.type === "crate" ? (
                        <p className="mt-1 text-xs text-crema/55">Aggiunta all’inventario casse</p>
                      ) : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* streak di particelle */}
                {(phase === "open" || phase === "done") && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <motion.span
                        key={i}
                        className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-[#e4c76b]"
                        initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                        animate={{
                          opacity: 0,
                          x: (Math.random() - 0.5) * 180,
                          y: -40 - Math.random() * 100,
                          scale: 0,
                        }}
                        transition={{ duration: 0.9 + Math.random() * 0.4, delay: i * 0.04 }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* strip di tutte le rewards */}
        {items.length > 1 ? (
          <ul className="mt-5 flex flex-wrap justify-center gap-1.5">
            {items.map((g, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ring-1",
                  i <= openIdx
                    ? "bg-[#c9a227]/20 text-[#e4c76b] ring-[#c9a227]/40"
                    : "bg-white/5 text-crema/40 ring-white/10",
                )}
              >
                {g.type === "premium_credits" ? (
                  <span className="inline-flex items-center gap-1">
                    <EventoCreditsIcon size="xs" />
                    {g.amount.toLocaleString("it-IT")}
                  </span>
                ) : (
                  g.label || ADVENT_CRATE_LABELS[g.crateId as AdventCrateId] || g.crateId
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-gradient-to-r from-[#c9a227] to-[#e4c76b] py-2.5 text-sm font-semibold text-ink hover:brightness-105"
        >
          {phase === "done" ? "Continua" : "Salta"}
        </button>
      </motion.div>
    </motion.div>
  );
}
