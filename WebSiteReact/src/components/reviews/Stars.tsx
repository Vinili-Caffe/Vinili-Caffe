"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** Stelle in sola lettura (anche frazionarie, per la media). */
export function Stars({ value, size = "size-4", className }: { value: number; size?: string; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${value.toFixed(1).replace(".", ",")} su 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className={cn("relative", size)}>
            <Star className={cn("absolute inset-0 text-crema/15", size)} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={cn("text-ember", size)} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

const LABELS = ["", "Da rivedere", "Così così", "Carino", "Molto bello", "Il mio posto preferito"];

/** Selettore del voto con hover e "rimbalzo". */
export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Voto">
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} ${i === 1 ? "stella" : "stelle"}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            whileTap={{ scale: 0.8 }}
            animate={value === i ? { scale: [1, 1.3, 1] } : { scale: 1 }}
            transition={{ duration: 0.3 }}
            className="p-0.5"
          >
            <Star className={cn("size-8 transition-colors", i <= shown ? "text-ember" : "text-crema/15")} fill="currentColor" strokeWidth={0} />
          </motion.button>
        ))}
      </div>
      <span className="text-sm text-crema/55">{shown ? LABELS[shown] : "Scegli un voto"}</span>
    </div>
  );
}
