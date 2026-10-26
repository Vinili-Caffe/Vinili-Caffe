"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { forceScrollTop, isPwaUiRestorePending } from "@/lib/view-state";

/** Dopo ogni navigazione riporta la vista in alto (export statico non ha ScrollRestoration). */
export function ScrollToTop() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // hash interni (es. /ruoli/#id) lasciano il browser gestire lo scroll
    if (window.location.hash) return;
    // ViewState sta ripristinando Y (F5 / back-forward / PTR / reopen PWA)
    if (window.__vcViewStateRestoring || isPwaUiRestorePending()) return;
    forceScrollTop();
    const a = window.requestAnimationFrame(() => {
      if (window.__vcViewStateRestoring || isPwaUiRestorePending()) return;
      forceScrollTop();
    });
    const t1 = window.setTimeout(() => {
      if (window.__vcViewStateRestoring || isPwaUiRestorePending()) return;
      forceScrollTop();
    }, 40);
    const t2 = window.setTimeout(() => {
      if (window.__vcViewStateRestoring || isPwaUiRestorePending()) return;
      forceScrollTop();
    }, 180);
    return () => {
      window.cancelAnimationFrame(a);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pathname, search]);

  return null;
}
