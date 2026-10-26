"use client";

import { useEffect } from "react";

/**
 * SW notificationclick → postMessage { type:"vc:notif-navigate", url }.
 * Su iOS client.navigate() è inaffidabile (finisce sulla home/start_url):
 * qui facciamo location.assign sulla URL della notifica.
 */
export function NotifNavigate() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const go = (url: string) => {
      const raw = String(url || "").trim();
      if (!raw) return;
      try {
        const u = new URL(raw, location.origin);
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
        } catch {
          /* ignore */
        }
        location.assign(next);
      } catch {
        /* ignore */
      }
    };

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
