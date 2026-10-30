"use client";

import { cn } from "@/lib/cn";
import { cdnUrl } from "@/lib/site";

/**
 * Vinile brand (`logo-disco.png`). `rpm` tenuto per API Turntable (etichetta non più SVG).
 */
export function VinylRecord({ className, rpm: _rpm = 33 }: { className?: string; rpm?: 33 | 45 }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cdnUrl("/images/logo-disco.png")}
      alt="Il vinile di Vinili & Caffè"
      width={512}
      height={512}
      draggable={false}
      className={cn("rounded-full object-cover select-none", className)}
    />
  );
}
