"use client";

import { useEffect } from "react";
import { forceScrollTop, notifPathKey } from "@/lib/view-state";

const PENDING_CACHE = "vc-notif-pending-v1";
const PENDING_REQ = "/__vc_notif_pending";

/**
 * SW notificationclick → postMessage { type:"vc:notif-navigate", url }
 * + cache pending (se il messaggio arriva prima dell’hydrate).
 * Su iOS client.navigate() / openWindow con PWA già aperta sono inaffidabili:
 * stash + location.assign/replace + drain ripetuti (anche al resume).
 */
export function NotifNavigate() {
  useEffect(() => {
    const markNavFlags = (next: string) => {
      try {
        sessionStorage.setItem("vc-pwa-left-start", "1");
        sessionStorage.removeItem("vc-pwa-want-home");
        sessionStorage.setItem("vc-notif-pending-nav", next);
        (window as unknown as { __vcNotifNavDone?: number }).__vcNotifNavDone = 1;
        (window as unknown as { __vcPwaResumeSkip?: number }).__vcPwaResumeSkip = 1;
      } catch {
        /* ignore */
      }
    };

    const go = (url: string) => {
      const raw = String(url || "").trim();
      if (!raw) return;
      try {
        const u = new URL(raw, location.origin);
        if (u.origin !== location.origin) {
          location.assign(u.href);
          return;
        }
        const next = notifPathKey(u.href);
        const here = notifPathKey(location.href);
        if (!next) return;
        if (next === here) {
          markNavFlags(next);
          try {
            sessionStorage.removeItem("vc-notif-pending-nav");
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
        markNavFlags(next);
        forceScrollTop();
        /* iOS: replace più stabile di assign su tap ripetuti da Notification Center */
        try {
          location.replace(next);
        } catch {
          location.assign(next);
        }
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
        const url = String(data?.url || "").trim();
        const at = Number(data?.t || 0);
        if (!url || (at > 0 && Date.now() - at > 120_000)) {
          await cache.delete(PENDING_REQ).catch(() => null);
          return false;
        }
        const next = notifPathKey(url);
        const here = notifPathKey(location.href);
        /* Cancella solo dopo che siamo già a destinazione, altrimenti iOS perde il target. */
        if (next && next === here) {
          await cache.delete(PENDING_REQ).catch(() => null);
          try {
            sessionStorage.removeItem("vc-notif-pending-nav");
          } catch {
            /* ignore */
          }
          forceScrollTop();
          return true;
        }
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
        go(pending);
      } catch {
        /* ignore */
      }
    };

    const poke = () => {
      drainSession();
      void drainCache();
    };

    poke();
    /* iOS: click → start_url / wake tardivo; ripeti drain. */
    const timers = [200, 500, 1000, 1800, 3200, 5500].map((ms) => window.setTimeout(poke, ms));

    const onVis = () => {
      if (document.visibilityState === "visible") poke();
    };
    const onShow = () => poke();
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVis);

    if (!("serviceWorker" in navigator)) {
      return () => {
        for (const t of timers) window.clearTimeout(t);
        window.removeEventListener("pageshow", onShow);
        document.removeEventListener("visibilitychange", onVis);
      };
    }

    const onMsg = (ev: MessageEvent) => {
      const d = ev?.data;
      if (!d || typeof d !== "object") return;
      if (String((d as { type?: string }).type || "") !== "vc:notif-navigate") return;
      go(String((d as { url?: string }).url || ""));
      /* riesegui drain: stash può arrivare dopo il messaggio su iOS */
      window.setTimeout(poke, 50);
      window.setTimeout(poke, 400);
    };

    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMsg);
      for (const t of timers) window.clearTimeout(t);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
