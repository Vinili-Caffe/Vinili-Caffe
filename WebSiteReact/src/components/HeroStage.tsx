"use client";

import { motion, useReducedMotion } from "motion/react";
import { DISCORD_INVITE } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import {
  HeroChatStack,
  HeroDeck,
  HeroDiscordBadge,
  HeroMenuDots,
} from "@/components/HeroDeck";
import { cn } from "@/lib/cn";

/** Card promo viva stile “deck 3D”: giradischi sospeso + CTA Entra. */
export function HeroStage({ className }: { className?: string }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 32, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.12, duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative mx-auto w-full max-w-[24rem] sm:max-w-md", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-12 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_45%_40%,rgba(217,154,91,0.5),transparent_62%)] blur-3xl"
      />

      <div
        className={cn(
          "relative overflow-hidden rounded-[2rem]",
          "bg-[linear-gradient(165deg,rgba(58,40,28,0.72)_0%,rgba(28,18,12,0.78)_55%,rgba(18,11,8,0.88)_100%)]",
          "p-5 shadow-[0_40px_90px_-36px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,230,200,0.16)]",
          "ring-1 ring-sand/20 backdrop-blur-2xl sm:p-6",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_0%,rgba(255,190,120,0.14),transparent_45%),radial-gradient(ellipse_at_10%_100%,rgba(88,101,242,0.1),transparent_40%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full bg-ember/25 blur-3xl"
        />

        <div className="relative flex items-start justify-between gap-3">
          <HeroDiscordBadge />
          <HeroMenuDots className="mt-2" />
        </div>

        <div className="relative mt-1 sm:mt-2">
          <HeroDeck />
          <HeroChatStack className="pointer-events-none absolute -right-1 top-[18%] z-10 sm:right-0 sm:top-[12%]" />
        </div>

        <div className="relative mt-5 flex items-center justify-between gap-3 sm:mt-6">
          <div className="flex items-center gap-2" aria-hidden>
            <span
              className="size-9 rounded-full bg-gradient-to-br from-[#3a2a20] to-[#1a100a] shadow-md ring-2 ring-espresso/90"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,220,180,0.12)" }}
            />
            <div className="flex -space-x-2">
              {["#c9a46e", "#8b5a2b", "#e8d5b5"].map((c, i) => (
                <span
                  key={c}
                  className="size-8 rounded-full ring-2 ring-[#1a100a]/90"
                  style={{
                    background: `linear-gradient(145deg, ${c}, #2a1a12)`,
                    zIndex: 3 - i,
                  }}
                />
              ))}
            </div>
          </div>

          <motion.a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener"
            whileHover={reduce ? undefined : { y: -3, scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className={cn(
              "inline-flex min-w-[8.25rem] items-center justify-center rounded-full",
              "bg-gradient-to-b from-[#d4a574] to-[#b56e3a]",
              "px-8 py-3.5 text-sm font-semibold tracking-wide text-white",
              "shadow-[0_14px_32px_-12px_rgba(181,110,58,0.95),inset_0_1px_0_rgba(255,240,220,0.45),inset_0_-2px_0_rgba(90,45,20,0.35)]",
              "ring-1 ring-sand/30",
            )}
          >
            Entra
            <span className="sr-only"> — {t("common.discord")}</span>
          </motion.a>
        </div>
      </div>
    </motion.div>
  );
}
