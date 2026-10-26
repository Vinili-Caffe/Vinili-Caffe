"use client";

import { ArrowUpRight } from "lucide-react";
import { NAV_GROUPS } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { NavIcon } from "@/lib/nav-icons";
import { cn } from "@/lib/cn";
import { MotionLink } from "./SmartLink";
import { Reveal } from "./Reveal";
import { Spotlight } from "./ui/spotlight-card";

export function Explore() {
  const { t } = useI18n();
  return (
    <section id="esplora" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-14 sm:px-6 sm:py-20">
      <Reveal className="mb-8 text-center sm:mb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">{t("explore.kicker")}</p>
        <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">{t("explore.title")}</h2>
      </Reveal>

      {/* Phone: 2×2. PC: 4 su una riga. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {NAV_GROUPS.map((g, gi) => (
          <Reveal key={g.labelKey} delay={gi * 0.05} className="h-full">
            <div className="group/spot relative h-full overflow-hidden rounded-2xl bg-gradient-to-b from-roast to-espresso p-3.5 ring-1 ring-sand/12 sm:rounded-3xl sm:p-5">
              <Spotlight size={260} />
              <h3 className="relative flex items-center gap-1.5 px-1.5 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-sand/80 sm:px-2 sm:pb-2 sm:text-xs sm:tracking-[0.25em]">
                <NavIcon labelKey={g.labelKey} className="size-3 shrink-0 opacity-80 sm:size-3.5" />
                <span className="truncate">{t(g.labelKey)}</span>
              </h3>
              <ul className="relative">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <MotionLink
                      href={l.href}
                      whileHover={{ x: 4 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className={cn(
                        "group flex items-center gap-2 rounded-xl px-1.5 py-2 transition-colors hover:bg-crema/6 sm:gap-3 sm:rounded-2xl sm:px-2 sm:py-2.5",
                      )}
                    >
                      <NavIcon labelKey={l.labelKey} className="size-3.5 shrink-0 opacity-55 group-hover:opacity-80" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-crema sm:text-[0.95rem]">
                        {t(l.labelKey)}
                      </span>
                      <ArrowUpRight className="size-3.5 shrink-0 text-crema/30 transition-colors group-hover:text-caramel sm:size-4" />
                    </MotionLink>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
