"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Bot, HeartHandshake, Info, LogIn, PenLine, RotateCcw, Shield, Users } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { useAuth } from "@/lib/auth";
import { useFeedbackApi } from "@/lib/feedback-api";
import { KINDS, STATUS, TOPICS, type Board, type Kind, type Status, type Suggestion, type Topic, type Viewer } from "@/lib/feedback";
import { cn } from "@/lib/cn";
import { readDeepLink } from "@/lib/deeplink";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { Pagination, pageSlice } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Composer } from "./Composer";
import { FeedbackSheet } from "./FeedbackSheet";
import { NoteCard } from "./NoteCard";
import { useI18n } from "@/lib/i18n";

const PAGE_SIZE = 12;

type Sort = "new" | "votes" | "old";
const SORTS: { id: Sort; label: string }[] = [
  { id: "new", label: "Più recenti" },
  { id: "votes", label: "Più votati" },
  { id: "old", label: "Più vecchi" },
];

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", on ? "bg-caramel text-ink" : "bg-crema/6 text-crema/65 ring-1 ring-sand/15 hover:text-crema")}
    >
      {children}
    </button>
  );
}

/**
 * La lavagna del bar: ogni idea o problema è un biglietto appeso.
 * Archivio dal contesto (FeedbackApiProvider): sito di default, feedback del bot nella dashboard.
 */
