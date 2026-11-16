"use client";

/**
 * React Bits — GradientText (adattato): gradiente caldo animato (sand → caramel → ember).
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

const DEFAULT = ["#c4a07a", "#d99a5b", "#f0b46e", "#f4e9d8"];

export function GradientText({
  children,
  className,
  colors = DEFAULT,
  speed = 6,
}: {
  children: ReactNode;
  className?: string;
  colors?: string[];
  speed?: number;
}) {
  const loop = [...colors, colors[0]];
  const style = {
    "--gt-speed": `${speed}s`,
    backgroundImage: `linear-gradient(110deg, ${loop.join(", ")})`,
    backgroundSize: "220% 100%",
  } as CSSProperties;

  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]",
        "animate-vc-shiny",
        "motion-reduce:animate-none motion-reduce:text-sand motion-reduce:[-webkit-text-fill-color:unset]",
        className,
      )}
      style={{ ...style, animationDuration: `${speed}s` }}
    >
      {children}
    </span>
  );
}
