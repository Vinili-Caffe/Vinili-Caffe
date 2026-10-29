"use client";

import { motion, useReducedMotion } from "motion/react";
import { DISCORD_INVITE } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { Turntable } from "@/components/Turntable";
import { cn } from "@/lib/cn";

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" aria-hidden className={className} fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.44-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

/** Card promo viva: giradischi vero + CTA Entra (niente testo/UI “finti” nello sfondo). */
export function HeroStage({ className }: { className?: string }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative mx-auto w-full max-w-[22rem] sm:max-w-sm", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_50%_40%,rgba(217,154,91,0.42),transparent_65%)] blur-3xl"
      />

      <div className="relative overflow-hidden rounded-[1.75rem] bg-espresso/60 p-4 shadow-[0_30px_80px_-28px_rgba(0,0,0,0.85)] ring-1 ring-sand/25 backdrop-blur-xl sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-caramel/15 via-transparent to-ink/40"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-ember/20 blur-3xl"
        />

        <div className="relative flex items-center justify-between gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[#5865f2]/90 text-white shadow-lg shadow-[#5865f2]/25 ring-1 ring-white/15">
            <DiscordMark className="size-5" />
          </span>
          {!reduce ? (
            <motion.span
              className="size-2 rounded-full bg-ember"
              animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.25, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            />
          ) : (
            <span className="size-2 rounded-full bg-ember/70" aria-hidden />
          )}
        </div>

        <div className="relative mt-3">
          <Turntable className="w-full max-w-none" />
        </div>

        <div className="relative mt-4 flex items-center justify-between gap-3">
          <div className="flex -space-x-2" aria-hidden>
            {["#c9a46e", "#8b5a2b", "#e8d5b5", "#6f4e37"].map((c, i) => (
              <span
                key={c}
                className="size-8 rounded-full ring-2 ring-espresso/80"
                style={{ background: `linear-gradient(145deg, ${c}, #2a1a12)`, zIndex: 4 - i }}
              />
            ))}
          </div>
          <motion.a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener"
            whileHover={reduce ? undefined : { y: -2, scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="inline-flex min-w-[7.75rem] items-center justify-center rounded-full bg-gradient-to-r from-caramel to-ember px-7 py-3 text-sm font-semibold tracking-wide text-ink shadow-[0_12px_28px_-10px_rgba(217,154,91,0.95)] ring-1 ring-sand/35"
          >
            Entra
            <span className="sr-only"> — {t("common.discord")}</span>
          </motion.a>
        </div>
      </div>
    </motion.div>
  );
}
