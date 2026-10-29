"use client";

import confetti from "canvas-confetti";

/** Colori del sito + il verde delle lettere giuste del Wordle. */
const COLORS = ["#d99a5b", "#f0b46e", "#f4e9d8", "#6dcf8a", "#c4a07a", "#ffd84a"];

/**
 * Coriandoli di festa (da Magic UI "Confetti", variante "Side Cannons"): due cannoni dai lati dello schermo.
 * `rich` = cap confettiRich (metriche + FPS) → raffiche ~2 s; altrimenti una sola raffica leggera.
 */
export function celebrate(rich = true) {
  if (typeof window === "undefined") return;
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 2147483000 } as const;
  if (!rich) {
    void confetti({ ...base, particleCount: 60, spread: 70, origin: { y: 0.7 } });
    return;
  }
  const end = Date.now() + 1800;
  const frame = () => {
    if (Date.now() > end) return;
    void confetti({ ...base, particleCount: 3, angle: 60, spread: 55, startVelocity: 60, origin: { x: 0, y: 0.6 } });
    void confetti({ ...base, particleCount: 3, angle: 120, spread: 55, startVelocity: 60, origin: { x: 1, y: 0.6 } });
    requestAnimationFrame(frame);
  };
  frame();
  // botto finale al centro
  window.setTimeout(() => {
    void confetti({ ...base, particleCount: 120, spread: 100, startVelocity: 45, origin: { y: 0.65 }, scalar: 1.1 });
  }, 400);
}
