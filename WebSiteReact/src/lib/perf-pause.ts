/**
 * Pausa FX pesanti (Halloween canvas, cursor trail/light) quando:
 * - chrome aperto (sheet / menu / dialog)
 * - focus su input/textarea (digitazione)
 */

const TYPING_ATTR = "data-vc-typing";
const PAUSE_ATTR = "data-vc-perf-pause";
const EVENT = "vc:perf-pause";

function chromeOpen(): boolean {
  try {
    return document.documentElement.hasAttribute("data-vc-chrome-open");
  } catch {
    return false;
  }
}

export function syncPerfPause() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const typing = root.hasAttribute(TYPING_ATTR);
  const pause = chromeOpen() || typing;
  const was = root.hasAttribute(PAUSE_ATTR);
  root.toggleAttribute(PAUSE_ATTR, pause);
  if (was === pause) return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { pause } }));
  } catch {
    /* ignore */
  }
}

export function setTypingActive(on: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (on) root.setAttribute(TYPING_ATTR, "1");
  else root.removeAttribute(TYPING_ATTR);
  syncPerfPause();
}

export function isPerfPaused(): boolean {
  try {
    return document.documentElement.hasAttribute(PAUSE_ATTR);
  } catch {
    return false;
  }
}

export function usePerfPauseListener(onChange: (pause: boolean) => void) {
  if (typeof window === "undefined") return () => {};
  const sync = () => onChange(isPerfPaused());
  sync();
  window.addEventListener(EVENT, sync);
  return () => window.removeEventListener(EVENT, sync);
}