export function FeedbackBoard({
  className = "mx-auto max-w-6xl px-6 pb-20",
  title = "Idee e feedback",
  botTab,
}: {
  className?: string;
  title?: string;
  /** terza voce "Bot" dello switcher (pagina pubblica): active = si sta guardando la lavagna del bot */
  botTab?: { active: boolean; onSelect: (bot: boolean, staff?: boolean) => void; staffAllowed?: boolean };
} = {}) {
  const api = useFeedbackApi();
  const { ready, token, login } = useAuth();
  const { t } = useI18n();
  const [board, setBoard] = useState<Board>(() => (readDeepLink().boardStaff ? "staff" : "community"));
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [sort, setSort] = useState<Sort>("new");
  const [pageNum, setPageNum] = useState(1);
  const [openId, setOpenId] = useState<string | null>(() => readDeepLink().suggestionId || null);
  const [composer, setComposer] = useState<{ edit?: Suggestion } | null>(null);
  const [toast, setToast] = useState("");
  /* due lavagne nella stessa pagina (server e bot): ognuna ha la sua ancora per la paginazione */
  const listId = `feedback-list-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const deeplinkBoot = useRef(Boolean(readDeepLink().suggestionId || readDeepLink().boardStaff));
  const triedStaffFlip = useRef(false);

  const pull = useCallback(async () => {
    if (!ready) return;
    const r = await api.load(board, token);
    if (!r.ok) {
      setError(r.message);
      setList([]);
      if (board === "staff") setBoard("community");
      return;
    }
    setError("");
    setList(r.data.suggestions);
    setViewer(r.data.viewer);
  }, [ready, token, board, api]);

  useEffect(() => {
    void pull();
  }, [pull]);

  // notifFeedbackDeep1: hash/query → tab + scheda (anche dopo click notifica)
  useEffect(() => {
    const sync = () => {
      const d = readDeepLink();
      if (d.boardStaff) setBoard("staff");
      if (d.suggestionId) setOpenId(d.suggestionId);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  // notifVisitExact1: hash = discussione aperta → dismiss push solo per quel feedback
  useEffect(() => {
    const want = openId && /^[a-f0-9]{24}$/i.test(openId) ? `#vc-suggestion-${openId}` : "";
    const cur = location.hash || "";
    if (want) {
      if (cur.toLowerCase() !== want.toLowerCase()) {
        history.replaceState(history.state, "", `${location.pathname}${location.search}${want}`);
        window.dispatchEvent(new Event("vc:notif-page"));
      }
    } else if (/^#(?:vc-suggestion-)?[a-f0-9]{24}$/i.test(cur)) {
      history.replaceState(history.state, "", `${location.pathname}${location.search}`);
      window.dispatchEvent(new Event("vc:notif-page"));
    }
  }, [openId]);

  useLiveRefresh(pull, { intervalMs: 90_000, enabled: ready, boot: false, topics: api.liveTopics });

  const replace = useCallback((s: Suggestion) => setList((l) => (l ? l.map((x) => (x.id === s.id ? s : x)) : l)), []);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 2600);
  };

  const vote = async (s: Suggestion, d: "up" | "down") => {
    if (!token) return login();
    // ottimistico: stessa logica del bot (stesso verso = togli, verso opposto = cambia)
    const up = d === "up" ? !s.upvotedByViewer : false;
    const down = d === "down" ? !s.downvotedByViewer : false;
    replace({ ...s, upvotedByViewer: up, downvotedByViewer: down, upvoteCount: s.upvoteCount - +s.upvotedByViewer + +up, downvoteCount: s.downvoteCount - +s.downvotedByViewer + +down });
    const r = await api.vote(token, s.id, d);
    if (r.ok) replace(r.data);
    else (replace(s), flash(r.message));
  };

  const shown = useMemo(() => {
    if (!list) return [];
    const f = list.filter((s) => (status === "all" || s.status === status) && (kind === "all" || s.kind === kind) && (topic === "all" || s.tag === topic));
    const score = (s: Suggestion) => s.upvoteCount - s.downvoteCount;
    return f.sort((a, b) =>
      sort === "votes" ? score(b) - score(a) || +new Date(b.createdAt) - +new Date(a.createdAt) : sort === "old" ? +new Date(a.createdAt) - +new Date(b.createdAt) : +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [list, status, kind, topic, sort]);

  // deeplink: azzera filtri una volta così la scheda risulta in lista e si apre
  useEffect(() => {
    if (!deeplinkBoot.current || !openId || !list) return;
    if (!list.some((s) => s.id === openId)) return;
    setStatus("all");
    setKind("all");
    setTopic("all");
    deeplinkBoot.current = false;
  }, [openId, list]);

  // se l'id non è in community ma abbiamo accesso staff → prova tab staff
  useEffect(() => {
    if (!openId || !list || triedStaffFlip.current) return;
    if (list.some((s) => s.id === openId)) return;
    if (board !== "community" || !viewer?.canAccessStaffBoard) return;
    triedStaffFlip.current = true;
    setBoard("staff");
    setList(null);
    setPageNum(1);
  }, [openId, list, board, viewer]);

  const counts = useMemo(() => {
    const c = { pending: 0, accepted: 0, rejected: 0 };
    for (const s of list ?? []) c[s.status]++;
    return c;
  }, [list]);

  const filtered = status !== "all" || kind !== "all" || topic !== "all";
  const { page: pageSafe, totalPages, slice } = pageSlice(shown, pageNum, PAGE_SIZE);
  const current = list?.find((s) => s.id === openId) ?? null;

  // porta alla pagina che contiene il biglietto (DeepLinkFocus trova l'ancora)
  useEffect(() => {
    if (!openId || !shown.length) return;
    const idx = shown.findIndex((s) => s.id === openId);
    if (idx < 0) return;
    const want = Math.floor(idx / PAGE_SIZE) + 1;
    if (pageNum !== want) setPageNum(want);
  }, [openId, shown, pageNum]);

  const newNote = () => (token ? setComposer({}) : login());

  return (
    <div className={className}>
      {/* come funziona */}
      <Reveal>
        <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
          <div className="flex gap-3 rounded-2xl bg-crema/[0.04] p-5 text-sm leading-relaxed text-crema/70 ring-1 ring-sand/10">
            <Info className="mt-0.5 size-4 shrink-0 text-caramel" />
            <p>
              <strong className="text-crema">Come funziona:</strong> premi “Nuovo feedback”, scegli Idea o Problema, descrivi il caso e se serve allega delle foto. Commenta e vota le
              proposte degli altri mentre sono in valutazione.
            </p>
          </div>
          <div className="flex gap-3 rounded-2xl bg-caramel/10 p-5 text-sm leading-relaxed text-crema/75 ring-1 ring-caramel/25">
            <HeartHandshake className="mt-0.5 size-4 shrink-0 text-caramel" />
            <p>
              <strong className="text-crema">Linee guida:</strong> il rispetto è la base per costruire una community. Mantieni un comportamento consono e non promuovere altri progetti.
            </p>
          </div>
        </div>
      </Reveal>

      {/* la lavagna */}
      <section className="scheme-dark mt-12 rounded-[2rem] bg-[#1b1d19] p-4 shadow-[inset_0_0_80px_rgba(0,0,0,0.6)] ring-8 ring-[#5a3a22] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-script text-4xl text-crema/80">{title}</p>
            <p className="text-sm text-crema/45 lining-nums">
              {counts.pending} in valutazione · {counts.accepted} accettati · {counts.rejected} rifiutati
            </p>
          </div>
          <button
            type="button"
            onClick={newNote}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink shadow-[0_12px_30px_-10px_rgba(232,160,90,0.7)] transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
          >
            {token ? <PenLine className="size-4" /> : <LogIn className="size-4" />} {token ? t("feedback.newNote") : t("feedback.loginToWrite")}
          </button>
        </div>

        {(api.boards && viewer?.canAccessStaffBoard) || botTab ? (
          <div className="mt-5 inline-flex rounded-full bg-black/30 p-1 ring-1 ring-crema/10">
            {(
              [
                "community",
                ...(api.boards && viewer?.canAccessStaffBoard ? ["staff"] : botTab?.active && botTab.staffAllowed ? ["staff"] : []),
                ...(botTab ? ["bot"] : []),
              ] as (Board | "bot")[]
            ).map((b) => {
              const on = b === "bot" ? Boolean(botTab?.active) : !botTab?.active && board === b;
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (on) return;
                    /* Bot e ritorno al sito: cambia lavagna (archivio diverso) */
                    if (botTab && (b === "bot" || botTab.active)) return botTab.onSelect(b === "bot", b === "staff");
                    setBoard(b as Board);
                    setList(null);
                    setOpenId(null);
                    setPageNum(1);
                  }}
                  className={cn("inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", on ? "bg-crema text-espresso" : "text-crema/60 hover:text-crema")}
                >
                  {b === "staff" ? <Shield className="size-4" /> : b === "bot" ? <Bot className="size-4" /> : <Users className="size-4" />}{" "}
                  {b === "staff" ? "Staff" : b === "bot" ? "Bot" : "Community"}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* filtri */}
        <div className="mt-5 space-y-2.5">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Pill on={status === "all"} onClick={() => (setStatus("all"), setPageNum(1))}>
              Tutti
            </Pill>
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <Pill key={s} on={status === s} onClick={() => (setStatus(s), setPageNum(1))}>
                {STATUS[s]}
              </Pill>
            ))}
            <span className="mx-1 w-px shrink-0 bg-crema/10" />
            {KINDS.map((k) => (
              <Pill key={k.id} on={kind === k.id} onClick={() => (setKind(kind === k.id ? "all" : k.id), setPageNum(1))}>
                {k.label}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1">
              {(api.topics ? TOPICS : []).map((t) => (
                <Pill key={t.id} on={topic === t.id} onClick={() => (setTopic(topic === t.id ? "all" : t.id), setPageNum(1))}>
                  {t.label}
                </Pill>
              ))}
            </div>
            <Select
              aria-label="Ordine"
              size="pill"
              value={sort}
              onChange={(v) => (setSort(v as Sort), setPageNum(1))}
              options={SORTS.map((s) => ({ value: s.id, label: s.label }))}
              className="min-w-[9.5rem] shrink-0 bg-crema/6 text-crema/80"
            />
          </div>
        </div>

        {error && <p className="mt-6 rounded-xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c]">{error}</p>}

        {/* biglietti */}
        <div id={listId} className="mt-8 scroll-mt-28">
          {list === null ? (
            <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="mb-6 h-48 animate-pulse rounded-sm bg-crema/10" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={HeartHandshake}
              title={filtered ? t("feedback.emptyFilteredTitle") : t("feedback.emptyTitle")}
              text={filtered ? t("feedback.emptyFilteredText") : t("feedback.emptyText")}
              action={
                filtered ? (
                  <button type="button" onClick={() => (setStatus("all"), setKind("all"), setTopic("all"))} className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25">
                    <RotateCcw className="size-4" /> {t("feedback.resetFilters")}
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
                {slice.map((s, i) => (
                  <NoteCard key={s.id} s={s} i={i} onOpen={() => setOpenId(s.id)} onVote={(d) => vote(s, d)} />
                ))}
              </div>
              <Pagination page={pageSafe} totalPages={totalPages} onChange={setPageNum} scrollToId={listId} />
            </>
          )}
        </div>
      </section>

      <AnimatePresence>
        {current && (
          <FeedbackSheet
            key={current.id}
            s={current}
            token={token}
            viewer={viewer}
            onClose={() => setOpenId(null)}
            onLogin={login}
            onUpdate={replace}
            onRemoved={(id) => (setList((l) => l?.filter((x) => x.id !== id) ?? l), setOpenId(null))}
            onRestored={(item) => (setList((l) => (l ? [item, ...l.filter((x) => x.id !== item.id)] : [item])), setOpenId(item.id))}
            onEdit={() => setComposer({ edit: current })}
            onVote={(d) => vote(current, d)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {composer && token && (
          <Composer
            token={token}
            board={board}
            editing={composer.edit}
            onClose={() => setComposer(null)}
            onSaved={(s, isNew) => {
              setComposer(null);
              if (isNew) setList((l) => [s, ...(l ?? [])]);
              else replace(s);
              flash(isNew ? (s.kind === "bug" ? "Segnalazione pubblicata." : "Suggerimento pubblicato.") : "Suggerimento aggiornato.");
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <div className="fixed inset-x-0 bottom-6 z-[90] flex justify-center px-6">
            <p className="rounded-full bg-crema px-5 py-2.5 text-sm font-semibold text-espresso shadow-2xl">{toast}</p>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
