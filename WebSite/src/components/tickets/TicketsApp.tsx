"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Inbox, MessageSquarePlus, Search, Ticket as TicketIcon, User, X } from "lucide-react";
import { AuthGateCard } from "@/components/AuthGateCard";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { isSiteRealtimeConnected, loadDetail, loadList, markRead, ownTypingAt, subscribeRealtime, ticketTime, type Category, type Detail, type ListData, type Ticket } from "@/lib/tickets";
import { cn } from "@/lib/cn";
import { setChromeOpen } from "@/lib/chrome-open";
import { readDeepLink } from "@/lib/deeplink";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { Pagination } from "@/components/ui/Pagination";
import { NewTicket } from "./NewTicket";
import { TicketChat } from "./TicketChat";

type Scope = "mine" | "staff";
const STAFF_FILTERS = [
  { id: "open", label: "Aperti" },
  { id: "unclaimed", label: "Da prendere" },
  { id: "mine", label: "In carico a me" },
  { id: "closed", label: "Chiusi" },
];

const STATUS_DOT: Record<string, string> = { open: "bg-ember", claimed: "bg-[#5f9a6a]", closed: "bg-crema/25" };

function filterTicketsBySearch(tickets: Ticket[], q: string): Ticket[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return tickets;
  return tickets.filter((t) => {
    const num = String(t.ticketNumber ?? "").padStart(4, "0");
    const hay = [t.displayName, num, `#${num}`, t.categoryLabel, t.lastMessagePreview].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}

function Row({ t, active, onClick }: { t: Ticket; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active}
        className={cn("flex w-full gap-3 rounded-2xl p-3 text-left transition-colors", active ? "bg-crema/[0.09] ring-1 ring-caramel/40" : "hover:bg-crema/[0.05]")}
      >
        <span className="relative block size-10 shrink-0">
          <Avatar userId={t.userId} src={t.authorAvatarUrl} name={t.authorName} className="size-10 text-sm" />
          <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-roast", STATUS_DOT[t.status] ?? "bg-ember")} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-semibold">{t.displayName}</span>
            <span className="ml-auto shrink-0 text-[0.7rem] text-crema/40">{ticketTime(t.lastMessageAt || t.createdAt)}</span>
          </span>
          <span className="block truncate text-xs text-crema/45">
            #{String(t.ticketNumber ?? "").padStart(4, "0")} · {t.categoryLabel}
            {t.claimedByName && t.status !== "closed" ? ` · ${t.claimedByName}` : ""}
          </span>
          {t.lastMessagePreview && <span className="mt-0.5 block truncate text-sm text-crema/60">{t.lastMessagePreview}</span>}
        </span>
      </button>
    </li>
  );
}

function ListChrome({
  scope,
  setScope,
  filter,
  setFilter,
  list,
  listErr,
  tickets,
  selected,
  hasOpenOwn,
  pageNum,
  onPage,
  onNew,
  onSelect,
  listSearch,
  setListSearch,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  filter: string;
  setFilter: (f: string) => void;
  list: ListData | null;
  listErr: string;
  tickets: Ticket[];
  selected: string | null;
  hasOpenOwn: boolean;
  pageNum: number;
  onPage: (p: number) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  listSearch: string;
  setListSearch: (q: string) => void;
}) {
  const { t } = useI18n();
  const totalPages = Math.max(1, Number(list?.totalPages) || 1);
  const pageSafe = Math.min(Math.max(1, pageNum), totalPages);
  const searchActive = scope === "staff" && listSearch.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-sand/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-xl font-semibold">{t("tickets.listTitle")}</p>
          {!hasOpenOwn && scope === "mine" && (
            <button type="button" onClick={onNew} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-3.5 py-1.5 text-sm font-semibold text-ink">
              <MessageSquarePlus className="size-4" /> {t("tickets.new")}
            </button>
          )}
        </div>
        {list?.staffAccess && (
          <div className="grid grid-cols-2 rounded-full bg-black/25 p-1 text-sm font-semibold ring-1 ring-crema/10">
            {(["mine", "staff"] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scope === s}
                onClick={() => setScope(s)}
                className={cn("inline-flex items-center justify-center gap-1.5 rounded-full py-1.5 transition-colors", scope === s ? "bg-crema text-espresso" : "text-crema/70 hover:text-crema")}
              >
                {s === "staff" ? <Inbox className="size-4" /> : <User className="size-4" />} {s === "staff" ? "Staff" : t("tickets.scopeMine")}
              </button>
            ))}
          </div>
        )}
        {scope === "staff" && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {STAFF_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-xl px-2.5 py-2 text-center text-[0.8rem] font-semibold leading-tight ring-1 transition-colors",
                    filter === f.id ? "bg-caramel text-ink ring-caramel" : "bg-crema/10 text-crema ring-sand/25 hover:bg-crema/15",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 rounded-xl bg-espresso/70 px-3 ring-1 ring-sand/15 focus-within:ring-caramel/60">
              <Search className="size-4 shrink-0 text-crema/40" aria-hidden />
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={t("tickets.searchPlaceholder")}
                aria-label={t("tickets.searchPlaceholder")}
                className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-crema/35"
              />
              {listSearch && (
                <button type="button" aria-label="Cancella ricerca" onClick={() => setListSearch("")} className="rounded-full p-1 text-crema/45 hover:bg-crema/8 hover:text-crema">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
          </>
        )}
      </div>
      <ul id="tickets-list" className="min-h-0 flex-1 space-y-1 overflow-y-auto scroll-mt-28 p-2">
        {list === null && [0, 1, 2, 3].map((i) => <li key={i} className="m-1 h-16 animate-pulse rounded-2xl bg-crema/[0.05]" />)}
        {list && tickets.length === 0 && (
          <li className="p-6 text-center text-sm text-crema/50">
            {searchActive ? "Nessun ticket corrisponde alla ricerca." : scope === "staff" ? "Nessun ticket in questa vista." : t("tickets.emptyMine")}
          </li>
        )}
        {tickets.map((t) => (
          <Row key={t.id} t={t} active={t.id === selected} onClick={() => onSelect(t.id)} />
        ))}
      </ul>
      {listErr && <p className="m-3 shrink-0 rounded-xl bg-[#a83a2c]/15 px-3 py-2 text-xs text-[#f0a493] light:text-[#a83a2c]">{listErr}</p>}
      {list && totalPages > 1 && (
        <div className="shrink-0 border-t border-sand/10 px-1 pb-2">
          <Pagination page={pageSafe} totalPages={totalPages} onChange={onPage} scrollToId="tickets-list" className="mt-3" />
        </div>
      )}
    </div>
  );
}

