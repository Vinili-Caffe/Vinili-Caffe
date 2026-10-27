"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { EventoBtn } from "@/components/evento/EventoUi";

export type CrateTint = { face: string; lid: string; glow: string; accent: string };

const CRATE_TINT: Record<string, CrateTint> = {
  omega: { face: "#c9a227", lid: "#f0d78c", glow: "rgba(201,162,39,0.75)", accent: "#ffe9a0" },
  alpha: { face: "#1d7fd4", lid: "#7dd3fc", glow: "rgba(46,168,255,0.7)", accent: "#bae6fd" },
  beta: { face: "#6d28d9", lid: "#c4b5fd", glow: "rgba(124,58,237,0.65)", accent: "#ddd6fe" },
  avvento: { face: "#15803d", lid: "#86efac", glow: "rgba(34,197,94,0.65)", accent: "#bbf7d0" },
  militare: { face: "#475569", lid: "#94a3b8", glow: "rgba(148,163,184,0.55)", accent: "#e2e8f0" },
  militare_plus: { face: "#64748b", lid: "#cbd5e1", glow: "rgba(203,213,225,0.6)", accent: "#f8fafc" },
  militare_op: { face: "#be123c", lid: "#fb7185", glow: "rgba(225,29,72,0.7)", accent: "#fecdd3" },
  casuale: { face: "#c2410c", lid: "#fdba74", glow: "rgba(249,115,22,0.65)", accent: "#fed7aa" },
};

export function crateTint(id: string): CrateTint {
  return CRATE_TINT[id] || CRATE_TINT.casuale!;
}

