"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useRichFx } from "@/components/effects/DeviceFxProvider";
import { cn } from "@/lib/cn";

/**
 * Star Border + Magnet (da React Bits): due bagliori che scorrono sul bordo del pulsante (sopra e sotto,
 * in versi opposti) e il pulsante che si lascia "attirare" un po' dal mouse quando ci passi vicino.
 * Avvolge il pulsante; con DeviceFx off/lite non aggiunge nulla.
 */
export function StarMagnet({
  children,
  color = "rgba(255,255,255,0.9)",
  speed = 5,
  pull = 0.25,
  className,
}: {
  children: React.ReactNode;
  color?: string;
  speed?: number;
  pull?: number;
  className?: string;
}) {
  const rich = useRichFx();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 200, damping: 16, mass: 0.4 });
  const y = useSpring(my, { stiffness: 200, damping: 16, mass: 0.4 });
  if (!rich) return <span className={cn("inline-flex", className)}>{children}</span>;
  return (
    <motion.span
      style={{ x, y }}
      className={cn("relative inline-flex overflow-hidden rounded-full p-[1.5px]", className)}
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - (r.left + r.width / 2)) * pull);
        my.set((e.clientY - (r.top + r.height / 2)) * pull);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -bottom-[11px] right-[-250%] h-1/2 w-[300%] rounded-full opacity-70"
        style={{ background: `radial-gradient(circle, ${color}, transparent 12%)` }}
        animate={{ x: ["0%", "-100%"], opacity: [1, 0] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear", repeatType: "loop" }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -top-[10px] left-[-250%] h-1/2 w-[300%] rounded-full opacity-70"
        style={{ background: `radial-gradient(circle, ${color}, transparent 12%)` }}
        animate={{ x: ["0%", "100%"], opacity: [1, 0] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear", repeatType: "loop" }}
      />
      <span className="relative z-[1] inline-flex">{children}</span>
    </motion.span>
  );
}
