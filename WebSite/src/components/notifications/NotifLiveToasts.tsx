"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Heart,
  MessageSquare,
  Shield,
  Sparkles,
  Star,
  Ticket,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import {
  KIND_LABEL,
  filterPersonal,
  loadNotifications,
  markNotifRead,
  resolveDestUrl,
  timeAgoNotif,
  type SiteNotification,
} from "@/lib/notifications";
import { armNotifAudioUnlock, playNotifSound } from "@/lib/notif-sound";
import { subscribeSiteRealtime } from "@/lib/site-realtime";
import { emitLiveRefresh } from "@/lib/use-live-refresh";
import { AnimatedList } from "../magicui/animated-list";
import { cn } from "@/lib/cn";
import { EmojiText } from "@/components/discord/EmojiText";

type Toast = SiteNotification & { toastKey: string };

const MAX_TOASTS = 4;
const TOAST_TTL_MS = 8_000;
const LIVE_EVENT = "vc:live-refresh";
const BELL_SYNC = "vc:notif-bell-sync";

function kindIcon(kind: string) {
  if (kind === "vote" || kind === "vote_reminder") return Star;
  if (kind === "success") return CheckCircle2;
  if (kind === "contest") return Heart;
  if (kind === "review" || kind === "suggestion") return MessageSquare;
  if (kind === "mod" || kind === "staff") return Shield;
  if (kind === "web_ticket" || kind === "web_ticket_mention" || kind === "web_ticket_sla") return Ticket;
  if (kind === "confessionale") return Sparkles;
  return Bell;
}

function kindTone(kind: string) {
  if (kind === "vote" || kind === "vote_reminder" || kind === "success") return "text-ember bg-caramel/20 ring-caramel/30";
  if (kind === "contest") return "text-rose-200 bg-rose-500/20 ring-rose-400/30";
  if (kind === "review") return "text-amber-200 bg-amber-500/20 ring-amber-400/30";
  if (kind === "mod" || kind === "staff") return "text-sky-200 bg-sky-500/20 ring-sky-400/30";
  if (kind === "suggestion") return "text-violet-200 bg-violet-500/20 ring-violet-400/30";
  if (kind.startsWith("web_ticket")) return "text-teal-200 bg-teal-500/20 ring-teal-400/30";
  return "text-crema/80 bg-crema/10 ring-sand/25";
}

function onNotificationsPage() {
  try {
    return window.location.pathname.replace(/\/+$/, "") === "/notifications";
  } catch {
    return false;
  }
}

