"use client";

import { motion } from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";
import { VinylRecord } from "@/components/VinylRecord";
import type { WrappedMood } from "@/lib/wrappedMoods";

/* dove sta il disco su ogni scheda: così ogni pagina ha una composizione sua */
const LAYOUT: Record<string, { x: string; y: string; size: string; show: boolean }> = {
  hello: { x: "62%", y: "-18%", size: "min(115vw,46rem)", show: true },
  days: { x: "-38%", y: "52%", size: "min(95vw,38rem)", show: true },
  messages: { x: "58%", y: "58%", size: "min(90vw,36rem)", show: false },
  voice: { x: "48%", y: "-30%", size: "min(110vw,44rem)", show: true },
  support: { x: "-30%", y: "-24%", size: "min(85vw,34rem)", show: false },
  boost: { x: "56%", y: "50%", size: "min(100vw,40rem)", show: true },
  games: { x: "-34%", y: "-20%", size: "min(90vw,36rem)", show: false },
  particular: { x: "50%", y: "54%", size: "min(100vw,40rem)", show: true },
  role: { x: "-40%", y: "58%", size: "min(90vw,36rem)", show: false },
  share: { x: "60%", y: "-26%", size: "min(100vw,40rem)", show: true },
};

/**
 * Sfondo di una scheda: carta a colore pieno, un retino a puntini, i solchi di un disco
 * e (su alcune) un vinile vero che entra dal bordo e gira piano.
 */
export function WrappedSlideDecor({ mood, celebrate }: { mood: WrappedMood; celebrate?: boolean }) {
  const reduce = useReducedMotionSafe();
  const l = LAYOUT[mood.id] || LAYOUT.hello!;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: mood.paper }} aria-hidden>
      {/* retino a puntini, come una stampa */}
      <div
        className="absolute -left-10 top-1/3 h-[60vh] w-[60vw] opacity-[0.18] [mask-image:radial-gradient(closest-side,black,transparent)]"
        style={{ backgroundImage: `radial-gradient(${mood.mark} 1.6px, transparent 1.7px)`, backgroundSize: "14px 14px" }}
      />

      {/* solchi (sempre), o il disco intero dove c'è spazio */}
      <motion.div
        className="absolute"
        style={{ left: l.x, top: l.y, width: l.size, height: l.size }}
        initial={reduce ? false : { opacity: 0, scale: 0.9, rotate: -20 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="size-full"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={reduce ? undefined : { duration: 24, repeat: Infinity, ease: "linear" }}
        >
          {l.show ? (
            <VinylRecord className="size-full opacity-95 drop-shadow-[0_30px_60px_rgba(0,0,0,0.45)]" />
          ) : (
            <div className="relative size-full">
              {[0, 7, 14, 21, 28, 35, 42].map((m) => (
                <span key={m} className="absolute rounded-full border" style={{ inset: `${m}%`, borderColor: mood.ink, opacity: 0.09 }} />
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* grana leggera, per non sembrare un colore piatto di plastica */}
      <div
        className="absolute inset-0 opacity-[0.09] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* festa: coriandoli quadrati dal basso */}
      {celebrate && !reduce
        ? Array.from({ length: 18 }, (_, i) => (
            <motion.span
              key={i}
              className="absolute bottom-0 size-2.5"
              style={{ left: `${5 + ((i * 37) % 90)}%`, background: i % 3 === 0 ? mood.ink : mood.mark }}
              initial={{ y: 40, opacity: 0, rotate: 0 }}
              animate={{ y: [-20, -260 - (i % 5) * 60], opacity: [0, 1, 0], rotate: (i % 2 ? 1 : -1) * 240 }}
              transition={{ duration: 1.8 + (i % 4) * 0.3, delay: 0.15 + (i % 6) * 0.07, ease: "easeOut" }}
            />
          ))
        : null}
    </div>
  );
}
