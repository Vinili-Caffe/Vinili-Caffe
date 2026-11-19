"use client";

/**
 * React Bits — TrueFocus (adattato): parole a fuoco a rotazione, cornice caramel.
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

export function TrueFocus({
  sentence,
  className,
  intervalMs = 2200,
  borderColor = "var(--color-caramel)",
}: {
  sentence: string;
  className?: string;
  intervalMs?: number;
  borderColor?: string;
}) {
  const words = sentence.split(/\s+/).filter(Boolean);
  const reduce = useReducedMotionSafe();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce || words.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % words.length), intervalMs);
    return () => window.clearInterval(id);
  }, [reduce, words.length, intervalMs]);

  const active = reduce ? -1 : i % Math.max(words.length, 1);

  return (
    <span className={cn("relative inline-flex flex-wrap items-center justify-center gap-x-[0.35em] gap-y-1", className)}>
      {words.map((w, idx) => {
        const on = active < 0 || idx === active;
        return (
          <span
            key={`${w}-${idx}`}
            className={cn(
              "relative inline-block font-display font-semibold transition-[filter,opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              on ? "opacity-100 blur-0 scale-100" : "opacity-45 blur-[3px] scale-[0.98]",
            )}
          >
            {w}
            {on && !reduce ? (
              <motion.span
                layoutId="vc-true-focus-frame"
                className="pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 rounded-md"
                style={{
                  boxShadow: `0 0 0 2px ${borderColor}, 0 0 18px color-mix(in srgb, ${borderColor} 35%, transparent)`,
                }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
