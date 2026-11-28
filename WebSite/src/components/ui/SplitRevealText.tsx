"use client";

import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Titolo che si compone parola per parola quando entra nello schermo (idea: Motion «split text»):
 * ogni parola sale e compare, una dopo l'altra.
 * Niente maschere sulle singole lettere: su iPhone (Safari) con tante lettere mascherate e animate
 * alcune restavano tagliate e il titolo appariva a pezzi. Rete di sicurezza: se il titolo è già arrivato
 * o è stato superato (scroll veloce), compare comunque. Il testo vero resta leggibile ai lettori di schermo.
 */
export function SplitRevealText({ text, className, stagger = 0.07 }: { text: string; className?: string; stagger?: number }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown || reduce) return;
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) setShown(true);
    };
    check();
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setShown(true), { threshold: 0 });
    io.observe(el);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    /* ultima garanzia: dopo qualche secondo compare in ogni caso */
    const t = window.setTimeout(() => setShown(true), 4000);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearTimeout(t);
    };
  }, [shown, reduce]);

  if (reduce) return <span className={className}>{text}</span>;

  const parent: Variants = { hidden: {}, shown: { transition: { staggerChildren: stagger } } };
  const word: Variants = {
    hidden: { opacity: 0, y: "0.45em" },
    shown: { opacity: 1, y: "0em", transition: { duration: 0.6, ease: EASE } },
  };
  const words = text.split(" ");

  return (
    <motion.span ref={ref} className={className} variants={parent} initial="hidden" animate={shown ? "shown" : "hidden"}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, wi) => (
          <span key={wi}>
            <motion.span className="inline-block" variants={word}>
              {w}
            </motion.span>
            {wi < words.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </motion.span>
  );
}
