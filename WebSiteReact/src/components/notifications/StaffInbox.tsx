"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Sheet } from "@/components/staffcard/Sheet";
import { WorkflowChatPanel } from "@/components/staff/WorkflowChatPanel";
import { confirmDialog, promptDialog, showToast } from "@/components/ui";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/cn";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import {
  INBOX_TABS,
  QUEUE_FILTERS,
  SCOPE_FILTERS,
  decideWorkflow,
  itemKey,
  loadWorkflowDetail,
  loadWorkflowQueue,
  loadWorkflowSummary,
  workflowDedupeKey,
  type InboxTabId,
  type WorkflowItem,
  type WorkflowPermissions,
  type WorkflowSummary,
} from "@/lib/staffWorkflows";
import { resolveWorkflowDetailFields, type WorkflowField } from "@/lib/workflow-fields";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { EmojiText } from "@/components/discord/EmojiText";
import { readDeepLink } from "@/lib/deeplink";
import { ShowMoreButton } from "@/components/ui/ShowMore";

const INBOX_LIST_INITIAL = 40;
const INBOX_LIST_STEP = 50;
const INBOX_PAGE_SIZE = 100;

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
        on ? "bg-caramel text-ink" : "bg-crema/6 text-crema/65 ring-1 ring-sand/15 hover:text-crema",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Inbox staff: solo candidature + appelli.
 * Dettaglio in sheet laterale (come sito vecchio), aggiornamento live via WS.
 */
