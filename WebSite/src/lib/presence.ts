// Presenza sul sito (online/idle), non Discord.
// POST /webhooks/site-user-presence  { status, path, visible } | { clear: true, status: "offline" }
// GET  /webhooks/site-user-presence/query?ids=…
// Handler: Vinyls/Utils/Web/siteUserPresenceApi.js — UI vecchia: vc-site-presence.js
// Pallini su ogni Avatar con userId (watchUser); heartbeat anche fuori dalle route “chat”.

import { apiUrl } from "@/lib/api";
import { pollInterval } from "@/lib/device-fx";
import { isOnline, onOnlineChange } from "@/lib/online";
import { subscribeSiteRealtime } from "@/lib/site-realtime";

export type PresenceStatus = "online" | "idle" | "offline";

const HB_MS_BASE = 60_000;
/** Query batch più lenta: gli avatar in viewport bastano a tenere fresco il pallino. */
const QUERY_MS_BASE = 90_000;
const IDLE_MS = 3 * 60 * 1000;
const SNOW = /^\d{16,22}$/;

const statuses = new Map<string, PresenceStatus>();
const watched = new Map<string, number>();
const listeners = new Set<() => void>();
const watchListeners = new Set<() => void>();

let hbTimer = 0;
let queryTimer = 0;
let querySoonTimer = 0;
let lastKey = "";
let lastActivity = 0;
let activityOn = false;
let currentToken = "";
let currentPath = "/";

function emit() {
  listeners.forEach((fn) => fn());
}

function emitWatch() {
  watchListeners.forEach((fn) => fn());
}

