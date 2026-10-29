"use client";

import { useEffect } from "react";
import { setTypingActive } from "@/lib/perf-pause";

function isTypingField(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (
      type === "button" ||
      type === "submit" ||
      type === "reset" ||
      type === "checkbox" ||
      type === "radio" ||
      type === "file" ||
      type === "range" ||
      type === "color" ||
      type === "hidden"
    ) {
      return false;
    }
    return true;
  }
  if (el.isContentEditable) return true;
  return Boolean(el.closest('[contenteditable=""], [contenteditable="true"]'));
}

/** Segnala digitazione → pausa Halloween/cursor FX (meno lag sulla tastiera). */
export function TypingPause() {
  useEffect(() => {
    const sync = () => setTypingActive(isTypingField(document.activeElement));
    const onIn = (e: FocusEvent) => {
      if (isTypingField(e.target)) setTypingActive(true);
    };
    const onOut = () => {
      // dopo blur: controlla se il focus è ancora su un campo
      requestAnimationFrame(sync);
    };
    document.addEventListener("focusin", onIn, true);
    document.addEventListener("focusout", onOut, true);
    sync();
    return () => {
      document.removeEventListener("focusin", onIn, true);
      document.removeEventListener("focusout", onOut, true);
      setTypingActive(false);
    };
  }, []);

  return null;
}