export function StaffInbox({ token }: { token: string }) {
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [perms, setPerms] = useState<WorkflowPermissions>({});
  const [queue, setQueue] = useState<InboxTabId | "">("");
  const [scope, setScope] = useState<string>("pending");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WorkflowItem[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<WorkflowItem | null>(null);
  const [detail, setDetail] = useState<WorkflowItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [listVisible, setListVisible] = useState(INBOX_LIST_INITIAL);
  const inboxDeepLinkApplied = useRef(false);

  useEffect(() => {
    setListVisible(INBOX_LIST_INITIAL);
  }, [queue, scope, filter, page]);

  const tabs = useMemo(
    () =>
      INBOX_TABS.filter((t) => {
        if (t.perm === "always") return true;
        return Boolean(perms[t.perm as keyof WorkflowPermissions]);
      }),
    [perms],
  );

  const pullSummary = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const quiet = Boolean(opts?.quiet);
      const r = await loadWorkflowSummary(token);
      if (!r.ok) {
        if (!quiet) {
          setError(r.message);
          setLoading(false);
        }
        return;
      }
      setSummary(r.data.summary);
      setPerms(r.data.permissions || {});
      if (!quiet) setLoading(false);
    },
    [token],
  );

  const pullQueue = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!queue) return;
      const quiet = Boolean(opts?.quiet);
      if (!quiet) {
        setItems(null);
        setError("");
      }
      const r = await loadWorkflowQueue(token, queue, { scope, filter: filter || undefined, page, pageSize: INBOX_PAGE_SIZE });
      if (!r.ok) {
        if (!quiet) {
          setError(r.message);
          setItems([]);
        }
        return;
      }
      setItems(r.data.items || []);
      setTotalPages(Math.max(1, r.data.pagination?.totalPages || 1));
      if (r.data.summary) setSummary(r.data.summary);
      if (r.data.permissions) setPerms(r.data.permissions);
      // se la pratica aperta non è più in lista, chiudi lo sheet
      if (quiet && selected) {
        const still = (r.data.items || []).some((it) => itemKey(it) === itemKey(selected));
        if (!still) setSelected(null);
      }
    },
    [token, queue, scope, filter, page, selected],
  );

  useEffect(() => {
    void pullSummary();
  }, [pullSummary, reload]);

  useEffect(() => {
    if (!tabs.length) return;
    if (!inboxDeepLinkApplied.current) {
      inboxDeepLinkApplied.current = true;
      const inbox = readDeepLink().inbox;
      if ((inbox === "candidature" || inbox === "appelli") && tabs.some((t) => t.id === inbox)) {
        setQueue(inbox);
        return;
      }
    }
    if (!queue || !tabs.some((t) => t.id === queue)) setQueue(tabs[0]!.id);
  }, [tabs, queue]);

  useEffect(() => {
    void pullQueue();
  }, [pullQueue, reload]);

  useLiveRefresh(
    async () => {
      await Promise.all([pullSummary({ quiet: true }), pullQueue({ quiet: true })]);
    },
    { intervalMs: 90_000, enabled: Boolean(token), boot: false, topics: ["inbox"] },
  );

  /* Carica dettaglio pieno (fields/content) all’apertura sheet — la lista ha solo preview corta. */
  useEffect(() => {
    if (!selected || !queue || !token) {
      setDetail(null);
      return;
    }
    const id = String(selected.messageId || selected.id || selected.recordId || "").trim();
    if (!id) {
      setDetail(selected);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setDetail(selected);
    loadWorkflowDetail(token, queue, id, selected.userId).then((r) => {
      if (!alive) return;
      setDetailLoading(false);
      if (!r.ok || !r.data.item) return;
      setDetail({ ...selected, ...r.data.item });
    });
    return () => {
      alive = false;
    };
  }, [selected, queue, token]);

  useEffect(() => {
    if (!items?.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "j" && e.key !== "k") return;
      const t = e.target;
      if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      const cur = selected ? items.findIndex((it) => itemKey(it) === itemKey(selected)) : -1;
      const delta = e.key === "j" ? 1 : -1;
      const next = cur < 0 ? (delta > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, cur + delta));
      if (next !== cur) setSelected(items[next]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected]);

  async function act(item: WorkflowItem, action: "accept" | "reject") {
    if (!queue || busy) return;
    let reason = "";
    if (action === "reject" || queue === "appelli") {
      const v = await promptDialog({
        title: action === "accept" ? "Motivazione (opzionale)" : "Inserisci una motivazione.",
        inputLabel: "Motivazione",
        multiline: true,
        maxLength: 500,
        placeholder: action === "reject" ? "Obbligatoria per il rifiuto…" : "Opzionale…",
      });
      if (v === null) return;
      reason = String(v || "").trim();
      if (action === "reject" && reason.length < 3) {
        showToast("Inserisci una motivazione.", true);
        return;
      }
    } else {
      const ok = await confirmDialog({
        title: "Accetta pratica",
        message: item.title || item.preview || undefined,
        confirmLabel: "Accetta",
      });
      if (!ok) return;
    }

    /* candidatureSiteAccept1: messageId può essere id sito (non snowflake); fallback da dedupeKey. */
    const fromDedupe = String(item.dedupeKey || "").includes(":")
      ? String(item.dedupeKey || "").split(":").slice(1).join(":")
      : "";
    const messageId = String(item.messageId || fromDedupe || item.id || item.recordId || "").trim();
    const type = String(item.type || item.kind || "").trim();
    const userId = String(item.userId || "").trim();
    if (queue === "candidature" && (!messageId || !type || !userId)) {
      showToast("Dati candidatura incompleti (messageId/type/userId). Ricarica e riprova.", true);
      return;
    }

    setBusy(true);
    const r = await decideWorkflow(token, {
      queue,
      action,
      messageId,
      userId,
      type,
      kind: item.kind || type,
      pauseId: item.pauseId,
      id: item.id || item.recordId || item.listingId || messageId,
      roleId: item.roleId,
      channelId: item.channelId,
      actionKey: item.actionKey,
      reason: reason || undefined,
      motivo: reason || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      showToast(r.message, true);
      return;
    }
    if (r.data.needsReason) {
      showToast("Inserisci una motivazione.", true);
      return;
    }
    showToast(r.data.message || (action === "accept" ? "Accettata." : "Rifiutata."));
    setSelected(null);
    setReload((n) => n + 1);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10" />
        ))}
      </div>
    );
  }

  if (!tabs.length) {
    return (
      <div className="rounded-3xl bg-roast/60 p-8 text-center ring-1 ring-sand/12">
        <Inbox className="mx-auto size-8 text-crema/35" />
        <p className="mt-3 text-sm text-crema/55">Nessuna coda inbox disponibile per il tuo ruolo.</p>
      </div>
    );
  }

  const filters = queue ? QUEUE_FILTERS[queue] || [] : [];
  const count = (id: InboxTabId) => Number(summary?.[id] || 0);
  const inboxRows = items ?? [];
  const inboxShown =
    inboxRows.length > INBOX_LIST_INITIAL ? inboxRows.slice(0, listVisible) : inboxRows;
  const inboxRemaining =
    inboxRows.length > INBOX_LIST_INITIAL ? Math.max(0, inboxRows.length - listVisible) : 0;
  const sheetItem = detail || selected;
  const chatKey = sheetItem && queue ? workflowDedupeKey(sheetItem, queue) : "";
  const formFields: WorkflowField[] =
    sheetItem && queue ? resolveWorkflowDetailFields(queue, sheetItem) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Code inbox staff">
        {tabs.map((t) => (
          <Pill
            key={t.id}
            on={queue === t.id}
            onClick={() => {
              if (t.id === queue) return;
              setQueue(t.id);
              setFilter("");
              setPage(1);
              setSelected(null);
            }}
          >
            {t.label}
            {count(t.id) > 0 ? <span className="ml-1.5 lining-nums opacity-80">({count(t.id)})</span> : null}
          </Pill>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro stato">
        {SCOPE_FILTERS.map((s) => (
          <Pill
            key={s.id}
            on={scope === s.id}
            onClick={() => {
              if (s.id === scope) return;
              setScope(s.id);
              setPage(1);
              setSelected(null);
            }}
          >
            {s.label}
          </Pill>
        ))}
      </div>

      {filters.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro elenco">
          {filters.map((f) => (
            <Pill
              key={f.id || "all"}
              on={filter === f.id}
              onClick={() => {
                if (f.id === filter) return;
                setFilter(f.id);
                setPage(1);
              }}
            >
              {f.label}
            </Pill>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-caramel/10 px-4 py-3 text-sm text-crema/75 ring-1 ring-caramel/25">{error}</p>
      ) : null}

      <AnimatePresence mode="wait">
        <motion.ul
          key={`${queue}-${scope}-${filter}-${page}-${reload}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
          role="list"
        >
          {items === null ? (
            [0, 1, 2].map((i) => <li key={i} className="h-24 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10" />)
          ) : items.length === 0 ? (
            <li className="rounded-3xl bg-roast/50 px-6 py-12 text-center ring-1 ring-sand/10">
              <p className="font-semibold text-crema/80">Nessuna richiesta in attesa con i filtri selezionati.</p>
              <p className="mt-2 text-sm text-crema/45">Prova ad ampliare i filtri o passa a Tutte.</p>
            </li>
          ) : (
            inboxShown.map((it) => {
              const on = selected && itemKey(selected) === itemKey(it);
              return (
                <li key={itemKey(it)}>
                  <button
                    type="button"
                    onClick={() => setSelected(it)}
                    className={cn(
                      "flex w-full gap-3 rounded-3xl bg-roast/70 p-4 text-left ring-1 transition",
                      on ? "ring-caramel/40 bg-caramel/10" : "ring-sand/12 hover:ring-sand/30",
                    )}
                  >
                    <Avatar userId={it.userId} src={it.avatarUrl} name={it.displayName || "Utente"} className="size-11 shrink-0 text-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate font-semibold text-crema">{it.displayName || "Utente"}</span>
                        {it.createdAt ? <span className="text-xs text-crema/40 lining-nums">{timeAgo(it.createdAt)}</span> : null}
                      </span>
                      {it.title ? <span className="mt-0.5 block truncate text-sm text-crema/70"><EmojiText text={it.title} /></span> : null}
                      {it.preview ? <span className="mt-1 block line-clamp-2 text-sm text-crema/45">{it.preview}</span> : null}
                      <span className="mt-2 flex flex-wrap gap-2">
                        {it.statusLabel || it.status ? (
                          <span className="rounded-full bg-crema/8 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-crema/55 ring-1 ring-sand/15">
                            {it.statusLabel || it.status}
                          </span>
                        ) : null}
                        {it.canAct ? (
                          <span className="rounded-full bg-caramel/15 px-2.5 py-0.5 text-[0.7rem] font-semibold text-ember ring-1 ring-caramel/25">
                            In attesa
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </motion.ul>
      </AnimatePresence>

      {items && items.length > 0 ? (
        <ShowMoreButton
          variant="plain"
          remaining={inboxRemaining}
          onClick={() => setListVisible((n) => n + INBOX_LIST_STEP)}
        />
      ) : null}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-full bg-crema/8 px-3 py-1.5 text-sm disabled:opacity-30"
          >
            <ChevronLeft className="size-4" /> Prec
          </button>
          <span className="text-sm text-crema/50 lining-nums">
            Pagina {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-full bg-crema/8 px-3 py-1.5 text-sm disabled:opacity-30"
          >
            Succ <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}

      <AnimatePresence>
        {selected && sheetItem ? (
          <Sheet
            key={itemKey(selected)}
            kicker={sheetItem.title || (queue === "appelli" ? "Appello" : "Candidatura")}
            title={sheetItem.displayName || "Pratica"}
            onClose={() => {
              setSelected(null);
              setDetail(null);
            }}
            wide
          >
            {/* Modulo risposte: una domanda per card */}
            {detailLoading && !formFields.length ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-crema/[0.04] ring-1 ring-sand/10" />
                ))}
              </div>
            ) : formFields.length ? (
              <div className="space-y-3" role="list" aria-label="Risposte del modulo">
                {formFields.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    role="listitem"
                    className="rounded-xl border border-sand/12 bg-espresso/55 px-4 py-3.5"
                  >
                    <p className="text-xs font-semibold leading-snug text-caramel/95">{f.name || `Campo ${i + 1}`}</p>
                    <DiscordContent text={f.value || "—"} className="mt-2 text-sm leading-relaxed text-crema/90" />
                  </div>
                ))}
              </div>
            ) : sheetItem.preview || sheetItem.content || sheetItem.body ? (
              <DiscordContent
                text={String(sheetItem.content || sheetItem.body || sheetItem.preview || "")}
                className="text-sm leading-relaxed text-crema/75"
              />
            ) : null}

            <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sheetItem.userId ? (
                <div className="rounded-xl bg-crema/[0.04] px-3 py-2.5 ring-1 ring-sand/10">
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-crema/40">User</dt>
                  <dd className="mt-0.5 truncate text-xs lining-nums text-crema/75">{sheetItem.userId}</dd>
                </div>
              ) : null}
              {sheetItem.kind || sheetItem.type ? (
                <div className="rounded-xl bg-crema/[0.04] px-3 py-2.5 ring-1 ring-sand/10">
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-crema/40">Tipo</dt>
                  <dd className="mt-0.5 text-xs text-crema/75">{sheetItem.kind || sheetItem.type}</dd>
                </div>
              ) : null}
              {sheetItem.statusLabel || sheetItem.status ? (
                <div className="rounded-xl bg-crema/[0.04] px-3 py-2.5 ring-1 ring-sand/10">
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-crema/40">Stato</dt>
                  <dd className="mt-0.5 text-xs text-crema/75">{sheetItem.statusLabel || sheetItem.status}</dd>
                </div>
              ) : null}
              {sheetItem.decidedByName ? (
                <div className="rounded-xl bg-crema/[0.04] px-3 py-2.5 ring-1 ring-sand/10">
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-crema/40">Gestita da</dt>
                  <dd className="mt-0.5 truncate text-xs text-crema/75">{sheetItem.decidedByName}</dd>
                </div>
              ) : null}
            </dl>

            {sheetItem.canAct ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(sheetItem, "accept")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-500/35 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Accetta
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(sheetItem, "reject")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#a83a2c]/25 px-4 py-2.5 text-sm font-semibold text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/40 disabled:opacity-40"
                >
                  <X className="size-4" /> Rifiuta
                </button>
              </div>
            ) : (
              <p className="mt-5 text-sm text-crema/45">Pratica chiusa o non azionabile con i tuoi permessi.</p>
            )}

            {chatKey ? (
              <div className="mt-6 border-t border-sand/10 pt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-caramel">Chat pratica</p>
                <p className="mb-3 text-xs text-crema/40">
                  {sheetItem.canAct
                    ? "Puoi aggiungere il richiedente alla discussione: riceve notifica e può rispondere dal sito."
                    : "Chat in sola lettura: la pratica è conclusa."}
                </p>
                <WorkflowChatPanel token={token} dedupeKey={chatKey} />
              </div>
            ) : null}
          </Sheet>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
