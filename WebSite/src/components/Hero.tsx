"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ChevronDown, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { HeroBackdrop } from "./HeroBackdrop";
import { HeroStage } from "./HeroStage";
import { RotatingText } from "./ui/rotating-text";

const EMBERS = Array.from({ length: 12 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  size: 3 + ((i * 7) % 4),
  delay: (i * 0.9) % 7,
  duration: 9 + ((i * 5) % 7),
  drift: (i % 2 ? 1 : -1) * (10 + ((i * 13) % 30)),
}));

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
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "16%"]);
  const fade = useTransform(scrollYProgress, [0.6, 0.98], [1, 0]);
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    <section ref={ref} className="relative isolate flex min-h-dvh items-center overflow-hidden pt-24">
      <motion.div style={reduce ? undefined : { y: bgY }} className="absolute inset-0 -z-20">
        <HeroBackdrop priority imgClassName="size-full scale-[1.08] object-cover" objectPosition="55% 40%" />
      </motion.div>
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(ellipse 100% 80% at 70% 45%, rgba(217,154,91,0.12), transparent 60%)",
            "radial-gradient(ellipse 70% 60% at 15% 50%, rgba(14,9,6,0.35), transparent 55%)",
            "linear-gradient(to bottom, rgba(14,9,6,0.35) 0%, rgba(14,9,6,0.28) 45%, rgba(14,9,6,0.55) 82%, var(--color-espresso) 100%)",
          ].join(", "),
        }}
      />

      {mounted && !reduce && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {EMBERS.map((e, i) => (
            <motion.span
              key={i}
              className="absolute bottom-0 rounded-full bg-ember shadow-[0_0_12px_3px_rgba(240,180,110,0.55)]"
              style={{ left: e.left, width: e.size, height: e.size }}
              initial={{ y: 0, x: 0, opacity: 0 }}
              animate={{ y: "-95vh", x: e.drift, opacity: [0, 0.85, 0.85, 0] }}
              transition={{ duration: e.duration, delay: e.delay, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      <motion.div
        style={reduce ? undefined : { opacity: fade }}
        className="scheme-dark mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8"
      >
        <div className="@container min-w-0 text-center lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="inline-flex items-center gap-2 rounded-full bg-crema/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-sand shadow-[inset_0_1px_0_rgba(244,233,216,0.08)] ring-1 ring-sand/30 backdrop-blur-md"
          >
            <Sparkles className="size-3.5 text-ember" /> {t("home.badgeLead")}{" "}
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
            <span className="block whitespace-nowrap text-crema drop-shadow-[0_2px_24px_rgba(217,154,91,0.2)] pr-[0.08em] text-[min(6rem,18.5cqw)]">
              Vinili <span className="italic text-sand">&amp;</span> Caffè
            </span>
          </motion.h1>

          <motion.p
            initial={{ y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.8, ease }}
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
              className="rounded-full bg-crema/8 px-6 py-3.5 font-semibold text-crema ring-1 ring-crema/25 transition-[transform,background-color,color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:bg-crema/14 hover:ring-sand/40 active:scale-[0.97]"
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
        animate={reduce ? undefined : { y: [0, 8, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-caramel/90">
          {t("home.scrollHint")}
        </span>
        <span className="flex size-9 items-center justify-center rounded-full bg-crema/8 ring-1 ring-sand/25">
          <ChevronDown className="size-5" />
        </span>
      </motion.a>
    </section>
  );
}
