"use client";

import { useEffect } from "react";
import { recoverPwaShellIfBroken } from "@/lib/stale-chunk-recovery";
import { isStandalonePwa } from "@/lib/view-state";

/**
 * iOS PWA: dopo molto tempo in background WebKit a volte ripristina la pagina
 * senza CSS (o da bfcache rotto). Hard reload; lo stash notifica resta in Cache API.
 */
export function PwaShellHealth() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let hiddenAt = 0;

    const check = (reason: "bfcache" | "css" | "resume") => {
      try {
        /* Solo shell installata / già usata come PWA — evita reload in Safari tab */
        const shell =
          isStandalonePwa() ||
          (() => {
            try {
              return localStorage.getItem("vc-pwa-shell") === "1";
            } catch {
              return false;
            }
          })();
        if (!shell) return;
      } catch {
        return;
      }
      recoverPwaShellIfBroken(reason);
    };

    const onShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) {
        check("bfcache");
        return;
      }
      /* piccolo delay: i fogli stile possono riattaccarsi al resume */
      window.setTimeout(() => check("resume"), 400);
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt > 0 ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      /* dopo ≥25s in background iOS è il caso tipico “sminchiata” */
      if (away >= 25_000) {
        window.setTimeout(() => check("css"), 350);
      }
    };

    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
