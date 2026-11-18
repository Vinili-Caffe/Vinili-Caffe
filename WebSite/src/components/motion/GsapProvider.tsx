"use client";

import { useEffect, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";
import { useDeviceFx } from "@/components/effects/DeviceFxProvider";

let registered = false;

function ensureGsapPlugins() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

/**
 * Registra GSAP + ScrollTrigger una volta e refresh su resize / cambio policy motion.
 */
export function GsapProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const { allowMotion, ready } = useDeviceFx();

  useEffect(() => {
    ensureGsapPlugins();
    const enable = ready && allowMotion && reduce !== true;
    ScrollTrigger.getAll().forEach((t) => {
      if (!enable) t.disable(false);
      else t.enable(false);
    });
    ScrollTrigger.config({ ignoreMobileResize: true });
    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize, { passive: true });
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 400);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", onResize);
    };
  }, [allowMotion, ready, reduce]);

  return <>{children}</>;
}

export { gsap, ScrollTrigger };
