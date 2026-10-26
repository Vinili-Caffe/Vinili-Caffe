"use client";

import { motion } from "motion/react";
import { Bot, PartyPopper, TrendingUp } from "lucide-react";
import { WHY } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { Reveal } from "./Reveal";
import { Spotlight } from "./ui/spotlight-card";

const ICONS = [TrendingUp, PartyPopper, Bot];

export function Why() {
  const { t } = useI18n();
  return (
    <section id="perche" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-20">
      <Reveal className="mb-12 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">{t("why.kicker")}</p>
        <h2 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">
          {t("why.title")}{" "}
          <span className="italic text-sand">{t("why.titleEm")}</span>
        </h2>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-3">
        {WHY.map((w, i) => {
          const Icon = ICONS[i];
          return (
            <Reveal key={w.n} delay={i * 0.12}>
              <motion.article
                whileHover="hover"
                className="group/spot group relative h-full overflow-hidden rounded-3xl bg-roast p-7 ring-1 ring-sand/12"
              >
                <Spotlight />
                <motion.div
                  variants={{ hover: { x: -28, y: 10, rotate: 90 } }}
                  transition={{ type: "spring", stiffness: 120, damping: 16 }}
                  className="absolute -right-20 -top-20 size-48 rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#2a1c14_1.5px_3px)] shadow-[0_10px_30px_rgba(0,0,0,0.6)] ring-1 ring-sand/15"
                >
                  <div className="absolute inset-[36%] rounded-full bg-gradient-to-br from-caramel to-sand/80" />
                  <div className="absolute inset-[48%] rounded-full bg-espresso" />
                </motion.div>

                <div className="relative inline-flex size-12 items-center justify-center rounded-2xl bg-caramel/15 text-caramel ring-1 ring-caramel/30">
                  <Icon className="size-6" />
                </div>
                <span className="absolute bottom-4 right-6 font-display text-7xl font-semibold lining-nums text-crema/[0.06]">
                  {w.n}
                </span>
                <h3 className="relative mt-5 font-display text-3xl font-semibold">{t(w.titleKey)}</h3>
                <p className="relative mt-3 leading-relaxed text-crema/65">{t(w.textKey)}</p>
              </motion.article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
