"use client";

import { useEffect } from "react";

/** Rimuove il sipario espresso dopo il primo paint utile. */
export function BootGate() {
  useEffect(() => {
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      try {
        window.__vcBootUnlock?.();
      } catch {
        document.documentElement.classList.remove("vc-boot-hold");
        document.documentElement.classList.add("vc-boot-ready");
      }
      const c = document.getElementById("vc-boot-curtain");
      if (c?.parentNode) c.parentNode.removeChild(c);
    };

    // Ripristina hold se React ha riscritto className su <html> prima dell’unlock
    try {
      if (document.getElementById("vc-boot-curtain")) {
        document.documentElement.classList.add("vc-boot-hold");
      }
    } catch {
      /* ignore */
    }

    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(unlock, 60);
      });
    });
    const failsafe = window.setTimeout(unlock, 1400);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(failsafe);
    };
  }, []);

  return null;
}
