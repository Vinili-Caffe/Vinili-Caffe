"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  hasAnalyticsConsent,
  loadAdSenseIfConsented,
  loadClarityIfConsented,
  loadMetaPixelIfConsented,
  trackMetaPageView,
} from "@/lib/cookie-consent";

/**
 * Clarity + Meta Pixel + AdSense su tutte le pagine (insieme a GA / GTM / Vercel).
 * Si attivano solo con consenso cookie; PageView Meta anche sulle navigazioni client.
 */
export function SiteTrackers() {
  const pathname = usePathname();
  const tracked = useRef<string | null>(null);

  useEffect(() => {
    if (!hasAnalyticsConsent()) {
      tracked.current = null;
      return;
    }
    loadClarityIfConsented();
    loadMetaPixelIfConsented();
    loadAdSenseIfConsented();
    if (tracked.current === null) {
      tracked.current = pathname;
      return;
    }
    if (tracked.current === pathname) return;
    tracked.current = pathname;
    trackMetaPageView();
  }, [pathname]);

  return null;
}
