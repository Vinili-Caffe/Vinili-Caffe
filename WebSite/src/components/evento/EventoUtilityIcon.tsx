"use client";

import { utilityIconUrl } from "@/lib/evento-utility-art";
import { cn } from "@/lib/cn";

const SIZE = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-20 w-20",
} as const;

/** Icona utility SW (bacta / festival / hutt / sconto). */
export function EventoUtilityIcon({
  itemId,
  size = "md",
  className = "",
  alt = "",
}: {
  itemId: string;
  size?: keyof typeof SIZE;
  className?: string;
  alt?: string;
}) {
  const src = utilityIconUrl(itemId);
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
