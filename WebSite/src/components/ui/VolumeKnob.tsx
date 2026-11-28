"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

/** tacche della corona: una ogni 10% (11 in tutto), da -135° a +135° */
const TICKS = Array.from({ length: 11 }, (_, i) => i * 10);
const STEP = 5;
const angleFor = (v: number) => -135 + (Math.min(100, Math.max(0, v)) / 100) * 270;

/**
 * Manopola del volume, come quella di uno stereo (idea: detent dial di Kokonut UI).
 * Si gira trascinando (su/giù o destra/sinistra), con la rotella o con le frecce; scatta di 5 in 5.
 */
export function VolumeKnob({
  value,
  onChange,
  label = "Volume",
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const drag = useRef<{ x: number; y: number; start: number } | null>(null);
  const v = Math.round(Math.min(100, Math.max(0, value)));
  const set = (n: number) => {
    const snapped = Math.min(100, Math.max(0, Math.round(n / STEP) * STEP));
    if (snapped !== v) onChange(snapped);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-valuetext={`${v}%`}
      title={`${label}: ${v}%`}
      className={cn(
        "relative size-11 shrink-0 cursor-grab touch-none select-none rounded-full outline-none active:cursor-grabbing",
        "focus-visible:ring-2 focus-visible:ring-caramel/70 focus-visible:ring-offset-2 focus-visible:ring-offset-espresso",
        className,
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY, start: v };
        try {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          /* puntatore già rilasciato: il trascinamento funziona lo stesso finché resta sopra */
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        /* su o a destra = più volume; 1px ≈ 0,6% */
        set(d.start + (d.y - e.clientY + (e.clientX - d.x)) * 0.6);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onWheel={(e) => {
        set(v + (e.deltaY < 0 ? STEP : -STEP));
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          set(v + STEP);
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          set(v - STEP);
        } else if (e.key === "Home") {
          e.preventDefault();
          set(0);
        } else if (e.key === "End") {
          e.preventDefault();
          set(100);
        }
      }}
    >
      {/* corona di tacche: si accendono fino al volume attuale */}
      {TICKS.map((t) => (
        <span
          key={t}
          aria-hidden
          className="absolute left-1/2 top-1/2 h-full w-px -translate-x-1/2 -translate-y-1/2"
          style={{ transform: `translate(-50%, -50%) rotate(${angleFor(t)}deg)` }}
        >
          <span
            className={cn(
              "absolute left-0 top-0 h-[3px] w-px rounded-full transition-colors duration-150",
              t <= v && v > 0 ? "bg-caramel" : "bg-crema/20",
            )}
          />
        </span>
      ))}

      {/* il pomello: metallo spazzolato scuro, con la tacca bianca che indica il volume */}
      <motion.div
        aria-hidden
        className="absolute inset-[5px] rounded-full bg-[conic-gradient(#3a3330,#1a1512,#4a413b,#16120f,#3a3330)] shadow-[0_3px_8px_-2px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,240,220,0.18)] ring-1 ring-black/60"
        animate={{ rotate: angleFor(v) }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 26, mass: 0.5 }}
      >
        <span className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#4a403a,#1d1815)] ring-1 ring-black/50" />
        <span className="absolute left-1/2 top-[3px] h-[7px] w-[2px] -translate-x-1/2 rounded-full bg-crema shadow-[0_0_4px_rgba(244,233,216,0.6)]" />
      </motion.div>
    </div>
  );
}
