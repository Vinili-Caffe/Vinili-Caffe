"use client";

import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";
import { useRichFx } from "@/components/effects/DeviceFxProvider";

/**
 * Number Ticker (da Magic UI): il numero sale contando quando entra nello schermo.
 * Scrive direttamente nel testo (niente re-render a ogni frame); con DeviceFx off/lite mostra subito il valore.
 */
export function NumberTicker({
  value,
  format = (n) => new Intl.NumberFormat("it-IT").format(Math.round(n)),
  duration = 1.4,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const rich = useRichFx();
  const shown = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (!rich || !Number.isFinite(value)) {
      el.textContent = format(value);
      shown.current = value;
      return;
    }
    const controls = animate(shown.current, value, {
      duration: shown.current === 0 ? duration : 0.5,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [inView, value, rich, format, duration]);

  return (
    <span ref={ref} className={className ?? "lining-nums tabular-nums"}>
      {format(value)}
    </span>
  );
}
