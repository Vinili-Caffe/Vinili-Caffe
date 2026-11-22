"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Riga che scorre di lato, con le frecce su desktop. */
export function QuizCarousel({ children, round, className }: { children: ReactNode; round?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  function update() {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }
  useEffect(update, [children]);

  function go(dir: number) {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <div className="group/row relative">
      <div
        ref={ref}
        onScroll={update}
        className={cn(
          "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          round ? "sm:gap-5" : "sm:gap-4",
          className,
        )}
      >
        {children}
      </div>
      {!edge.start ? <Arrow side="left" onClick={() => go(-1)} /> : null}
      {!edge.end ? <Arrow side="right" onClick={() => go(1)} /> : null}
    </div>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Indietro" : "Avanti"}
      className={cn(
        "absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-espresso/90 text-crema shadow-lg ring-1 ring-sand/25 backdrop-blur transition hover:bg-caramel hover:text-ink md:grid",
        side === "left" ? "-left-5" : "-right-5",
      )}
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );
}

