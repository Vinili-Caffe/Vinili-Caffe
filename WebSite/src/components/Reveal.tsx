"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Entra dal basso via CSS (`vc-reveal`).
 * Stesso markup SSR e client (niente branch su reduced-motion / DeviceFx → no #418).
 * L’animazione si spegne da CSS: prefers-reduced-motion e html[data-vc-fx-motion="0"].
 */
export function Reveal({
  delay = 0,
  y = 48,
  children,
  className,
  viewportAmount: _viewportAmount,
}: {
  delay?: number;
  y?: number;
  children?: ReactNode;
  className?: string;
  /** Legacy no-op: tenuto per call-site esistenti. */
  viewportAmount?: number;
}) {
  const style = {
    "--vc-reveal-y": `${y}px`,
    "--vc-reveal-delay": `${Math.max(0, delay)}s`,
  } as CSSProperties;

  return (
    <div className={cn("vc-reveal", className)} style={style}>
      {children}
    </div>
  );
}
