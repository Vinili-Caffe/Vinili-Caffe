"use client";

import { useEffect } from "react";

/** Sync UI fazione (shop/permessi/rango) dopo promote/demote/claim o poll. */
export const EVENTO_FACTION_SYNC = "vc-evento-faction-sync";

export function notifyEventoFactionSync(reason?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_FACTION_SYNC, { detail: { reason: reason || "sync" } }));
}

/** Ricarica quando arriva un sync, al focus, o periodicamente (altri utenti che ti promuovono). */
export function useEventoFactionSync(onSync: () => void, opts?: { pollMs?: number; enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const pollMs = Math.max(0, Number(opts?.pollMs) || 10_000);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = () => {
      if (alive) onSync();
    };
    window.addEventListener(EVENTO_FACTION_SYNC, run);
    window.addEventListener("focus", run);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = pollMs > 0 ? window.setInterval(run, pollMs) : 0;
    return () => {
      alive = false;
      window.removeEventListener(EVENTO_FACTION_SYNC, run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVis);
      if (poll) window.clearInterval(poll);
    };
  }, [enabled, onSync, pollMs]);
}
