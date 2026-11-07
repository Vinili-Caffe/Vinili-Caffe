"use client";

import { useEffect, useRef } from "react";
import { fetchEventoStatus, type EventoWallet } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { subscribeSiteRealtime } from "@/lib/site-realtime";

/**
 * Sync live economia/fazione sul sito.
 * I comandi Discord (+daily, +work, +deposita, gambling, …) aggiornano il wallet in DB;
 * il poller confronta un fingerprint e notifica tutte le UI in ascolto.
 * In più: WS `evento_wallet_changed` dopo i grant minigame Discord.
 */
export const EVENTO_FACTION_SYNC = "vc-evento-faction-sync";

/** Poll default: abbastanza stretto da sembrare real-time dopo i comandi economy. */
export const EVENTO_LIVE_POLL_MS = 2_500;

export function notifyEventoFactionSync(reason?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_FACTION_SYNC, { detail: { reason: reason || "sync" } }));
}

export function walletLiveFingerprint(wallet?: EventoWallet | null): string {
  if (!wallet) return "";
  const crates = wallet.crates || {};
  const crateBit = Object.keys(crates)
    .sort()
    .map((k) => `${k}:${Math.max(0, Math.floor(Number(crates[k]) || 0))}`)
    .join(",");
  const items = wallet.items || {};
  const itemBit = Object.keys(items)
    .sort()
    .map((k) => `${k}:${Math.max(0, Math.floor(Number(items[k]) || 0))}`)
    .join(",");
  return [
    wallet.updatedAt || "",
    Math.max(0, Math.floor(Number(wallet.credits) || 0)),
    Math.max(0, Math.floor(Number(wallet.exp) || 0)),
    Math.max(0, Math.floor(Number(wallet.pei) || 0)),
    Math.max(0, Math.floor(Number(wallet.factionBankGiven) || 0)),
    wallet.factionId || "",
    wallet.factionRankTier ?? wallet.factionRank?.tier ?? "",
    crateBit,
    itemBit,
  ].join("|");
}

/**
 * Ricarica quando arriva un sync, al focus, o (opzionale) in poll locale.
 * Preferisci pollMs: 0 sui pannelli se è montato EventoLiveWalletPoller.
 */
export function useEventoFactionSync(onSync: () => void, opts?: { pollMs?: number; enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const pollMs =
    opts?.pollMs === undefined ? EVENTO_LIVE_POLL_MS : Math.max(0, Number(opts.pollMs) || 0);

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

/**
 * Un solo poller per le pagine evento: rileva cambi wallet (economy Discord → sito)
 * e notifica tutti i pannelli in ascolto. Non ascolta il proprio notify (evita loop).
 */
export function EventoLiveWalletPoller({ pollMs = EVENTO_LIVE_POLL_MS }: { pollMs?: number } = {}) {
  const { user, token, ready } = useAuth();
  const lastFp = useRef("");
  const interval = Math.max(1_500, Number(pollMs) || EVENTO_LIVE_POLL_MS);
  const selfId = String(user?.id || "").trim();

  useEffect(() => {
    if (!ready || !token) {
      lastFp.current = "";
      return;
    }
    let alive = true;

    const tick = async (reason = "poll") => {
      if (!alive) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const st = await fetchEventoStatus(token);
      if (!alive || !st?.ok) return;
      const fp = walletLiveFingerprint(st.wallet);
      if (!fp) return;
      if (!lastFp.current) {
        lastFp.current = fp;
        if (reason === "ws") notifyEventoFactionSync("wallet_ws");
        return;
      }
      if (fp !== lastFp.current) {
        lastFp.current = fp;
        notifyEventoFactionSync(reason === "ws" ? "wallet_ws" : "wallet");
      } else if (reason === "ws") {
        /* Grant appena arrivato: forza reload UI anche se fingerprint non è ancora cambiato. */
        notifyEventoFactionSync("wallet_ws");
      }
    };

    void tick();
    const poll = window.setInterval(() => {
      void tick();
    }, interval);
    const onFocus = () => {
      void tick();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const offWs = subscribeSiteRealtime((ping) => {
      if (ping?.type !== "evento_wallet_changed") return;
      if (ping.userId && selfId && ping.userId !== selfId) return;
      void tick("ws");
    });
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      offWs();
    };
  }, [ready, token, interval, selfId]);

  return null;
}
