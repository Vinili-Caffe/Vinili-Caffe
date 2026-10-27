"use client";

import { useLayoutEffect } from "react";

/** Rimuove il sipario espresso dopo il primo paint utile (scroll già in cima). */
export function BootGate() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    // SiteShell rimonta a ogni pagina: non riaprire il sipario se già sbloccato
    if (root.classList.contains("vc-boot-ready") && !document.getElementById("vc-boot-curtain")) {
      return;
    }

    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      try {
        window.scrollTo(0, 0);
      } catch {
        /* ignore */
      }
      try {
        window.__vcBootUnlock?.();
      } catch {
        root.classList.remove("vc-boot-hold");
        root.classList.add("vc-boot-ready");
      }
      const c = document.getElementById("vc-boot-curtain");
      if (c?.parentNode) c.parentNode.removeChild(c);
    };

    // Ripristina hold se React ha riscritto className su <html> prima dell’unlock
    try {
      if (!root.classList.contains("vc-boot-ready")) {
        root.classList.add("vc-boot-hold");
      }
      if (!document.getElementById("vc-boot-curtain") && root.classList.contains("vc-boot-hold")) {
        const c = document.createElement("div");
        c.id = "vc-boot-curtain";
        c.setAttribute("aria-hidden", "true");
        c.style.cssText =
          "position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:#0e0906;";
        try {
          const light =
            root.getAttribute("data-vc-theme") === "light" || root.getAttribute("data-theme") === "light";
          if (light) c.style.background = "#efe6dc";
        } catch {
          /* ignore */
        }
        root.appendChild(c);
      }
    } catch {
      /* ignore */
    }

    // Aspetta layout reale (main non vuoto) + 2 frame, così non alziamo il sipario sul solo chrome
    let frames = 0;
    let tries = 0;
    const tick = () => {
      if (done) return;
      frames += 1;
      tries += 1;
      try {
        window.scrollTo(0, 0);
      } catch {
        /* ignore */
      }
      const main = document.querySelector("main");
      const mainH = main ? (main as HTMLElement).offsetHeight : 0;
      const readyLayout = mainH > 120 || tries > 36;
      if (frames >= 2 && readyLayout) {
        window.setTimeout(unlock, 40);
        return;
      }
      window.requestAnimationFrame(tick);
    };
    const id = window.requestAnimationFrame(tick);
    const failsafe = window.setTimeout(unlock, 2000);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(failsafe);
    };
  }, []);

  return null;
}
