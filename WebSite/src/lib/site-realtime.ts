import { API_ORIGIN, SITE_ORIGIN, USE_API_ORIGIN } from "./site";
import { emitLiveRefresh } from "./use-live-refresh";

/** Ping generico dal WS `/webhooks/site-realtime-ws`. */
export type SiteRealtimePing = {
  type: string;
  userId?: string;
  unread?: number;
  ticketId?: string;
  queue?: string;
  stop?: boolean;
  readerId?: string;
  messageIds?: string[];
  platform?: string;
  status?: string;
  action?: string;
  scope?: string;
};

type Listener = (p: SiteRealtimePing) => void;

let shared: WebSocket | null = null;
let listeners = new Set<Listener>();
let closed = false;
let retry = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let bootstrapped = false;

/** Mappa type WS → topic `vc:live-refresh` (board filtrano con `topics`). */
const TYPE_TO_TOPIC: Record<string, string> = {
  notifications_changed: "notifications",
  votes_changed: "vote",
  staff_workflow_changed: "inbox",
  boards_changed: "boards",
  reviews_changed: "reviews",
  confessionale_changed: "confessionale",
  suggestions_changed: "suggestions",
  live_stats_changed: "live_stats",
  staff_pauses_changed: "staff_pauses",
  staff_compiti_changed: "staff_compiti",
  staff_profile_changed: "staff_profile",
  site_ui_changed: "site_ui",
  live_stream_changed: "live_stream",
  presence_changed: "presence",
  site_presence_changed: "presence",
  partnership_changed: "partnership",
  rank_card_changed: "rank_card",
  serata_changed: "serata",
  member_left: "live_stats",
};

function realtimeWsUrl() {
  try {
    if (USE_API_ORIGIN) {
      return `${API_ORIGIN.replace(/^http/, "ws")}/webhooks/site-realtime-ws`;
    }
    const base =
      typeof window !== "undefined" && window.location?.origin ? window.location.origin : SITE_ORIGIN;
    const u = new URL("/webhooks/site-realtime-ws", base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  } catch {
    return USE_API_ORIGIN
      ? "wss://api.viniliecaffe.it/webhooks/site-realtime-ws"
      : "wss://www.viniliecaffe.it/webhooks/site-realtime-ws";
  }
}

function topicForType(type: string): string | null {
  if (TYPE_TO_TOPIC[type]) return TYPE_TO_TOPIC[type];
  if (type.startsWith("web_ticket")) return "tickets";
  if (type.startsWith("workflow_chat")) return "inbox";
  return null;
}

function openShared() {
  if (closed || typeof window === "undefined") return;
  if (shared && (shared.readyState === WebSocket.OPEN || shared.readyState === WebSocket.CONNECTING)) return;
  try {
    shared = new WebSocket(realtimeWsUrl());
  } catch {
    shared = null;
    if (!closed && listeners.size) {
      timer = setTimeout(openShared, Math.min(12_000, 800 * 2 ** retry++));
    }
    return;
  }
  shared.onopen = () => {
    retry = 0;
  };
  shared.onmessage = (ev) => {
    try {
      const d = JSON.parse(String(ev.data));
      const type = String(d?.type || "");
      if (!type || type === "realtime_hello" || type === "suggestions_hello") return;
      const ping: SiteRealtimePing = {
        type,
        userId: d.userId ? String(d.userId) : undefined,
        unread: Number.isFinite(Number(d.unread)) ? Number(d.unread) : undefined,
        ticketId: d.ticketId ? String(d.ticketId) : undefined,
        queue: d.queue ? String(d.queue) : undefined,
        stop: !!d.stop,
        readerId: d.readerId ? String(d.readerId) : undefined,
        messageIds: Array.isArray(d.messageIds)
          ? d.messageIds.map((x: unknown) => String(x || "")).filter(Boolean)
          : undefined,
        platform: d.platform ? String(d.platform) : undefined,
        status: d.status ? String(d.status) : undefined,
        action: d.action ? String(d.action) : undefined,
        scope: d.scope ? String(d.scope) : undefined,
      };
      for (const fn of listeners) {
        try {
          fn(ping);
        } catch {
          /* ignore */
        }
      }
      const topic = topicForType(type);
      if (topic) emitLiveRefresh(topic);
    } catch {
      /* ignore */
    }
  };
  shared.onerror = () => {};
  shared.onclose = () => {
    shared = null;
    if (closed || !listeners.size) return;
    timer = setTimeout(openShared, Math.min(12_000, 800 * 2 ** retry++));
  };
}

/** Una sola connessione WS condivisa. Ritorna unsubscribe. */
export function subscribeSiteRealtime(onPing: Listener): () => void {
  listeners.add(onPing);
  closed = false;
  if (!shared || shared.readyState === WebSocket.CLOSED) openShared();
  return () => {
    listeners.delete(onPing);
    if (!listeners.size) {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      try {
        shared?.close();
      } catch {
        /* ignore */
      }
      shared = null;
      retry = 0;
    }
  };
}

export function isSiteRealtimeConnected(): boolean {
  return shared?.readyState === WebSocket.OPEN;
}

export function bootstrapSiteRealtime() {
  if (bootstrapped || typeof window === "undefined") return () => {};
  bootstrapped = true;
  const off = subscribeSiteRealtime(() => {});
  const poke = () => {
    if (!listeners.size) return;
    if (!shared || shared.readyState === WebSocket.CLOSED || shared.readyState === WebSocket.CLOSING) {
      closed = false;
      openShared();
    }
  };
  window.addEventListener("focus", poke);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poke();
  });
  return () => {
    window.removeEventListener("focus", poke);
    off();
    bootstrapped = false;
  };
}
