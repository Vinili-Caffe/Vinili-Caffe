"use client";

import { useEffect } from "react";

const PENDING_CACHE = "vc-notif-pending-v1";
const PENDING_REQ = "/__vc_notif_pending";

/**
 * SW notificationclick → postMessage { type:"vc:notif-navigate", url }
 * + cache pending (se il messaggio arriva prima dell’hydrate).
 * Su iOS client.navigate() è inaffidabile (finisce sulla home/start_url):
 * qui facciamo sempre location.assign sulla URL della notifica.
 */
export function NotifNavigate() {
  useEffect(() => {
    const go = (url: string) => {
      const raw = String(url || "").trim();
      if (!raw) return;
      try {
        const u = new URL(raw, location.origin);
        /* Solo stesso origin in-app; esterni (top.gg ecc.) in nuova navigazione. */
        if (u.origin !== location.origin) {
          location.assign(u.href);
          return;
        }
        const next = u.pathname + u.search + u.hash;
        const here = location.pathname + location.search + location.hash;
        if (next === here) return;
        try {
          sessionStorage.setItem("vc-pwa-left-start", "1");
          sessionStorage.removeItem("vc-pwa-want-home");
          sessionStorage.setItem("vc-notif-pending-nav", next);
        } catch {
          /* ignore */
        }
        location.assign(next);
      } catch {
        /* ignore */
      }
    };

    const drainCache = async () => {
      try {
        if (!("caches" in window)) return;
        const cache = await caches.open(PENDING_CACHE);
        const res = await cache.match(PENDING_REQ);
        if (!res) return;
        const data = (await res.json().catch(() => null)) as { url?: string; t?: number } | null;
        await cache.delete(PENDING_REQ);
        const url = String(data?.url || "").trim();
        const at = Number(data?.t || 0);
        if (!url || (at > 0 && Date.now() - at > 90_000)) return;
        go(url);
      } catch {
        /* ignore */
      }
    };

    const drainSession = () => {
      try {
        const pending = sessionStorage.getItem("vc-notif-pending-nav");
        if (!pending) return;
        sessionStorage.removeItem("vc-notif-pending-nav");
        const here = location.pathname + location.search + location.hash;
        if (pending !== here) go(pending);
      } catch {
        /* ignore */
      }
    };

    drainSession();
    void drainCache();

    if (!("serviceWorker" in navigator)) return;

    const onMsg = (ev: MessageEvent) => {
      const d = ev?.data;
      if (!d || typeof d !== "object") return;
      if (String((d as { type?: string }).type || "") !== "vc:notif-navigate") return;
      go(String((d as { url?: string }).url || ""));
    };

    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  return null;
}
