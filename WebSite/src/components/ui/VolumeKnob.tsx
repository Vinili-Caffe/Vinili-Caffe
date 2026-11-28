"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** tacche della corona: una ogni 10% (11 in tutto), da -135° a +135° */
const TICKS = Array.from({ length: 11 }, (_, i) => i * 10);
const SWEEP = 270;
const angleFor = (v: number) => -135 + (Math.min(100, Math.max(0, v)) / 100) * SWEEP;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** angolo (gradi) del puntatore attorno al centro della manopola */
function pointerDeg(x: number, y: number, cx: number, cy: number) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}
/** differenza di angolo senza il salto a ±180° */
function unwrap(prev: number, next: number) {
  let d = next - prev;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Manopola del volume, come quella di uno stereo (idea: detent dial di Kokonut UI).
 * Si gira come una manopola vera: il movimento attorno al centro la fa ruotare e il pomello resta
 * sotto il dito (niente molle né scatti mentre la giri). Anche rotella del mouse (senza far scorrere
 * la pagina) e frecce della tastiera.
 */
export function VolumeKnob({
  value,
  onChange,
  label = "Volume",
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ cx: number; cy: number; last: number | null; val: number } | null>(null);
  /* valore "vivo" mentre la giri: continuo, così il pomello segue la mano senza ritardi */
  const [live, setLive] = useState<number | null>(null);
  const v = clamp(Math.round(value));
  const shown = live ?? v;

  const emit = (n: number) => {
    const r = Math.round(clamp(n));
    if (r !== v) onChange(r);
  };

  /* rotella: listener non passivo, così sopra la manopola la pagina non scorre */
  const valueRef = useRef(v);
  valueRef.current = v;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 2 : -2;
      const next = clamp(valueRef.current + step);
      if (next !== valueRef.current) onChangeRef.current(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const end = () => {
    drag.current = null;
    setLive(null);
  };

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${Math.round(shown)}%`}
      title={`${label}: ${Math.round(shown)}% (gira attorno al centro)`}
      className={cn(
        "relative size-11 shrink-0 cursor-grab touch-none select-none rounded-full outline-none active:cursor-grabbing",
        "focus-visible:ring-2 focus-visible:ring-caramel/70 focus-visible:ring-offset-2 focus-visible:ring-offset-espresso",
        className,
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const far = Math.hypot(e.clientX - cx, e.clientY - cy) > 6;
        drag.current = { cx, cy, last: far ? pointerDeg(e.clientX, e.clientY, cx, cy) : null, val: v };
        setLive(v);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* puntatore già rilasciato */
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        /* vicinissimo al centro l'angolo impazzisce: si aspetta di allontanarsi */
        if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 6) {
          d.last = null;
          return;
        }
        const deg = pointerDeg(e.clientX, e.clientY, d.cx, d.cy);
        if (d.last == null) {
          d.last = deg;
          return;
        }
        const delta = unwrap(d.last, deg);
        d.last = deg;
        d.val = clamp(d.val + (delta / SWEEP) * 100);
        setLive(d.val);
        emit(d.val);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 5;
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          emit(v + step);
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          emit(v - step);
        } else if (e.key === "Home") {
          e.preventDefault();
          emit(0);
        } else if (e.key === "End") {
          e.preventDefault();
          emit(100);
        }
      }}
    >
      {/* corona di tacche: si accendono fino al volume attuale */}
      {TICKS.map((t) => (
        <span
          key={t}
          aria-hidden
          className="absolute left-1/2 top-1/2 h-full w-px"
          style={{ transform: `translate(-50%, -50%) rotate(${angleFor(t)}deg)` }}
        >
          <span
            className={cn(
              "absolute left-0 top-0 h-[3px] w-px rounded-full transition-colors duration-150",
              t <= shown && shown > 0 ? "bg-caramel" : "bg-crema/20",
            )}
          />
        </span>
      ))}

      {/* il pomello: ruota direttamente col valore (transizione breve solo per rotella e tastiera) */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-[5px] rounded-full bg-[conic-gradient(#3a3330,#1a1512,#4a413b,#16120f,#3a3330)] shadow-[0_3px_8px_-2px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,240,220,0.18)] ring-1 ring-black/60",
          live == null && "transition-transform duration-150 ease-out",
        )}
        style={{ transform: `rotate(${angleFor(shown)}deg)` }}
      >
        <span className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#4a403a,#1d1815)] ring-1 ring-black/50" />
        <span className="absolute left-1/2 top-[3px] h-[7px] w-[2px] -translate-x-1/2 rounded-full bg-crema shadow-[0_0_4px_rgba(244,233,216,0.6)]" />
      </div>
    </div>
  );
}
