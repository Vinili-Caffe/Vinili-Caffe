"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { LOCALES, LANG_LABEL, useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { setChromeOpen } from "@/lib/chrome-open";
import { FlagImg } from "./FlagImg";

/** Menù lingue: bandiere PNG (tutte le lingue i18n). Accanto al wordmark. */
export function LangMenu({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  /* posizione del menu: dentro lo schermo anche se il pulsante sta sul bordo destro (es. dashboard su telefono) */
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = Math.min(288, vw - 32);
      const left = Math.max(16, Math.min(r.left, vw - width - 16));
      setPos({ left, top: r.bottom + 8, width });
    }
    setOpen((o) => !o);
  };
  const uid = useId();

  useEffect(() => {
    setChromeOpen(`lang-${uid}`, open);
    return () => setChromeOpen(`lang-${uid}`, false);
  }, [open, uid]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    /* menu fuori dal pulsante: se la pagina scorre si chiude invece di restare staccato */
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  return (
    <div ref={box} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        ref={btn}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("nav.language")}
        title={LANG_LABEL[locale]}
        className="inline-flex size-10 items-center justify-center rounded-full bg-crema/8 ring-1 ring-crema/15 transition-colors hover:bg-crema/15"
      >
        <FlagImg locale={locale} size={20} className="h-4 w-5" />
      </button>

      {typeof document !== "undefined"
        ? createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menu}
            role="listbox"
            aria-label={t("nav.languageList")}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            style={pos ? { left: pos.left, top: pos.top, width: pos.width } : undefined}
            className="fixed z-[120] overflow-hidden rounded-2xl bg-roast/95 p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
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
      </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
