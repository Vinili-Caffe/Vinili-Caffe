"use client";

import { useEffect } from "react";
import { forceScrollTop, notifPathKey } from "@/lib/view-state";

const PENDING_CACHE = "vc-notif-pending-v1";
const PENDING_REQ = "/__vc_notif_pending";

/**
 * SW notificationclick → postMessage { type:"vc:notif-navigate", url }
 * + cache pending (se il messaggio arriva prima dell’hydrate).
 * Su iOS client.navigate() / start_url sono inaffidabili: location.assign + poll cache.
 */
export function NotifNavigate() {
  useEffect(() => {
    const go = (url: string) => {
      const raw = String(url || "").trim();
      if (!raw) return;
      try {
        const u = new URL(raw, location.origin);
        if (u.origin !== location.origin) {
          location.assign(u.href);
          return;
        }
        /* stesso pathKey dello SW (trailing slash) — evita skip/false mismatch */
        const next = notifPathKey(u.href);
        const here = notifPathKey(location.href);
        if (!next) return;
        if (next === here) {
          try {
            sessionStorage.setItem("vc-pwa-left-start", "1");
            sessionStorage.removeItem("vc-pwa-want-home");
            (window as unknown as { __vcNotifNavDone?: number }).__vcNotifNavDone = 1;
            (window as unknown as { __vcPwaResumeSkip?: number }).__vcPwaResumeSkip = 1;
          } catch {
            /* ignore */
          }
          forceScrollTop();
          if (u.hash) {
            const id = decodeURIComponent(u.hash.slice(1));
            if (id) {
              window.setTimeout(() => {
                document.getElementById(id)?.scrollIntoView({ block: "start" });
              }, 80);
            }
          }
          return;
        }
        try {
          sessionStorage.setItem("vc-pwa-left-start", "1");
          sessionStorage.removeItem("vc-pwa-want-home");
          sessionStorage.setItem("vc-notif-pending-nav", next);
          (window as unknown as { __vcNotifNavDone?: number }).__vcNotifNavDone = 1;
          (window as unknown as { __vcPwaResumeSkip?: number }).__vcPwaResumeSkip = 1;
        } catch {
          /* ignore */
        }
        forceScrollTop();
        location.assign(next);
      } catch {
        /* ignore */
      }
    };

    const drainCache = async () => {
      try {
        if (!("caches" in window)) return false;
        const cache = await caches.open(PENDING_CACHE);
        const res = await cache.match(PENDING_REQ);
        if (!res) return false;
        const data = (await res.json().catch(() => null)) as { url?: string; t?: number } | null;
        await cache.delete(PENDING_REQ);
        const url = String(data?.url || "").trim();
        const at = Number(data?.t || 0);
        if (!url || (at > 0 && Date.now() - at > 120_000)) return false;
        go(url);
        return true;
      } catch {
        return false;
      }
    };

    const drainSession = () => {
      try {
        const pending = sessionStorage.getItem("vc-notif-pending-nav");
        if (!pending) return;
        const here = notifPathKey(location.href);
        const want = notifPathKey(pending) || pending;
        if (want === here) {
          sessionStorage.removeItem("vc-notif-pending-nav");
          forceScrollTop();
          return;
        }
        sessionStorage.removeItem("vc-notif-pending-nav");
        go(pending);
      } catch {
        /* ignore */
      }
    };

    drainSession();
    void drainCache();
    /* iOS: click → start_url → hydrate tardi; ripeti drain un paio di volte. */
    const t1 = window.setTimeout(() => void drainCache(), 400);
    const t2 = window.setTimeout(() => void drainCache(), 1200);
    const t3 = window.setTimeout(() => void drainCache(), 2800);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
      };
    }

    const onMsg = (ev: MessageEvent) => {
      const d = ev?.data;
      if (!d || typeof d !== "object") return;
      if (String((d as { type?: string }).type || "") !== "vc:notif-navigate") return;
      go(String((d as { url?: string }).url || ""));
    };

    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMsg);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  return null;
}
