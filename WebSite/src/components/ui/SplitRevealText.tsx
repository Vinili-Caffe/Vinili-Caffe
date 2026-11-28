"use client";

import { motion} from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

/**
 * Titolo che si compone lettera per lettera quando entra nello schermo (idea: Motion «split text mask»):
 * ogni lettera sale da sotto una maschera, con un piccolo ritardo l'una dall'altra.
 * Le parole restano intere (vanno a capo come testo normale); il testo vero resta leggibile ai lettori di schermo.
 */
export function SplitRevealText({ text, className, stagger = 0.022 }: { text: string; className?: string; stagger?: number }) {
  const reduce = useReducedMotionSafe();
  if (reduce) return <span className={className}>{text}</span>;
  let i = 0;
  const words = text.split(" ");
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, wi) => (
          <span key={wi} className="inline-block whitespace-nowrap">
            {Array.from(w).map((ch) => {
              const n = i++;
              return (
                <span key={n} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
                  <motion.span
                    className="inline-block"
                    initial={{ y: "110%", rotate: 6 }}
                    whileInView={{ y: "0%", rotate: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ delay: n * stagger, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {ch}
                  </motion.span>
                </span>
              );
            })}
            {wi < words.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
          </span>
        ))}
      </span>
    </span>
  );
}
