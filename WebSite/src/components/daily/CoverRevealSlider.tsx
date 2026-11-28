"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronsLeftRight } from "lucide-react";

/**
 * Prima e dopo (idea: Motion «image reveal slider»): a sinistra la copertina a quadretti com'era
 * al primo tentativo, a destra quella vera. Si trascina la linea (anche con le frecce).
 */
export function CoverRevealSlider({ before, after }: { before: string; after: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPct(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div className="mt-4 w-full">
      <div
        ref={box}
        className="relative aspect-square w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-2xl ring-1 ring-sand/15 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.85)]"
        onPointerDown={(e) => {
          setDragging(true);
          moveTo(e.clientX);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* niente */
          }
        }}
        onPointerMove={(e) => dragging && moveTo(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt="La copertina vera" draggable={false} className="absolute inset-0 size-full object-cover" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={before}
          alt="La copertina a quadretti"
          draggable={false}
          className="absolute inset-0 size-full object-cover [image-rendering:pixelated]"
          style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        />
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-crema/90 backdrop-blur-sm">
          Prima
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-crema/90 backdrop-blur-sm">
          Dopo
        </span>
        {/* la linea con la maniglia */}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-crema shadow-[0_0_12px_rgba(244,233,216,0.7)]" style={{ left: `${pct}%` }}>
          <motion.span
            className="absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-crema text-ink shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
            animate={{ scale: dragging ? 1.12 : 1 }}
          >
            <ChevronsLeftRight className="size-4" />
          </motion.span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(pct)}
          onChange={(e) => setPct(Number(e.target.value))}
          aria-label="Confronta prima e dopo"
          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
          onPointerDown={(e) => e.preventDefault()}
        />
      </div>
      <p className="mt-1.5 text-center text-[0.7rem] text-crema/45">Trascina per vedere com'era all'inizio</p>
    </div>
  );
}
