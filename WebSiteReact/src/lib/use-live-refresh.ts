"use client";

import { useEffect, useRef } from "react";
import { pollInterval } from "@/lib/device-fx";
import { isOnline } from "@/lib/online";

const EVENT = "vc:live-refresh";

type Opts = {
  /** Base ms (default 20s). Viene moltiplicato da DeviceFx.pollMult. */
  intervalMs?: number;
  enabled?: boolean;
  /** Se false, niente fetch al mount (la pagina carica già da sola). Default true. */
  boot?: boolean;
  /**
   * Se impostato, ricarica solo quando `vc:live-refresh` ha detail in lista
   * (o detail vuoto = “refresh generico”). Senza topics: ogni emit.
   */
  topics?: string[];
};

/**
 * Ricarica dati “live” mentre la pagina è aperta:
 * - poll a intervallo adattivo (solo tab visibile)
 * - subito su focus / visibility / pageshow
 * - su evento custom `vc:live-refresh` (WS → emitLiveRefresh)
 * - su `vc:device-fx` riparte col nuovo pollMult
 */
export function useLiveRefresh(refresh: () => void | Promise<void>, opts: Opts = {}) {
  const baseMs = Math.max(5_000, Number(opts.intervalMs) || 20_000);
  const enabled = opts.enabled !== false;
  const boot = opts.boot !== false;
  const topics = opts.topics;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const topicsRef = useRef(topics);
  topicsRef.current = topics;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let inflight = false;
    let queued = false;

    const run = () => {
      if (!alive || document.hidden || !isOnline()) return;
      if (inflight) {
        queued = true;
        return;
      }
      inflight = true;
      Promise.resolve(refreshRef.current())
        .catch(() => {})
        .finally(() => {
          inflight = false;
          if (!alive) return;
          if (queued) {
            queued = false;
            run();
          }
        });
    };

    const onLive = (ev: Event) => {
      const detail = String((ev as CustomEvent).detail || "").trim();
      const allow = topicsRef.current;
      if (allow && allow.length) {
        if (detail && !allow.includes(detail)) return;
      }
      run();
    };

    const bootTimer = boot ? window.setTimeout(run, 350) : 0;
    let id = window.setInterval(run, pollInterval(baseMs));

    const restartPace = () => {
      window.clearInterval(id);
      id = window.setInterval(run, pollInterval(baseMs));
    };

    const onVis = () => {
      if (document.hidden) return;
      window.setTimeout(run, 0);
    };
    const onOnline = () => window.setTimeout(run, 0);
    window.addEventListener("focus", run);
    window.addEventListener("pageshow", run);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(EVENT, onLive);
    window.addEventListener("vc:device-fx", restartPace);
    window.addEventListener("online", onOnline);

    return () => {
      alive = false;
      if (bootTimer) window.clearTimeout(bootTimer);
      window.clearInterval(id);
      window.removeEventListener("focus", run);
      window.removeEventListener("pageshow", run);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(EVENT, onLive);
      window.removeEventListener("vc:device-fx", restartPace);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, baseMs, boot, topics?.join(",")]);
}

/** Emesso da WS / toast per forzare un refresh (detail = topic). */
export function emitLiveRefresh(detail?: string) {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: detail || "" }));
  } catch {
    /* ignore */
  }
}
