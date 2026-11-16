"use client";

/**
 * React Bits — GlareHover (adattato): striscia di luce sul hover, stile vinile lucido.
 */
import { useCallback, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function GlareHover({
  children,
  className,
  glareColor = "rgba(244,233,216,0.35)",
  borderRadius,
}: {
  children: ReactNode;
  className?: string;
  glareColor?: string;
  borderRadius?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    el.style.setProperty("--glare-x", `${x}%`);
    el.style.setProperty("--glare-y", `${y}%`);
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className={cn(
        "group/glare relative isolate overflow-hidden",
        "before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:opacity-0 before:transition-opacity before:duration-300",
        "before:bg-[radial-gradient(circle_at_var(--glare-x,50%)_var(--glare-y,50%),var(--glare-color),transparent_55%)]",
        "hover:before:opacity-100",
        "motion-reduce:before:hidden",
        className,
      )}
      style={
        {
          "--glare-color": glareColor,
          borderRadius,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
