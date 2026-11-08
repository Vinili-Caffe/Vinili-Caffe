"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  HeroBackdrop,
  HERO_ATMO_BAND,
  HERO_ATMO_VIDEO,
  HERO_ATMO_VIDEO_MOBILE,
} from "@/components/HeroBackdrop";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

const ease = [0.22, 1, 0.36, 1] as const;

export type VetrinaHeroProps = {
  /** Etichetta piccola sopra il titolo */
  kicker?: string;
  /** Titolo principale (2–3 righe a mano) */
  title: React.ReactNode;
  /** Sottotitolo umano, max ~2 frasi */
  text: string;
  /** Variante: hub principale o sottopagina più bassa */
  size?: "hub" | "page";
  /** CTA opzionali sotto il testo */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Testata Vetrina — idea: guardare dentro una vetrina di caffè.
 * Vetro, alone caldo, parola fantasma dietro. Niente PageHero generico.
 */
export function VetrinaHero({
  kicker = "Vetrina",
  title,
  text,
  size = "page",
  actions,
  className,
}: VetrinaHeroProps) {
  const reduce = useReducedMotion();
  const hub = size === "hub";

  return (
    <section
      className={cn(
        "vc-vetrina-hero relative isolate overflow-x-hidden",
        hub ? "pb-16 pt-32 sm:pb-24 sm:pt-40" : "pb-12 pt-28 sm:pb-16 sm:pt-36",
        className,
      )}
    >
      <HeroBackdrop
        priority
        poster={HERO_ATMO_BAND}
        videoSrc={HERO_ATMO_VIDEO}
        videoSrcMobile={HERO_ATMO_VIDEO_MOBILE}
        imgClassName="size-full object-cover opacity-45 sm:opacity-50"
        objectPosition="50% 38%"
      />

      {/* alone caldo + melt verso espresso */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(ellipse 85% 50% at 50% 0%, rgba(217,154,91,0.2), transparent 58%)",
            "linear-gradient(to bottom, rgba(14,9,6,0.42) 0%, rgba(14,9,6,0.72) 48%, rgba(14,9,6,0.94) 82%, var(--color-espresso) 100%)",
          ].join(", "),
        }}
      />

      {/* riflessi di vetro */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[6%] top-[18%] -z-[5] hidden h-[58%] rounded-[1.75rem] border border-crema/[0.08] bg-crema/[0.02] shadow-[inset_0_1px_0_rgba(255,240,220,0.08)] sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[10%] top-[22%] -z-[4] hidden h-[42%] w-px bg-gradient-to-b from-crema/25 via-crema/5 to-transparent sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[14%] top-[26%] -z-[4] hidden h-[28%] w-px rotate-[8deg] bg-gradient-to-b from-crema/15 via-transparent to-transparent sm:block"
      />

      {/* parola fantasma */}
      <p
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-[42%] -z-[6] -translate-x-1/2 -translate-y-1/2 select-none font-display font-semibold uppercase tracking-[-0.06em] text-crema/[0.045]",
          hub ? "text-[18vw] leading-[0.78]" : "text-[14vw] leading-[0.8]",
        )}
      >
        Vetrina
      </p>

      <div className="scheme-dark relative mx-auto max-w-5xl px-6 text-center">
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-caramel"
        >
          {kicker}
        </motion.p>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 22, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 0.08, duration: 0.85, ease }}
          className={cn(
            "mx-auto mt-4 max-w-3xl font-display font-semibold leading-[0.95] tracking-[-0.02em] text-crema",
            hub ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl",
          )}
        >
          {title}
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.75, ease }}
          className={cn(
            "mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-crema/65",
            hub ? "text-base sm:text-lg" : "text-sm sm:text-base",
          )}
        >
          {text}
        </motion.p>

        {actions ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.7, ease }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            {actions}
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}

/** Link rapidi hub → bot / server / invia */
export function VetrinaHubActions() {
  const pill =
    "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-[transform,background-color,color] duration-200 ease-out active:scale-[0.97]";
  return (
    <>
      <SmartLink href={page("/vetrina/server/")} className={cn(pill, "bg-crema/10 text-crema ring-1 ring-sand/25 hover:bg-crema/16")}>
        Server
      </SmartLink>
      <SmartLink href={page("/vetrina/bot/")} className={cn(pill, "bg-crema/10 text-crema ring-1 ring-sand/25 hover:bg-crema/16")}>
        Bot
      </SmartLink>
      <SmartLink
        href={page("/vetrina/invia/")}
        className={cn(pill, "bg-gradient-to-r from-caramel to-ember text-ink hover:brightness-105")}
      >
        Metti la tua scheda
      </SmartLink>
    </>
  );
}
