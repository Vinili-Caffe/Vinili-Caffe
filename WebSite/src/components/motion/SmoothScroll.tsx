"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ReactLenis, type LenisRef } from "lenis/react";
import { cancelFrame, frame, useReducedMotion } from "motion/react";
import "lenis/dist/lenis.css";
import { useDeviceFx } from "@/components/effects/DeviceFxProvider";

type Props = {
  children: ReactNode;
  /** Disattiva Lenis (dashboard, form, scroll nested). */
  disabled?: boolean;
};

/**
 * Smooth scroll Lenis pilotato dal frame loop di Motion.
 * Si spegne con reduced-motion / device low-end / `disabled`.
 */
export function SmoothScroll({ children, disabled = false }: Props) {
  const lenisRef = useRef<LenisRef>(null);
  const reduce = useReducedMotion();
  const { allowMotion, ready } = useDeviceFx();
  const off = disabled || reduce === true || (ready && !allowMotion);

  useEffect(() => {
    if (off) return;
    function update({ timestamp }: { timestamp: number }) {
      lenisRef.current?.lenis?.raf(timestamp);
    }
    frame.setup(update, true);
    return () => cancelFrame(update);
  }, [off]);

  if (off) return <>{children}</>;

  return (
    <ReactLenis root options={{ autoRaf: false, lerp: 0.12, smoothWheel: true }} ref={lenisRef}>
      {children}
    </ReactLenis>
  );
}