function PaneBody({
  creating,
  selected,
  detail,
  detailErr,
  token,
  categories,
  typingNames,
  isStaff,
  hasOpenOwn,
  scope,
  staffView,
  onBack,
  onCreated,
  onCreate,
  refreshDetail,
  refreshList,
}: {
  creating: boolean;
  selected: string | null;
  detail: Detail | null;
  detailErr: string;
  token: string;
  categories: Category[];
  typingNames: string[];
  isStaff: boolean;
  hasOpenOwn: boolean;
  scope: Scope;
  staffView: boolean;
  onBack: () => void;
  onCreated: (t: Ticket) => void;
  onCreate: () => void;
  refreshDetail: () => void;
  refreshList: () => void;
}) {
  const { t } = useI18n();
  if (creating) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NewTicket token={token} categories={categories} isStaff={isStaff} onCancel={onBack} onCreated={onCreated} />
      </div>
    );
  }
  if (selected) {
    if (detail && detail.ticket.id === selected) {
      return (
        <div
          id={`ticket-${selected}`}
          data-deeplink={`ticketId:${selected} id:${selected}`}
          className="flex min-h-0 flex-1 flex-col scroll-mt-28"
        >
          <TicketChat
            token={token}
            detail={detail}
            categories={categories}
            typing={typingNames}
            staffView={staffView}
            onBack={onBack}
            reload={() => (refreshDetail(), refreshList())}
          />
        </div>
      );
    }
    if (detailErr) {
      return (
        <div className="m-auto max-w-sm p-6 text-center">
          <p className="font-display text-2xl font-semibold">Ticket non disponibile</p>
          <p className="mt-2 text-sm text-crema/55">{detailErr}</p>
          <button type="button" onClick={onBack} className="mt-4 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25">
            Torna alla lista
          </button>
        </div>
      );
    }
    /* ticketSwitchSteady1: stessa forma della chat (testata, messaggi, campo di scrittura) mentre carica,
       così passando da un ticket all'altro testata e campo non spariscono e ricompaiono */
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" aria-busy="true" aria-label="Apro il ticket…">
        <div className="shrink-0 border-b border-dashed border-sand/20 bg-roast/60 px-4 py-3 sm:px-6">
          <div className="h-6 w-48 animate-pulse rounded-md bg-crema/10" />
          <div className="mt-1.5 h-3.5 w-32 animate-pulse rounded bg-crema/[0.07]" />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-3 py-5 sm:px-6">
          {[60, 40, 72, 48].map((w, i) => (
            <div key={i} className={i % 2 ? "flex justify-end" : "flex"}>
              <div className="h-12 animate-pulse rounded-2xl bg-crema/[0.06]" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-sand/10 bg-roast/60 p-3 sm:p-4">
          <div className="h-11 animate-pulse rounded-2xl bg-crema/[0.06]" />
        </div>
      </div>
    );
  }
  return (
    <div className="m-auto max-w-sm p-8 text-center">
      <TicketIcon className="mx-auto size-12 text-caramel/70" />
      <p className="mt-4 font-display text-3xl font-semibold">{scope === "mine" ? t("tickets.emptyPaneTitle") : "Nessun ticket aperto"}</p>
      <p className="mt-2 text-crema/55">
        {scope === "staff"
          ? "Scegli un ticket dalla lista."
          : hasOpenOwn
            ? t("tickets.emptyPanePick")
            : t("tickets.emptyPanePickOrNew")}
      </p>
      {!hasOpenOwn && scope === "mine" && (
        <button type="button" onClick={onCreate} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <MessageSquarePlus className="size-4" /> {t("tickets.openTicket")}
        </button>
      )}
    </div>
  );
}

/** I ticket: lista + chat. Su telefono lista in pagina, chat a schermo intero. */
export function TicketsApp() {
  const { ready, token } = useAuth();
  const { t } = useI18n();
  const [scope, setScope] = useState<Scope>("mine");
  const [filter, setFilter] = useState("open");
  const [pageNum, setPageNum] = useState(1);
  const [list, setList] = useState<ListData | null>(null);
  const [listErr, setListErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [listSearch, setListSearch] = useState("");
  const selRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  selRef.current = selected;

  useEffect(() => {
    const applyFromUrl = () => {
      const d = readDeepLink();
      if (d.viewStaff || d.inbox) setScope("staff");
      if (d.ticketId) {
        setCreating(false);
        setSelected(d.ticketId);
      }
    };
    applyFromUrl();
    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, []);

  const refreshList = useCallback(async () => {
    if (!token) return;
    const r = await loadList(token, {
      page: pageNum,
      ...(scope === "staff" ? { scope: "staff" as const, status: filter } : {}),
    });
    if (!r.ok) return setListErr(r.message);
    setListErr("");
    setList(r.data);
    if (r.data.categories?.length) setCategories(r.data.categories);
    // se la pagina richiesta non esiste più (es. ticket chiusi), torna indietro
    const tp = Math.max(1, Number(r.data.totalPages) || 1);
    if (pageNum > tp) setPageNum(tp);
  }, [token, scope, filter, pageNum]);

  const refreshDetail = useCallback(async () => {
    const id = selRef.current;
    if (!token || !id) return;
    const r = await loadDetail(token, id);
    if (selRef.current !== id) return;
    if (!r.ok) return setDetailErr(r.message);
    setDetailErr("");
    setDetail(r.data);
    const unread = r.data.messages.filter((m) => m.authorId !== r.data.viewerId && m.authorKind !== "system").map((m) => m.id);
    if (unread.length) void markRead(token, id, unread.slice(-50));
  }, [token]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    setDetail(null);
    setDetailErr("");
    setTyping({});
    if (selected) void refreshDetail();
  }, [selected, refreshDetail]);

  useEffect(() => {
    if (!token) return;
    let tList: ReturnType<typeof setTimeout> | null = null;
    let tDetail: ReturnType<typeof setTimeout> | null = null;
    const soonList = () => (tList && clearTimeout(tList), (tList = setTimeout(() => void refreshList(), 400)));
    const soonDetail = () => (tDetail && clearTimeout(tDetail), (tDetail = setTimeout(() => void refreshDetail(), 250)));
    const off = subscribeRealtime((p) => {
      if (p.type === "web_ticket_typing") {
        if (p.ticketId !== selRef.current || Date.now() - ownTypingAt() < 5000) return;
        setTyping(p.stop ? {} : { someone: { name: "Qualcuno", at: Date.now() } });
        return;
      }
      // spunte: aggiorna subito i miei messaggi senza aspettare il reload
      if (p.type === "web_ticket_receipts" && p.ticketId && p.ticketId === selRef.current && p.messageIds?.length) {
        const ids = new Set(p.messageIds.map(String));
        setDetail((cur) => {
          if (!cur || cur.ticket.id !== p.ticketId) return cur;
          let changed = false;
          const messages = cur.messages.map((m) => {
            if (!ids.has(String(m.id)) || m.authorId !== cur.viewerId) return m;
            if (m.receiptStatus === "read") return m;
            changed = true;
            return { ...m, receiptStatus: "read" as const };
          });
          return changed ? { ...cur, messages } : cur;
        });
        return;
      }
      soonList();
      if (!p.ticketId || p.ticketId === selRef.current) soonDetail();
    });
    const schedulePoll = () => {
      const ms = isSiteRealtimeConnected() ? 60_000 : 20_000;
      pollRef.current = setTimeout(() => {
        if (document.visibilityState === "visible" && !document.hidden) {
          void refreshList();
          void refreshDetail();
        }
        schedulePoll();
      }, ms);
    };
    schedulePoll();
    const vis = () => {
      if (document.visibilityState !== "visible" || document.hidden) return;
      void refreshList();
      void refreshDetail();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      off();
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = null;
      document.removeEventListener("visibilitychange", vis);
      if (tList) clearTimeout(tList);
      if (tDetail) clearTimeout(tDetail);
    };
  }, [token, refreshList, refreshDetail]);

  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const id = setTimeout(() => setTyping((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => Date.now() - v.at < 6000))), 6000);
    return () => clearTimeout(id);
  }, [typing]);

  const showRight = !!selected || creating;

  useBodyScrollLock(showRight, { mobileOnly: true });

  useEffect(() => {
    setChromeOpen("tickets-pane", showRight);
    return () => setChromeOpen("tickets-pane", false);
  }, [showRight]);

  const writeTicketUrl = (id: string | null) => {
    const u = new URL(location.href);
    u.searchParams.delete("id");
    u.searchParams.delete("ticket");
    u.searchParams.delete("ticketId");
    u.hash = "";
    if (id) u.searchParams.set("ticketId", id);
    if (scope === "staff") u.searchParams.set("view", "staff");
    else u.searchParams.delete("view");
    history.replaceState(null, "", u.pathname + u.search);
    window.dispatchEvent(new Event("vc:notif-page"));
  };

  const select = (id: string) => {
    setCreating(false);
    setSelected(id);
    writeTicketUrl(id);
  };
  const back = () => {
    setSelected(null);
    setCreating(false);
    writeTicketUrl(null);
  };
  const startNew = () => {
    setCreating(true);
    setSelected(null);
    writeTicketUrl(null);
  };
  const onScope = (s: Scope) => {
    if (s === scope) return;
    setScope(s);
    setPageNum(1);
    setList(null);
    setListSearch("");
    // aggiorna ?view=staff se c’è un ticket aperto (deeplink notifiche)
    if (selected) {
      const u = new URL(location.href);
      u.searchParams.set("ticketId", selected);
      u.searchParams.delete("id");
      u.searchParams.delete("ticket");
      if (s === "staff") u.searchParams.set("view", "staff");
      else u.searchParams.delete("view");
      history.replaceState(null, "", u.pathname + u.search);
      window.dispatchEvent(new Event("vc:notif-page"));
    }
  };
  const onFilter = (f: string) => {
    if (f === filter) return;
    setFilter(f);
    setPageNum(1);
    setList(null);
  };
  const onPage = (p: number) => {
    if (p === pageNum) return;
    setPageNum(p);
    setList(null);
    requestAnimationFrame(() => {
      const el = document.getElementById("tickets-list");
      if (el) el.scrollTop = 0;
    });
  };

  /* stesse misure della lista/card vere, così il resto della pagina non si sposta quando arrivano */
  if (!ready)
    return (
      <div className="mx-auto min-h-[22rem] max-w-7xl animate-pulse rounded-[1.5rem] bg-crema/[0.04] lg:h-[min(40rem,calc(100dvh-14rem))] lg:min-h-[28rem] lg:rounded-[2rem]" />
    );
  if (!token)
    return (
      <AuthGateCard title={t("tickets.gateTitle")} text={t("tickets.gateText")} />
    );

  const ticketsRaw = list?.tickets ?? [];
  const tickets = scope === "staff" ? filterTicketsBySearch(ticketsRaw, listSearch) : ticketsRaw;
  const typingNames = Object.values(typing).map((v) => v.name);
  const hasOpenOwn = scope === "mine" && tickets.some((t) => t.userId === list?.viewerId && t.status !== "closed");

  const listProps = {
    scope,
    setScope: onScope,
    filter,
    setFilter: onFilter,
    list,
    listErr,
    tickets,
    selected,
    hasOpenOwn,
    pageNum,
    onPage,
    onNew: startNew,
    onSelect: select,
    listSearch,
    setListSearch,
  };

  const paneProps = {
    creating,
    selected,
    detail,
    detailErr,
    token,
    categories,
    typingNames,
    isStaff: !!list?.isStaff,
    hasOpenOwn,
    scope,
    staffView: scope === "staff",
    onBack: back,
    onCreated: (t: Ticket) => {
      void refreshList();
      select(t.id);
    },
    onCreate: startNew,
    refreshDetail: () => void refreshDetail(),
    refreshList: () => void refreshList(),
  };

  return (
    <>
      {/* Mobile: lista con altezza max così overflow-y sulla lista funziona (prima overflow-hidden senza max-h tagliava senza scroll) */}
      <div className="mx-auto max-w-7xl lg:hidden">
        <div className="flex max-h-[min(36rem,calc(100dvh-12rem))] min-h-[22rem] flex-col overflow-hidden rounded-[1.5rem] bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/15">
          <ListChrome {...listProps} />
        </div>
      </div>

      {/* Desktop: card due colonne */}
      <div className="mx-auto hidden h-[min(40rem,calc(100dvh-14rem))] min-h-[28rem] max-w-7xl overflow-hidden rounded-[2rem] bg-espresso/80 ring-1 ring-sand/15 lg:grid lg:grid-cols-[22rem_1fr]">
        <aside className="flex min-h-0 flex-col border-r border-sand/10 bg-roast/50">
          <ListChrome {...listProps} />
        </aside>
        <section className="flex min-h-0 flex-col">
          <PaneBody {...paneProps} />
        </section>
      </div>

      {/* Mobile: chat / nuovo a schermo intero */}
      <AnimatePresence>
        {showRight && (
          <motion.div
            key={creating ? "new" : selected || "pane"}
            role="dialog"
            aria-modal="true"
            aria-label={creating ? "Nuovo ticket" : "Ticket"}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[55] flex flex-col bg-espresso lg:hidden"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                back();
              }
            }}
          >
            <PaneBody {...paneProps} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
