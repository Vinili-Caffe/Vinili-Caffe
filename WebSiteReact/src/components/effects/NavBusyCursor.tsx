"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { forceScrollTop } from "@/lib/view-state";

function mainContentReady(): boolean {
  const main = document.querySelector("main");
  if (!main) return false;
  if (main.querySelector('[aria-busy="true"]')) return false;
  // gate evento / skeleton: aspetta contenuto reale
  if (document.documentElement.classList.contains("vc-evento-hold")) return false;
  return (main as HTMLElement).offsetHeight > 200;
}

function releaseRouteHold() {
  const root = document.documentElement;
  root.classList.remove("vc-interaction-hold");
  root.classList.remove("vc-route-hold");
  if (!window.__vcViewStateRestoring) forceScrollTop();
}

/**
 * Durante navigazioni interne:
 * - html.vc-interaction-hold (cursore loading)
 * - html.vc-route-hold (sipario anti flash footer/navbar-only)
 * Si spegne quando il main ha contenuto reale (non solo gate/skeleton).
 */
export function NavBusyCursor() {
  const pathname = usePathname() || "/";
  const releaseTimer = useRef(0);

  useLayoutEffect(() => {
    forceScrollTop();
    window.clearTimeout(releaseTimer.current);

    let tries = 0;
    const poll = () => {
      tries += 1;
      forceScrollTop();
      if (mainContentReady() || tries > 40) {
        releaseRouteHold();
        return;
      }
      releaseTimer.current = window.setTimeout(poll, 50);
    };
    // un frame dopo il nuovo path, poi poll finché il gate non ha finito
    const a = window.requestAnimationFrame(() => {
      releaseTimer.current = window.setTimeout(poll, 30);
    });
    return () => {
      window.cancelAnimationFrame(a);
      window.clearTimeout(releaseTimer.current);
    };
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (a.target && a.target !== "_self") return;
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search && !url.hash) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      document.documentElement.classList.add("vc-interaction-hold");
      document.documentElement.classList.add("vc-route-hold");
      forceScrollTop();
      window.setTimeout(() => {
        document.documentElement.classList.remove("vc-interaction-hold");
        document.documentElement.classList.remove("vc-route-hold");
      }, 8000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
