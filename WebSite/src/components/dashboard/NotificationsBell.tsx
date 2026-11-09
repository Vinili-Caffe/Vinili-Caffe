"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { loadNotifications, markNotificationsRead, timeAgo, type DashNotification } from "@/lib/dashboard-notifications";

const POLL_MS = 120_000;

/** Campanella notifiche staff. Chi non è alto staff riceve 403: la campanella non compare. */
export function NotificationsBell() {
  const { token } = useAuth();
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
      if (res.status === 401 || res.status === 403) setAvailable(false);
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
            className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl bg-roast shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15"
          >
            <header className="flex items-center justify-between gap-2 border-b border-sand/[0.08] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-crema">Notifiche</p>
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
              <p className="px-4 py-10 text-center text-sm text-crema/60">Nessuna notifica per ora.</p>
            ) : (
              <ul className="max-h-[min(26rem,70vh)] divide-y divide-sand/[0.07] overflow-y-auto">
                {items.map((n) => {
                  const long = n.body.length > n.title.length;
                  const isOpen = expanded === n.id;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => long && setExpanded(isOpen ? null : n.id)}
                        aria-expanded={long ? isOpen : undefined}
                        className={cn("flex w-full gap-3 px-4 py-3 text-left transition", long && "hover:bg-crema/[0.03]", !n.read && "bg-caramel/[0.05]")}
                      >
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-ember")} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-sm text-crema", !n.read && "font-semibold", !isOpen && "line-clamp-2")}>
                            {isOpen ? n.body : n.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-crema/60">
                            {timeAgo(n.at)}
                            {long && !isOpen ? " · leggi tutto" : ""}
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
