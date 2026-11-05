"use client";

import { creditiIconUrl } from "@/lib/evento-credits";
import { cn } from "@/lib/cn";

const SIZE = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-10 w-10",
  xl: "h-16 w-16",
  hero: "h-24 w-24 sm:h-28 sm:w-28",
} as const;

/** Icona ufficiale crediti evento (crediti.gif). */
export function EventoCreditsIcon({
  size = "md",
  className = "",
  alt = "Crediti",
}: {
  size?: keyof typeof SIZE;
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={creditiIconUrl()}
      alt={alt}
      data-vc-lightbox-ignore
      className={cn("inline-block object-contain", SIZE[size], className)}
      draggable={false}
    />
  );
}
