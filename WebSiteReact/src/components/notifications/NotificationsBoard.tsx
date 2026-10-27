"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  BellOff,
  CheckCheck,
  ChevronDown,
  Inbox,
  LogIn,
  Mail,
  Trash2,
  X,
} from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { useAuth } from "@/lib/auth";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import {
  KIND_LABEL,
  PERSONAL_CATS,
  checkStaffAccess,
  clearAllNotifs,
  deleteNotif,
  filterPersonal,
  loadNotifications,
  markAllNotifsRead,
  markNotifRead,
  personalCategory,
  resolveDestUrl,
  shouldOpenInNewTab,
  timeAgoNotif,
  type NotifFilter,
  type PersonalCatId,
  type SiteNotification,
} from "@/lib/notifications";
import { cn } from "@/lib/cn";
import { setOsAppBadge } from "@/lib/os-badge";
import { NotifPrefs } from "./NotifPrefs";
import { PushCard } from "./PushCard";
import { StaffInbox } from "./StaffInbox";
import { EmojiText } from "@/components/discord/EmojiText";
import { confirmDialog } from "@/components/ui";
import { BoardSkeleton, EmptyState } from "@/components/ui/EmptyState";

type Scope = "personal" | "staff";

function Pill({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
        on ? "bg-caramel text-ink" : "bg-crema/6 text-crema/65 ring-1 ring-sand/15 hover:text-crema",
        className,
      )}
    >
      {children}
    </button>
  );
}

function kindIconTone(kind: string) {
  if (kind === "vote" || kind === "vote_reminder" || kind === "success") return "text-ember bg-caramel/15 ring-caramel/25";
  if (kind === "contest") return "text-rose-200 bg-rose-500/15 ring-rose-400/25";
  if (kind === "review") return "text-amber-200 bg-amber-500/15 ring-amber-400/25";
  if (kind === "mod" || kind === "staff") return "text-sky-200 bg-sky-500/15 ring-sky-400/25";
  if (kind === "suggestion") return "text-violet-200 bg-violet-500/15 ring-violet-400/25";
  return "text-crema/70 bg-crema/8 ring-sand/20";
}