/** Cassa 3D CSS (stile chest da gioco). */
export function EventoCrateArt({
  crateId,
  open = false,
  shake = false,
  size = "md",
  qty,
  className = "",
}: {
  crateId: string;
  open?: boolean;
  shake?: boolean;
  size?: "sm" | "md" | "lg";
  qty?: number;
  className?: string;
}) {
  const t = crateTint(crateId);
  const box =
    size === "lg" ? "h-40 w-40 sm:h-48 sm:w-48" : size === "sm" ? "h-20 w-20" : "h-28 w-28 sm:h-32 sm:w-32";

  return (
    <motion.div
      className={`relative mx-auto ${box} ${className}`}
      style={{ perspective: 700 }}
      animate={shake ? { x: [0, -6, 7, -5, 4, 0], rotate: [0, -3, 3, -2, 1, 0] } : { x: 0, rotate: 0 }}
      transition={shake ? { duration: 0.55, repeat: Infinity, repeatDelay: 0.15 } : undefined}
    >
      <div
        className="pointer-events-none absolute -inset-4 rounded-full opacity-70 blur-2xl"
        style={{ background: t.glow }}
        aria-hidden
      />
      <div
        className="absolute inset-x-[8%] bottom-0 top-[34%] rounded-lg shadow-2xl ring-1 ring-white/25"
        style={{
          background: `linear-gradient(155deg, ${t.lid} 0%, ${t.face} 42%, #05070f 130%)`,
          boxShadow: `0 12px 36px -8px ${t.glow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
        }}
      >
        <div className="absolute inset-x-[12%] top-[14%] h-px bg-white/30" />
        <div className="absolute inset-x-[12%] bottom-[16%] h-px bg-black/35" />
        <div
          className="absolute left-1/2 top-1/2 flex size-[28%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2"
          style={{ borderColor: t.accent, background: "rgba(5,7,15,0.55)", boxShadow: `0 0 12px ${t.glow}` }}
        >
          <div className="h-[38%] w-[18%] rounded-sm" style={{ background: t.accent }} />
        </div>
      </div>
      <motion.div
        className="absolute inset-x-[4%] top-[4%] h-[38%] origin-bottom rounded-t-lg ring-1 ring-white/30"
        style={{
          background: `linear-gradient(180deg, ${t.accent} 0%, ${t.lid} 45%, ${t.face} 100%)`,
          transformStyle: "preserve-3d",
          boxShadow: `0 0 24px -4px ${t.glow}`,
        }}
        initial={false}
        animate={{ rotateX: open ? -125 : 0 }}
        transition={{ type: "spring", stiffness: 110, damping: 13 }}
      >
        <div className="absolute inset-x-[18%] bottom-[18%] h-1.5 rounded-full bg-black/30" />
        <div
          className="absolute left-1/2 top-[42%] size-2 -translate-x-1/2 rounded-full"
          style={{ background: t.accent, boxShadow: `0 0 8px ${t.glow}` }}
        />
      </motion.div>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-[18%] h-[70%] w-[70%] -translate-x-1/2 rounded-full"
            style={{
              background: `radial-gradient(circle, ${t.accent} 0%, transparent 68%)`,
              mixBlendMode: "screen",
            }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0.35, 0.9, 0.5], scale: [0.7, 1.25, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>
      {qty != null && qty > 0 ? (
        <span
          className="absolute -right-1 -top-1 z-10 flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums text-[#05070f] shadow-md ring-2 ring-[#05070f]/40"
          style={{ background: t.accent }}
        >
          {qty}
        </span>
      ) : null}
    </motion.div>
  );
}

export type CrateLootPayload = {
  crateId: string;
  label: string;
  credits: number;
  exp: number;
  note?: string | null;
};

type LootCard = { id: string; title: string; value: string; tone: "gold" | "blue" | "sand" };

/**
 * Overlay stile gioco: tap per aprire la cassa, poi tap per rivelare ogni premio.
 */
export function EventoCrateOpenOverlay({
  loot,
  onClose,
}: {
  loot: CrateLootPayload;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  /** closed → tap apre; revealing → tap rivela la prossima card; done → continua */
  const [phase, setPhase] = useState<"closed" | "opened" | "revealing" | "done">("closed");
  const [revealed, setRevealed] = useState(0);

  const cards = useMemo(() => {
    const out: LootCard[] = [];
    if (loot.credits > 0) {
      out.push({
        id: "cr",
        title: "Crediti",
        value: `+${loot.credits.toLocaleString("it-IT")}`,
        tone: "gold",
      });
    }
    if (loot.exp > 0) {
      out.push({
        id: "xp",
        title: "Esperienza",
        value: `+${loot.exp.toLocaleString("it-IT")} EXP`,
        tone: "blue",
      });
    }
    if (loot.note) {
      out.push({ id: "note", title: "Bonus", value: loot.note, tone: "sand" });
    }
    if (!out.length) {
      out.push({ id: "empty", title: "Vuoto", value: "Niente questa volta", tone: "sand" });
    }
    return out;
  }, [loot]);

  const remaining = Math.max(0, cards.length - revealed);
  const t = crateTint(loot.crateId);

  function advance() {
    if (phase === "closed") {
      setPhase("opened");
      window.setTimeout(() => setPhase("revealing"), 450);
      return;
    }
    if (phase === "opened") {
      setPhase("revealing");
      return;
    }
    if (phase === "revealing") {
      if (revealed >= cards.length) {
        setPhase("done");
        return;
      }
      const next = revealed + 1;
      setRevealed(next);
      if (next >= cards.length) setPhase("done");
      return;
    }
    if (phase === "done") onClose();
  }

  const hint =
    phase === "closed"
      ? "Tocca la cassa per aprirla"
      : phase === "opened"
        ? "Si apre…"
        : phase === "revealing"
          ? remaining > 0
            ? remaining === cards.length
              ? "Tocca per scoprire il premio"
              : `Tocca · ancora ${remaining} premi`
            : ""
          : "Tocca Continua";

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-[#03050c]/94" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-60"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 100%, ${t.glow}, transparent 70%)`,
        }}
        aria-hidden
      />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.32em]" style={{ color: t.accent }}>
          {loot.label}
        </p>

        <button
          type="button"
          className="relative touch-manipulation rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]/50"
          onClick={advance}
          aria-label={hint || "Continua"}
          disabled={phase === "opened"}
        >
          <EventoCrateArt
            crateId={loot.crateId}
            size="lg"
            open={phase !== "closed"}
            shake={phase === "closed"}
          />
        </button>

        {/* slot premi: coperte finché non le tocchi */}
        <div className="relative mt-6 flex min-h-[10rem] w-full flex-wrap items-center justify-center gap-3">
          <AnimatePresence mode="popLayout">
            {cards.map((c, i) => {
              const isShown = i < revealed;
              if (!isShown && phase !== "revealing" && phase !== "done") return null;
              if (!isShown && i > revealed) return null;
              // prossima da scoprire: card coperto cliccabile
              if (!isShown && i === revealed && phase === "revealing") {
                return (
                  <motion.button
                    key={`sealed-${c.id}`}
                    type="button"
                    layout
                    initial={{ opacity: 0, scale: 0.7, y: 24 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 280, damping: 18 }}
                    onClick={advance}
                    className="flex h-[7.5rem] w-[9.5rem] flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#1a2238] to-[#0a0e18] ring-1 ring-[#c9a227]/35"
                    style={{ boxShadow: `0 0 28px -6px ${t.glow}` }}
                  >
                    <span className="text-3xl text-[#e4c76b]/80" aria-hidden>
                      ?
                    </span>
                    <span className="mt-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-crema/45">
                      Tocca
                    </span>
                  </motion.button>
                );
              }
              if (!isShown) return null;
              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, rotateY: 90, scale: 0.7 }}
                  animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                  className="w-[9.5rem] rounded-2xl p-4 text-center shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] ring-1"
                  style={{
                    background:
                      c.tone === "gold"
                        ? "linear-gradient(160deg,#3a2a0c,#12100a 70%)"
                        : c.tone === "blue"
                          ? "linear-gradient(160deg,#0c243a,#0a1018 70%)"
                          : "linear-gradient(160deg,#1a1620,#0a0c12 70%)",
                    borderColor:
                      c.tone === "gold"
                        ? "rgba(228,199,107,0.45)"
                        : c.tone === "blue"
                          ? "rgba(125,211,252,0.4)"
                          : "rgba(244,233,216,0.2)",
                    boxShadow:
                      i === revealed - 1
                        ? `0 0 32px -4px ${
                            c.tone === "gold"
                              ? "rgba(201,162,39,0.7)"
                              : c.tone === "blue"
                                ? "rgba(46,168,255,0.55)"
                                : "rgba(244,233,216,0.25)"
                          }`
                        : undefined,
                  }}
                >
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.22em] text-crema/50">{c.title}</p>
                  <p
                    className="mt-2 font-display text-xl font-semibold leading-tight"
                    style={{
                      color: c.tone === "gold" ? "#f0d78c" : c.tone === "blue" ? "#7dd3fc" : "#f4e9d8",
                    }}
                  >
                    {c.value}
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {phase === "done" ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
            <EventoBtn onClick={onClose}>Continua</EventoBtn>
          </motion.div>
        ) : (
          <p className="mt-8 text-center text-xs text-crema/45">{hint}</p>
        )}
      </div>
    </motion.div>
  );
}
