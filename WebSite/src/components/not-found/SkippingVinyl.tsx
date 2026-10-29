"use client";

import { motion, useReducedMotion } from "motion/react";
import { VinylRecord } from "@/components/VinylRecord";
import { cn } from "@/lib/cn";

/** Disco che “salta”: gira, poi scatta indietro di un pezzo (solo transform). */
export function SkippingVinyl({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("relative mx-auto size-40 sm:size-48", className)} aria-hidden>
      {/* alone del piatto */}
      <span className="absolute inset-[-8%] rounded-full bg-gradient-to-b from-mocha/80 to-espresso ring-1 ring-sand/20 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]" />
      <span className="absolute inset-[18%] rounded-full bg-espresso/90 ring-1 ring-sand/10" />
      {/* perno */}
      <span className="absolute left-1/2 top-1/2 z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-caramel shadow-[0_0_0_3px_rgba(212,145,80,0.25)]" />

      <motion.div
        className="absolute inset-[6%]"
        animate={
          reduce
            ? { rotate: 12 }
            : {
                rotate: [0, 42, 38, 95, 88, 160, 152, 220, 214, 280, 272, 360],
              }
        }
        transition={
          reduce
            ? undefined
            : {
                duration: 6.5,
                repeat: Infinity,
                ease: "linear",
                times: [0, 0.12, 0.14, 0.28, 0.3, 0.45, 0.47, 0.62, 0.64, 0.8, 0.82, 1],
              }
        }
      >
        <VinylRecord className="size-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)]" />
      </motion.div>

      {/* braccio / puntina stilizzata */}
      <motion.span
        className="absolute -right-1 top-[8%] h-[42%] w-1 origin-top rounded-full bg-gradient-to-b from-sand to-caramel/80 shadow-[2px_4px_12px_rgba(0,0,0,0.45)]"
        style={{ rotate: 18 }}
        animate={reduce ? undefined : { rotate: [18, 22, 17, 21, 18] }}
        transition={reduce ? undefined : { duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
