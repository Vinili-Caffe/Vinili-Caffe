"use client";

import { useEffect, useRef } from "react";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { cn } from "@/lib/cn";

/**
 * Spotlight (da "Spotlight Card" di React Bits): una luce calda segue il puntatore dentro la card.
 * Si mette come primo figlio di una card `relative group/spot overflow-hidden`: ascolta il genitore e
 * aggiorna due variabili CSS, quindi niente re-render mentre muovi il mouse. Senza cap pointerFx non fa nulla.
 */
export function Spotlight({
  color = "rgba(217,154,91,0.16)",
  size = 340,
  className,
}: {
  color?: string;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rich = useFxCap("pointerFx");
  useEffect(() => {
    if (!rich) return;
    const layer = ref.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      raf = 0;
      layer.style.setProperty("--sx", `${x}px`);
      layer.style.setProperty("--sy", `${y}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = host.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    host.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      host.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rich]);
  if (!rich) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 [@media(hover:hover)]:group-hover/spot:opacity-100",
        className,
      )}
      style={{ background: `radial-gradient(${size}px circle at var(--sx, 50%) var(--sy, 50%), ${color}, transparent 70%)` }}
    />
  );
}
