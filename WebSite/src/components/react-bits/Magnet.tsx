"use client";

/**
 * React Bits — Magnet (adattato): il bottone “tira” leggermente verso il cursore.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Magnet({
  children,
  className,
  padding = 48,
  strength = 0.28,
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  padding?: number;
  /** 0–1 quanto segue il cursore */
  strength?: number;
  disabled?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = wrap.current;
    const node = inner.current;
    if (!root || !node || disabled) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let active = false;

    const tick = () => {
      raf = 0;
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      node.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 || active) {
        raf = requestAnimationFrame(tick);
      }
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = root.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const outside = Math.hypot(
        Math.max(0, Math.abs(dx) - r.width / 2),
        Math.max(0, Math.abs(dy) - r.height / 2),
      );
      if (outside > padding) {
        active = false;
        tx = 0;
        ty = 0;
      } else {
        active = true;
        const pull = 1 - Math.min(1, outside / Math.max(1, padding));
        tx = dx * strength * pull;
        ty = dy * strength * pull;
      }
      wake();
    };
    const onLeave = () => {
      active = false;
      tx = 0;
      ty = 0;
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      node.style.transform = "";
    };
  }, [disabled, padding, strength]);

  return (
    <div ref={wrap} className={cn("relative inline-block", className)}>
      <div ref={inner} className="will-change-transform">
        {children}
      </div>
    </div>
  );
}
