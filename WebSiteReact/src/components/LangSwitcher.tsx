"use client";

import { LOCALES, LANG_LABEL, useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/** Selettore it / en / es (shell chrome). */
export function LangSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** Solo bandiere/codice, senza bordo largo (navbar guest mobile). */
  compact?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={cn(
        "flex items-center gap-1",
        compact ? "rounded-full bg-crema/8 p-0.5 ring-1 ring-crema/15" : "rounded-xl bg-crema/6 p-1 ring-1 ring-sand/12",
        className,
      )}
      role="radiogroup"
      aria-label={t("nav.languageList")}
    >
      {LOCALES.map((id) => {
        const on = locale === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={LANG_LABEL[id]}
            title={LANG_LABEL[id]}
            onClick={() => setLocale(id as Locale)}
            className={cn(
              "flex items-center justify-center font-semibold uppercase tracking-wide transition-colors",
              compact ? "size-8 rounded-full text-[0.65rem]" : "flex-1 rounded-lg px-2.5 py-1.5 text-xs",
              on ? "bg-caramel/20 text-ember ring-1 ring-caramel/30" : "text-crema/55 hover:bg-crema/8 hover:text-crema",
            )}
          >
            {id}
          </button>
        );
      })}
    </div>
  );
}
