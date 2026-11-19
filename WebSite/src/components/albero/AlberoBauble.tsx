"use client";

import { forwardRef } from "react";
import { VenetianMask } from "lucide-react";
import { cn } from "@/lib/cn";
import { colorMeta, type AlberoOrnament } from "@/lib/albero";

type Props = {
  ornament: AlberoOrnament;
  size?: number;
  selected?: boolean;
  dragging?: boolean;
  dimmed?: boolean;
  showNick?: boolean;
  xPct?: number;
  yPct?: number;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

export const AlberoBauble = forwardRef<HTMLButtonElement, Props>(function AlberoBauble(
  {
    ornament,
    size = 36,
    selected,
    dragging,
    dimmed,
    showNick = true,
    xPct,
    yPct,
    onPointerDown,
    onClick,
    className,
    style,
  },
  ref,
) {
  const meta = colorMeta(ornament.color);
  const anonymous = Boolean(ornament.anonymous) || ornament.displayName === "Anonimo";
  const nick = anonymous
    ? "Anonimo"
    : ornament.displayName.length > 10
      ? `${ornament.displayName.slice(0, 9).trimEnd()}…`
      : ornament.displayName;

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${anonymous ? "Anonimo" : ornament.displayName}: ${ornament.message}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={cn(
        "absolute touch-none select-none outline-none will-change-transform",
        "focus-visible:ring-2 focus-visible:ring-caramel/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        dragging ? "z-40 cursor-grabbing" : ornament.mine ? "z-20 cursor-grab" : "z-10 cursor-pointer",
        dimmed && "opacity-35",
        selected && "z-30",
        className,
      )}
      style={{
        width: size,
        height: size,
        left: xPct != null ? `${xPct * 100}%` : undefined,
        top: yPct != null ? `${yPct * 100}%` : undefined,
        transform: xPct != null || yPct != null ? "translate(-50%, -50%)" : undefined,
        ...style,
      }}
    >
      {/* gancio */}
      <span
        className="pointer-events-none absolute left-1/2 top-0 z-20 h-[18%] w-[12%] -translate-x-1/2 -translate-y-[70%] rounded-[1px] bg-gradient-to-b from-[#f0d9a0] to-[#8a6430]"
        aria-hidden
      />

      {/* sfera: relative → avatar centrato dentro */}
      <span
        className={cn(
          "relative block size-full overflow-hidden rounded-full ring-1",
          selected || dragging ? "ring-[#fff3c4]" : "ring-white/30",
        )}
        style={{
          background: `linear-gradient(145deg, ${meta.hex}, #140c08 125%)`,
          boxShadow: `0 0 12px ${meta.glow}, 0 4px 10px -3px rgba(0,0,0,0.65)`,
        }}
      >
        {!anonymous && ornament.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ornament.avatarUrl}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-1/2 size-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover"
          />
        ) : anonymous ? (
          <span
            className="absolute left-1/2 top-1/2 flex size-[78%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{
              background: `radial-gradient(circle at 40% 32%, rgba(255,236,200,0.22), transparent 42%), linear-gradient(160deg, ${meta.hex}55, #1a100c 78%)`,
              boxShadow: "inset 0 0 0 1px rgba(255,236,200,0.18)",
            }}
            aria-hidden
          >
            <VenetianMask
              className="size-[52%] text-[#f3e0b8]"
              strokeWidth={1.6}
              absoluteStrokeWidth
            />
          </span>
        ) : (
          <span className="absolute left-1/2 top-1/2 flex size-[72%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#2a1c12] text-[0.65em] font-semibold text-crema">
            {(ornament.displayName[0] || "·").toUpperCase()}
          </span>
        )}
        <span
          className="pointer-events-none absolute left-[18%] top-[14%] size-[18%] rounded-full bg-white/45"
          aria-hidden
        />
      </span>

      {showNick ? (
        <span
          className="pointer-events-none absolute left-1/2 top-[108%] max-w-[5.5rem] -translate-x-1/2 truncate rounded-full bg-espresso/70 px-1.5 py-px text-center text-[0.55rem] font-semibold leading-tight text-crema/90"
          title={ornament.displayName}
        >
          {nick}
        </span>
      ) : null}
    </button>
  );
});
