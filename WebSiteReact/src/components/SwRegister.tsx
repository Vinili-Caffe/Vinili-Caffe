"use client";

import { useEffect } from "react";

/** Registra /sw.js per tutti: push + dismiss + badge + pagina offline (le pagine vere non vanno in cache). */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // query bust: forza update SW dopo fix dismiss/badge
    navigator.serviceWorker
      .register("/sw.js?v=20261028pushClickNavIos2")
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
