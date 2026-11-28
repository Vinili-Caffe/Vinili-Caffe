"use client";

import { Bot, PartyPopper, TrendingUp } from "lucide-react";
import { WHY } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { Reveal } from "./Reveal";

const ICONS = [TrendingUp, PartyPopper, Bot];

export function Why() {
  const { t } = useI18n();
  return (
    <section id="perche" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-20 sm:py-24">
      <Reveal className="mb-12 max-w-2xl">
        <p className="text-sm font-medium text-caramel">{t("why.kicker")}</p>
        <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-balance sm:text-5xl">
          {t("why.title")} <span className="block italic text-sand">{t("why.titleEm")}</span>
        </h2>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-3 md:gap-5">
        {WHY.map((w, i) => {
          const Icon = ICONS[i];
          return (
            <Reveal key={w.n} delay={i * 0.12}>
              <article className="relative h-full overflow-hidden rounded-3xl bg-roast p-7 ring-1 ring-sand/15">
                  {/* il disco che spunta dall'angolo: l'oggetto del mondo vinili, fermo */}
                  <div
                    aria-hidden
                    className="absolute -right-20 -top-20 size-48 rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#2a1c14_1.5px_3px)] shadow-[0_10px_30px_rgba(0,0,0,0.6)] ring-1 ring-sand/20"
                  >
                    <div className="absolute inset-[36%] rounded-full bg-caramel" />
                    <div className="absolute inset-[48%] rounded-full bg-espresso" />
                  </div>

                  <Icon className="relative size-6 text-ember" aria-hidden />
                  <span className="absolute bottom-4 right-6 font-display text-7xl font-semibold lining-nums text-caramel/[0.12]">
                    {w.n}
                  </span>
                  <h3 className="relative mt-5 font-display text-3xl font-semibold">{t(w.titleKey)}</h3>
                  <p className="relative mt-3 leading-relaxed text-crema/70">{t(w.textKey)}</p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