function NotifRow({
  n,
  onOpen,
  onDelete,
}: {
  n: SiteNotification;
  onOpen: (n: SiteNotification) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(n)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(n);
          }
        }}
        className={cn(
          "group flex cursor-pointer gap-3 rounded-3xl p-4 ring-1 transition-colors",
          n.read ? "bg-roast/50 ring-sand/10 hover:ring-sand/25" : "bg-roast/80 ring-caramel/30 hover:ring-caramel/50",
          n.filtered && "opacity-70",
        )}
      >
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", kindIconTone(String(n.kind)))}>
          <Bell className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-crema"><EmojiText text={n.title} /></p>
          {n.body ? <p className="mt-0.5 line-clamp-2 text-sm text-crema/55"><EmojiText text={n.body} /></p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-crema/40">
            <span className="lining-nums">{timeAgoNotif(n.at)}</span>
            {!n.read ? <span className="rounded-full bg-caramel/20 px-2 py-0.5 font-semibold text-ember">Non letta</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
              n.openUrl ? "bg-caramel/15 text-ember ring-1 ring-caramel/25" : n.read ? "bg-crema/8 text-crema/45" : "bg-crema/10 text-crema/60",
            )}
          >
            {n.openUrl ? "Vai" : KIND_LABEL[String(n.kind)] || "Info"}
          </span>
          <button
            type="button"
            aria-label="Elimina notifica"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(n.id);
            }}
            className="rounded-full p-1.5 text-crema/35 opacity-70 transition-colors hover:bg-crema/10 hover:text-crema group-hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function CategoryBlock({
  id,
  label,
  items,
  open,
  onToggle,
  onClear,
  onOpen,
  onDelete,
}: {
  id: PersonalCatId;
  label: string;
  items: SiteNotification[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  onOpen: (n: SiteNotification) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="rounded-3xl bg-mocha/40 ring-1 ring-sand/12">
      <div className="flex items-center gap-1 px-2 py-1.5 sm:px-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-2.5 text-left hover:bg-crema/[0.04]"
        >
          <Mail className="size-4 shrink-0 text-caramel" />
          <span className="truncate font-semibold text-crema">{label}</span>
          <span className="ml-1 rounded-full bg-crema/10 px-2 py-0.5 text-xs font-semibold text-crema/55 lining-nums">{items.length}</span>
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-crema/40 transition-transform", open && "rotate-180")} />
        </button>
        <button
          type="button"
          aria-label={`Elimina tutte in ${label}`}
          title={`Elimina tutte in ${label}`}
          onClick={onClear}
          className="rounded-full p-2 text-crema/35 hover:bg-crema/10 hover:text-crema"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-2 overflow-hidden px-2 pb-3 sm:px-3"
            role="list"
          >
            {items.map((n) => (
              <NotifRow key={n.id} n={n} onOpen={onOpen} onDelete={onDelete} />
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function readScopeFromUrl(): Scope {
  try {
    const view = String(
      new URLSearchParams(location.search).get("view") ||
        new URLSearchParams(location.search).get("tab") ||
        "",
    ).toLowerCase();
    if (view === "staff" || view === "inbox") return "staff";
  } catch {
    /* ignore */
  }
  return "personal";
}

/** La cassetta delle lettere del bar: personali + inbox staff (se l’API lo consente). */
export function NotificationsBoard() {
  const { ready, token, login } = useAuth();
  const [scope, setScope] = useState<Scope>(readScopeFromUrl);
  /* null = check staff in corso: non resettare ?view=staff al boot. */
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [items, setItems] = useState<SiteNotification[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<NotifFilter>("all");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const prefsHost = useRef<HTMLDivElement>(null);

  const flash = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(""), 2400);
  };

  const refresh = useCallback(async () => {
    if (!token) return;
    const r = await loadNotifications(token);
    if (!r.ok) {
      setError(r.message);
      setItems([]);
      return;
    }
    setError("");
    setItems(r.data.items);
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setItems(null);
      setIsStaff(false);
      return;
    }
    void refresh();
    let alive = true;
    setIsStaff(null);
    checkStaffAccess(token).then((ok) => {
      if (alive) setIsStaff(ok);
    });
    return () => {
      alive = false;
    };
  }, [ready, token, refresh]);

  useLiveRefresh(refresh, {
    intervalMs: 60_000,
    enabled: ready && Boolean(token),
    boot: false,
    topics: ["notifications"],
  });

  useEffect(() => {
    const onChanged = () => {
      if (token) void refresh();
    };
    window.addEventListener("vc:notif-changed", onChanged);
    return () => window.removeEventListener("vc:notif-changed", onChanged);
  }, [token, refresh]);

  // ?view=staff|inbox | ?tab=staff (anche dopo click push / soft nav)
  useEffect(() => {
    const apply = () => {
      try {
        const sp = new URLSearchParams(location.search);
        const view = String(sp.get("view") || sp.get("tab") || "").toLowerCase();
        if (view === "staff" || view === "inbox") setScope("staff");
        else if (!view) setScope("personal");
      } catch {
        /* ignore */
      }
    };
    apply();
    window.addEventListener("popstate", apply);
    window.addEventListener("pageshow", apply);
    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener("pageshow", apply);
    };
  }, []);

  useEffect(() => {
    if (isStaff === null) return;
    if (!isStaff && scope === "staff") setScope("personal");
    if (isStaff && readScopeFromUrl() === "staff") setScope("staff");
  }, [isStaff, scope]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!prefsOpen) return;
      if (prefsHost.current?.contains(e.target as Node)) return;
      setPrefsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPrefsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [prefsOpen]);

  const writeScopeUrl = (next: Scope) => {
    try {
      const u = new URL(location.href);
      if (next === "staff") u.searchParams.set("view", "staff");
      else u.searchParams.delete("view");
      u.searchParams.delete("tab");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch {
      /* ignore */
    }
  };

  const staffKnown = isStaff === true;

  const shown = useMemo(() => filterPersonal(items ?? [], filter), [items, filter]);

  const stats = useMemo(() => {
    const allActive = filterPersonal(items ?? [], "all");
    const unread = allActive.filter((n) => !n.read).length;
    const filtered = filterPersonal(items ?? [], "filtered").length;
    return { total: allActive.length, unread, filtered };
  }, [items]);

  useEffect(() => {
    if (!ready || !token) return;
    setOsAppBadge(stats.unread);
  }, [ready, token, stats.unread]);

  const buckets = useMemo(() => {
    const map = new Map<PersonalCatId, SiteNotification[]>();
    for (const cat of PERSONAL_CATS) map.set(cat.id, []);
    for (const n of shown) {
      const id = personalCategory(n);
      const list = map.get(id) ?? [];
      list.push(n);
      map.set(id, list);
    }
    return PERSONAL_CATS.map((c) => ({ ...c, items: map.get(c.id) ?? [] })).filter((c) => c.items.length > 0);
  }, [shown]);

  const openOne = async (n: SiteNotification) => {
    if (!token) return;
    setItems((list) => (list ? list.map((x) => (x.id === n.id ? { ...x, read: true } : x)) : list));
    void markNotifRead(token, n.id);
    const dest = resolveDestUrl(n.openUrl);
    if (!dest) return;
    if (shouldOpenInNewTab(dest, String(n.kind))) {
      window.open(dest, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const u = new URL(dest);
      if (u.origin === location.origin) {
        location.assign(u.pathname + u.search + u.hash);
        return;
      }
    } catch {
      /* fall through */
    }
    location.assign(dest);
  };

  const removeOne = async (id: string) => {
    if (!token) return;
    setItems((list) => (list ? list.filter((x) => x.id !== id) : list));
    if (/^[a-f0-9]{24}$/i.test(id)) void deleteNotif(token, id);
  };

  const clearCategory = async (catId: PersonalCatId) => {
    if (!token || !items) return;
    const ids = items.filter((n) => personalCategory(n) === catId).map((n) => n.id);
    setItems((list) => (list ? list.filter((x) => personalCategory(x) !== catId) : list));
    await Promise.all(ids.filter((id) => /^[a-f0-9]{24}$/i.test(id)).map((id) => deleteNotif(token, id)));
    flash("Categoria svuotata.");
  };

  const markAll = async () => {
    if (!token || busy) return;
    setBusy(true);
    setItems((list) => (list ? list.map((x) => ({ ...x, read: true })) : list));
    const r = await markAllNotifsRead(token);
    setBusy(false);
    flash(r.ok ? "Tutte segnate come lette." : r.message);
  };

  const clearAll = async () => {
    if (!token || busy) return;
    if (!(await confirmDialog({ message: "Eliminare tutte le notifiche personali?", danger: true }))) return;
    setBusy(true);
    setItems([]);
    const r = await clearAllNotifs(token);
    setBusy(false);
    flash(r.ok ? "Notifiche eliminate." : r.message);
    void refresh();
  };

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-6 pb-20">
        <BoardSkeleton />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-20">
        <Reveal>
          <div className="rounded-3xl bg-roast/70 p-8 text-center ring-1 ring-sand/12">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
              <Bell className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-3xl font-semibold">Accedi per le tue lettere</h2>
            <p className="mt-2 text-sm leading-relaxed text-crema/60">
              Le notifiche del sito (ticket, voti, esiti) arrivano qui dopo il login con Discord.
            </p>
            <button
              type="button"
              onClick={login}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-semibold text-ink transition hover:-translate-y-0.5"
            >
              <LogIn className="size-4" />
              Accedi con Discord
            </button>
          </div>
        </Reveal>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pb-20">
      <Reveal>
        <div className="flex gap-3 rounded-2xl bg-caramel/10 p-5 text-sm leading-relaxed text-crema/75 ring-1 ring-caramel/25">
          <Mail className="mt-0.5 size-4 shrink-0 text-caramel" />
          <p>
            <strong className="text-crema">La tua inbox:</strong> ogni avviso nella sua casella.
            Apri una notifica per segnarla come letta e andare alla destinazione. I filtri decidono cosa ricevi ancora.
          </p>
        </div>
      </Reveal>

      {staffKnown ? (
        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Ambito notifiche">
          <Pill
            on={scope === "personal"}
            onClick={() => {
              setScope("personal");
              writeScopeUrl("personal");
            }}
          >
            <Bell className="size-3.5" />
            Personali
          </Pill>
          <Pill
            on={scope === "staff"}
            onClick={() => {
              setScope("staff");
              writeScopeUrl("staff");
            }}
          >
            <Inbox className="size-3.5" />
            Inbox
          </Pill>
        </div>
      ) : null}

      {scope === "staff" && staffKnown ? (
        <div className="mt-6">
          <StaffInbox token={token} />
        </div>
      ) : (
        <>
          <PushCard token={token} />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-crema/50 lining-nums" aria-live="polite">
              {stats.unread === 0 ? "Tutte lette" : `${stats.unread} non lette`} · {stats.total} totali
              {stats.filtered ? ` · ${stats.filtered} filtrate` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || stats.unread === 0}
                onClick={markAll}
                className="inline-flex items-center gap-1.5 rounded-full bg-crema/6 px-3 py-1.5 text-xs font-semibold text-crema/65 ring-1 ring-sand/15 hover:text-crema disabled:opacity-40"
              >
                <CheckCheck className="size-3.5" />
                <span className="hidden sm:inline">Segna lette</span>
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2" ref={prefsHost}>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Vista notifiche">
              <Pill on={filter === "all"} onClick={() => setFilter("all")}>
                Tutte
              </Pill>
              <Pill on={filter === "unread"} onClick={() => setFilter("unread")}>
                Non lette
              </Pill>
              <Pill on={filter === "filtered"} onClick={() => setFilter("filtered")}>
                Filtrate
                {stats.filtered ? <span className="lining-nums">({stats.filtered})</span> : null}
              </Pill>
            </div>
            <NotifPrefs token={token} isStaff={staffKnown} open={prefsOpen} onOpenChange={setPrefsOpen} />
            <button
              type="button"
              disabled={busy || !(items && items.length)}
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/6 px-3.5 py-1.5 text-sm font-semibold text-crema/65 ring-1 ring-sand/15 hover:text-crema disabled:opacity-40"
              aria-label="Elimina tutte le notifiche"
            >
              <Trash2 className="size-3.5" />
              <span className="hidden sm:inline">Elimina tutte</span>
            </button>
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl bg-caramel/10 px-4 py-3 text-sm text-crema/75 ring-1 ring-caramel/25">{error}</p>
          ) : null}

          <ul className="mt-6 space-y-3" role="list">
            {items === null ? (
              <li>
                <BoardSkeleton />
              </li>
            ) : buckets.length === 0 ? (
              <li>
                <EmptyState icon={BellOff} title="Niente in arrivo" text="Nessuna notifica da mostrare." />
              </li>
            ) : (
              buckets.map((cat) => (
                <CategoryBlock
                  key={cat.id}
                  id={cat.id}
                  label={cat.label}
                  items={cat.items}
                  open={Boolean(openCats[cat.id])}
                  onToggle={() => setOpenCats((o) => ({ ...o, [cat.id]: !o[cat.id] }))}
                  onClear={() => clearCategory(cat.id)}
                  onOpen={openOne}
                  onDelete={removeOne}
                />
              ))
            )}
          </ul>
        </>
      )}

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-roast px-5 py-2.5 text-sm font-medium text-crema shadow-lg ring-1 ring-sand/25"
            role="status"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
