"use client";

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell, CheckCheck, ExternalLink, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { setChromeOpen } from "@/lib/chrome-open";
import { useCloseOnScroll } from "@/lib/use-close-on-scroll";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  deleteNotif,
  filterBell,
  loadNotifications,
  markAllNotifsRead,
  markNotifRead,
  personalCategory,
  PERSONAL_CATS,
  resolveDestUrl,
  timeAgoNotif,
  type SiteNotification,
} from "@/lib/notifications";
import { setOsAppBadge } from "@/lib/os-badge";
import { subscribeSiteRealtime } from "@/lib/site-realtime";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { SmartLink } from "./SmartLink";
import { AnimatedList } from "./magicui/animated-list";
import { EmojiText } from "@/components/discord/EmojiText";

function useNarrowNav() {
  const [narrow, setNarrow] = useState(() => {
    try {
      return window.matchMedia("(max-width: 1023px)").matches;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

/** Campanella + dropdown (desktop) / schermata full (telefono). */
export function NavNotifBell() {
  const { ready, token, user } = useAuth();
  const { t } = useI18n();
  const narrow = useNarrowNav();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SiteNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const reduceMotion = useReducedMotion();
  const [ring, setRing] = useState(0);
  const prevUnread = useRef(0);
  useEffect(() => {
    if (unread > prevUnread.current) setRing((r) => r + 1);
    prevUnread.current = unread;
  }, [unread]);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();

  useEffect(() => {
    setChromeOpen(`notif-${uid}`, open);
    return () => setChromeOpen(`notif-${uid}`, false);
  }, [open, uid]);

  useBodyScrollLock(open && narrow);

  const load = useCallback(() => {
    if (!token) return;
    loadNotifications(token, 50).then((res) => {
      if (!res.ok) return;
      const raw = res.data.items || [];
      const list = filterBell(raw);
      const fromList = list.filter((x) => !x.read).length;
      const fromApi = Number(res.data.unread);
      const n = Number.isFinite(fromApi) ? Math.max(fromList, fromApi) : fromList;
      setItems(list);
      setUnread(n);
      setOsAppBadge(n);
      try {
        window.dispatchEvent(new CustomEvent("vc:notif-bell-sync", { detail: { items: raw } }));
      } catch {
        /* ignore */
      }
    });
  }, [token]);

  useEffect(() => {
    if (!ready || !token) {
      setItems([]);
      setUnread(0);
      setOsAppBadge(0);
    }
  }, [ready, token]);

  useLiveRefresh(load, {
    intervalMs: 60_000,
    enabled: ready && Boolean(token),
    boot: true,
    topics: ["notifications"],
  });

  useEffect(() => {
    if (!ready || !token) return;
    const me = String(user?.id || "").trim();
    return subscribeSiteRealtime((ping) => {
      if (ping.type !== "notifications_changed") return;
      if (me && ping.userId && ping.userId !== me) return;
      if (Number.isFinite(Number(ping.unread))) {
        const n = Math.max(0, Math.min(99, Math.floor(Number(ping.unread))));
        setUnread(n);
        setOsAppBadge(n);
      }
      load();
    });
  }, [ready, token, user?.id, load]);

  useEffect(() => {
    if (open && ready && token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo all’open
  }, [open]);

  useEffect(() => {
    if (!ready || !token) return;
    setOsAppBadge(unread);
  }, [ready, token, unread]);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open || narrow) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && closeMenu();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, narrow, closeMenu]);

  useEffect(() => {
    if (!open || !narrow) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, narrow, closeMenu]);

  useCloseOnScroll(open && !narrow, closeMenu);

  if (!ready || !token) return null;

  const preview = items.slice(0, narrow ? 24 : 8);

  async function onOpenItem(n: SiteNotification) {
    if (!token) return;
    if (!n.read) {
      await markNotifRead(token, n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => {
        const next = Math.max(0, u - 1);
        setOsAppBadge(next);
        return next;
      });
    }
    setOpen(false);
  }

  async function onDeleteItem(n: SiteNotification, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!token) return;
    const wasUnread = !n.read;
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (wasUnread) {
      setUnread((u) => {
        const next = Math.max(0, u - 1);
        setOsAppBadge(next);
        return next;
      });
    }
    if (/^[a-f0-9]{24}$/i.test(n.id)) void deleteNotif(token, n.id);
    window.dispatchEvent(new CustomEvent("vc:notif-changed"));
  }

  async function markAll() {
    if (!token || busy) return;
    setBusy(true);
    await markAllNotifsRead(token);
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    setOsAppBadge(0);
    setBusy(false);
  }

  const listBody = (
    <>
      {preview.length === 0 ? (
        <p className={cn("text-center text-crema/50", narrow ? "px-4 py-16 text-base" : "px-3 py-8 text-sm")}>
          {t("notif.empty")}
        </p>
      ) : (
        <AnimatedList key={open ? `open-${preview.map((n) => n.id).join(",")}` : "closed"} delay={narrow ? 40 : 60} showAll>
          {preview.map((n) => {
            const cat = PERSONAL_CATS.find((c) => c.id === personalCategory(n))?.label || "";
            const href = resolveDestUrl(n.openUrl) || page("/notifications/");
            return (
              <div
                key={n.id}
                className={cn(
                  "group flex items-stretch gap-0.5 rounded-xl transition-colors hover:bg-crema/8",
                  !n.read && "bg-caramel/8",
                  narrow && "rounded-2xl",
                )}
              >
                <a
                  href={href}
                  onClick={() => void onOpenItem(n)}
                  className={cn("flex min-w-0 flex-1 gap-2.5", narrow ? "px-3.5 py-3.5" : "px-2.5 py-2.5")}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      narrow && "mt-2 size-2.5",
                      n.read ? "bg-crema/20" : "bg-ember shadow-[0_0_6px_rgba(240,180,110,0.7)]",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate font-medium text-crema", narrow ? "text-[0.95rem]" : "text-sm")}>
                        <EmojiText text={n.title} />
                      </span>
                      <span className="shrink-0 text-[0.65rem] text-crema/40">{timeAgoNotif(n.at)}</span>
                    </span>
                    {n.body ? (
                      <span
                        className={cn(
                          "mt-0.5 leading-relaxed text-crema/55",
                          narrow ? "line-clamp-3 text-sm" : "line-clamp-2 text-xs",
                        )}
                      >
                        <EmojiText text={n.body} />
                      </span>
                    ) : null}
                    {cat ? (
                      <span className="mt-1 inline-block text-[0.65rem] font-semibold uppercase tracking-wider text-caramel/80">
                        {cat}
                      </span>
                    ) : null}
                  </span>
                </a>
                <button
                  type="button"
                  aria-label={t("notif.delete")}
                  title={t("notif.delete")}
                  onClick={(e) => void onDeleteItem(n, e)}
                  className={cn(
                    "m-1.5 flex shrink-0 items-center justify-center self-center rounded-full text-crema/35 transition-colors hover:bg-crema/10 hover:text-crema",
                    narrow ? "size-10 opacity-90" : "size-8 opacity-80 group-hover:opacity-100 sm:opacity-60",
                  )}
                >
                  <X className={narrow ? "size-4" : "size-3.5"} />
                </button>
              </div>
            );
          })}
        </AnimatedList>
      )}
    </>
  );

  const footer = (
    <SmartLink
      href={page("/notifications/")}
      onClick={() => setOpen(false)}
      className={cn(
        "flex items-center justify-center gap-1.5 font-medium text-ember hover:bg-caramel/10",
        narrow ? "rounded-2xl px-4 py-3.5 text-base" : "rounded-xl px-3 py-2.5 text-sm",
      )}
    >
      {t("notif.seeAll")} <ExternalLink className="size-3.5" />
    </SmartLink>
  );

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-10 items-center justify-center rounded-full bg-crema/8 text-crema ring-1 ring-crema/15 transition-colors hover:bg-crema/15"
        aria-expanded={open}
        aria-label={unread ? t("notif.unreadAria", { n: unread }) : t("notif.title")}
      >
        <motion.span
          key={ring}
          className="inline-flex origin-[50%_12%]"
          initial={false}
          animate={unread > 0 && !reduceMotion ? { rotate: [0, -22, 18, -12, 8, -4, 0] } : { rotate: 0 }}
          transition={
            unread > 0 && !reduceMotion
              ? { duration: 0.9, ease: "easeInOut", repeat: Infinity, repeatDelay: 3.2 }
              : { duration: 0.2 }
          }
        >
          <Bell className="size-[1.15rem]" strokeWidth={2.25} />
        </motion.span>
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key={`b${ring}`}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [1.35, 1], opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 18 }}
              className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-ember px-1 text-center text-[0.65rem] font-bold leading-4 text-ink"
            >
              {unread > 99 ? "99+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
        {unread > 0 && !reduceMotion && (
          <span aria-hidden className="pointer-events-none absolute inset-0 animate-ping rounded-full ring-2 ring-ember/40 [animation-duration:2.4s]" />
        )}
      </button>

      <AnimatePresence>
        {open && narrow ? (
          <motion.div
            key="notif-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t("notif.title")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] flex flex-col bg-espresso/98"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sand/10 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))]">
              <p className="font-display text-xl font-semibold text-crema">{t("notif.title")}</p>
              <div className="flex items-center gap-1.5">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAll()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-crema/70 hover:bg-crema/8 hover:text-crema disabled:opacity-50"
                  >
                    <CheckCheck className="size-4" /> {t("notif.markAll")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeMenu}
                  className="inline-flex size-11 items-center justify-center rounded-full bg-crema/8 text-crema ring-1 ring-crema/15"
                  aria-label={t("nav.closeMenu")}
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">{listBody}</div>
            <div className="shrink-0 border-t border-sand/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open && !narrow ? (
          <motion.div
            key="notif-drop"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full z-[70] mt-2 w-[min(22rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-2xl bg-roast/95 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.95)] ring-1 ring-sand/15 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-sand/10 px-3.5 py-2.5">
              <p className="text-sm font-semibold text-crema">{t("notif.title")}</p>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAll()}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.7rem] font-medium text-crema/60 hover:bg-crema/8 hover:text-crema disabled:opacity-50"
                  >
                    <CheckCheck className="size-3.5" /> {t("notif.markAll")}
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[min(22rem,50vh)] overflow-y-auto p-1.5">{listBody}</div>
            <div className="border-t border-sand/10 p-1.5">{footer}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
