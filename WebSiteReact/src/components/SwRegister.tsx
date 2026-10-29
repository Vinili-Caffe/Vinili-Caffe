"use client";

import { useEffect } from "react";
import { SW_URL } from "@/lib/push";

/** Registra /sw.js per tutti: push + dismiss + badge + pagina offline (le pagine vere non vanno in cache). */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // stesso indirizzo delle notifiche push (lib/push.ts): mai due versioni del SW in lotta
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((reg) => {
        try {
          void reg.update();
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
