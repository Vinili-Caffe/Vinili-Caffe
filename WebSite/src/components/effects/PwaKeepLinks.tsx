"use client";

import { useEffect } from "react";
import { isStandalonePwa, resumePathFromLocation, writePwaResume } from "@/lib/view-state";

/**
 * In PWA:
 * 1) link same-origin assoluti → navigazione interna (niente uscita dallo standalone)
 * 2) link esterni (Top.gg, Discadia, …) → salva la pagina corrente in resume PRIMA di uscire,
 *    così al rientro non finisci sulla home (start_url).
 */
export function PwaKeepLinks() {
  useEffect(() => {
    if (!isStandalonePwa()) return;

    const markReturnHere = () => {
      try {
        sessionStorage.setItem("vc-pwa-left-start", "1");
        sessionStorage.removeItem("vc-pwa-want-home");
      } catch {
        /* ignore */
      }
      writePwaResume(
        resumePathFromLocation(location.pathname, location.search, location.hash),
      );
    };

    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const t = ev.target as Element | null;
      const a = t?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.hasAttribute("download")) return;
      const href = String(a.getAttribute("href") || "").trim();
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let u: URL;
      try {
        u = new URL(href, location.origin);
      } catch {
        return;
      }

      // esterno: salva dove tornare (iOS apre Safari e al rientro riparte da start_url)
      if (u.origin !== location.origin) {
        markReturnHere();
        return;
      }

      // same-origin con target=_blank → tratta come uscita: salva resume
      if (a.target && a.target !== "" && a.target !== "_self") {
        markReturnHere();
        return;
      }

      // già relativo gestito da Next — solo assoluti same-origin → tieni in PWA
      if (!/^https?:\/\//i.test(href)) return;
      ev.preventDefault();
      markReturnHere();
      const next = u.pathname + u.search + u.hash;
      if (next !== location.pathname + location.search + location.hash) {
        location.assign(next);
      }
    };

    // pagehide/freeze: ultimo salvataggio se l’OS sospende la PWA
    const onLeave = () => markReturnHere();
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("freeze", onLeave as EventListener);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("freeze", onLeave as EventListener);
    };
  }, []);

  return null;
}
