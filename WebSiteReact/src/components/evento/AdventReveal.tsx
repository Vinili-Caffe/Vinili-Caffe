"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { ADVENT_CRATE_LABELS, type AdventCrateId } from "@/lib/evento-avvento";
import { cn } from "@/lib/cn";

export type AdventGranted =
  | { type: "crate"; crateId: string; qty?: number; label?: string }
  | { type: "premium_credits"; amount: number };

const CRATE_TINT: Record<string, { face: string; lid: string; glow: string }> = {
  omega: { face: "#c9a227", lid: "#e4c76b", glow: "rgba(201,162,39,0.65)" },
  alpha: { face: "#2ea8ff", lid: "#7dd3fc", glow: "rgba(46,168,255,0.6)" },
  beta: { face: "#7c3aed", lid: "#a78bfa", glow: "rgba(124,58,237,0.55)" },
  avvento: { face: "#22c55e", lid: "#86efac", glow: "rgba(34,197,94,0.55)" },
  militare: { face: "#64748b", lid: "#94a3b8", glow: "rgba(148,163,184,0.5)" },
  militare_plus: { face: "#94a3b8", lid: "#cbd5e1", glow: "rgba(203,213,225,0.55)" },
  militare_op: { face: "#e11d48", lid: "#fb7185", glow: "rgba(225,29,72,0.6)" },
  casuale: { face: "#f0b46e", lid: "#fde68a", glow: "rgba(240,180,110,0.55)" },
};

function crateTint(id: string) {
  return CRATE_TINT[id] || CRATE_TINT.casuale!;
}

function CrateVisual({
  crateId,
  open,
  qty,
}: {
  crateId: string;
  open: boolean;
  qty?: number;
}) {
  const t = crateTint(crateId);
  return (
    <div className="relative mx-auto h-28 w-28 sm:h-32 sm:w-32" style={{ perspective: 600 }}>
      {/* corpo */}
      <div
        className="absolute inset-x-2 bottom-0 top-10 rounded-md shadow-2xl ring-1 ring-white/20"
        style={{
          background: `linear-gradient(160deg, ${t.lid} 0%, ${t.face} 45%, #0a1020 140%)`,
          boxShadow: `0 0 28px -4px ${t.glow}`,
        }}
      >
        <div className="absolute inset-x-3 top-3 h-px bg-white/25" />
        <div className="absolute inset-x-3 bottom-3 h-px bg-black/30" />
        <div
          className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
          style={{ borderColor: t.lid, background: "rgba(5,7,15,0.45)" }}
        />
        {qty && qty > 1 ? (
          <span className="absolute bottom-1.5 right-2 font-display text-sm font-bold text-white/90">×{qty}</span>
        ) : null}
      </div>
      {/* coperchio */}
      <motion.div
        className="absolute inset-x-1 top-2 h-12 origin-bottom rounded-t-md ring-1 ring-white/25"
        style={{
          background: `linear-gradient(180deg, ${t.lid}, ${t.face})`,
          transformStyle: "preserve-3d",
          boxShadow: `0 0 20px -2px ${t.glow}`,
        }}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: open ? -118 : 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 14, delay: open ? 0.15 : 0 }}
      >
        <div className="absolute inset-x-4 bottom-2 h-1.5 rounded-full bg-black/25" />
      </motion.div>
    </div>
  );
}

function CreditsBurst({ amount }: { amount: number }) {
  return (
    <motion.div
      className="relative mx-auto flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32"
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 14 }}
    >
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#c9a227]/50 to-[#2ea8ff]/20 blur-md" />
      <div className="relative flex size-24 flex-col items-center justify-center rounded-full bg-gradient-to-br from-[#e4c76b] to-[#c9a227] text-ink shadow-[0_0_40px_-6px_rgba(201,162,39,0.8)] ring-2 ring-white/30">
        <span className="font-display text-2xl font-bold leading-none">{amount.toLocaleString("it-IT")}</span>
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider">crediti</span>
      </div>
    </motion.div>
  );
}

/** Overlay: porta → casse che si aprono → oggetti. */
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

  const [phase, setPhase] = useState<"door" | "crates" | "open" | "done">("door");
  const [openIdx, setOpenIdx] = useState(-1);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("crates"), 700);
    const t2 = window.setTimeout(() => setPhase("open"), 1400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
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
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    const sb = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (sb > 0) document.body.style.paddingRight = `${sb}px`;
    try {
      window.scrollTo({ top: window.scrollY, behavior: "instant" as ScrollBehavior });
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
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
                  <CrateVisual
                    crateId={String(current.crateId)}
                    open={phase === "open" || phase === "done"}
                    qty={current.qty}
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
                          ? `${current.amount.toLocaleString("it-IT")} crediti premium`
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
                {g.type === "premium_credits"
                  ? `${g.amount} crediti`
                  : g.label || ADVENT_CRATE_LABELS[g.crateId as AdventCrateId] || g.crateId}
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
