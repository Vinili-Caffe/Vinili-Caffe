"use client";

import { cn } from "@/lib/cn";

/** Scheletri di lista (E8). Sostituiscono i `animate-pulse` copiati pagina per pagina. */

export type ListSkeletonVariant = "card" | "row" | "compact";

const LINE = ["w-2/3", "w-4/5", "w-1/2", "w-3/5"] as const;

export function ListSkeletonItem({
  variant = "card",
  index = 0,
}: {
  variant?: ListSkeletonVariant;
  index?: number;
}) {
  if (variant === "compact") {
    return <div className={cn("h-8 animate-pulse rounded-xl bg-crema/8", LINE[index % LINE.length])} />;
  }
  if (variant === "row") {
    return <div className="h-14 animate-pulse rounded-2xl bg-roast/50 ring-1 ring-sand/10" />;
  }
  return (
    <div className="flex gap-3 rounded-3xl bg-roast/50 p-4 ring-1 ring-sand/10">
      <div className="size-11 shrink-0 animate-pulse rounded-full bg-crema/10" />
      <div className="min-w-0 flex-1 space-y-2 py-1">
        <div className="h-3 w-1/3 animate-pulse rounded-full bg-crema/10" />
        <div className={cn("h-3 animate-pulse rounded-full bg-crema/8", LINE[index % LINE.length])} />
        <div className="h-3 w-2/5 animate-pulse rounded-full bg-crema/6" />
      </div>
    </div>
  );
}

export function ListSkeleton({
  count = 4,
  variant = "card",
  className,
  label = "Caricamento",
}: {
  count?: number;
  variant?: ListSkeletonVariant;
  className?: string;
  label?: string;
}) {
  const n = Math.max(1, Math.min(12, count));
  return (
    <ul data-vc-ui="list-skeleton" className={cn(variant === "compact" ? "space-y-2" : "space-y-3", className)} aria-busy="true" aria-label={label}>
      {Array.from({ length: n }, (_, i) => (
        <li key={i} aria-hidden>
          <ListSkeletonItem variant={variant} index={i} />
        </li>
      ))}
    </ul>
  );
}
