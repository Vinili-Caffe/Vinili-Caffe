"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

const ease = [0.22, 1, 0.36, 1] as const;

export type VetrinaHeroProps = {
  kicker?: string;
  title: React.ReactNode;
  text: string;
  size?: "hub" | "page";
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Testata Vetrina — solo tipografia e luce.
 * Niente video café (è un altro pezzo del sito): qui è una vetrina tipografica.
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
        "vc-vetrina-hero relative isolate overflow-hidden",
        hub ? "min-h-[min(88vh,920px)] pt-28 sm:pt-32" : "pt-28 sm:pt-32",
        className,
      )}
    >
      {/* pavimento scuro + alone basso (luce della vetrina) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-[#080604]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[55%] bg-[radial-gradient(ellipse_80%_70%_at_50%_100%,rgba(217,154,91,0.18),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")",
        }}
      />

      {/* bordo vetro — linea sottile che inquadra */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-3 -z-[5] rounded-[1.25rem] border border-crema/[0.07] sm:inset-5 sm:rounded-[1.5rem]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[8%] top-24 -z-[4] hidden h-[min(55vh,420px)] w-px bg-gradient-to-b from-caramel/40 via-crema/10 to-transparent lg:block"
      />

      {/* parola verticale */}
      <p
        aria-hidden
        className="pointer-events-none absolute bottom-[18%] left-[-0.5rem] z-0 hidden origin-bottom-left -rotate-90 select-none font-display text-[clamp(3rem,8vw,6.5rem)] font-semibold uppercase leading-none tracking-[0.35em] text-crema/[0.06] lg:block"
      >
        Vetrina
      </p>

      <div
        className={cn(
          "relative mx-auto flex max-w-6xl flex-col px-6 sm:px-10",
          hub ? "min-h-[min(72vh,760px)] justify-end pb-14 sm:pb-20" : "pb-10 sm:pb-12",
        )}
      >
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease }}
          className="text-[0.68rem] font-semibold uppercase tracking-[0.36em] text-caramel"
        >
          {kicker}
        </motion.p>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.8, ease }}
          className={cn(
            "mt-4 max-w-[14ch] font-display font-semibold leading-[0.92] tracking-[-0.035em] text-crema",
            hub ? "text-[clamp(2.75rem,7.5vw,5.75rem)]" : "text-[clamp(2.25rem,5.5vw,3.75rem)]",
          )}
        >
          {title}
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.7, ease }}
          className={cn(
            "mt-5 max-w-md text-pretty leading-relaxed text-crema/58",
            hub ? "text-[0.98rem] sm:text-lg" : "text-sm sm:text-base",
          )}
        >
          {text}
        </motion.p>

        {actions ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.65, ease }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            {actions}
          </motion.div>
        ) : null}

        {/* soglia di luce sotto il titolo */}
        <div
          aria-hidden
          className={cn(
            "mt-10 h-px w-full max-w-xl bg-gradient-to-r from-caramel/55 via-crema/15 to-transparent",
            !hub && "mt-8 max-w-sm from-caramel/35",
          )}
        />
      </div>
    </section>
  );
}

export function VetrinaHubActions() {
  const base =
    "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-[transform,background-color,color,border-color] duration-200 ease-out active:scale-[0.97]";
  return (
    <>
      <SmartLink
        href={page("/vetrina/server/")}
        className={cn(base, "border border-crema/20 bg-transparent text-crema hover:border-crema/40 hover:bg-crema/[0.06]")}
      >
        Server
      </SmartLink>
      <SmartLink
        href={page("/vetrina/bot/")}
        className={cn(base, "border border-crema/20 bg-transparent text-crema hover:border-crema/40 hover:bg-crema/[0.06]")}
      >
        Bot
      </SmartLink>
      <SmartLink href={page("/vetrina/invia/")} className={cn(base, "bg-crema text-ink hover:bg-white")}>
        Metti la tua scheda
      </SmartLink>
    </>
  );
}
