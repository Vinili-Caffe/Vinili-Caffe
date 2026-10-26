"use client";

import { motion, useScroll, type MotionProps } from "motion/react";
import { cn } from "@/lib/cn";

type ScrollProgressProps = Omit<React.HTMLAttributes<HTMLDivElement>, keyof MotionProps> & {
  ref?: React.Ref<HTMLDivElement>;
};

/** Barra di progresso scroll in cima (sostituisce la scrollbar nascosta). */
export function ScrollProgress({ className, ref, ...props }: ScrollProgressProps) {
  const { scrollYProgress } = useScroll();
  return (
    <motion.div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2.5px] origin-left",
        "bg-gradient-to-r from-caramel via-ember to-sand",
        className,
      )}
      style={{ scaleX: scrollYProgress }}
      {...props}
    />
  );
}
