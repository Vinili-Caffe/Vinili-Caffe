"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

/** Pannello laterale dei riquadri del profilo staff (come i "sheet" del sito vecchio). Esc chiude. */
export function Sheet({ title, kicker, onClose, children, wide }: { title: string; kicker?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const chromeId = useId();
  useBodyScrollLock(true);
  useEffect(() => {
    setChromeOpen(`sheet-${chromeId}`, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      setChromeOpen(`sheet-${chromeId}`, false);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, chromeId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex justify-end overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button type="button" aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className={`relative z-10 flex h-full w-full flex-col overflow-y-auto bg-roast shadow-2xl ring-1 ring-sand/15 ${wide ? "max-w-3xl" : "max-w-xl"}`}
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-sand/10 bg-roast px-5 py-4 sm:px-7">
          <div className="min-w-0">
            {kicker && <p className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-caramel">{kicker}</p>}
            <h2 className="truncate font-display text-2xl font-semibold">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="ml-auto rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema">
            <X className="size-5" />
          </button>
        </header>
        <div className="p-5 sm:p-7">{children}</div>
      </motion.aside>
    </motion.div>,
    document.body,
  );
}

/** Riga numerata "#id testo" delle valutazioni / warn. */
export function ReasonRow({ id, text, children }: { id: number; text: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-crema/[0.04] px-3 py-2.5 ring-1 ring-sand/10">
      <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-caramel lining-nums">#{id}</span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed text-crema/85">{text}</span>
      {children}
    </li>
  );
}
