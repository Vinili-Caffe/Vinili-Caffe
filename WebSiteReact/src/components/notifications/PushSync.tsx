"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { pushSupported, syncPushSubscription } from "@/lib/push";
import { subscribeSiteRealtime } from "@/lib/site-realtime";

/**
 * pushPcBannerFix1: se il permesso c’è, ri-posta sempre la subscription al server
 * (endpoint FCM zombie = sent:1 senza banner). Ascolta anche `vc:push-resubscribe`.
 */
export function PushSync() {
  const { ready, token } = useAuth();
  const lastSync = useRef(0);

  useEffect(() => {
    if (!ready || !token || !pushSupported()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const run = (forceRefresh = false) => {
      const now = Date.now();
      if (!forceRefresh && now - lastSync.current < 15_000) return;
      lastSync.current = now;
      void syncPushSubscription(token, { forceRefresh });
    };

    const t = window.setTimeout(() => run(false), 900);
    const onVis = () => {
      if (document.visibilityState === "visible") run(false);
    };
    document.addEventListener("visibilitychange", onVis);

    const offWs = subscribeSiteRealtime((ping) => {
      /* forceRefresh solo su nudge esplicito — evita churn endpoint a PWA chiusa */
      if (String(ping?.type || "") === "vc:push-resubscribe") run(true);
    });

    const onSwMsg = (ev: MessageEvent) => {
      const t = ev?.data && typeof ev.data === "object" ? String((ev.data as { type?: string }).type || "") : "";
      if (t === "vc:push-resubscribe") run(true);
    };
    navigator.serviceWorker?.addEventListener?.("message", onSwMsg);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      offWs();
      navigator.serviceWorker?.removeEventListener?.("message", onSwMsg);
    };
  }, [ready, token]);

  return null;
}
