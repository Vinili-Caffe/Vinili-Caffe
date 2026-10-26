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

/** Campanella + dropdown anteprima (come il vecchio sito, UI Motif). */
export function NavNotifBell() {
  const { ready, token, user } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SiteNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const reduceMotion = useReducedMotion();
  // a ogni notifica in più la campanella riparte subito (key nuova), senza aspettare il giro
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

  const load = useCallback(() => {
    if (!token) return;
    loadNotifications(token, 50).then((res) => {
      if (!res.ok) return;
      // campanella = tutte comprese le staff; fuori solo conferme voto e tipi silenziati. Già sorted newest-first
      const raw = res.data.items || [];
      const list = filterBell(raw);
      const fromList = list.filter((x) => !x.read).length;
      // il server conta con le stesse regole della campanella (già senza conferme voto e silenziate):
      // oltre le 50 in lista vale il suo totale. Stesso numero sul badge di telefono e PC.
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

  // poll + focus/pageshow + WS — pace da DeviceFx.pollMult via useLiveRefresh
  useLiveRefresh(load, {
    intervalMs: 60_000,
    enabled: ready && Boolean(token),
    boot: true,
    topics: ["notifications"],
  });

  /* badgeCrossDevice1: unread dal payload WS → badge subito, poi full sync */
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

  // ricarica anche all’apertura della campanella
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
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && closeMenu();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeMenu]);

  // Solo click: chiude automaticamente allo scroll
  useCloseOnScroll(open, closeMenu);

  if (!ready || !token) return null;

  const preview = items.slice(0, 8);

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

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-10 items-center justify-center rounded-full bg-crema/8 text-crema ring-1 ring-crema/15 transition-colors hover:bg-crema/15"
        aria-expanded={open}
        aria-label={unread ? t("notif.unreadAria", { n: unread }) : t("notif.title")}
      >
        {/* da non lette la campanella suona ogni qualche secondo; a ogni nuova arrivata suona subito */}
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
        {open && (
          <motion.div
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

            <div className="max-h-[min(22rem,50vh)] overflow-y-auto p-1.5">
              {preview.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-crema/50">{t("notif.empty")}</p>
              ) : (
                <AnimatedList key={open ? `open-${preview.map((n) => n.id).join(",")}` : "closed"} delay={60} showAll>
                  {preview.map((n) => {
                    const cat = PERSONAL_CATS.find((c) => c.id === personalCategory(n))?.label || "";
                    const href = resolveDestUrl(n.openUrl) || page("/notifications/");
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          "group flex items-stretch gap-0.5 rounded-xl transition-colors hover:bg-crema/8",
                          !n.read && "bg-caramel/8",
                        )}
                      >
                        <a
                          href={href}
                          onClick={() => void onOpenItem(n)}
                          className="flex min-w-0 flex-1 gap-2.5 px-2.5 py-2.5"
                        >
                          <span
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",
                              n.read ? "bg-crema/20" : "bg-ember shadow-[0_0_6px_rgba(240,180,110,0.7)]",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium text-crema"><EmojiText text={n.title} /></span>
                              <span className="shrink-0 text-[0.65rem] text-crema/40">{timeAgoNotif(n.at)}</span>
                            </span>
                            {n.body ? (
                              <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-crema/55"><EmojiText text={n.body} /></span>
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
                          className="m-1.5 flex size-8 shrink-0 items-center justify-center self-center rounded-full text-crema/35 opacity-80 transition-colors hover:bg-crema/10 hover:text-crema group-hover:opacity-100 sm:opacity-60"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </AnimatedList>
              )}
            </div>

            <div className="border-t border-sand/10 p-1.5">
              <SmartLink
                href={page("/notifications/")}
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-ember hover:bg-caramel/10"
              >
                {t("notif.seeAll")} <ExternalLink className="size-3.5" />
              </SmartLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
