"use client";

import { useEffect } from "react";
import { EFFECT_KEYS, effectEnabled } from "@/lib/site-effects";
import { disposeTypeSfx, playTypeSfx, unlockTypeSfx } from "@/lib/type-sfx";

function isTypingTarget(el: EventTarget | null): boolean {
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

function isPrintableKey(ev: KeyboardEvent): boolean {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
  const key = String(ev.key || "");
  if (key === "Unidentified") return false;
  if (key.length === 1) return true;
  return key === "Enter" || key === "Backspace" || key === "Delete" || key === " " || key === "Space";
}

/**
 * Soft click su input/textarea. Mute: `localStorage.vc_type_sfx = "0"`.
 * Volume: `vc_type_sfx_vol` (0–1 o 0–100).
 * Wordle chiama `playTypeSfx` direttamente (niente focus su input).
 */
export function TypeSfx() {
  useEffect(() => {
    if (!effectEnabled(EFFECT_KEYS.typeSfx, true)) return;

    const onKey = (ev: KeyboardEvent) => {
      if (!isPrintableKey(ev) || !isTypingTarget(ev.target)) return;
      unlockTypeSfx();
      playTypeSfx();
    };

    const onInput = (ev: Event) => {
      try {
        if (!window.matchMedia("(pointer: coarse)").matches) return;
      } catch {
        return;
      }
      if (!isTypingTarget(ev.target)) return;
      unlockTypeSfx();
      playTypeSfx();
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("pointerdown", unlockTypeSfx, { once: true, capture: true });

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("input", onInput, true);
      disposeTypeSfx();
    };
  }, []);

  return null;
}
