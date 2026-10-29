"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Marquee per display name lunghi (es. UserMenu navbar).
 * Se il testo ci sta, resta statico; se overflow → clone + slide Motion.
 * `underline`: linea sotto ogni segmento (segue il marquee) — always | hover.
 */
export function HeaderNameMarquee({
  text,
  className,
  underline,
}: {
  text: string;
  className?: string;
  underline?: "always" | "hover" | false;
}) {
  const reduce = useReducedMotion();
  const hostRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [marquee, setMarquee] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(8);

  const lineOnSeg = underline
    ? cn(
        "relative",
        // sotto il glyph, senza pb sul host (altrimenti wordmark e username non restano allineati)
        "after:pointer-events-none after:absolute after:left-0 after:-bottom-[3px] after:h-[1.5px] after:rounded-full",
        "after:bg-gradient-to-r after:from-mocha after:via-crema after:to-mocha",
        "after:origin-left after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.22,1,0.36,1)]",
        // destra: non coprire il gap tra cloni del marquee
        marquee ? "after:right-6" : "after:right-0",
        underline === "always" ? "after:scale-x-100" : "after:scale-x-0 group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100",
      )
    : undefined;

  useEffect(() => {
    const host = hostRef.current;
    const probe = measureRef.current;
    if (!host || !probe) return;

    const measure = () => {
      const containerW = host.clientWidth || 0;
      const textW = Math.ceil(probe.scrollWidth || 0);
      if (containerW <= 0 || textW <= 0) {
        setMarquee(false);
        return;
      }
      if (reduce || textW <= containerW + 2) {
        setMarquee(false);
        return;
      }
      const seg = Math.ceil(textW + 26);
      setDistance(seg);
      setDuration(Math.max(6, Math.min(12, seg / 40)));
      setMarquee(true);
    };

    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(host);
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text, reduce]);

  return (
    <span
      ref={hostRef}
      className={cn(
        "relative block leading-none",
        marquee ? "overflow-hidden whitespace-nowrap" : "truncate",
        className,
      )}
      title={text}
    >
      {/* probe nascosto: misura senza truncate (altrimenti scrollWidth = clientWidth) */}
      <span
        ref={measureRef}
        className="pointer-events-none absolute left-0 top-0 -z-10 whitespace-nowrap opacity-0"
        aria-hidden
      >
        {text}
      </span>

      {marquee ? (
        <motion.span
          className="inline-flex"
          animate={{ x: [0, -distance] }}
          transition={{ duration, ease: "linear", repeat: Infinity }}
        >
          <span className={cn("inline-block shrink-0 pr-6", lineOnSeg)}>{text}</span>
          <span className={cn("inline-block shrink-0 pr-6", lineOnSeg)} aria-hidden>
            {text}
          </span>
        </motion.span>
      ) : (
        <span className={cn("inline-block max-w-full", lineOnSeg, !marquee && "truncate")}>{text}</span>
      )}
    </span>
  );
}
