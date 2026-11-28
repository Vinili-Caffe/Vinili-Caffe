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
      <div className="relative mx-auto max-w-6xl">
      <Reveal className="mb-8 text-center sm:mb-12">
        <p className="text-sm font-medium text-caramel">{t("explore.kicker")}</p>
        <h2 className="mt-3 font-display text-3xl font-semibold leading-snug text-balance sm:text-4xl lg:text-5xl">
          {t("explore.title")}
        </h2>
      </Reveal>

      {/* Phone: 2×2. PC: 4 su una riga. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {navGroups.map((g, gi) => (
          <Reveal key={g.labelKey} delay={gi * 0.05} className="h-full">
              <div className="relative h-full overflow-hidden rounded-2xl bg-roast p-3.5 ring-1 ring-sand/15 sm:rounded-3xl sm:p-5">
                <h3 className="relative flex items-center gap-1.5 px-1.5 pb-1.5 text-xs font-semibold text-caramel sm:px-2 sm:pb-2 sm:text-xs">
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
                            <span className="shrink-0 rounded-full bg-espresso/90 px-2 py-0.5 text-xs font-semibold text-sand ring-1 ring-sand/30">
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
                          className={cn(
                            "group flex items-center gap-2 rounded-xl px-1.5 py-2 transition-[transform,background-color,color] duration-200 ease-out hover:bg-crema/6 active:scale-[0.98] sm:gap-3 sm:rounded-2xl sm:px-2 sm:py-2.5",
                          )}
                        >
                          <NavIcon labelKey={l.labelKey} className="size-3.5 shrink-0 opacity-55 transition-opacity duration-200 group-hover:opacity-80" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-crema sm:text-[0.95rem]">
                            {t(l.labelKey)}
                          </span>
                          {seasonReady && navLinkSeasonLive(l) ? <SeasonLiveNavTag /> : null}
                          <ArrowUpRight className="size-3.5 shrink-0 text-crema/30 transition-colors duration-200 group-hover:text-caramel sm:size-4" />
                        </MotionLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
          </Reveal>
        ))}
      </div>
      </div>
    </section>
  );
}
