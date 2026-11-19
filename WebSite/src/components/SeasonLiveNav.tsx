"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";
import { enableSeasonForces, subscribeSeasonForces } from "@/lib/site-effects";

const ACCENT = "#e24a3b";

/**
 * Dopo hydration: abilita override localStorage stagione e ricalcola badge.
 * (Primo paint deve restare uguale all’SSR — niente #418.)
 */
export function useNavSeasonTick() {
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    enableSeasonForces();
    setReady(true);
    const bump = () => setTick((n) => n + 1);
    const unsub = subscribeSeasonForces(bump);
    bump();
    const id = window.setInterval(bump, 60_000);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, []);

  return { tick, ready };
}

/** Bollino «in corso» accanto ad Albero / Wrapped (stile tag sconti). */
export function SeasonLiveNavTag({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      title={t("nav.inProgress")}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[0.55rem] font-bold uppercase leading-4 tracking-[0.14em] ring-1",
        className,
      )}
      style={{
        color: ACCENT,
        backgroundColor: `${ACCENT}22`,
        boxShadow: `inset 0 0 0 1px ${ACCENT}66`,
      }}
    >
      {t("nav.inProgress")}
    </span>
  );
}

/** Punto esclamativo sul gruppo Giochi quando Albero o Wrapped sono live. */
export function SeasonLiveNavDot({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      aria-hidden
      title={t("nav.inProgress")}
      className={cn(
        "relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-black leading-none",
        className,
      )}
      style={{
        color: ACCENT,
        backgroundColor: `${ACCENT}22`,
        boxShadow: `inset 0 0 0 1px ${ACCENT}66`,
      }}
    >
      <span className="absolute inset-0 rounded-full opacity-50 motion-safe:animate-ping [animation-iteration-count:4]" style={{ backgroundColor: `${ACCENT}55` }} />
      <span className="relative" aria-hidden>
        !
      </span>
    </span>
  );
}
