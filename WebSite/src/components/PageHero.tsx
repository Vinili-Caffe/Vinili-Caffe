"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  HeroBackdrop,
  HERO_ATMO_BAND,
  HERO_ATMO_VIDEO,
  HERO_ATMO_VIDEO_MOBILE,
} from "@/components/HeroBackdrop";

const ease = [0.22, 1, 0.36, 1] as const;

/** Testata pagine interne: stessa atmosfera della home, crop più stretto (no card / no testo finto). */
export function PageHero({
  kicker,
  title,
  accent,
  text,
  icon,
  imageSrc = HERO_ATMO_BAND,
  imageSrcMobile,
  videoSrc = HERO_ATMO_VIDEO,
  videoSrcMobile = HERO_ATMO_VIDEO_MOBILE,
  tone = "site",
}: {
  kicker: string;
  title: string;
  accent?: string;
  text?: string;
  icon?: React.ReactNode;
  imageSrc?: string;
  imageSrcMobile?: string;
  videoSrc?: string | null;
  videoSrcMobile?: string | null;
  tone?: "site" | "evento";
}) {
  const reduce = useReducedMotion();
  const isEvento = tone === "evento";
  return (
    <section className="vc-page-hero relative isolate overflow-x-hidden pb-20 pt-36 sm:pb-28 sm:pt-44">
      <HeroBackdrop
        poster={isEvento ? imageSrc : imageSrc || HERO_ATMO_BAND}
        posterMobile={imageSrcMobile}
        videoSrc={isEvento ? null : videoSrc}
        videoSrcMobile={isEvento ? null : videoSrcMobile}
        priority
        imgClassName="size-full object-cover opacity-55 sm:opacity-60"
        objectPosition={isEvento ? "center" : "50% 42%"}
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
                "radial-gradient(ellipse 90% 45% at 50% 0%, rgba(217,154,91,0.16), transparent 55%)",
                "linear-gradient(to bottom, rgba(14,9,6,0.5) 0%, rgba(14,9,6,0.78) 42%, rgba(14,9,6,0.94) 78%, var(--color-espresso) 100%)",
              ].join(", "),
        }}
      />

      <div className="scheme-dark mx-auto max-w-4xl px-6 text-center">
        <motion.p
          initial={reduce ? false : { y: 14, opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.55, ease }}
          className={
            isEvento
              ? "inline-flex items-center gap-2 rounded-full bg-black/45 px-4 py-1.5 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-cyan-200/85 ring-1 ring-cyan-300/35 backdrop-blur-md shadow-[0_0_24px_rgba(56,189,248,0.18)]"
              : "inline-flex items-center gap-2 rounded-full bg-crema/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-sand shadow-[inset_0_1px_0_rgba(244,233,216,0.08)] ring-1 ring-sand/30 backdrop-blur-md"
          }
        >
          <span className={isEvento ? "text-cyan-300 [&>svg]:size-3.5" : "text-ember [&>svg]:size-3.5"}>
            {icon}
          </span>{" "}
          {kicker}
        </motion.p>
        <h1
          className={
            isEvento
              ? "mx-auto mt-6 max-w-4xl text-balance font-display text-5xl font-semibold leading-[1.12] tracking-tight text-[#eaf6ff] sm:text-7xl"
              : "mx-auto mt-6 max-w-4xl text-balance font-display text-5xl font-semibold leading-[1.15] text-crema sm:text-7xl"
          }
        >
          {title}
          {accent ? (
            <>
              {" "}
              <span className={isEvento ? "italic text-[#f0d78c]" : "italic text-sand"}>{accent}</span>
            </>
          ) : null}
        </h1>
        {text ? (
          <motion.p
            initial={reduce ? false : { y: 10, opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.55, ease }}
            className={
              isEvento
                ? "mx-auto mt-5 max-w-[38rem] text-pretty text-lg leading-relaxed text-sky-100/70"
                : "mx-auto mt-5 max-w-[38rem] text-pretty text-lg leading-relaxed text-crema/80"
            }
          >
            {text}
          </motion.p>
        ) : null}
      </div>
    </section>
  );
}
