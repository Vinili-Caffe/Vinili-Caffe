"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { useRichFx } from "@/components/effects/DeviceFxProvider";
import { cn } from "@/lib/cn";

/**
 * Circular Text (da React Bits): una scritta che gira in tondo, come l'etichetta di un vinile.
 * SVG con textPath ruotato via transform (GPU); su dispositivi deboli o senza movimento (DeviceFx off/lite) resta ferma.
 */
export function CircularText({
  text,
  duration = 22,
  className,
  children,
}: {
  text: string;
  duration?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const rich = useRichFx();
  return (
    <div className={cn("relative grid place-items-center", className)}>
      <motion.svg
        viewBox="0 0 200 200"
        aria-hidden
        className="absolute inset-0 size-full"
        animate={rich ? { rotate: 360 } : undefined}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      >
        <defs>
          <path id={`ct-${id}`} d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <text className="fill-current text-[15px] font-semibold tracking-[0.18em]">
          <textPath href={`#ct-${id}`} textLength={490} lengthAdjust="spacingAndGlyphs">
            {text}
          </textPath>
        </text>
      </motion.svg>
      <div className="relative">{children}</div>
    </div>
  );
}
