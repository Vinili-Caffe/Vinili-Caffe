"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Bot, Check, ChevronDown, Flag, Inbox, LogIn, MessageSquareWarning, Pause, Server, Shield, Star, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  kindLabel,
  labelOf,
  loadBoardsConfig,
  modDecide,
  modListPending,
  modListReports,
  modResolveReport,
  type BoardListing,
  type BoardReportItem,
  type BoardsConfig,
  type ModReportAction,
} from "@/lib/boards";
import { timeAgo } from "@/lib/time";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { confirmDialog, promptDialog, showToast } from "@/components/ui";
import { SmartLink } from "../SmartLink";
import { DiscordContent } from "../discord/DiscordContent";

const TABS = [
  { id: "pending", label: "In revisione" },
  { id: "reports", label: "Segnalazioni" },
  { id: "rejected", label: "Rifiutate" },
  { id: "suspended", label: "Sospese" },
  { id: "approved", label: "Pubblicate" },
] as const;
type Tab = (typeof TABS)[number]["id"];
type KindFilter = "" | "server" | "bot";
type ReportTarget = "" | "listing" | "review";

function useModQuery() {
  const [tab, setTabState] = useState<Tab>("pending");
  const [focusId, setFocusId] = useState("");
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      const t = p.get("tab");
      if (t === "reports" || t === "pending" || t === "rejected" || t === "suspended" || t === "approved") setTabState(t);
      setFocusId(p.get("id") || "");
    } catch {
      /* ignore */
    }
  }, []);
  function setTab(next: Tab) {
    setTabState(next);
    try {
      const u = new URL(location.href);
      if (next === "pending") u.searchParams.delete("tab");
      else u.searchParams.set("tab", next);
      history.replaceState(history.state, "", u.toString());
    } catch {
      /* ignore */
    }
  }
  return [tab, setTab, focusId] as const;
}

