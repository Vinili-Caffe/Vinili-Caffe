"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ReactLenis, type LenisRef } from "lenis/react";
import { cancelFrame, frame } from "motion/react";
import "lenis/dist/lenis.css";
import { useDeviceFx } from "@/components/effects/DeviceFxProvider";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

type Props = {
  children: ReactNode;
  /** Disattiva Lenis (dashboard, form, scroll nested). */
  disabled?: boolean;
};

/**
 * Smooth scroll Lenis pilotato dal frame loop di Motion.
 * Albero DOM stabile (sempre ReactLenis se non `disabled`): spegne solo raf/smoothWheel
 * con reduced-motion / device low-end — niente #418 da wrapper diverso SSR vs client.
 */
export function SmoothScroll({ children, disabled = false }: Props) {
  const lenisRef = useRef<LenisRef>(null);
  const reduce = useReducedMotionSafe();
  const { allowMotion, ready } = useDeviceFx();
  const softOff = reduce || (ready && !allowMotion);

  useEffect(() => {
    if (disabled || softOff) return;
    function update({ timestamp }: { timestamp: number }) {
      lenisRef.current?.lenis?.raf(timestamp);
    }
    frame.setup(update, true);
    return () => cancelFrame(update);
  }, [disabled, softOff]);

  if (disabled) return <>{children}</>;

  return (
    <ReactLenis
      root
      options={{ autoRaf: false, lerp: 0.12, smoothWheel: !softOff }}
      ref={lenisRef}
    >
      {children}
    </ReactLenis>
  );
}