export function subscribePresence(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function subscribeWatch(cb: () => void) {
  watchListeners.add(cb);
  return () => watchListeners.delete(cb);
}

export function presenceStatus(id?: string | null): PresenceStatus {
  if (!id) return "offline";
  return statuses.get(id) || "offline";
}

export function watchUser(id?: string | null) {
  const uid = String(id || "").trim();
  if (!SNOW.test(uid)) return () => {};
  watched.set(uid, (watched.get(uid) || 0) + 1);
  emitWatch();
  pokePresence();
  return () => {
    const n = (watched.get(uid) || 1) - 1;
    if (n <= 0) watched.delete(uid);
    else watched.set(uid, n);
    emitWatch();
  };
}

export function watchedIds() {
  const ids: string[] = [];
  for (const id of watched.keys()) {
    if (ids.length >= 100) break;
    ids.push(id);
  }
  return ids;
}

/** Heartbeat su pagine “social” + ovunque ci siano avatar in watch (shouldNet). */
export function pathWantsPresence(path: string) {
  const p = String(path || "").toLowerCase();
  return /\/tickets(?:\/|$)|\/staff(?:\/|$)|\/confessionale(?:\/|$)|\/bacheca(?:\/|$)|\/feedback(?:\/|$)|\/classifiche(?:\/|$)|\/vote(?:\/|$)|\/user(?:\/|$)|\/recensioni(?:\/|$)|\/notifications(?:\/|$)|\/ruoli(?:\/|$)|\/$/.test(
    p,
  );
}

function api(path: string) {
  return apiUrl(path);
}

function myStatus(): PresenceStatus {
  if (typeof document !== "undefined" && document.hidden) return "idle";
  if (lastActivity && Date.now() - lastActivity > IDLE_MS) return "idle";
  return "online";
}

function shouldNet() {
  if (!currentToken) return false;
  if (pathWantsPresence(currentPath)) return true;
  return watched.size > 0;
}

function ensureActivity() {
  if (activityOn || typeof window === "undefined") return;
  activityOn = true;
  lastActivity = Date.now();
  const mark = () => {
    lastActivity = Date.now();
  };
  for (const ev of ["pointerdown", "keydown", "touchstart", "scroll"] as const) {
    window.addEventListener(ev, mark, { passive: true, capture: true });
  }
  document.addEventListener("visibilitychange", () => {
    // defer: non bloccare il visibilitychange handler (violation console)
    window.setTimeout(() => sendHeartbeat(false), 0);
  });
  window.addEventListener("pagehide", () => {
    clearPresence();
  });
}

async function sendHeartbeat(force: boolean) {
  const t = currentToken;
  if (!t || !shouldNet() || !isOnline()) return;
  const st = myStatus();
  const hidden = typeof document !== "undefined" && document.hidden;
  const path = currentPath.slice(0, 160);
  const key = `${st}|${hidden ? "0" : "1"}|${path}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  try {
    await fetch(api("/webhooks/site-user-presence"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ status: st, path, visible: !hidden }),
      credentials: "omit",
      keepalive: true,
    });
  } catch {
    /* rete assente: il banner outage se ne accorge */
  }
}

function clearPresence() {
  const t = currentToken;
  if (!t || !isOnline()) return;
  lastKey = "";
  try {
    void fetch(api("/webhooks/site-user-presence"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ clear: true, status: "offline" }),
      credentials: "omit",
      keepalive: true,
    });
  } catch {
    /* pagehide */
  }
}

function applyMap(map: Record<string, string>) {
  let changed = false;
  for (const [id, raw] of Object.entries(map)) {
    const st: PresenceStatus = raw === "online" || raw === "idle" ? raw : "offline";
    if (statuses.get(id) !== st) {
      statuses.set(id, st);
      changed = true;
    }
  }
  if (changed) emit();
}

async function queryVisible() {
  const ids = watchedIds();
  if (!ids.length || !isOnline()) return;
  try {
    const r = await fetch(api(`/webhooks/site-user-presence/query?ids=${encodeURIComponent(ids.join(","))}`), {
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
    });
    const data = (await r.json().catch(() => null)) as { ok?: boolean; statuses?: Record<string, string> } | null;
    if (!data?.ok || !data.statuses) return;
    applyMap(data.statuses);
  } catch {
    /* query silenziosa */
  }
}

function stopTimers() {
  if (hbTimer) window.clearInterval(hbTimer);
  if (queryTimer) window.clearInterval(queryTimer);
  hbTimer = 0;
  queryTimer = 0;
}

function ensureTimers() {
  if (typeof window === "undefined") return;
  if (!shouldNet() || !isOnline()) {
    stopTimers();
    return;
  }
  if (!hbTimer) {
    void sendHeartbeat(true);
    hbTimer = window.setInterval(() => void sendHeartbeat(false), pollInterval(HB_MS_BASE));
  }
  if (!queryTimer) {
    void queryVisible();
    queryTimer = window.setInterval(() => void queryVisible(), pollInterval(QUERY_MS_BASE));
  }
}

/** Se cambiano le caps (rete/batteria), riparte con i nuovi intervalli. */
function bindFxPace() {
  if (typeof window === "undefined") return;
  const onFx = () => {
    if (!shouldNet()) return;
    stopTimers();
    ensureTimers();
  };
  window.addEventListener("vc:device-fx", onFx);
}

let fxPaceBound = false;
function ensureFxPace() {
  if (fxPaceBound) return;
  fxPaceBound = true;
  bindFxPace();
  onOnlineChange((online) => {
    if (!online) {
      stopTimers();
      return;
    }
    ensureTimers();
    void sendHeartbeat(true);
    void queryVisible();
  });
  // WS: aggiorna solo gli id in watch (niente full query)
  subscribeSiteRealtime((ping) => {
    if (ping.type !== "site_presence_changed" && ping.type !== "presence_changed") return;
    const id = String(ping.userId || "").trim();
    if (!id || !watched.has(id)) return;
    const st: PresenceStatus =
      ping.status === "online" || ping.status === "idle" || ping.status === "offline"
        ? ping.status
        : "offline";
    if (statuses.get(id) !== st) {
      statuses.set(id, st);
      emit();
    }
  });
}

export function pokePresence() {
  if (typeof window === "undefined") return;
  if (querySoonTimer) window.clearTimeout(querySoonTimer);
  querySoonTimer = window.setTimeout(() => {
    querySoonTimer = 0;
    ensureTimers();
    void queryVisible();
  }, 180);
}

/** Aggancia heartbeat al token reale e al percorso. Ritorna lo stop. */
export function bindPresence(token: string | null, path: string) {
  currentToken = String(token || "").trim();
  currentPath = String(path || "/").slice(0, 160);
  ensureActivity();
  ensureFxPace();
  if (!shouldNet()) {
    stopTimers();
    return () => {};
  }
  ensureTimers();
  void sendHeartbeat(false);
  return () => {
    stopTimers();
  };
}
