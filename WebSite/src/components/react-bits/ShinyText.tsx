"use client";

/**
 * React Bits — ShinyText (adattato): riflesso caldo che scorre sul testo.
 * Palette default Vinili (sand → crema).
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function ShinyText({
  children,
  className,
  speed = 3.2,
  color = "var(--color-sand)",
  shine = "var(--color-crema)",
}: {
  children: ReactNode;
  className?: string;
  /** secondi per un passaggio completo */
  speed?: number;
  color?: string;
  shine?: string;
}) {
  const style = {
    "--shiny-speed": `${speed}s`,
    backgroundImage: `linear-gradient(110deg, ${color} 0%, ${color} 38%, ${shine} 50%, ${color} 62%, ${color} 100%)`,
    backgroundSize: "220% 100%",
  } as CSSProperties;

  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]",
        "animate-vc-shiny",
        "motion-reduce:animate-none motion-reduce:[background-image:none] motion-reduce:text-sand motion-reduce:[-webkit-text-fill-color:unset]",
        className,
      )}
      style={{ ...style, animationDuration: `${speed}s` }}
    >
      {children}
    </span>
  );
}
