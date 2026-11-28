"use client";

import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Titolo che si compone lettera per lettera quando entra nello schermo (idea: Motion «split text mask»):
 * ogni lettera sale da sotto una maschera, una dopo l'altra.
 * Un solo controllo per tutto il titolo (prima ce n'era uno per lettera e su iPhone alcune lettere non
 * partivano mai). In più una rete di sicurezza: se il titolo è già arrivato o è stato superato (scroll veloce),
 * compare comunque. Il testo vero resta leggibile ai lettori di schermo.
 */
export function SplitRevealText({ text, className, stagger = 0.022 }: { text: string; className?: string; stagger?: number }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown || reduce) return;
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const r = el.getBoundingClientRect();
      /* arrivato nello schermo, o già passato sopra */
      if (r.top < window.innerHeight * 0.92) setShown(true);
    };
    check();
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setShown(true), { threshold: 0 });
    io.observe(el);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [shown, reduce]);

  if (reduce) return <span className={className}>{text}</span>;

  const parent: Variants = { hidden: {}, shown: { transition: { staggerChildren: stagger } } };
  const letter: Variants = {
    hidden: { y: "110%", rotate: 6 },
    shown: { y: "0%", rotate: 0, transition: { duration: 0.6, ease: EASE } },
  };
  const words = text.split(" ");

  return (
    <motion.span ref={ref} className={className} variants={parent} initial="hidden" animate={shown ? "shown" : "hidden"}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, wi) => (
          <span key={wi} className="inline-block whitespace-nowrap">
            {Array.from(w).map((ch, ci) => (
              <span key={ci} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
                <motion.span className="inline-block" variants={letter}>
                  {ch}
                </motion.span>
              </span>
            ))}
            {wi < words.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
          </span>
        ))}
      </span>
    </motion.span>
  );
}
