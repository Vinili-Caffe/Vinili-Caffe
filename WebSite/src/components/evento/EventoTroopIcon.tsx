"use client";

import { troopIconUrl } from "@/lib/evento-troop-art";
import { cn } from "@/lib/cn";

const SIZE = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-20 w-20",
} as const;

/** Icona truppa SW (catalogo unità). */
export function EventoTroopIcon({
  unitId,
  size = "md",
  className = "",
  alt = "",
}: {
  unitId: string;
  size?: keyof typeof SIZE;
  className?: string;
  alt?: string;
}) {
  const src = troopIconUrl(unitId);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      data-vc-lightbox-ignore
      className={cn("inline-block object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]", SIZE[size], className)}
      draggable={false}
    />
  );
}
