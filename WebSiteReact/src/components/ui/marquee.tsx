"use client";

import { useRichFx } from "@/components/effects/DeviceFxProvider";
import { cn } from "@/lib/cn";

/**
 * Marquee (da Magic UI): una striscia che scorre all'infinito. Il contenuto è duplicato e scorre di
 * metà larghezza, così il giro si chiude senza salti. Solo transform (GPU), si ferma al passaggio del mouse.
 * Su dispositivi deboli o senza movimento (DeviceFx off/lite), o con `manual`, è una striscia ferma
 * da scorrere col dito, la rotella o le frecce (`stripRef` per comandarla da fuori).
 */
export function Marquee({
  children,
  reverse,
  duration = 60,
  gap = 16,
  manual,
  stripRef,
  className,
}: {
  children: React.ReactNode;
  reverse?: boolean;
  duration?: number;
  gap?: number;
  manual?: boolean;
  stripRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  const animated = useRichFx() && !manual;
  if (!animated) {
    return (
      <div
        ref={stripRef}
        className={cn(
          "flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
        style={{ gap }}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "group/marquee flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
        className,
      )}
      style={{ "--marquee-duration": `${duration}s`, "--marquee-gap": `${gap}px` } as React.CSSProperties}
    >
      <div
        className={cn(
          "flex w-max shrink-0 animate-marquee group-hover/marquee:[animation-play-state:paused]",
          reverse && "[animation-direction:reverse]",
        )}
        style={{ gap }}
      >
        {children}
        <div aria-hidden className="contents">
          {children}
        </div>
      </div>
    </div>
  );
}
