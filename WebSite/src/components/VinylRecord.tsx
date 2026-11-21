"use client";

import { cn } from "@/lib/cn";
import { cdnUrl } from "@/lib/site";

/**
 * Vinile brand (`logo-disco.png`). `rpm` tenuto per API Turntable (etichetta non più SVG).
 */
export function VinylRecord({ className }: { className?: string; rpm?: 33 | 45 }) {
  return (
     
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
