"use client";

import { Disc3 } from "lucide-react";

/** Barra minima nell'Attività Discord: solo brand + titolo, niente nav del sito. */
export function ActivityChrome() {
  return (
    <header className="sticky top-0 z-40 border-b border-sand/10 bg-espresso/90 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-caramel/15 text-caramel ring-1 ring-caramel/25">
          <Disc3 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-caramel/90">Vinili &amp; Caffè</p>
          <p className="truncate font-display text-lg text-crema">Music Quiz</p>
        </div>
      </div>
    </header>
  );
}
