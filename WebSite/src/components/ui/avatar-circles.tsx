"use client";

import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";

/**
 * Avatar Circles (da Magic UI): facce sovrapposte + un cerchio "+N" per chi non entra.
 * Usa `Avatar` così un CDN Discord 404 diventa silhouette (niente foto rotta).
 * `shrink-0` obbligatorio: nelle card 2×2 mobile il flex altrimenti schiaccia le facce a ovali.
 */
export function AvatarCircles({
  people,
  total,
  max = 5,
  label,
  className,
}: {
  people: { name: string; avatarUrl?: string }[];
  total?: number;
  max?: number;
  /** scritta accanto alle facce (es. "25 persone"), così il "+N" non si confonde col numero grande */
  label?: string;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = Math.max(0, (total ?? people.length) - shown.length);
  if (!shown.length) return null;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2.5", className)}>
      <div className="flex shrink-0 items-center -space-x-2 sm:-space-x-2.5">
        {shown.map((p, i) => (
          <Avatar
            key={`${p.name}-${i}`}
            src={p.avatarUrl}
            name={p.name}
            noPresence
            className="size-7 shrink-0 bg-mocha ring-2 ring-roast transition-transform hover:z-10 hover:-translate-y-0.5 sm:size-8"
          />
        ))}
        {rest > 0 && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-caramel text-[0.6rem] font-bold text-ink ring-2 ring-roast lining-nums sm:size-8 sm:text-[0.62rem]">
            +{rest > 99 ? "99" : rest}
          </span>
        )}
      </div>
      {label ? <span className="truncate text-[0.7rem] text-crema/50 lining-nums sm:text-xs">{label}</span> : null}
    </div>
  );
}
