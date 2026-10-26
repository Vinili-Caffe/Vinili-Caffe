"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ChevronDown, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { DiscordButton } from "./DiscordButton";
import { Turntable } from "./Turntable";
import { RotatingText } from "./ui/rotating-text";
import { StarMagnet } from "./ui/star-border";

const EMBERS = Array.from({ length: 14 }, (_, i) => ({
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
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const fade = useTransform(scrollYProgress, [0.6, 0.98], [1, 0]);
  const reduce = useReducedMotion();
  // le braci dipendono da "riduci movimento", che il server non conosce: si aggiungono dopo l'avvio,
  // così l'HTML del server e quello del browser coincidono (prima: errore React #418 in home)
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
        <picture>
          <source media="(max-width: 640px)" srcSet="/images/sfondo-mobile-still.webp" type="image/webp" />
          <img
            src="/images/sfondo-still.webp"
            alt=""
            width={1920}
            height={1080}
            decoding="async"
            fetchPriority="high"
            className="size-full scale-110 object-cover"
          />
        </picture>
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(14,9,6,0.35),rgba(14,9,6,0.85)_60%,var(--color-espresso))]" />

      {mounted && !reduce && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {EMBERS.map((e, i) => (
            <motion.span
              key={i}
              className="absolute bottom-0 rounded-full bg-ember shadow-[0_0_12px_3px_rgba(240,180,110,0.6)]"
              style={{ left: e.left, width: e.size, height: e.size }}
              initial={{ y: 0, x: 0, opacity: 0 }}
              animate={{ y: "-95vh", x: e.drift, opacity: [0, 0.9, 0.9, 0] }}
              transition={{ duration: e.duration, delay: e.delay, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      <motion.div
        style={reduce ? undefined : { opacity: fade }}
        className="scheme-dark mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pb-16 lg:grid-cols-[1.1fr_0.9fr]"
      >
        <div className="@container min-w-0 text-center lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-sand ring-1 ring-sand/25 backdrop-blur"
          >
            <Sparkles className="size-3.5" /> {t("home.badgeLead")}{" "}
            <RotatingText words={t("home.badgeWords").split("|")} className="text-ember" />
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.9, ease }}
            className="mt-6 font-display text-6xl font-semibold leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl"
          >
            <span className="block text-crema/70 text-3xl font-medium italic sm:text-4xl">{welcome}</span>
            {/* il nome sempre su una riga: la misura si adatta alla colonna (5,2em di larghezza) */}
            <span className="block whitespace-nowrap bg-gradient-to-b from-crema via-sand to-caramel bg-clip-text pr-[0.08em] text-[min(6rem,18.5cqw)] text-transparent">
              Vinili <span className="italic">&amp;</span> Caffè
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.8, ease }}
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-crema/75 lg:mx-0"
          >
            {t("home.lead")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <StarMagnet>
              <DiscordButton />
            </StarMagnet>
            <a
              href="#esplora"
              className="rounded-full px-6 py-3.5 font-medium text-crema/85 ring-1 ring-crema/20 transition-colors hover:bg-crema/8 hover:text-crema"
            >
              {t("home.exploreCta")}
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, duration: 1.2, ease }}
        >
          <Turntable />
        </motion.div>
      </motion.div>

      <motion.a
        href="#numeri"
        aria-label={t("home.scroll")}
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-crema/65 hover:text-crema"
        animate={reduce ? undefined : { y: [0, 8, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sand/90">
          {t("home.scrollHint")}
        </span>
        <ChevronDown className="size-6" />
      </motion.a>
    </section>
  );
}
