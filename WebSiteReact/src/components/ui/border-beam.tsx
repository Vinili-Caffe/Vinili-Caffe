"use client";

import { motion } from "motion/react";
import { useRichFx } from "@/components/effects/DeviceFxProvider";

/**
 * Border Beam (da Magic UI): una scia di luce che corre lungo il bordo della card.
 * Il genitore deve essere `relative` con angoli arrotondati; la scia è mascherata sul solo bordo.
 * Con DeviceFx off/lite non viene disegnata.
 */
export function BorderBeam({
  size = 90,
  duration = 7,
  from = "#ff73fa",
  to = "#f0b46e",
  borderWidth = 1.5,
  delay = 0,
}: {
  size?: number;
  duration?: number;
  from?: string;
  to?: string;
  borderWidth?: number;
  delay?: number;
}) {
  const rich = useRichFx();
  if (!rich) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
      style={{ borderWidth, borderStyle: "solid" }}
    >
      <motion.div
        className="absolute aspect-square"
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: `linear-gradient(to left, ${from}, ${to}, transparent)`,
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{ repeat: Infinity, ease: "linear", duration, delay: -delay }}
      />
    </div>
  );
}
