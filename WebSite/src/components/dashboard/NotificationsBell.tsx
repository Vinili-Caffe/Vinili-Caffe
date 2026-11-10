"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCheck, Clock3, Diamond, LogOut, Megaphone, Ticket } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { dashHref } from "@/lib/dashboard";
import { loadNotifications, markNotificationsRead, timeAgo, type DashNotification } from "@/lib/dashboard-notifications";

const POLL_MS = 90_000;

function typeIcon(type: string) {
  switch (type) {
    case "premium_expiring":
      return <Diamond className="size-3.5" aria-hidden />;
    case "bot_missing":
    case "bot_left":
      return <LogOut className="size-3.5" aria-hidden />;
    case "tickets_stale":
      return <Ticket className="size-3.5" aria-hidden />;
    case "staff":
      return <Megaphone className="size-3.5" aria-hidden />;
    default:
      return <AlertTriangle className="size-3.5" aria-hidden />;
  }
}

function typeTone(type: string) {
  switch (type) {
    case "premium_expiring":
      return "bg-caramel/15 text-caramel";
    case "bot_missing":
    case "bot_left":
      return "bg-[#a83a2c]/20 text-[#f0a493] light:text-[#a83a2c]";
    case "tickets_stale":
      return "bg-ember/15 text-ember";
    case "staff":
      return "bg-crema/10 text-crema/80";
    default:
      return "bg-crema/10 text-crema/70";
  }
}

/** Campanella avvisi dashboard (tutti gli utenti con accesso) + notifiche staff se alto staff. */
export function NotificationsBell() {
  const { token } = useAuth();
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [items, setItems] = useState<DashNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await loadNotifications(token);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        setAvailable(false);
        setItems([]);
        setUnread(0);
      }
      return;
    }
    setAvailable(true);
    setItems(res.items);
    setUnread(res.unread);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let stop = false;
    const tick = () => {
      if (!stop && document.visibilityState === "visible") void refresh();
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [token, refresh]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!token || !available) return null;

  const markAll = async () => {
    setBusy(true);
    const res = await markNotificationsRead(token);
    setBusy(false);
    if (res.ok) {
      setItems(res.items);
      setUnread(res.unread);
    }
  };

  const openItem = (n: DashNotification) => {
    if (n.href) {
      setOpen(false);
      router.push(dashHref(n.href));
      return;
    }
    if (n.body.length > n.title.length) {
      setExpanded((cur) => (cur === n.id ? null : n.id));
    }
  };

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `Notifiche, ${unread} da leggere` : "Notifiche"}
        className={cn(
          "relative inline-flex size-9 items-center justify-center rounded-lg ring-1 transition",
          open ? "bg-crema/[0.08] text-crema ring-sand/30" : "text-crema/70 ring-sand/15 hover:text-crema hover:ring-sand/30",
        )}
      >
        <Bell className="size-[1.05rem]" aria-hidden />
        {unread ? (
          <span className="absolute -right-1 -top-1 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-ember px-1 text-[0.62rem] font-bold tabular-nums text-ink ring-2 ring-espresso">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-label="Notifiche"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl bg-roast shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15"
          >
            <header className="flex items-center justify-between gap-2 border-b border-sand/[0.08] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-crema">Avvisi</p>
                <p className="text-xs text-crema/60">{unread ? `${unread} da leggere` : "Tutto letto"}</p>
              </div>
              {unread ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void markAll()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ember transition hover:bg-caramel/10 disabled:opacity-50"
                >
                  <CheckCheck className="size-3.5" aria-hidden /> Segna lette
                </button>
              ) : null}
            </header>
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-crema/60">Nessun avviso per ora.</p>
            ) : (
              <ul className="max-h-[min(28rem,70vh)] divide-y divide-sand/[0.07] overflow-y-auto">
                {items.map((n) => {
                  const isOpen = expanded === n.id;
                  const showBody = isOpen || Boolean(n.href);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={cn(
                          "flex w-full gap-3 px-4 py-3 text-left transition hover:bg-crema/[0.03]",
                          !n.read && "bg-caramel/[0.05]",
                        )}
                      >
                        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", typeTone(n.type))}>
                          {typeIcon(n.type)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className={cn("min-w-0 flex-1 text-sm text-crema", !n.read && "font-semibold")}>{n.title}</span>
                            {!n.read ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ember" aria-hidden /> : null}
                          </span>
                          {showBody ? (
                            <span className={cn("mt-0.5 block text-xs leading-relaxed text-crema/70", !isOpen && !n.href && "line-clamp-2")}>
                              {n.body}
                            </span>
                          ) : n.body !== n.title ? (
                            <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-crema/70">{n.body}</span>
                          ) : null}
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-crema/50">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="size-2.5" aria-hidden />
                              {timeAgo(n.at)}
                            </span>
                            {n.guildName ? <span className="truncate">{n.guildName}</span> : null}
                            {n.href ? <span className="text-ember/80">Apri →</span> : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
