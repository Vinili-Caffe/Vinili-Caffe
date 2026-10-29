"use client";

import { useEffect, useId, useRef } from "react";
import { useRichFx } from "@/components/effects/DeviceFxProvider";
import { isPerfPaused } from "@/lib/perf-pause";
import { cn } from "@/lib/cn";

/**
 * Curved Loop (da React Bits): una scritta che scorre all'infinito lungo una curva, come il bordo di un disco.
 * Il testo è ripetuto e scorre spostando startOffset; si ferma fuori schermo, in pausa o con DeviceFx off/lite.
 */
export function CurvedLoop({ text, speed = 0.6, curve = 70, className }: { text: string; speed?: number; curve?: number; className?: string }) {
  const rich = useRichFx();
  const id = useId().replace(/:/g, "");
  const tpRef = useRef<SVGTextPathElement>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const boxRef = useRef<SVGSVGElement>(null);
  const reps = 6;

  useEffect(() => {
    const tp = tpRef.current;
    const m = measureRef.current;
    const box = boxRef.current;
    if (!tp || !m || !box) return;
    const unit = m.getComputedTextLength() || 600;
    tp.setAttribute("startOffset", `${-unit}px`);
    if (!rich) return;
    let raf = 0;
    let visible = true;
    let off = -unit;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(step);
    });
    io.observe(box);
    function step() {
      raf = 0;
      if (!visible) return;
      if (!isPerfPaused()) {
        off += speed;
        if (off > 0) off -= unit;
        tp!.setAttribute("startOffset", `${off}px`);
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rich, speed, text]);

  return (
    <div className={cn("w-full overflow-hidden", className)} aria-label={text}>
      <svg ref={boxRef} viewBox="0 0 1440 140" className="block w-full select-none" aria-hidden>
        <text ref={measureRef} className="invisible text-[44px] font-semibold" style={{ visibility: "hidden" }}>
          {text}
        </text>
        <defs>
          <path id={`cl-${id}`} d={`M-100,40 Q720,${40 + curve * 2} 1540,40`} fill="none" />
        </defs>
        <text className="fill-current font-display text-[44px] font-semibold tracking-wide">
          <textPath ref={tpRef} href={`#cl-${id}`}>
            {Array.from({ length: reps }, () => text).join("")}
          </textPath>
        </text>
      </svg>
    </div>
  );
}