/** Coda di moderazione della vetrina (solo staff). */
export function ModQueue() {
  const { ready, token, login } = useAuth();
  const [tab, setTab, focusId] = useModQuery();
  const focusDone = useRef(false);
  const [kind, setKind] = useState<KindFilter>("");
  const [reportTarget, setReportTarget] = useState<ReportTarget>("");
  const [list, setList] = useState<BoardListing[] | null>(null);
  const [reports, setReports] = useState<BoardReportItem[] | null>(null);
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(() => {
    if (!ready || !token) return;
    setErr("");
    if (tab === "reports") {
      setReports(null);
      void modListReports(token, "open", kind, reportTarget).then((r) => {
        if (!r.ok) {
          setErr(r.message);
          setReports([]);
          showToast(r.message, true);
          return;
        }
        setReports(r.data.items || []);
      });
      return;
    }
    setList(null);
    void modListPending(token, tab, kind).then((r) => {
      if (!r.ok) {
        setErr(r.message);
        setList([]);
        showToast(r.message, true);
        return;
      }
      setList(r.data.listings || []);
    });
  }, [ready, token, tab, kind, reportTarget]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    focusDone.current = false;
  }, [focusId, tab]);

  useEffect(() => {
    if (!focusId || focusDone.current) return;
    const readyList = tab === "reports" ? reports : list;
    if (!readyList) return;
    const tick = window.setTimeout(() => {
      const el = document.querySelector(`[data-report-id="${CSS.escape(focusId)}"], [data-listing-id="${CSS.escape(focusId)}"]`);
      if (!el) return;
      focusDone.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(tick);
  }, [focusId, tab, list, reports]);

  useEffect(() => {
    if (ready) void loadBoardsConfig("", token).then((c) => c && setCfg(c));
  }, [ready, token]);

  if (ready && !token) {
    return (
      <section className="mx-auto max-w-md px-6 pb-28 text-center">
        <Shield className="mx-auto size-12 text-caramel" />
        <p className="mt-4 font-display text-4xl">Area staff</p>
        <p className="mt-2 text-crema/60">La coda di moderazione è riservata allo staff. Accedi con Discord.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </section>
    );
  }

  async function decide(item: BoardListing, decision: "approve" | "reject" | "suspend", notes = "") {
    if (!token) return;
    let reason = "";
    if (decision !== "approve") {
      reason =
        (await promptDialog({
          title: decision === "reject" ? `Rifiuta “${item.name}”` : `Sospendi “${item.name}”`,
          inputLabel: "Motivo (lo vede il proprietario)",
          placeholder: decision === "reject" ? "Cosa deve correggere per essere approvata?" : "Perché la sospendi?",
          multiline: true,
        })) || "";
      if (reason.trim().length < 3) {
        showToast("Scrivi un motivo di almeno 3 caratteri.", true);
        return;
      }
    }
    setBusy(item.id + decision);
    const r = await modDecide(token, item.id, decision, reason.trim(), notes.trim());
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || (decision === "approve" ? `“${item.name}” è in vetrina` : decision === "reject" ? "Scheda rifiutata" : "Scheda sospesa"));
    setList((prev) => (prev ? prev.filter((x) => x.id !== item.id) : prev));
  }

  async function resolveReport(item: BoardReportItem, decision: "resolve" | "dismiss", action: ModReportAction = "") {
    if (!token) return;
    const isReview = item.reportKind === "review";
    if (action === "suspend_listing") {
      if (
        !(await confirmDialog({
          title: `Sospendere «${item.listingName}»?`,
          message: "La scheda esce dalla vetrina pubblica. Il proprietario vede il motivo.",
          danger: true,
          confirmLabel: "Sospendi scheda",
        }))
      ) {
        return;
      }
    }
    if (action === "delete_review") {
      if (
        !(await confirmDialog({
          title: "Eliminare la recensione?",
          message: "La recensione sparisce dalla scheda e non si può annullare.",
          danger: true,
          confirmLabel: "Elimina recensione",
        }))
      ) {
        return;
      }
    }
    const note =
      (await promptDialog({
        title:
          action === "suspend_listing"
            ? "Motivo sospensione"
            : action === "delete_review"
              ? "Nota (opzionale)"
              : decision === "dismiss"
                ? "Archivia segnalazione"
                : "Segnalazione gestita",
        inputLabel: action === "suspend_listing" ? "Motivo (lo vede il proprietario)" : "Nota interna (opzionale)",
        placeholder:
          action === "suspend_listing"
            ? "Perché sospendi la scheda?"
            : action === "delete_review"
              ? "Es. spam, insulti…"
              : isReview
                ? "Esito sulla recensione…"
                : "Esito, azioni fatte…",
        multiline: true,
      })) || "";
    if (action === "suspend_listing" && note.trim().length < 3) {
      showToast("Scrivi un motivo di almeno 3 caratteri per il proprietario.", true);
      return;
    }
    setBusy(item.id + (action || decision));
    const r = await modResolveReport(token, item.id, action ? "resolve" : decision, note.trim(), action);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast(
      r.data.message ||
        (action === "suspend_listing"
          ? "Scheda sospesa."
          : action === "delete_review"
            ? "Recensione eliminata."
            : decision === "dismiss"
              ? "Segnalazione archiviata."
              : "Segnalazione gestita."),
    );
    setReports((prev) => (prev ? prev.filter((x) => x.id !== item.id) : prev));
  }

  const count = tab === "reports" ? reports?.length : list?.length;

  return (
    <section className="mx-auto max-w-5xl px-4 pb-28 sm:px-6">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              tab === t.id ? "bg-crema text-ink" : "bg-roast text-crema/55 ring-1 ring-sand/12 hover:text-crema",
            )}
          >
            {t.label}
            {tab === t.id && count != null ? <span className="ml-1.5 rounded-full bg-ink/15 px-1.5 text-xs tabular-nums">{count}</span> : null}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/40">Tipo</span>
        {(
          [
            { id: "" as KindFilter, label: "Tutti", icon: null },
            { id: "server" as KindFilter, label: "Server", icon: Server },
            { id: "bot" as KindFilter, label: "Bot", icon: Bot },
          ] as const
        ).map((k) => {
          const Icon = k.icon;
          return (
            <button
              key={k.id || "all"}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                kind === k.id ? "bg-caramel/20 text-ember ring-1 ring-caramel/40" : "bg-crema/5 text-crema/55 ring-1 ring-sand/12 hover:text-crema",
              )}
            >
              {Icon ? <Icon className="size-3.5" /> : null}
              {k.label}
            </button>
          );
        })}
        {tab === "reports" ? (
          <>
            <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/40">Oggetto</span>
            {(
              [
                { id: "" as ReportTarget, label: "Tutto" },
                { id: "listing" as ReportTarget, label: "Schede" },
                { id: "review" as ReportTarget, label: "Recensioni" },
              ] as const
            ).map((t) => (
              <button
                key={t.id || "all-target"}
                type="button"
                aria-pressed={reportTarget === t.id}
                onClick={() => setReportTarget(t.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  reportTarget === t.id ? "bg-caramel/20 text-ember ring-1 ring-caramel/40" : "bg-crema/5 text-crema/55 ring-1 ring-sand/12 hover:text-crema",
                )}
              >
                {t.label}
              </button>
            ))}
          </>
        ) : null}
      </div>

      {err && <p className="mb-4 rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/25">{err}</p>}

      {tab === "reports" ? (
        !reports ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-3xl bg-roast/60" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-sand/20 p-12 text-center">
            <Flag className="mx-auto size-10 text-sand/40" />
            <p className="mt-3 font-display text-3xl text-crema/85">Nessuna segnalazione</p>
            <p className="mt-1 text-crema/50">La coda è vuota con i filtri attuali.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {reports.map((item) => (
              <ReportCard key={item.id} item={item} busy={busy} focused={focusId === item.id || focusId === item.listingId} onResolve={resolveReport} />
            ))}
          </ul>
        )
      ) : !list ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl bg-roast/60" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-sand/20 p-12 text-center">
          <Inbox className="mx-auto size-10 text-sand/40" />
          <p className="mt-3 font-display text-3xl text-crema/85">{tab === "pending" ? "Coda vuota" : "Niente qui"}</p>
          <p className="mt-1 text-crema/50">{tab === "pending" ? "Nessuna scheda da controllare. Ottimo lavoro." : "Nessuna scheda in questo stato."}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {list.map((item) => (
              <ModCard key={item.id} item={item} cfg={cfg} tab={tab as Exclude<Tab, "reports">} busy={busy} focused={focusId === item.id} onDecide={decide} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function ReportCard({
  item,
  busy,
  focused,
  onResolve,
}: {
  item: BoardReportItem;
  busy: string;
  focused?: boolean;
  onResolve: (item: BoardReportItem, d: "resolve" | "dismiss", action?: ModReportAction) => void;
}) {
  const isReview = item.reportKind === "review";
  const KindIcon = item.listingKind === "bot" ? Bot : Server;
  const locked = busy.startsWith(item.id);
  const schedaHref = item.listingSlug || item.listingId
    ? page(`/vetrina/scheda/?slug=${encodeURIComponent(item.listingSlug || item.listingId)}${isReview ? "#recensioni" : ""}`)
    : "";
  const listingStatus = String(item.listingStatus || "");
  const canSuspend = Boolean(item.listingId) && listingStatus !== "suspended" && listingStatus !== "rejected";
  const canDeleteReview = isReview && Boolean(item.reviewId);
  return (
    <li
      data-report-id={item.id}
      data-listing-id={item.listingId || undefined}
      className={cn("overflow-hidden rounded-3xl bg-roast p-5 ring-1 sm:p-6", focused ? "ring-2 ring-ember shadow-[0_0_0_4px_rgba(217,154,91,0.2)]" : "ring-sand/12")}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-espresso ring-1 ring-sand/15">
          {item.listingIconUrl ? (
             
            <img src={item.listingIconUrl} alt="" className="size-full object-cover" />
          ) : isReview ? (
            <MessageSquareWarning className="size-6 text-ember" />
          ) : (
            <Flag className="size-6 text-ember" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em]",
                isReview ? "bg-caramel/15 text-ember ring-1 ring-caramel/30" : "bg-ember/15 text-ember ring-1 ring-ember/30",
              )}
            >
              {isReview ? "Recensione" : "Scheda"}
            </span>
            {item.listingKind ? (
              <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/40">
                <KindIcon className="size-3" /> {kindLabel(item.listingKind)}
              </span>
            ) : null}
            {listingStatus ? (
              <span className="rounded-full bg-crema/8 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-crema/50 ring-1 ring-sand/15">
                {listingStatus}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.16em] text-ember">{item.categoryLabel}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-crema">{item.listingName}</p>
          {isReview && (item.reviewSnippet || item.reviewAuthor) ? (
            <blockquote className="mt-3 rounded-2xl border-l-2 border-ember/50 bg-espresso/50 px-4 py-3">
              <p className="flex flex-wrap items-center gap-2 text-xs text-crema/45">
                {item.reviewAuthor ? <span className="font-semibold text-crema/70">{item.reviewAuthor}</span> : null}
                {item.reviewRating ? (
                  <span className="inline-flex items-center gap-0.5 text-ember">
                    <Star className="size-3 fill-ember" /> {item.reviewRating}
                  </span>
                ) : null}
              </p>
              {item.reviewSnippet ? <p className="mt-1.5 text-sm leading-relaxed text-crema/75 [overflow-wrap:anywhere]">{item.reviewSnippet}</p> : null}
            </blockquote>
          ) : null}
          <p className="mt-3 whitespace-pre-wrap text-sm text-crema/70 [overflow-wrap:anywhere]">
            <span className="font-semibold text-crema/85">Motivo: </span>
            {item.reason}
          </p>
          <p className="mt-2 text-xs text-crema/40">
            da {item.reporterName || item.reporterId || "utente"} · {item.createdAt ? timeAgo(item.createdAt) : ""}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-sand/10 pt-4">
        {schedaHref ? (
          <SmartLink href={schedaHref} className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold ring-1 ring-sand/20">
            {isReview ? "Apri recensioni" : "Apri scheda"} <ArrowUpRight className="size-3.5" />
          </SmartLink>
        ) : null}
        {canSuspend ? (
          <button
            type="button"
            disabled={locked}
            onClick={() => void onResolve(item, "resolve", "suspend_listing")}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#a83a2c]/25 px-4 py-2 text-sm font-bold text-[#f0b4a8] ring-1 ring-[#a83a2c]/45 transition hover:bg-[#a83a2c]/35 disabled:opacity-50"
          >
            <Pause className="size-4" /> Sospendi scheda
          </button>
        ) : null}
        {canDeleteReview ? (
          <button
            type="button"
            disabled={locked}
            onClick={() => void onResolve(item, "resolve", "delete_review")}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#a83a2c]/25 px-4 py-2 text-sm font-bold text-[#f0b4a8] ring-1 ring-[#a83a2c]/45 transition hover:bg-[#a83a2c]/35 disabled:opacity-50"
          >
            <X className="size-4" /> Elimina recensione
          </button>
        ) : null}
        <button
          type="button"
          disabled={locked}
          onClick={() => void onResolve(item, "resolve")}
          className="rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-bold text-ink disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-4" /> Segnata come gestita
          </span>
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => void onResolve(item, "dismiss")}
          className="rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/70 ring-1 ring-sand/15 disabled:opacity-50"
        >
          Falso allarme · archivia
        </button>
      </div>
    </li>
  );
}

function ModCard({
  item,
  cfg,
  tab,
  busy,
  focused,
  onDecide,
}: {
  item: BoardListing;
  cfg: BoardsConfig | null;
  tab: Exclude<Tab, "reports">;
  busy: string;
  focused?: boolean;
  onDecide: (item: BoardListing, d: "approve" | "reject" | "suspend", notes?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mod = item.moderation;
  const [notes, setNotes] = useState(mod?.notes || "");
  const accent = /^#[0-9a-f]{6}$/i.test(item.accent || "") ? item.accent : "#d99a5b";
  const invite = item.kind === "bot" ? item.botInviteUrl : item.inviteUrl;
  const KindIcon = item.kind === "bot" ? Bot : Server;
  const reason = item.moderation?.rejectReason;
  const history = mod?.history?.filter((h) => h.decision || h.notes || h.reason) || [];
  return (
    <motion.li
      layout
      data-listing-id={item.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className={cn("overflow-hidden rounded-3xl bg-roast ring-1", focused ? "ring-2 ring-ember shadow-[0_0_0_4px_rgba(217,154,91,0.2)]" : "ring-sand/12")}
    >
      <div className="h-2" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-sand/20" style={{ background: `${accent}44` }}>
            {item.iconUrl ? (
               
              <img src={item.iconUrl} alt="" className="size-full object-cover" />
            ) : (
              <KindIcon className="size-7 text-crema/60" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">
              <KindIcon className="size-3.5" /> {kindLabel(item.kind)}
              {item.nsfw && <span className="rounded bg-[#a83a2c] px-1.5 tracking-wider text-crema">18+</span>}
              {item.updatedAt ? <span className="normal-case tracking-normal text-crema/35">· aggiornata {timeAgo(item.updatedAt)}</span> : null}
            </p>
            <p className="mt-0.5 font-display text-3xl font-semibold leading-tight">{item.name || "Senza nome"}</p>
            {item.tagline && <p className="mt-1 text-crema/65">{item.tagline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {item.categories.map((c) => (
                <span key={c} className="rounded-full bg-crema/8 px-2 py-0.5 ring-1 ring-sand/12">
                  {labelOf(cfg?.categoryLabels, c)}
                </span>
              ))}
              {item.locales.map((l) => (
                <span key={l} className="rounded-full bg-crema/5 px-2 py-0.5 text-crema/55 ring-1 ring-sand/10">
                  {labelOf(cfg?.localeLabels, l)}
                </span>
              ))}
              {item.tags.slice(0, 8).map((t) => (
                <span key={t} className="text-crema/45">
                  #{t}
                </span>
              ))}
            </div>
          </div>
          {(item.authorName || item.authorAvatarUrl) && (
            <div className="flex items-center gap-2 text-sm">
              {item.authorAvatarUrl ? (
                 
                <img src={item.authorAvatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : null}
              <span className="text-crema/60">{item.authorName}</span>
            </div>
          )}
        </div>

        {reason && tab !== "pending" && <p className="mt-4 rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/20">Motivo: {reason}</p>}

        {mod?.reviewedAt ? (
          <p className="mt-3 text-xs text-crema/45">
            Ultima revisione {timeAgo(mod.reviewedAt)}
            {mod.reviewedBy ? <span className="font-mono text-crema/35"> · staff {mod.reviewedBy}</span> : null}
          </p>
        ) : null}

        {history.length > 0 ? (
          <ul className="mt-3 space-y-1.5 border-l border-sand/15 pl-3">
            {history.slice(0, 8).map((h, i) => (
              <li key={`${h.at || i}-${h.decision}`} className="text-xs text-crema/55">
                <span className="font-semibold capitalize text-crema/75">{h.decision || "nota"}</span>
                {h.at ? <span className="text-crema/40"> · {timeAgo(h.at)}</span> : null}
                {h.reason ? <span className="block text-crema/50">Motivo: {h.reason}</span> : null}
                {h.notes ? <span className="block text-crema/45">{h.notes}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-crema/55 hover:text-crema">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /> {open ? "Nascondi descrizione" : "Leggi la descrizione"}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 max-h-96 overflow-y-auto rounded-2xl bg-espresso/60 p-4 text-sm leading-relaxed text-crema/80 ring-1 ring-sand/10">
                {item.description ? <DiscordContent text={item.description} /> : <span className="text-crema/40">Nessuna descrizione.</span>}
                {item.visitorNotes ? <p className="mt-3 border-t border-sand/10 pt-3 text-crema/60">Note: {item.visitorNotes}</p> : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-crema/45">Nota interna · solo staff</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="Appunti per gli altri dello staff (il proprietario non la vede)"
            className="mt-1.5 w-full resize-y rounded-xl bg-espresso/60 px-3 py-2 text-sm text-crema/85 ring-1 ring-sand/15 outline-none placeholder:text-crema/30 focus:ring-caramel/50"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand/10 pt-4">
          {tab !== "approved" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onDecide(item, "approve", notes)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#5f9a6a]/25 px-4 py-2 text-sm font-bold text-[#a7d8b0] ring-1 ring-[#5f9a6a]/45 transition hover:bg-[#5f9a6a]/35 disabled:opacity-50"
            >
              <Check className="size-4" /> Approva
            </button>
          )}
          {tab === "pending" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onDecide(item, "reject", notes)}
              className="inline-flex items-center gap-1.5 rounded-full bg-ember/15 px-4 py-2 text-sm font-bold text-ember ring-1 ring-ember/30 transition hover:bg-ember/25 disabled:opacity-50"
            >
              <X className="size-4" /> Rifiuta
            </button>
          )}
          {tab !== "suspended" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onDecide(item, "suspend", notes)}
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 transition hover:text-crema disabled:opacity-50"
            >
              <Pause className="size-4" /> Sospendi
            </button>
          )}
          <span className="ml-auto flex flex-wrap gap-3 text-sm">
            {invite ? (
              <a href={invite} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-crema/55 hover:text-ember">
                Invito <ArrowUpRight className="size-3.5" />
              </a>
            ) : (
              <span className="text-crema/35">Nessun invito</span>
            )}
            {item.slug && (
              <SmartLink href={page(`/vetrina/scheda/?slug=${encodeURIComponent(item.slug)}`)} className="inline-flex items-center gap-1 text-crema/55 hover:text-ember">
                Apri scheda <ArrowUpRight className="size-3.5" />
              </SmartLink>
            )}
          </span>
        </div>
      </div>
    </motion.li>
  );
}
