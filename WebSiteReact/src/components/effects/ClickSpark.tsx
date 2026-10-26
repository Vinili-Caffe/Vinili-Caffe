"use client";

import { useEffect } from "react";
import { useFxCap } from "./DeviceFxProvider";
import { isDesktopPointer } from "@/lib/site-effects";

const SVGNS = "http://www.w3.org/2000/svg";

/**
 * Click Spark (da React Bits): a ogni click del mouse, otto scintille color caramello partono dal punto.
 * Un piccolo SVG per click, animato con la Web Animations API e poi rimosso: niente canvas sempre acceso.
 * Solo mouse + cap pointerFx.
 */
export function ClickSpark() {
  const rich = useFxCap("pointerFx");

  useEffect(() => {
    if (!rich || !isDesktopPointer()) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const size = 60;
      const svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText = `position:fixed;left:${e.clientX - size / 2}px;top:${e.clientY - size / 2}px;pointer-events:none;z-index:2147483001;overflow:visible`;
      const c = size / 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const line = document.createElementNS(SVGNS, "line");
        line.setAttribute("x1", String(c + Math.cos(a) * 6));
        line.setAttribute("y1", String(c + Math.sin(a) * 6));
        line.setAttribute("x2", String(c + Math.cos(a) * 14));
        line.setAttribute("y2", String(c + Math.sin(a) * 14));
        line.setAttribute("stroke", i % 2 ? "#f0b46e" : "#d99a5b");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("stroke-linecap", "round");
        svg.appendChild(line);
        line.animate(
          [
            { transform: "translate(0,0)", opacity: 1 },
            { transform: `translate(${Math.cos(a) * 12}px,${Math.sin(a) * 12}px)`, opacity: 0 },
          ],
          { duration: 420, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" },
        );
      }
      document.body.appendChild(svg);
      window.setTimeout(() => svg.remove(), 460);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, [rich]);

  return null;
}
