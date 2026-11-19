"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { navGroupsForSeason, navLinkLocked, navLinkSeasonLive } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { NavIcon } from "@/lib/nav-icons";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { loadStaffAccess } from "@/lib/staff";
import { isEventoHighStaff } from "@/lib/evento-starwars";
import { MotionLink } from "./SmartLink";
import { Reveal } from "./Reveal";
import { GlareHover, GradientText, ScrollFloat } from "./react-bits";
import { Spotlight } from "./ui/spotlight-card";
import { SeasonLiveNavTag, useNavSeasonTick } from "./SeasonLiveNav";

export function Explore() {
  const { t } = useI18n();
  const { token } = useAuth();
  const [highStaff, setHighStaff] = useState(false);
  const { tick: seasonTick, ready: seasonReady } = useNavSeasonTick();
  const navGroups = navGroupsForSeason();
  void seasonTick;
  const soon = t("auth.comingSoon");

  useEffect(() => {
    if (!token) {
      setHighStaff(false);
      return;
    }
    let alive = true;
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      setHighStaff(r.ok ? isEventoHighStaff(r.data) : false);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <section id="esplora" className="relative scroll-mt-28 px-5 py-14 sm:px-6 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-8 h-40 bg-[radial-gradient(ellipse_50%_80%_at_50%_0%,rgba(217,154,91,0.1),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl">
      <Reveal className="mb-8 text-center sm:mb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">{t("explore.kicker")}</p>
        <div className="mt-3 font-display text-3xl font-semibold text-balance sm:text-4xl lg:text-5xl">
          <GradientText speed={7}>
            <ScrollFloat
              className="my-0"
              textClassName="font-display text-3xl font-semibold sm:text-4xl lg:text-5xl"
              stagger={0.02}
              distance={80}
            >
              {t("explore.title")}
            </ScrollFloat>
          </GradientText>
        </div>
      </Reveal>

      {/* Phone: 2×2. PC: 4 su una riga. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {navGroups.map((g, gi) => (
          <Reveal key={g.labelKey} delay={gi * 0.05} className="h-full">
            <GlareHover
              className="h-full rounded-2xl sm:rounded-3xl"
              glareColor="rgba(244,233,216,0.22)"
            >
              <div className="group/spot relative h-full overflow-hidden rounded-2xl bg-gradient-to-b from-caramel/[0.1] via-roast to-espresso p-3.5 ring-1 ring-sand/15 transition-[ring-color,box-shadow] duration-200 hover:ring-caramel/30 sm:rounded-3xl sm:p-5">
                <Spotlight size={260} />
                <h3 className="relative flex items-center gap-1.5 px-1.5 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-caramel sm:px-2 sm:pb-2 sm:text-xs sm:tracking-[0.25em]">
                  <NavIcon labelKey={g.labelKey} className="size-3 shrink-0 opacity-90 sm:size-3.5" />
                  <span className="truncate">{t(g.labelKey)}</span>
                </h3>
                <ul className="relative">
                  {g.links.map((l) => {
                    const locked = navLinkLocked(l, { highStaff });
                    if (locked) {
                      return (
                        <li key={l.href}>
                          <span
                            role="link"
                            aria-disabled="true"
                            title={soon}
                            className="flex cursor-not-allowed items-center gap-2 overflow-hidden rounded-xl px-1.5 py-2 sm:gap-3 sm:rounded-2xl sm:px-2 sm:py-2.5"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-2 blur-[2.5px] select-none" aria-hidden>
                              <NavIcon labelKey={l.labelKey} className="size-3.5 shrink-0 opacity-55" />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-crema sm:text-[0.95rem]">
                                {t(l.labelKey)}
                              </span>
                            </span>
                            <span className="shrink-0 rounded-full bg-espresso/90 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-sand ring-1 ring-sand/30">
                              {soon}
                            </span>
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={l.href}>
                        <MotionLink
                          href={l.href}
                          whileHover={{ x: 4 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          className={cn(
                            "group flex items-center gap-2 rounded-xl px-1.5 py-2 transition-[transform,background-color,color] duration-200 ease-out hover:bg-crema/6 active:scale-[0.98] sm:gap-3 sm:rounded-2xl sm:px-2 sm:py-2.5",
                          )}
                        >
                          <NavIcon labelKey={l.labelKey} className="size-3.5 shrink-0 opacity-55 transition-opacity duration-200 group-hover:opacity-80" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-crema sm:text-[0.95rem]">
                            {t(l.labelKey)}
                          </span>
                          {seasonReady && navLinkSeasonLive(l) ? <SeasonLiveNavTag /> : null}
                          <ArrowUpRight className="size-3.5 shrink-0 text-crema/30 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-caramel sm:size-4" />
                        </MotionLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </GlareHover>
          </Reveal>
        ))}
      </div>
      </div>
    </section>
  );
}
