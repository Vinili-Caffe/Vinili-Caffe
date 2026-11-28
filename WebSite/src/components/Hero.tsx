"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { HeroBackdrop } from "./HeroBackdrop";
import { HeroStage } from "./HeroStage";
import { RotatingText } from "./ui/rotating-text";

const ease = [0.22, 1, 0.36, 1] as const;

type WelcomePayload = {
  ok?: boolean;
  badge?: string;
  i18nKey?: string;
  gender?: string;
};

export function Hero() {
  const { t, locale } = useI18n();
  const { ready, token } = useAuth();
  const [welcome, setWelcome] = useState(t("home.welcome"));
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const fade = useTransform(scrollYProgress, [0.6, 0.98], [1, 0]);
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setWelcome(t("home.welcome"));
      return;
    }
    let alive = true;
    fetch("/webhooks/site-welcome-pronouns", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j: WelcomePayload) => {
        if (!alive) return;
        const key = String(j?.i18nKey || "").trim();
        if (key === "home.welcomeM" || key === "home.welcomeF" || key === "home.welcome") {
          setWelcome(t(key));
          return;
        }
        const badge = String(j?.badge || "").trim();
        if (badge) {
          setWelcome(badge);
          return;
        }
        setWelcome(t("home.welcome"));
      })
      .catch(() => {
        if (alive) setWelcome(t("home.welcome"));
      });
    return () => {
      alive = false;
    };
  }, [ready, token, locale, t]);

  return (
    <section ref={ref} data-vc-hero className="relative isolate flex min-h-dvh items-center overflow-hidden pt-24">
      <div className="absolute inset-0 -z-20">
        <HeroBackdrop priority imgClassName="size-full object-cover" objectPosition="55% 40%" />
      </div>
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(ellipse 70% 60% at 15% 50%, rgba(14,9,6,0.35), transparent 55%)",
            "linear-gradient(to bottom, rgba(14,9,6,0.35) 0%, rgba(14,9,6,0.28) 45%, rgba(14,9,6,0.55) 82%, var(--color-espresso) 100%)",
          ].join(", "),
        }}
      />

      <motion.div
        style={reduce ? undefined : { opacity: fade }}
        className="scheme-dark mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8"
      >
        <div className="@container min-w-0 text-center lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="text-sm font-medium text-sand"
          >
            {t("home.badgeLead")}{" "}
            <RotatingText words={t("home.badgeWords").split("|")} className="text-ember" />
          </motion.p>

          {/* speedLcp1: niente opacity 0 sui testi in cima (LCP): il browser non li conta finché sono invisibili */}
          <motion.h1
            initial={{ y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.9, ease }}
            className="mt-7 font-display text-6xl font-semibold leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl"
          >
            <span className="mb-1 block font-script text-[2.35rem] font-normal leading-none text-sand sm:mb-2 sm:text-[2.85rem] lg:text-[3.25rem]">
              {welcome}
            </span>
            <span className="block whitespace-nowrap pr-[0.08em] text-[min(6rem,18.5cqw)] text-crema">
              Vinili <span className="italic">&amp;</span> Caffè
            </span>
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.7, ease }}
            className="mx-auto mt-7 max-w-xl text-pretty text-lg leading-relaxed text-crema/80 lg:mx-0"
          >
            {t("home.lead")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <a
              href="#esplora"
              className="inline-flex rounded-full bg-crema/8 px-6 py-3.5 font-semibold text-crema ring-1 ring-crema/25 transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-crema/14 hover:ring-sand/40 active:scale-[0.97]"
            >
              {t("home.exploreCta")}
            </a>
          </motion.div>
        </div>

        {/* Card promo reale: Turntable + Entra (CTA Discord primaria) */}
        <HeroStage className="lg:justify-self-end" />
      </motion.div>

      <motion.a
        href="#numeri"
        aria-label={t("home.scroll")}
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 text-sand transition-colors hover:text-crema"
      >
        <span className="text-xs font-semibold text-caramel/90">
          {t("home.scrollHint")}
        </span>
        <span className="flex size-9 items-center justify-center rounded-full bg-crema/8 ring-1 ring-sand/25">
          <ChevronDown className="size-5" />
        </span>
      </motion.a>
    </section>
  );
}
