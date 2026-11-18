"use client";

import type { ReactNode } from "react";
import { GsapProvider } from "./GsapProvider";
import { SmoothScroll } from "./SmoothScroll";

/**
 * Stack motion del sito pubblico: Lenis (scroll) + GSAP (scroll trigger) + Motion (già in ShellMotion).
 * Su chrome `app` (dashboard) Lenis resta spento.
 */
export function SiteMotionRoot({
  children,
  smoothScroll = true,
}: {
  children: ReactNode;
  smoothScroll?: boolean;
}) {
  return (
    <GsapProvider>
      <SmoothScroll disabled={!smoothScroll}>{children}</SmoothScroll>
    </GsapProvider>
  );
}
