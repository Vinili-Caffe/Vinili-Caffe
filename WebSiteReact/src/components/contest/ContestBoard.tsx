"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  SkipForward,
  Loader2,
  Ghost,
  Trophy,
  Monitor,
  Smartphone,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  CalendarDays,
  Images,
  ThumbsUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  clearContestDemo,
  contestImageUrl,
  contestWindowParts,
  deleteContestImage,
  fetchContestFeed,
  fetchContestLeaderboard,
  fetchContestStatus,
  replaceContestImage,
  seedContestDemo,
  submitContestImage,
  swipeContest,
  type ContestCategory,
  type ContestStatus,
  type ContestSubmission,
} from "@/lib/contest";
import { DiscordButton } from "@/components/DiscordButton";
import { confirmDialog, showToast } from "@/components/ui";
import { cn } from "@/lib/cn";

type Tab = "submit" | "vote" | "board";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function CategoryIcon({ id }: { id: string }) {
  if (id === "pc") return <Monitor className="size-3.5" />;
  if (id === "mobile") return <Smartphone className="size-3.5" />;
  return null;
}

function CategoryPills({
  cats,
  value,
  onChange,
}: {
  cats: ContestCategory[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (cats.length <= 1) return null;
  return (
    <div className="flex gap-1 rounded-2xl bg-ink/40 p-1 ring-1 ring-crema/10" role="tablist" aria-label="Sezione">
      {cats.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.id)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition",
              active ? "bg-caramel text-ink shadow-sm" : "text-crema/55 hover:bg-crema/[0.06] hover:text-crema/85",
            )}
          >
            <CategoryIcon id={c.id} />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function BlurName({ name, blurred }: { name?: string | null; blurred?: boolean }) {
  const label = name || "Partecipante";
  return (
    <span
      className={cn("inline-block max-w-full truncate align-middle", blurred && "select-none blur-[6px]")}
      title={blurred ? "Nome in chiaro a fine evento" : undefined}
      aria-label={blurred ? "Nome nascosto" : label}
    >
      {label}
    </span>
  );
}

function Podium({ podium, cat }: { podium: ContestSubmission[]; cat: string }) {
  if (!podium.length) return null;
  const slots = [
    { row: podium[1], place: 2, pedestal: "h-10", size: "size-[4.5rem] sm:size-20", pc: "h-12 w-[4.5rem] sm:h-14 sm:w-24" },
    { row: podium[0], place: 1, pedestal: "h-16", size: "size-[5.5rem] sm:size-28", pc: "h-16 w-28 sm:h-[5.5rem] sm:w-36" },
    { row: podium[2], place: 3, pedestal: "h-7", size: "size-16 sm:size-[4.5rem]", pc: "h-11 w-20 sm:h-12 sm:w-[5.5rem]" },
  ].filter((s) => s.row);

  return (
    <div className="rounded-3xl bg-gradient-to-b from-crema/[0.06] to-transparent px-2 pb-1 pt-5 ring-1 ring-crema/10 sm:px-4">
      <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
        {slots.map(({ row, place, pedestal, size, pc }) => {
          if (!row) return null;
          const gold = place === 1;
          return (
            <div key={row.id} className="flex flex-col items-center text-center">
              <span
                className={cn(
                  "mb-2 inline-flex size-7 items-center justify-center rounded-full font-display text-sm font-semibold",
                  gold ? "bg-caramel text-ink" : "bg-crema/10 text-crema/70",
                )}
              >
                {place}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={contestImageUrl(row.imageUrl)}
                alt=""
                className={cn(
                  "rounded-2xl object-cover shadow-lg shadow-black/40 ring-1 ring-crema/15",
                  cat === "pc" ? pc : size,
                  gold && "ring-2 ring-caramel/70",
                )}
              />
              <p className="mt-2.5 w-full truncate px-0.5 text-xs font-medium text-crema sm:text-sm">
                <BlurName name={row.displayName} blurred={row.nameBlurred} />
              </p>
              <p className="mt-0.5 text-[11px] tabular-nums text-crema/45">{Number(row.likes) || 0} like</p>
              <div
                className={cn(
                  "mt-3 w-full rounded-t-lg bg-crema/[0.07] ring-1 ring-inset ring-crema/10",
                  pedestal,
                  gold && "bg-caramel/15 ring-caramel/25",
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-3xl bg-crema/[0.035] p-4 ring-1 ring-crema/10 sm:p-5", className)}>{children}</div>
  );
}

export function ContestBoard({ eventKey }: { eventKey: string }) {
  const { ready, token } = useAuth();
  const [status, setStatus] = useState<ContestStatus | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [deck, setDeck] = useState<ContestSubmission[]>([]);
  const [board, setBoard] = useState<ContestSubmission[]>([]);
  const [podium, setPodium] = useState<ContestSubmission[]>([]);
  const [boardPreview, setBoardPreview] = useState(true);
  const [boardPage, setBoardPage] = useState(1);
  const [boardPages, setBoardPages] = useState(1);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const likeBadgeRef = useRef<HTMLDivElement | null>(null);
  const passBadgeRef = useRef<HTMLDivElement | null>(null);
  const dragXRef = useRef(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const rafRef = useRef(0);

  const cats = useMemo<ContestCategory[]>(
    () => (status?.categories?.length ? status.categories : [{ id: "main", label: "Main" }]),
    [status?.categories],
  );
  const [catSubmit, setCatSubmit] = useState("");
  const [catVote, setCatVote] = useState("");
  const [catBoard, setCatBoard] = useState("");
  const isSfondi = status?.kind === "sfondi";

  useEffect(() => {
    if (!cats.length) return;
    const ids = new Set(cats.map((c) => c.id));
    const first = cats[0].id;
    setCatSubmit((prev) => (ids.has(prev) ? prev : first));
    setCatVote((prev) => (ids.has(prev) ? prev : first));
    setCatBoard((prev) => (ids.has(prev) ? prev : first));
  }, [cats]);

  const reload = useCallback(async () => {
    const s = await fetchContestStatus(eventKey, token);
    setStatus(s);
    if (s?.phase === "after") setTab("board");
  }, [eventKey, token]);

  const loadFeed = useCallback(async () => {
    if (!token) return;
    const f = await fetchContestFeed(eventKey, token, catVote);
    if (f?.ok) setDeck(f.items || []);
  }, [eventKey, token, catVote]);

  const loadBoard = useCallback(async () => {
    const out = await fetchContestLeaderboard(eventKey, token, catBoard, boardPage, 10);
    if (out?.ok) {
      setPodium(out.podium || []);
      setBoard(out.items || []);
      setBoardPreview(Boolean(out.preview));
      setBoardPages(Math.max(1, Number(out.totalPages) || 1));
      if (out.page && out.page !== boardPage) setBoardPage(out.page);
    }
  }, [eventKey, token, catBoard, boardPage]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  useEffect(() => {
    if (!ready || !token || tab !== "vote") return;
    void loadFeed();
  }, [ready, token, tab, loadFeed]);

  useEffect(() => {
    if (!ready || tab !== "board") return;
    void loadBoard();
  }, [ready, tab, loadBoard]);

  useEffect(() => {
    setBoardPage(1);
  }, [catBoard]);

  const top = deck[0] || null;
  const phaseLabel = useMemo(() => {
    if (!status) return "…";
    if (status.phase === "before") return "In arrivo";
    if (status.phase === "after") return "Terminato";
    if (status.phase === "hidden") return "Non disponibile";
    return "In corso";
  }, [status]);

  const mineByCat = useMemo(() => {
    const map: Record<string, ContestSubmission | undefined> = {};
    for (const s of status?.mySubmissions || []) {
      map[String(s.category || "main")] = s;
    }
    return map;
  }, [status?.mySubmissions]);

  const canSubmitCat = status?.canSubmitByCategory?.[catSubmit]?.canSubmit ?? false;
  const catSubmitLabel = cats.find((c) => c.id === catSubmit)?.label || "";

  async function onPickFile(file: File | null) {
    if (!file || !token) return;
    setBusy(true);
    setMsg("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const out = await submitContestImage(eventKey, token, dataUrl, catSubmit);
      setMsg(out.message || (out.ok ? "Inviato." : "Errore."));
      if (out.ok) {
        await reload();
        setTab("vote");
        setCatVote(catSubmit);
      }
    } catch {
      setMsg("Upload non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  async function onReplaceFile(file: File | null) {
    if (!file || !token) return;
    const ok = await confirmDialog({
      title: "Sostituire la foto?",
      message: "Perderai tutti i like ricevuti su questa foto.",
      danger: true,
      confirmLabel: "Sostituisci",
    });
    if (!ok) return;
    setBusy(true);
    setMsg("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const out = await replaceContestImage(eventKey, token, dataUrl, catSubmit);
      setMsg(out.message || (out.ok ? "Aggiornata." : "Errore."));
      if (out.ok) {
        await reload();
        if (tab === "board") await loadBoard();
      }
    } catch {
      setMsg("Sostituzione non riuscita.");
    } finally {
      setBusy(false);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

  async function onDeleteMine() {
    if (!token) return;
    const ok = await confirmDialog({
      title: "Cancellare la foto?",
      message: "La foto verrà rimossa e tutti i like andranno persi.",
      danger: true,
      confirmLabel: "Cancella",
    });
    if (!ok) return;
    setBusy(true);
    setMsg("");
    try {
      const out = await deleteContestImage(eventKey, token, catSubmit);
      setMsg(out.message || (out.ok ? "Cancellata." : "Errore."));
      if (out.ok) {
        await reload();
        if (tab === "board") await loadBoard();
      }
    } catch {
      setMsg("Cancellazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  function paintCard(x: number, withTransition: boolean) {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = withTransition ? "transform 180ms ease" : "none";
    el.style.transform = `translate3d(${x}px,0,0) rotate(${x / 28}deg)`;
    const like = likeBadgeRef.current;
    const pass = passBadgeRef.current;
    if (like) like.style.opacity = x > 40 ? "1" : "0";
    if (pass) pass.style.opacity = x < -40 ? "1" : "0";
  }

  function resetCard() {
    dragXRef.current = 0;
    paintCard(0, true);
  }

  async function onSwipe(action: "like" | "pass") {
    if (!token || !top || busy) return;
    setBusy(true);
    try {
      const fly = action === "like" ? window.innerWidth : -window.innerWidth;
      paintCard(fly, true);
      await swipeContest(eventKey, token, top.id, action);
      setDeck((d) => d.slice(1));
      dragXRef.current = 0;
      requestAnimationFrame(() => paintCard(0, false));
      if (deck.length <= 2) void loadFeed();
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!top || busy) return;
    e.preventDefault();
    startXRef.current = e.clientX;
    draggingRef.current = true;
    paintCard(dragXRef.current, false);
    cardRef.current?.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const raw = e.clientX - startXRef.current;
    const max = Math.min(220, window.innerWidth * 0.42);
    const x = Math.max(-max, Math.min(max, raw));
    dragXRef.current = x;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paintCard(dragXRef.current, false);
    });
  }

  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const x = dragXRef.current;
    if (x > 110) void onSwipe("like");
    else if (x < -110) void onSwipe("pass");
    else resetCard();
  }

  const showMain =
    status?.phase === "open" || status?.phase === "after" || Boolean(status?.staffPreview);

  if (!ready) {
    return (
      <div className="mx-auto flex max-w-lg justify-center px-6 py-16 text-crema/60">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!status?.ok && status?.phase === "hidden") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center text-crema/70">Contest non disponibile.</div>
    );
  }

  const needLoginForTab = (tab === "submit" || tab === "vote") && !token;
  const tabs =
    status?.phase === "after"
      ? ([["board", "Classifica"]] as const)
      : ([
          ["submit", "Invia"],
          ["vote", "Vota"],
          ["board", "Classifica"],
        ] as const);

  return (
    <div className="mx-auto max-w-lg px-6 pb-24">
      <Panel className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-caramel/10 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <span className="inline-flex items-center rounded-full bg-caramel/15 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-caramel">
            {phaseLabel}
          </span>
        </div>
        <h2 className="relative mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {status?.title || "Contest"}
        </h2>
        {status?.blurb ? <p className="relative mt-2 text-sm leading-relaxed text-crema/65">{status.blurb}</p> : null}
        <div className={cn("relative mt-4 grid gap-2", status?.startAt && status?.endAt ? "grid-cols-2" : "grid-cols-2")}>
          <div className="rounded-2xl bg-ink/35 px-3 py-2.5 ring-1 ring-crema/10">
            <p className="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/40">
              <Images className="size-3" />
              Invii
            </p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums text-crema">
              {status?.submissionCount ?? 0}
            </p>
            <p className="text-[11px] text-crema/45">foto nel contest</p>
          </div>
          <div className="rounded-2xl bg-ink/35 px-3 py-2.5 ring-1 ring-crema/10">
            <p className="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/40">
              <ThumbsUp className="size-3" />
              I tuoi voti
            </p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums text-crema">
              {token ? status?.myVoteCount ?? 0 : "—"}
            </p>
            <p className="text-[11px] text-crema/45">{token ? "like + pass" : "accedi per votare"}</p>
          </div>
        </div>
        {status?.startAt && status?.endAt ? (
          <div className="relative mt-2 grid grid-cols-2 gap-2">
            {(() => {
              const w = contestWindowParts(status.startAt, status.endAt);
              return (
                <>
                  <div className="rounded-2xl bg-ink/35 px-3 py-2.5 ring-1 ring-crema/10">
                    <p className="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/40">
                      <CalendarDays className="size-3" />
                      Apre
                    </p>
                    <p className="mt-1 font-display text-sm font-semibold capitalize text-crema">
                      {w.start.weekday} {w.start.day}
                    </p>
                    <p className="text-xs capitalize text-crema/55">
                      {w.start.month} · {w.start.time}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-ink/35 px-3 py-2.5 ring-1 ring-crema/10">
                    <p className="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/40">
                      <CalendarDays className="size-3" />
                      Chiude
                    </p>
                    <p className="mt-1 font-display text-sm font-semibold capitalize text-crema">
                      {w.end.weekday} {w.end.day}
                    </p>
                    <p className="text-xs capitalize text-crema/55">
                      {w.end.month} · {w.end.time}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
      </Panel>

      {status?.phase === "before" && !status.staffPreview ? (
        <Panel className="mt-5 text-center text-sm text-crema/65">
          Apre alle 19:00 (ora di Roma). Torna qui per inviare, votare e seguire la classifica.
        </Panel>
      ) : null}

      {showMain ? (
        <>
          {status?.staffPreview && status.phase !== "after" && token ? (
            <details className="mt-4 rounded-2xl bg-ink/30 px-3 py-2 text-xs text-crema/45 ring-1 ring-crema/10">
              <summary className="cursor-pointer select-none py-1 text-crema/55 hover:text-crema/75">Strumenti test</summary>
              <div className="flex flex-wrap gap-2 pb-1 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full bg-crema/10 px-3 py-1.5 text-crema ring-1 ring-crema/15 hover:bg-crema/15 disabled:opacity-40"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setBusy(true);
                    try {
                      const out = await seedContestDemo(eventKey, token, 8);
                      showToast(out.message || (out.ok ? "Demo caricate." : "Errore demo."), !out.ok);
                      await reload();
                      setTab("board");
                      setBoardPage(1);
                      await loadBoard();
                      if (tab === "vote") await loadFeed();
                    } catch {
                      showToast("Seed demo fallito.", true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "…" : "+8 demo"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full bg-crema/5 px-3 py-1.5 text-crema/70 ring-1 ring-crema/10 hover:bg-crema/10 disabled:opacity-40"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setBusy(true);
                    try {
                      const out = await clearContestDemo(eventKey, token);
                      showToast(out.message || (out.ok ? "Demo rimosse." : "Errore."), !out.ok);
                      await reload();
                      setTab("board");
                      await loadBoard();
                      await loadFeed();
                    } catch {
                      showToast("Pulizia demo fallita.", true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Pulisci demo
                </button>
              </div>
            </details>
          ) : null}

          <div className="mt-5 flex gap-1 rounded-2xl bg-espresso p-1 ring-1 ring-crema/10">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "flex-1 rounded-xl py-2.5 text-sm font-semibold transition",
                  tab === id ? "bg-caramel text-ink shadow-sm" : "text-crema/55 hover:text-crema",
                )}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {needLoginForTab ? (
            <Panel className="mt-6 text-center">
              <Ghost className="mx-auto size-9 text-caramel" />
              <p className="mt-3 font-display text-xl font-semibold">Accedi per partecipare</p>
              <p className="mt-2 text-sm text-crema/60">La classifica è pubblica. Per inviare o votare serve Discord.</p>
              <div className="mt-5 flex justify-center">
                <DiscordButton label="Accedi con Discord" />
              </div>
            </Panel>
          ) : null}

          {tab === "submit" && status?.phase !== "after" && token ? (
            <div className="mt-6 space-y-4">
              <CategoryPills cats={cats} value={catSubmit} onChange={setCatSubmit} />
              {mineByCat[catSubmit] ? (
                <Panel className="space-y-4 !p-3 sm:!p-4">
                  <div className="overflow-hidden rounded-2xl ring-1 ring-crema/12">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={contestImageUrl(mineByCat[catSubmit]!.imageUrl)}
                      alt=""
                      className={cn("w-full object-cover", catSubmit === "pc" ? "aspect-video" : "aspect-[3/4]")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-sm font-medium text-crema">
                        {isSfondi ? `Sfondo ${catSubmitLabel}` : catSubmitLabel || "La tua foto"}
                      </p>
                      <p className="text-xs text-crema/45">{Number(mineByCat[catSubmit]?.likes) || 0} like</p>
                    </div>
                    <div className="flex gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-crema/10 px-3.5 py-2 text-xs font-medium text-crema ring-1 ring-crema/15 hover:bg-crema/15">
                        <Pencil className="size-3.5" />
                        Cambia
                        <input
                          ref={replaceInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => void onReplaceFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onDeleteMine()}
                        className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-300 ring-1 ring-red-400/25 hover:bg-red-500/20"
                      >
                        <Trash2 className="size-3.5" />
                        Elimina
                      </button>
                    </div>
                  </div>
                  <p className="px-1 text-[11px] leading-relaxed text-crema/40">
                    Se cambi o elimini la foto, i like già ricevuti vengono azzerati.
                  </p>
                </Panel>
              ) : (
                <label className="group flex cursor-pointer flex-col items-center gap-3 rounded-3xl border border-dashed border-crema/20 bg-gradient-to-b from-crema/[0.05] to-transparent px-6 py-14 text-center transition hover:border-caramel/40 hover:from-caramel/[0.07]">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-caramel/15 text-caramel ring-1 ring-caramel/25 transition group-hover:scale-105">
                    <ImagePlus className="size-7" />
                  </span>
                  <span className="font-display text-lg font-semibold">
                    {isSfondi ? `Carica sfondo ${catSubmitLabel}` : `Carica ${catSubmitLabel || "foto"}`}
                  </span>
                  <span className="max-w-xs text-xs leading-relaxed text-crema/45">
                    {catSubmit === "pc" ? "Formato orizzontale consigliato" : catSubmit === "mobile" ? "Formato verticale consigliato" : "Una foto"}
                    {" · "}PNG, JPG o WEBP · max 4 MB
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={busy || !canSubmitCat}
                    onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
              {cats.length > 1 && !mineByCat[catSubmit] ? (
                <p className="text-center text-xs text-crema/40">Una foto per sezione: puoi mandarne una per PC e una per telefono.</p>
              ) : null}
              {msg ? <p className="text-center text-sm text-sand">{msg}</p> : null}
              {busy ? <Loader2 className="mx-auto size-5 animate-spin text-crema/50" /> : null}
            </div>
          ) : null}

          {tab === "vote" && status?.phase !== "after" && token ? (
            <div className="mt-6 space-y-4 overflow-x-clip">
              <CategoryPills
                cats={cats}
                value={catVote}
                onChange={(id) => {
                  setCatVote(id);
                  setDeck([]);
                }}
              />
              {!top ? (
                <Panel className="py-14 text-center">
                  <Heart className="mx-auto size-8 text-crema/25" />
                  <p className="mt-3 text-sm text-crema/60">
                    {status?.canVote ? "Hai visto tutto qui. Torna più tardi per nuove foto." : "Il voto non è disponibile."}
                  </p>
                </Panel>
              ) : (
                <>
                  <div
                    ref={cardRef}
                    className={cn(
                      "relative mx-auto w-full max-w-sm touch-none select-none overflow-hidden rounded-[1.75rem] bg-roast shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] ring-1 ring-crema/12 will-change-transform",
                      catVote === "pc" ? "aspect-video" : "aspect-[3/4]",
                    )}
                    style={{ transform: "translate3d(0,0,0)", touchAction: "none" }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={contestImageUrl(top.imageUrl)}
                      alt=""
                      className="pointer-events-none size-full object-cover"
                      draggable={false}
                    />
                    <div
                      ref={likeBadgeRef}
                      className="pointer-events-none absolute left-4 top-4 rounded-lg border-2 border-emerald-400/90 bg-ink/40 px-3 py-1 text-sm font-bold uppercase tracking-widest text-emerald-300 opacity-0 backdrop-blur-sm transition-opacity duration-75"
                    >
                      Like
                    </div>
                    <div
                      ref={passBadgeRef}
                      className="pointer-events-none absolute right-4 top-4 rounded-lg border-2 border-red-400/90 bg-ink/40 px-3 py-1 text-sm font-bold uppercase tracking-widest text-red-300 opacity-0 backdrop-blur-sm transition-opacity duration-75"
                    >
                      Pass
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-5 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onSwipe("pass")}
                      className="flex size-14 items-center justify-center rounded-full bg-crema/[0.07] text-crema ring-1 ring-crema/15 transition hover:bg-crema/12"
                      aria-label="Passa"
                    >
                      <SkipForward className="size-6" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onSwipe("like")}
                      className="flex size-[4.25rem] items-center justify-center rounded-full bg-caramel text-ink shadow-lg shadow-caramel/35 transition hover:brightness-110"
                      aria-label="Mi piace"
                    >
                      <Heart className="size-7 fill-current" />
                    </button>
                  </div>
                  <p className="text-center text-[11px] text-crema/40">
                    Swipe destra = like · sinistra = passa · le tue foto non compaiono
                  </p>
                </>
              )}
            </div>
          ) : null}

          {tab === "board" ? (
            <div className="mt-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-crema">
                    <Trophy className="size-4 text-caramel" />
                    {boardPreview ? "Classifica live" : "Classifica finale"}
                  </div>
                  {boardPreview ? (
                    <p className="mt-1 text-xs text-crema/45">Nomi sfocati fino alla fine dell&apos;evento.</p>
                  ) : null}
                </div>
              </div>

              <CategoryPills
                cats={cats}
                value={catBoard}
                onChange={(id) => {
                  setCatBoard(id);
                  setBoardPage(1);
                }}
              />

              {!podium.length && !board.length ? (
                <Panel className="py-12 text-center text-sm text-crema/55">Ancora nessun invio in questa sezione.</Panel>
              ) : (
                <>
                  <Podium podium={podium} cat={catBoard} />

                  {board.length ? (
                    <ol className="space-y-2">
                      {board.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-center gap-3 rounded-2xl bg-crema/[0.035] p-2.5 ring-1 ring-crema/10"
                        >
                          <span className="w-8 shrink-0 text-center font-display text-lg font-semibold tabular-nums text-caramel/90">
                            {row.rank ?? "–"}
                          </span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={contestImageUrl(row.imageUrl)}
                            alt=""
                            className={cn(
                              "shrink-0 rounded-xl object-cover ring-1 ring-crema/10",
                              catBoard === "pc" ? "h-12 w-20" : "size-12",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-crema">
                              <BlurName name={row.displayName} blurred={row.nameBlurred} />
                            </p>
                            <p className="text-xs tabular-nums text-crema/45">{Number(row.likes) || 0} like</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}

                  {boardPages > 1 ? (
                    <div className="flex items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        disabled={busy || boardPage <= 1}
                        onClick={() => setBoardPage((p) => Math.max(1, p - 1))}
                        className="inline-flex size-9 items-center justify-center rounded-full bg-crema/[0.06] text-crema ring-1 ring-crema/12 disabled:opacity-35"
                        aria-label="Pagina precedente"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-crema/50">
                        {boardPage} / {boardPages}
                      </span>
                      <button
                        type="button"
                        disabled={busy || boardPage >= boardPages}
                        onClick={() => setBoardPage((p) => Math.min(boardPages, p + 1))}
                        className="inline-flex size-9 items-center justify-center rounded-full bg-crema/[0.06] text-crema ring-1 ring-crema/12 disabled:opacity-35"
                        aria-label="Pagina successiva"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
