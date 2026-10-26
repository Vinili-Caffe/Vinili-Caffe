"use client";

import { motion } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Testata delle pagine interne: foto sfumata + titolo (override image per eventi). */
export function PageHero({
  kicker,
  title,
  accent,
  text,
  icon,
  imageSrc = "/images/sfondo-still.webp",
  imageSrcMobile = "/images/sfondo-mobile-still.webp",
  tone = "site",
}: {
  kicker: string;
  title: string;
  accent?: string;
  text?: string;
  /** elemento già creato (es. <BookOpen />): da un Server Component non si può passare il componente */
  icon?: React.ReactNode;
  /** Sfondo hero (default: locale). */
  imageSrc?: string;
  imageSrcMobile?: string;
  /** `evento` = overlay navy/galassia (no roast Halloween). */
  tone?: "site" | "evento";
}) {
  const overlay =
    tone === "evento"
      ? "bg-[linear-gradient(to_bottom,rgba(5,7,15,0.45),rgba(10,16,32,0.78)_50%,rgba(5,7,15,0.94)_82%,#05070f)]"
      : "bg-[linear-gradient(to_bottom,rgba(14,9,6,0.55),rgba(14,9,6,0.85)_55%,rgba(14,9,6,0.92)_82%,var(--color-espresso))]";
  return (
    /* overflow-x only: evita tagli a titolo/italic; pb + gap CSS verso il blocco sotto */
    <section className="vc-page-hero relative isolate overflow-x-hidden pb-20 pt-36 sm:pb-28 sm:pt-44">
      <picture>
        <source media="(max-width: 640px)" srcSet={imageSrcMobile} />
        <img src={imageSrc} alt="" className="absolute inset-0 -z-20 size-full object-cover opacity-60" />
      </picture>
      <div className={`absolute inset-0 -z-10 ${overlay}`} />

      <div className="scheme-dark mx-auto max-w-4xl px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-sand ring-1 ring-sand/25 backdrop-blur"
        >
          <span className="[&>svg]:size-3.5">{icon}</span> {kicker}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.8, ease }}
          className="mx-auto mt-6 max-w-4xl text-balance font-display text-5xl font-semibold leading-[1.15] text-crema sm:text-7xl"
        >
          {title}
          {accent ? (
            <>
              {" "}
              <span className="italic text-sand">{accent}</span>
            </>
          ) : null}
        </motion.h1>
        {text && (
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.7, ease }}
            className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-crema/75"
          >
            {text}
          </motion.p>
        )}
      </div>
    </section>
  );
}
