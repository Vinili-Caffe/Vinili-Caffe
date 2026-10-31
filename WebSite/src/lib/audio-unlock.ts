/**
 * Sblocco audio senza bloccare il primo tocco: `new AudioContext()` può costare 0,4–0,9 s
 * (INP scarso su tutte le pagine). Su PC e Android il browser ricorda il gesto, quindi si crea
 * dopo che la risposta al tocco è disegnata; su iPhone/iPad l'audio parte solo dentro il gesto.
 */

function isAppleTouch(): boolean {
  try {
    const ua = navigator.userAgent || "";
    return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  } catch {
    return false;
  }
}

export function runAfterGesturePaint(fn: () => void) {
  if (typeof window === "undefined") return;
  if (isAppleTouch() || typeof requestAnimationFrame !== "function") {
    fn();
    return;
  }
  requestAnimationFrame(() => setTimeout(fn, 0));
}
