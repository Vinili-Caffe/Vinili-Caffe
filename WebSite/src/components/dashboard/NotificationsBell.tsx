"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCheck, Clock3, Diamond, LogOut, Megaphone, Ticket, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { dashHref } from "@/lib/dashboard";
import { confirmLeaveUnsaved } from "@/lib/unsaved-changes";
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

const NARROW_MQ = "(max-width: 1023px)";
function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(NARROW_MQ);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(NARROW_MQ).matches,
    () => false,
  );
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
  const sheet = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();
  useBodyScrollLock(open && narrow);

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
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !sheet.current?.contains(t)) setOpen(false);
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

  const openItem = async (n: DashNotification) => {
    if (n.href) {
      setOpen(false);
      /* modifiche non salvate nella pagina: prima la barra in basso */
      if (!(await confirmLeaveUnsaved())) return;
      const target = dashHref(n.href);
      let url: URL | null = null;
      try {
        url = new URL(target, window.location.href);
      } catch {
        url = null;
      }
      /* stessa pagina (es. pannello server con altro server/sezione): il pannello legge l'indirizzo solo all'apertura,
         quindi serve un caricamento vero; altrimenti resteresti dove sei */
      if (url && url.origin === window.location.origin && url.pathname === window.location.pathname) {
        if (url.search !== window.location.search || url.hash !== window.location.hash) window.location.assign(url.pathname + url.search + url.hash);
        return;
      }
      router.push(target);
      return;
    }
    if (n.body.length > n.title.length) {
      setExpanded((cur) => (cur === n.id ? null : n.id));
    }
  };

  const listEl = (big: boolean) => (
    items.length === 0 ? (
              <p className={cn("text-center text-crema/60", big ? "px-4 py-16 text-base" : "px-4 py-10 text-sm")}>Nessun avviso per ora.</p>
            ) : (
              <ul className={cn("divide-y divide-sand/[0.07]", !big && "max-h-[min(28rem,70vh)] overflow-y-auto")}>
                {items.map((n) => {
                  const isOpen = expanded === n.id;
                  const showBody = isOpen || Boolean(n.href);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void openItem(n)}
                        className={cn(
                          "flex w-full gap-3 text-left transition hover:bg-crema/[0.03]",
                          big ? "px-4 py-4" : "px-4 py-3",
                          !n.read && "bg-caramel/[0.05]",
                        )}
                      >
                        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", typeTone(n.type))}>
                          {typeIcon(n.type)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className={cn("min-w-0 flex-1 text-crema", big ? "text-[0.95rem]" : "text-sm", !n.read && "font-semibold")}>{n.title}</span>
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
    )
  );

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

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open && narrow ? (
                <motion.div
                  ref={sheet}
                  key="dash-notif-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Notifiche"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[100] flex flex-col bg-espresso/98"
                >
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sand/10 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))]">
                    <div>
                      <p className="font-display text-xl font-semibold text-crema">Avvisi</p>
                      <p className="text-xs text-crema/60">{unread ? `${unread} da leggere` : "Tutto letto"}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {unread ? (
                        <button
                          type="button"
                          onClick={() => void markAll()}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-crema/70 hover:bg-crema/8 hover:text-crema disabled:opacity-50"
                        >
                          <CheckCheck className="size-4" aria-hidden /> Segna lette
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="inline-flex size-11 items-center justify-center rounded-full bg-crema/8 text-crema ring-1 ring-crema/15"
                        aria-label="Chiudi"
                      >
                        <X className="size-5" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{listEl(true)}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      <AnimatePresence>
        {open && !narrow ? (
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
            {listEl(false)}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
