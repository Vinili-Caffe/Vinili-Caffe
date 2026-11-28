"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion} from "motion/react";
import { Palette } from "lucide-react";
import { cn } from "@/lib/cn";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

/** la mazzetta: i colori del sito più qualche classico */
const SWATCHES = [
  { hex: "#d99a5b", name: "Caramello" },
  { hex: "#f0b46e", name: "Ambra" },
  { hex: "#f4e9d8", name: "Crema" },
  { hex: "#8b5a3c", name: "Nocciola" },
  { hex: "#c0392b", name: "Vino" },
  { hex: "#ff73fa", name: "Fucsia" },
  { hex: "#9b7bff", name: "Lavanda" },
  { hex: "#3fa9f5", name: "Cielo" },
  { hex: "#2ecc71", name: "Menta" },
];

/**
 * Mazzetta di campioni colore che si apre a ventaglio (idea: Kokonut «swatch fan»).
 * Click su un campione = quel colore.
 */
export function SwatchFan({ value, onPick, disabled }: { value: string; onPick: (hex: string) => void; disabled?: boolean }) {
  const reduce = useReducedMotionSafe();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [open]);

  const n = SWATCHES.length;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Apri la mazzetta dei colori"
        title="Mazzetta colori"
        className="grid size-9 place-items-center rounded-xl bg-crema/[0.06] text-sand ring-1 ring-sand/20 transition hover:bg-crema/10 hover:text-crema disabled:opacity-40"
      >
        <Palette className="size-4" />
      </button>
      <AnimatePresence>
        {open ? (
          <div className="absolute bottom-full right-0 z-40 mb-2 h-40 w-40" aria-label="Campioni colore" role="listbox">
            {SWATCHES.map((s, i) => {
              const angle = -62 + (i * 124) / (n - 1);
              const active = value.toLowerCase() === s.hex;
              return (
                <motion.button
                  key={s.hex}
                  type="button"
                  role="option"
                  aria-selected={active}
                  title={s.name}
                  onClick={() => {
                    onPick(s.hex);
                    setOpen(false);
                  }}
                  initial={reduce ? { opacity: 0 } : { rotate: 0, opacity: 0 }}
                  animate={{ rotate: angle, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { rotate: 0, opacity: 0 }}
                  transition={reduce ? { duration: 0.1 } : { type: "spring", stiffness: 300, damping: 22, delay: i * 0.025 }}
                  whileHover={reduce ? undefined : { y: -8 }}
                  style={{ transformOrigin: "50% 100%" }}
                  className={cn(
                    "absolute bottom-0 right-[3.25rem] flex h-36 w-9 flex-col overflow-hidden rounded-md bg-paper shadow-[0_6px_14px_-4px_rgba(0,0,0,0.6)] ring-1 ring-black/25",
                    active && "ring-2 ring-crema",
                  )}
                >
                  <span className="h-2/3 w-full" style={{ background: s.hex }} />
                  <span className="flex flex-1 items-start justify-center pt-1 text-[0.45rem] font-bold uppercase leading-none text-ink/70 [writing-mode:vertical-rl]">
                    {s.name}
                  </span>
                </motion.button>
              );
            })}
            {/* il perno della mazzetta */}
            <span aria-hidden className="absolute bottom-[-4px] right-[3.95rem] size-2.5 rounded-full bg-[#2a1c14] ring-2 ring-sand/60" />
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
