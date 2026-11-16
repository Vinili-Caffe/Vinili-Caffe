"use client";

/**
 * React Bits — BlurText (adattato): parole che partono sfocate e si mettono a fuoco.
 * Dipendenza: motion (già nel sito).
 */
import { motion, useInView, useReducedMotion, type Easing } from "motion/react";
import { useMemo, useRef } from "react";
import { cn } from "@/lib/cn";

const EASE: Easing = [0.22, 1, 0.36, 1];

export function BlurText({
  text,
  className,
  delay = 0.05,
  blur = 8,
  y = 18,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  delay?: number;
  blur?: number;
  y?: number;
  as?: "span" | "h1" | "h2" | "h3" | "p";
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  const reduce = useReducedMotion();
  const words = useMemo(() => text.split(/(\s+)/).filter(Boolean), [text]);

  return (
    <Tag ref={ref as never} className={cn("inline-block", className)} aria-label={text}>
      {words.map((w, i) =>
        /^\s+$/.test(w) ? (
          <span key={`s${i}`}>{w}</span>
        ) : (
          <motion.span
            key={`${i}-${w}`}
            className="inline-block will-change-[transform,filter,opacity]"
            initial={reduce ? false : { opacity: 0, filter: `blur(${blur}px)`, y }}
            animate={inView || reduce ? { opacity: 1, filter: "blur(0px)", y: 0 } : undefined}
            transition={{ duration: 0.55, delay: reduce ? 0 : i * delay, ease: EASE }}
          >
            {w}
          </motion.span>
        ),
      )}
    </Tag>
  );
}
