"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

/**
 * Tooltip del sito al posto di quello del sistema: ogni elemento con `title`
 * (in tutto il sito, senza toccare i componenti) mostra questa nuvoletta.
 * Il `title` si sposta in `data-vc-tip` così il browser non mostra il suo.
 */
const DELAY_MS = 380;
const SKIP = new Set(["IFRAME", "HTML", "BODY", "svg", "title"]);

type Tip = { text: string; x: number; y: number; below: boolean };

function findTipTarget(start: EventTarget | null): HTMLElement | null {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement && !SKIP.has(el.tagName)) {
      if (el.hasAttribute("title") && el.getAttribute("title")?.trim()) {
        const text = el.getAttribute("title")!.trim();
        el.setAttribute("data-vc-tip", text);
        el.removeAttribute("title");
        /* il title faceva anche da nome accessibile: se non c'è altro, lo teniamo */
        if (!el.getAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", text);
        return el;
      }
      if (el.getAttribute("data-vc-tip")) return el;
    }
    el = el.parentElement;
  }
  return null;
}

const noopSubscribe = () => () => {};

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const timer = useRef<number | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(hover: none)").matches) return;

    const clear = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setTip(null);
    };

    const show = (el: HTMLElement) => {
      const text = el.getAttribute("data-vc-tip") || "";
      if (!text || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 56;
      setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 12), window.innerWidth - 12), y: below ? r.bottom + 8 : r.top - 8, below });
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = findTipTarget(e.target);
      if (el === current.current) return;
      clear();
      if (!el) return;
      current.current = el;
      timer.current = window.setTimeout(() => show(el), DELAY_MS);
    };

    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null;
      if (current.current && to && current.current.contains(to)) return;
      if (current.current && e.target instanceof Node && current.current.contains(e.target)) clear();
    };

    const onFocus = (e: FocusEvent) => {
      const el = e.target instanceof HTMLElement && e.target.matches(":focus-visible") ? findTipTarget(e.target) : null;
      if (el && el === e.target) {
        clear();
        current.current = el;
        show(el);
      }
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", clear);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", clear);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {tip ? (
        <motion.div
          key={`${tip.text}-${tip.x}-${tip.y}`}
          role="tooltip"
          data-vc-ui="tooltip"
          initial={{ opacity: 0, y: tip.below ? -3 : 3, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="pointer-events-none fixed z-[130] max-w-[16rem] rounded-lg bg-mocha px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-crema shadow-[0_12px_30px_-12px_rgba(0,0,0,0.85)] ring-1 ring-sand/20"
          style={{ left: tip.x, top: tip.y, translate: tip.below ? "-50% 0" : "-50% -100%" }}
        >
          {tip.text}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
