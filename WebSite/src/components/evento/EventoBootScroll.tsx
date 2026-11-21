"use client";

import { useEffect, useLayoutEffect } from "react";
import { useSitePathname } from "@/lib/locale-path";
import { forceScrollTop } from "@/lib/view-state";

/**
 * Pagine evento: sempre riparti dall'alto (niente restore ViewState dal fondo)
 * e ripeti dopo hydrate/gate/hero.
 */
export function EventoBootScroll() {
  const pathname = useSitePathname() || "/";

  useLayoutEffect(() => {
    try {
      window.__vcViewStateRestoring = false;
    } catch {
      /* ignore */
    }
    forceScrollTop();
  }, [pathname]);

  useEffect(() => {
    forceScrollTop();
    const a = requestAnimationFrame(() => forceScrollTop());
    const t1 = window.setTimeout(() => forceScrollTop(), 120);
    return () => {
      cancelAnimationFrame(a);
      window.clearTimeout(t1);
    };
  }, [pathname]);

  return null;
}
