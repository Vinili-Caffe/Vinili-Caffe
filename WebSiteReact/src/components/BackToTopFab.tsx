"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { useChromeOpenListener } from "@/lib/chrome-open";
import { floatCoversContent } from "@/lib/float-cover";

const SHOW_Y = 420;
const BACK_TOP_ATTR = "data-vc-back-top-on";

function setBackTopOn(on: boolean) {
  try {
    document.documentElement.toggleAttribute(BACK_TOP_ATTR, on);
  } catch {
    /* ignore */
  }
}

/** Freccia “torna su” — sparisce se copre footer/card; segnala al MusicDock se è su. */
export function BackToTopFab() {
  const [on, setOn] = useState(false);
  const [covering, setCovering] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);

  useEffect(() => useChromeOpenListener(setChromeOpen), []);

  useEffect(() => {
    const tickShow = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      const long = document.documentElement.scrollHeight > window.innerHeight * 1.6;
      setOn(long && y >= SHOW_Y);
    };
    tickShow();
    window.addEventListener("scroll", tickShow, { passive: true });
    window.addEventListener("resize", tickShow);
    return () => {
      window.removeEventListener("scroll", tickShow);
      window.removeEventListener("resize", tickShow);
    };
  }, []);

  const visible = on && !chromeOpen && !covering;

  useEffect(() => {
    setBackTopOn(visible);
    return () => setBackTopOn(false);
  }, [visible]);

  useEffect(() => {
    const measure = () => {
      timer.current = 0;
      const el = btnRef.current;
      if (!el || !on || chromeOpen) {
        setCovering(false);
        return;
      }
      try {
        setCovering(floatCoversContent(el));
      } catch {
        setCovering(false);
      }
    };
    const schedule = () => {
      if (timer.current) return;
      timer.current = window.setTimeout(measure, 90);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });

    let io: IntersectionObserver | null = null;
    const foot = document.querySelector("footer");
    if (foot && typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(schedule, { threshold: [0, 0.05, 0.15, 0.35, 0.6] });
      io.observe(foot);
    }

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      io?.disconnect();
    };
  }, [on, chromeOpen]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    el.dataset.vcFloatHidden = covering ? "1" : "0";
  }, [covering]);

  if (!on || chromeOpen) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      id="vc-site-back-top"
      data-vc-float="back-top"
      aria-label="Torna su"
      aria-hidden={covering || undefined}
      tabIndex={covering ? -1 : 0}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-3 z-[50] sm:right-5",
        "inline-flex size-11 items-center justify-center rounded-full",
        "bg-espresso/95 text-sand ring-1 ring-sand/30 shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
        "transition-[opacity,visibility,transform] duration-[180ms] ease-out",
        "hover:bg-caramel/25 hover:text-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel",
        covering && "pointer-events-none invisible translate-y-5 opacity-0",
      )}
    >
      <ChevronUp className="size-5" strokeWidth={2.4} />
    </button>
  );
}
