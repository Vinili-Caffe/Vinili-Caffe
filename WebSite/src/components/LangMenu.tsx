"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LOCALES, LANG_LABEL, useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { setChromeOpen } from "@/lib/chrome-open";
import { FlagImg } from "./FlagImg";

/** Menù lingue: bandiere PNG (tutte le lingue i18n). Accanto al wordmark. */
export function LangMenu({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();

  useEffect(() => {
    setChromeOpen(`lang-${uid}`, open);
    return () => setChromeOpen(`lang-${uid}`, false);
  }, [open, uid]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("nav.language")}
        title={LANG_LABEL[locale]}
        className="inline-flex size-10 items-center justify-center rounded-full bg-crema/8 ring-1 ring-crema/15 transition-colors hover:bg-crema/15"
      >
        <FlagImg locale={locale} size={20} className="h-4 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={t("nav.languageList")}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 top-full z-[70] mt-2 w-[min(18rem,calc(100vw-2rem))] origin-top-left overflow-hidden rounded-2xl bg-roast/95 p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
          >
            <div className="grid grid-cols-5 gap-1">
              {LOCALES.map((id) => {
                const on = locale === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    aria-label={LANG_LABEL[id]}
                    title={LANG_LABEL[id]}
                    onClick={() => {
                      setLocale(id as Locale);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl transition-colors",
                      on ? "bg-caramel/20 ring-1 ring-caramel/40" : "hover:bg-crema/10",
                    )}
                  >
                    <FlagImg locale={id as Locale} size={40} className="h-[18px] w-6" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
