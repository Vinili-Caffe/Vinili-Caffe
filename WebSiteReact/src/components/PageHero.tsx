"use client";

import { motion, useReducedMotion } from "motion/react";
import { HeroBackdrop, HERO_PROMO_POSTER, HERO_PROMO_VIDEO, HERO_PROMO_VIDEO_MOBILE } from "@/components/HeroBackdrop";

const ease = [0.22, 1, 0.36, 1] as const;

/** Testata delle pagine interne: promo loop + titolo (override image/video per eventi). */
export function PageHero({
  kicker,
  title,
  accent,
  text,
  icon,
  imageSrc = HERO_PROMO_POSTER,
  imageSrcMobile,
  videoSrc = HERO_PROMO_VIDEO,
  videoSrcMobile = HERO_PROMO_VIDEO_MOBILE,
  tone = "site",
}: {
  kicker: string;
  title: string;
  accent?: string;
  text?: string;
  /** elemento già creato (es. <BookOpen />): da un Server Component non si può passare il componente */
  icon?: React.ReactNode;
  /** Poster / still (default: promo). */
  imageSrc?: string;
  imageSrcMobile?: string;
  /** Loop hero; `null` = solo still (es. evento). */
  videoSrc?: string | null;
  videoSrcMobile?: string | null;
  /** `evento` = overlay navy/galassia (no roast Halloween). */
  tone?: "site" | "evento";
}) {
  const reduce = useReducedMotion();
  const isEvento = tone === "evento";
  return (
    /* overflow-x only: evita tagli a titolo/italic; pb + gap CSS verso il blocco sotto */
    <section className="vc-page-hero relative isolate overflow-x-hidden pb-20 pt-36 sm:pb-28 sm:pt-44">
      <HeroBackdrop
        poster={imageSrc}
        posterMobile={imageSrcMobile}
        videoSrc={isEvento ? null : videoSrc}
        videoSrcMobile={isEvento ? null : videoSrcMobile}
        priority
        imgClassName="size-full object-cover opacity-70"
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: isEvento
            ? [
                "radial-gradient(ellipse 80% 50% at 50% -5%, rgba(120,160,255,0.14), transparent 55%)",
                "linear-gradient(to bottom, rgba(5,7,15,0.45), rgba(10,16,32,0.78) 50%, rgba(5,7,15,0.94) 82%, #05070f)",
              ].join(", ")
            : [
                "radial-gradient(ellipse 90% 50% at 50% -8%, rgba(217,154,91,0.18), transparent 55%)",
                "radial-gradient(ellipse 55% 40% at 85% 30%, rgba(240,180,110,0.08), transparent 50%)",
                "linear-gradient(to bottom, rgba(14,9,6,0.42) 0%, rgba(14,9,6,0.78) 48%, rgba(14,9,6,0.94) 78%, var(--color-espresso) 100%)",
              ].join(", "),
        }}
      />
      {!isEvento ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[55%] opacity-60"
          style={{
            background:
              "linear-gradient(105deg, transparent 38%, rgba(240,180,110,0.06) 49%, rgba(217,154,91,0.1) 52%, transparent 64%)",
          }}
        />
      ) : null}

      <div className="scheme-dark mx-auto max-w-4xl px-6 text-center">
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease }}
          className="inline-flex items-center gap-2 rounded-full bg-crema/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-sand shadow-[inset_0_1px_0_rgba(244,233,216,0.08)] ring-1 ring-sand/30 backdrop-blur-md"
        >
          <span className="text-ember [&>svg]:size-3.5">{icon}</span> {kicker}
        </motion.p>
        <h1 className="mx-auto mt-6 max-w-4xl text-balance font-display text-5xl font-semibold leading-[1.15] text-crema sm:text-7xl">
          {title}
          {accent ? (
            <>
              {" "}
              <span className="italic text-sand">{accent}</span>
            </>
          ) : null}
        </h1>
        {text ? (
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.55, ease }}
            className="mx-auto mt-5 max-w-[38rem] text-pretty text-lg leading-relaxed text-crema/80"
          >
            {text}
          </motion.p>
        ) : null}
      </div>
    </section>
  );
}
