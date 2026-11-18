"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { motionTokens, springs } from "@/lib/motion-tokens";

/** Entra dal basso in viewport. Con riduci-movimento: subito visibile (niente opacity 0 bloccata). */
export function Reveal({
  delay = 0,
  y = motionTokens.distance.xl,
  children,
  className,
  viewportAmount = 0.15,
}: {
  delay?: number;
  y?: number;
  children?: ReactNode;
  className?: string;
  /** Quanta parte dell’elemento deve entrare in vista (default più permissivo del 10% negativo). */
  viewportAmount?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={cn(className)}>{children}</div>;
  }
  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: viewportAmount, margin: "0px" }}
      transition={{ ...springs.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}
