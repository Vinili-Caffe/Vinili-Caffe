"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

/** Tazzina disegnata con Tailwind: il vapore sale piano (solo transform/opacity). */
export function Cup({ size = 1, foam, className }: { size?: number; foam?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("relative mx-auto h-32 w-40", className)} style={{ transform: `scale(${size})` }} aria-hidden>
      {/* vapore */}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute bottom-[62%] h-10 w-2 rounded-full bg-gradient-to-t from-crema/0 via-crema/25 to-crema/0 blur-[3px]"
          style={{ left: `${38 + i * 11}%` }}
          initial={{ opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 0.35, y: 0 } : { opacity: [0, 0.7, 0], y: [6, -16, -30], scaleX: [1, 1.6, 0.8] }}
          transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }}
        />
      ))}
      {/* piattino */}
      <span className="absolute bottom-0 left-1/2 h-4 w-40 -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-sand/90 to-sand/50 shadow-[0_10px_20px_-8px_rgba(0,0,0,0.8)]" />
      {/* manico */}
      <span className="absolute bottom-7 right-3 size-10 rounded-full border-[7px] border-crema/85" />
      {/* tazza */}
      <span className="absolute bottom-2.5 left-1/2 h-[4.5rem] w-28 -translate-x-1/2 overflow-hidden rounded-b-[2.6rem] rounded-t-md bg-gradient-to-br from-crema to-sand shadow-[inset_-8px_-6px_14px_rgba(120,80,50,0.35)]">
        <span className="absolute inset-x-0 top-0 h-3 rounded-[50%] bg-gradient-to-b from-mocha to-espresso" />
        {foam && <span className="absolute inset-x-3 top-0.5 h-2 rounded-[50%] bg-[radial-gradient(circle,#f4e9d8,#d6b48e)]" />}
      </span>
    </div>
  );
}
