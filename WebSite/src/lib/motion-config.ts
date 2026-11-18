import { motionTokens } from "./motion-tokens";

/** Gate runtime per Motion / GSAP / Lenis / React Bits. */
export const motionConfig = {
  isLowEnd() {
    if (typeof navigator === "undefined") return false;
    const cores = Number(navigator.hardwareConcurrency || 8);
    return cores > 0 && cores <= 4;
  },

  prefersReduced() {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  shouldAnimate({ essential = false }: { essential?: boolean } = {}) {
    if (this.prefersReduced()) return false;
    if (!essential && this.isLowEnd()) return false;
    return true;
  },

  duration() {
    return this.isLowEnd() || this.prefersReduced()
      ? motionTokens.duration.instant
      : motionTokens.duration.normal;
  },
};
