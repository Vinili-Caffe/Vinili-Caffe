"use client";

import { motion, useReducedMotion } from "motion/react";
import type { WrappedMood } from "@/lib/wrappedMoods";
import { cn } from "@/lib/cn";

const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left: `${6 + ((i * 17) % 88)}%`,
  top: `${8 + ((i * 29) % 78)}%`,
  size: 2 + (i % 4),
  delay: (i % 7) * 0.18,
  dur: 2.4 + (i % 5) * 0.35,
}));

const RINGS = [1, 2, 3, 4];

export function WrappedSlideDecor({ mood, celebrate }: { mood: WrappedMood; celebrate?: boolean }) {
  const reduce = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* bloom centrale */}
      <motion.div
        className="absolute left-1/2 top-[38%] size-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: mood.glow }}
        animate={reduce ? { opacity: 0.45 } : { opacity: [0.25, 0.55, 0.35], scale: [0.92, 1.08, 1] }}
        transition={reduce ? undefined : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* blob secondario */}
      <motion.div
        className="absolute -right-16 top-24 size-56 rounded-full blur-3xl opacity-40"
        style={{ background: mood.accent }}
        animate={reduce ? undefined : { y: [0, 24, 0], x: [0, -12, 0] }}
        transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -left-20 bottom-10 size-64 rounded-full blur-3xl opacity-30"
        style={{ background: mood.glow }}
        animate={reduce ? undefined : { y: [0, -18, 0] }}
        transition={reduce ? undefined : { duration: 6.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* grain soft */}
      <div
        className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")",
        }}
      />

      {mood.particle === "vinyl" || mood.particle === "wave" ? (
        <div className="absolute left-1/2 top-1/2 size-[min(120vw,42rem)] -translate-x-1/2 -translate-y-1/2">
          {RINGS.map((r) => (
            <motion.span
              key={r}
              className="absolute inset-0 rounded-full border border-[#f4e9d8]/10"
              style={{ margin: `${r * 7}%` }}
              animate={
                reduce
                  ? { opacity: 0.2 }
                  : mood.particle === "wave"
                    ? { scale: [1, 1.04, 1], opacity: [0.12, 0.35, 0.12] }
                    : { rotate: 360, opacity: [0.08, 0.22, 0.08] }
              }
              transition={
                reduce
                  ? undefined
                  : mood.particle === "wave"
                    ? { duration: 2.2 + r * 0.35, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 18 + r * 4, repeat: Infinity, ease: "linear" }
              }
            />
          ))}
        </div>
      ) : null}

      {mood.particle === "steam" ? (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              className="absolute bottom-[18%] rounded-full bg-[#f4e9d8]/25 blur-md"
              style={{ left: `${36 + i * 7}%`, width: 18 + i * 4, height: 40 + i * 8 }}
              animate={reduce ? { opacity: 0.15 } : { y: [0, -120 - i * 20], opacity: [0, 0.45, 0], scaleX: [1, 1.4] }}
              transition={reduce ? undefined : { duration: 3.2 + i * 0.4, repeat: Infinity, delay: i * 0.45, ease: "easeOut" }}
            />
          ))}
        </>
      ) : null}

      {(mood.particle === "spark" || mood.particle === "star" || mood.particle === "coin" || mood.particle === "confetti" || mood.particle === "note") &&
        SPARKS.map((s) => (
          <motion.span
            key={s.id}
            className={cn(
              "absolute rounded-full",
              mood.particle === "star" && "rotate-45",
              mood.particle === "note" && "rounded-[2px]",
            )}
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: mood.particle === "note" ? s.size * 2.2 : s.size,
              background: mood.accent,
              boxShadow: `0 0 ${6 + s.size}px ${mood.glow}`,
            }}
            animate={
              reduce
                ? { opacity: 0.35 }
                : {
                    opacity: [0.15, 0.95, 0.2],
                    y: mood.particle === "confetti" ? [0, 40 + (s.id % 5) * 8, 0] : [0, -10, 0],
                    scale: [0.7, 1.25, 0.8],
                    rotate: mood.particle === "confetti" ? [0, 40, -20] : 0,
                  }
            }
            transition={reduce ? undefined : { duration: s.dur, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

      {celebrate && !reduce ? (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.span
              key={`c-${i}`}
              className="absolute left-1/2 top-[42%] size-2 rounded-full"
              style={{ background: mood.accent }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
              animate={{
                opacity: [0, 1, 0],
                x: Math.cos((i / 6) * Math.PI * 2) * (90 + i * 12),
                y: Math.sin((i / 6) * Math.PI * 2) * (70 + i * 10),
                scale: [0.4, 1.2, 0.2],
              }}
              transition={{ duration: 1.4, delay: 0.1 + i * 0.05, ease: "easeOut" }}
            />
          ))}
        </>
      ) : null}

      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
