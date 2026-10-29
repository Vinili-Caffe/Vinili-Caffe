"use client";

import { useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { useFxCap } from "@/components/effects/DeviceFxProvider";

/**
 * Tilted Card (da React Bits): l'oggetto si inclina verso il puntatore con una molla, più un riflesso
 * di luce che lo segue. Solo transform + opacità, niente re-render; senza cap pointerFx resta fermo.
 *
 *   const tilt = useTilt();
 *   <div {...tilt.handlers} style={{ perspective: 900 }}>
 *     <motion.div style={tilt.style}> … <motion.span style={{ background: tilt.glare }} /> </motion.div>
 *   </div>
 */
export function useTilt(maxDeg = 12) {
  const rich = useFxCap("pointerFx");
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glow = useMotionValue(0);
  const spring = { stiffness: 220, damping: 20, mass: 0.6 };
  const rotateX = useSpring(rx, spring);
  const rotateY = useSpring(ry, spring);
  const scale = useSpring(1, spring);
  const glareOpacity = useSpring(glow, spring);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,240,220,0.28), transparent 55%)`;

  const handlers = {
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!rich || e.pointerType === "touch") return;
      const r = e.currentTarget.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      ry.set((px - 0.5) * 2 * maxDeg);
      rx.set(-(py - 0.5) * 2 * maxDeg);
      gx.set(px * 100);
      gy.set(py * 100);
      glow.set(1);
      scale.set(1.04);
    },
    onPointerLeave: () => {
      rx.set(0);
      ry.set(0);
      glow.set(0);
      scale.set(1);
    },
  };

  return { handlers, style: { rotateX, rotateY, scale, transformStyle: "preserve-3d" as const }, glare, glareOpacity };
}
