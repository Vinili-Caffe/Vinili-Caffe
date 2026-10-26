/** Menù chrome aperti → PiP / overlay possono nascostersi. */

import { syncPerfPause } from "@/lib/perf-pause";

const ATTR = "data-vc-chrome-open";
const EVENT = "vc:chrome-open";

let openCount = 0;

export function setChromeOpen(id: string, open: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (open) {
    if (!root.hasAttribute(`${ATTR}-${id}`)) {
      root.setAttribute(`${ATTR}-${id}`, "1");
      openCount += 1;
    }
  } else if (root.hasAttribute(`${ATTR}-${id}`)) {
    root.removeAttribute(`${ATTR}-${id}`);
    openCount = Math.max(0, openCount - 1);
  }
  root.toggleAttribute(ATTR, openCount > 0);
  syncPerfPause();
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { open: openCount > 0, id } }));
  } catch {
    /* ignore */
  }
}

export function useChromeOpenListener(onChange: (open: boolean) => void) {
  if (typeof window === "undefined") return () => {};
  const sync = () => onChange(document.documentElement.hasAttribute(ATTR));
  sync();
  window.addEventListener(EVENT, sync);
  return () => window.removeEventListener(EVENT, sync);
}
