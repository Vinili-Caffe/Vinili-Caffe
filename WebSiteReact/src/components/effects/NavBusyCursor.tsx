"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { forceScrollTop } from "@/lib/view-state";

/**
 * Durante navigazioni interne:
 * - html.vc-interaction-hold (cursore loading)
 * - html.vc-route-hold (sipario anti flash footer/navbar-only)
 * Si spegne al cambio pathname + paint.
 */
export function NavBusyCursor() {
  const pathname = usePathname() || "/";

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("vc-interaction-hold");
    // tieni il sipario un frame dopo il nuovo path, poi sblocca
    const a = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        root.classList.remove("vc-route-hold");
        if (!window.__vcViewStateRestoring) forceScrollTop();
      });
    });
    return () => window.cancelAnimationFrame(a);
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
      // hash same-page: no hold
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      document.documentElement.classList.add("vc-interaction-hold");
      document.documentElement.classList.add("vc-route-hold");
      forceScrollTop();
      // safety: se la navigazione non parte, togli dopo 8s
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
