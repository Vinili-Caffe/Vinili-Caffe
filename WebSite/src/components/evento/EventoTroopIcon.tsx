"use client";

import { useEffect, useState } from "react";
import { troopIconCandidates } from "@/lib/evento-troop-art";
import { cn } from "@/lib/cn";

const SIZE = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-20 w-20",
} as const;

/** Icona truppa SW (catalogo unità), variante per fazione quando disponibile. */
export function EventoTroopIcon({
  unitId,
  factionId = null,
  size = "md",
  className = "",
  alt = "",
}: {
  unitId: string;
  factionId?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
  alt?: string;
}) {
  const candidates = troopIconCandidates(unitId, factionId);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [unitId, factionId]);

  const src = candidates[idx] || "";
  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      data-vc-lightbox-ignore
      onError={() => {
        setIdx((i) => (i + 1 < candidates.length ? i + 1 : i));
      }}
      className={cn(
        "inline-block object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.35)]",
        SIZE[size],
        className,
      )}
      draggable={false}
    />
  );
}
