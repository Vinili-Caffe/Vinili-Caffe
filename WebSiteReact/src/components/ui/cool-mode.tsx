"use client";

import { useEffect, useRef } from "react";
import { useRichFx } from "@/components/effects/DeviceFxProvider";

const BITS = ["☕", "💿", "❤️", "✨", "🎶", "🧡"];

/**
 * Cool Mode (da Magic UI): a ogni click dal punto toccato schizzano cuori, dischi e tazzine.
 * Particelle DOM animate con la Web Animations API (solo transform + opacità) e rimosse alla fine.
 * Avvolge un solo figlio; con DeviceFx off/lite non fa nulla.
 */
export function CoolMode({ children, count = 14 }: { children: React.ReactNode; count?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const rich = useRichFx();

  useEffect(() => {
    const host = ref.current;
    if (!host || !rich) return;
    const burst = (e: PointerEvent) => {
      for (let i = 0; i < count; i++) {
        const el = document.createElement("span");
        el.textContent = BITS[Math.floor(Math.random() * BITS.length)];
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;pointer-events:none;z-index:2147483000;font-size:${14 + Math.random() * 12}px;will-change:transform,opacity;`;
        document.body.appendChild(el);
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
        const dist = 70 + Math.random() * 110;
        const dx = Math.cos(ang) * dist;
        const dy = Math.sin(ang) * dist;
        const rot = (Math.random() - 0.5) * 120;
        const anim = el.animate(
          [
            { transform: "translate(-50%,-50%) scale(0.4)", opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.6 },
            { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 90}px)) rotate(${rot * 1.4}deg) scale(0.9)`, opacity: 0 },
          ],
          { duration: 900 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" },
        );
        anim.onfinish = () => el.remove();
      }
    };
    host.addEventListener("pointerdown", burst);
    return () => host.removeEventListener("pointerdown", burst);
  }, [rich, count]);

  return (
    <span ref={ref} className="contents">
      {children}
    </span>
  );
}
