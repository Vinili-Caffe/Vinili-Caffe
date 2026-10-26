"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

/** Angoli immersivi Star Wars: stelle, alone laser, alone kyber. */
export function StarWarsDecor({ live }: { live: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" aria-hidden>
      {/* Alone blu / oro */}
      <div
        className="absolute -left-24 top-16 size-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(46,168,255,0.35), transparent 70%)" }}
      />
      <div
        className="absolute -right-20 bottom-24 size-80 rounded-full opacity-35 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(201,162,39,0.28), transparent 70%)" }}
      />

      {/* Stelle fisse angoli */}
      <svg className="absolute left-3 top-20 size-28 opacity-70 sm:left-6 sm:top-24 sm:size-36" viewBox="0 0 120 120">
        {[
          [18, 22, 1.2],
          [42, 14, 0.8],
          [28, 48, 1],
          [58, 36, 0.7],
          [14, 72, 0.9],
          [48, 68, 1.1],
          [72, 52, 0.6],
          [86, 28, 0.85],
        ].map(([x, y, r], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill="#f0e6c8"
            initial={false}
            animate={live ? { opacity: [0.35, 1, 0.45, 0.9, 0.35] } : { opacity: 0.7 }}
            transition={live ? { duration: 3.2 + i * 0.35, repeat: Infinity, ease: "easeInOut" } : undefined}
          />
        ))}
      </svg>

      <svg className="absolute bottom-28 right-4 size-24 opacity-65 sm:bottom-32 sm:right-8 sm:size-32" viewBox="0 0 100 100">
        {[
          [20, 30, 0.9],
          [55, 18, 1.1],
          [78, 42, 0.7],
          [40, 60, 1],
          [68, 72, 0.8],
          [22, 78, 0.65],
        ].map(([x, y, r], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill="#e4c76b"
            initial={false}
            animate={live ? { opacity: [0.3, 0.95, 0.4, 0.85, 0.3] } : { opacity: 0.65 }}
            transition={live ? { duration: 2.8 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 } : undefined}
          />
        ))}
      </svg>

      {/* Tratto laser sottile */}
      <motion.div
        className={cn(
          "absolute left-[8%] top-[42%] h-px w-[18%] origin-left rounded-full",
          "bg-gradient-to-r from-transparent via-[#2ea8ff] to-transparent opacity-50",
        )}
        initial={false}
        animate={live ? { opacity: [0.15, 0.7, 0.2], scaleX: [0.6, 1, 0.75] } : { opacity: 0.35 }}
        transition={live ? { duration: 4.5, repeat: Infinity, ease: "easeInOut" } : undefined}
      />
      <motion.div
        className={cn(
          "absolute bottom-[28%] right-[10%] h-px w-[14%] origin-right rounded-full",
          "bg-gradient-to-l from-transparent via-[#e11d48]/80 to-transparent opacity-40",
        )}
        initial={false}
        animate={live ? { opacity: [0.1, 0.55, 0.15], scaleX: [0.7, 1, 0.8] } : { opacity: 0.3 }}
        transition={live ? { duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 1.2 } : undefined}
      />
    </div>
  );
}
