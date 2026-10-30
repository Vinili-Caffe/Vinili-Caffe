"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { pushSupported, syncPushSubscription } from "@/lib/push";

/**
 * Tiene viva l'iscrizione push di questo dispositivo: all'apertura del sito e quando si torna sulla scheda/PWA
 * (al massimo una volta al minuto) controlla che esista e la ri-registra sul server. Se il browser l'ha revocata
 * o rinnovata da solo, il server riceve quella nuova e le notifiche riprendono senza fare niente.
 */
export function PushSync() {
  const { ready, token } = useAuth();
  const lastSync = useRef(0);

  useEffect(() => {
    if (!ready || !token || !pushSupported()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const run = () => {
      const now = Date.now();
      if (now - lastSync.current < 60_000) return;
      lastSync.current = now;
      void syncPushSubscription(token);
    };

    const t = window.setTimeout(run, 900);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", run);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", run);
    };
  }, [ready, token]);

  return null;
}
