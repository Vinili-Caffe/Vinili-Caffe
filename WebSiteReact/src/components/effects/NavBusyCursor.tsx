"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Durante navigazioni interne → html.vc-interaction-hold (cursore loading custom).
 * Si spegne al cambio pathname.
 */
export function NavBusyCursor() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    document.documentElement.classList.remove("vc-interaction-hold");
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
      if (url.pathname === location.pathname && url.search === location.search) return;
      document.documentElement.classList.add("vc-interaction-hold");
      // safety: se la navigazione non parte, togli dopo 8s
      window.setTimeout(() => document.documentElement.classList.remove("vc-interaction-hold"), 8000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