/** Toast in alto a destra + catch-up al ritorno tab (non “mangiare” le notif in background). */
export function NotifLiveToasts() {
  const { ready, token, user } = useAuth();
  /** Già mostrate (o seed iniziale). */
  const seen = useRef<Set<string> | null>(null);
  /** Arrivate mentre la tab era nascosta → toast al focus. */
  const pending = useRef<Map<string, SiteNotification>>(new Map());
  const pageOpenedAt = useRef(0);
  const inflight = useRef(false);
  const queued = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    armNotifAudioUnlock();
  }, []);

  useEffect(() => {
    if (!ready || !token) {
      seen.current = null;
      pending.current.clear();
      setToasts([]);
      return;
    }

    let alive = true;
    pageOpenedAt.current = Date.now();
    const myId = String(user?.id || "").trim();

    const pushToasts = (fresh: SiteNotification[]) => {
      if (!fresh.length) return;
      const batch = fresh.slice(0, MAX_TOASTS).map((n) => ({
        ...n,
        toastKey: `${n.id}-${Date.now()}`,
      }));
      setToasts((prev) => [...batch, ...prev].slice(0, MAX_TOASTS));
      playNotifSound();
      if (batch.some((n) => /vote/i.test(String(n.kind || "")))) emitLiveRefresh("vote");
      for (const t of batch) {
        window.setTimeout(() => {
          if (!alive) return;
          setToasts((prev) => prev.filter((x) => x.toastKey !== t.toastKey));
        }, TOAST_TTL_MS);
      }
    };

    const flushPending = () => {
      if (document.hidden || onNotificationsPage()) return;
      const list = [...pending.current.values()].sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
      pending.current.clear();
      if (!list.length) return;
      for (const n of list) seen.current?.add(n.id);
      pushToasts(list);
    };

    const ingest = (list: SiteNotification[]) => {
      if (!seen.current) {
        /* notifBootRace1: seed le già presenti; toast solo quelle nate dopo (o durante) l’apertura pagina */
        const skew = pageOpenedAt.current - 800;
        seen.current = new Set();
        const arrived: SiteNotification[] = [];
        for (const n of list) {
          if (!n.read && Number(n.at || 0) >= skew) arrived.push(n);
          else seen.current.add(n.id);
        }
        if (!arrived.length) return;
        if (document.hidden || onNotificationsPage()) {
          for (const n of arrived) pending.current.set(n.id, n);
          return;
        }
        for (const n of arrived) seen.current.add(n.id);
        pushToasts(arrived);
        return;
      }

      const fresh = list.filter((n) => !n.read && !seen.current!.has(n.id) && !pending.current.has(n.id));
      if (!fresh.length) {
        for (const n of list) {
          if (n.read) seen.current!.add(n.id);
        }
        return;
      }

      if (document.hidden || onNotificationsPage()) {
        for (const n of fresh) pending.current.set(n.id, n);
        return;
      }

      for (const n of fresh) seen.current!.add(n.id);
      pushToasts(fresh);
    };

    const tick = () => {
      if (!alive) return;
      if (inflight.current) {
        queued.current = true;
        return;
      }
      inflight.current = true;
      loadNotifications(token, 20)
        .then((res) => {
          if (!alive || !res.ok) return;
          ingest(filterPersonal(res.data.items || [], "all"));
        })
        .finally(() => {
          inflight.current = false;
          if (!alive) return;
          if (queued.current) {
            queued.current = false;
            tick();
          }
        });
    };

    /* niente poll dedicato: riusa il fetch della campanella + WS */
    const onBell = (ev: Event) => {
      const items = (ev as CustomEvent<{ items?: SiteNotification[] }>).detail?.items;
      if (!Array.isArray(items)) return;
      ingest(filterPersonal(items, "all"));
    };
    const onLive = (ev: Event) => {
      const detail = String((ev as CustomEvent).detail || "");
      if (detail && detail !== "notifications" && detail !== "inbox") return;
      tick();
    };
    const onVis = () => {
      if (document.hidden) return;
      flushPending();
    };
    const onFocus = () => {
      flushPending();
    };
    window.addEventListener(BELL_SYNC, onBell);
    window.addEventListener(LIVE_EVENT, onLive);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const offWs = subscribeSiteRealtime((ping) => {
      if (ping.type !== "notifications_changed") return;
      if (myId && ping.userId && ping.userId !== myId) return;
      tick();
    });

    return () => {
      alive = false;
      window.removeEventListener(BELL_SYNC, onBell);
      window.removeEventListener(LIVE_EVENT, onLive);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      offWs();
    };
  }, [ready, token, user?.id]);

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 top-[max(4.5rem,env(safe-area-inset-top))] z-[90] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5"
      aria-live="polite"
    >
      <AnimatedList delay={80} className="pointer-events-auto" showAll>
        {toasts.map((n) => {
          const href = resolveDestUrl(n.openUrl) || page("/notifications/");
          const Icon = kindIcon(String(n.kind));
          const label = KIND_LABEL[String(n.kind)] || "Notifica";
          return (
            <a
              key={n.toastKey}
              href={href}
              onClick={() => {
                if (token && n.id) void markNotifRead(token, n.id);
              }}
              className={cn(
                "flex gap-3 rounded-2xl border border-sand/20 bg-roast/95 px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md ring-1 ring-caramel/15",
                "transition hover:border-caramel/40 hover:ring-caramel/30",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1",
                  kindTone(String(n.kind)),
                )}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-caramel/90">
                    {label}
                  </span>
                  <span className="ml-auto shrink-0 text-[0.65rem] text-crema/40">{timeAgoNotif(n.at)}</span>
                </span>
                <span className="mt-0.5 block truncate text-sm font-medium text-crema"><EmojiText text={n.title || label} /></span>
                {n.body ? (
                  <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-crema/55"><EmojiText text={n.body} /></span>
                ) : (
                  <span className="mt-0.5 block text-xs text-crema/40">Tocca per aprire</span>
                )}
              </span>
            </a>
          );
        })}
      </AnimatedList>
    </div>
  );
}
