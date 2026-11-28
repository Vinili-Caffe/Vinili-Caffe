"use client";

import { useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Elastic Slider (da React Bits): se trascini oltre gli estremi la barra si allunga come un elastico e torna
 * indietro con una molla; le icone ai lati rimbalzano. Tastiera: frecce, Home/Fine.
 */
export function ElasticSlider({
  value,
  onChange,
  label,
  left,
  right,
  className,
}: {
  value: number; // 0..1
  onChange: (v: number) => void;
  label: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const over = useMotionValue(0); // px oltre il bordo (negativo = a sinistra)
  const scaleX = useTransform(over, (o) => 1 + Math.min(0.12, Math.abs(o) / 400));
  const originX = useTransform(over, (o) => (o < 0 ? 1 : 0));
  const leftScale = useTransform(over, (o) => (o < 0 ? 1 + Math.min(0.4, -o / 60) : 1));
  const rightScale = useTransform(over, (o) => (o > 0 ? 1 + Math.min(0.4, o / 60) : 1));
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  const setFromX = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const raw = (clientX - r.left) / r.width;
    onChange(Math.max(0, Math.min(1, raw)));
    over.set(raw < 0 ? (clientX - r.left) : raw > 1 ? clientX - r.right : 0);
  };
  const release = () => animate(over, 0, { type: "spring", stiffness: 500, damping: 18 });

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {left ? <motion.span style={{ scale: leftScale }}>{left}</motion.span> : null}
      <motion.div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={{ scaleX, originX }}
        className="relative h-2.5 min-w-0 flex-1 cursor-pointer touch-none rounded-full bg-crema/15 outline-none focus-visible:ring-2 focus-visible:ring-caramel/60"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromX(e.clientX);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.05;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(1, value + step));
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(0, value - step));
          else if (e.key === "Home") onChange(0);
          else if (e.key === "End") onChange(1);
          else return;
          e.preventDefault();
        }}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-caramel to-ember" style={{ width: `${pct}%` }} />
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-crema shadow ring-2 ring-caramel"
          style={{ left: `${pct}%` }}
        />
      </motion.div>
      {right ? <motion.span style={{ scale: rightScale }}>{right}</motion.span> : null}
    </div>
  );
}
