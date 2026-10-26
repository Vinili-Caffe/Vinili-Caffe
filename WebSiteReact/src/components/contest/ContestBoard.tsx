"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  SkipForward,
  Upload,
  Loader2,
  Ghost,
  Trophy,
  Monitor,
  Smartphone,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  clearContestDemo,
  contestImageUrl,
  deleteContestImage,
  fetchContestFeed,
  fetchContestLeaderboard,
  fetchContestStatus,
  formatRomeRange,
  replaceContestImage,
  seedContestDemo,
  submitContestImage,
  swipeContest,
  type ContestCategory,
  type ContestStatus,
  type ContestSubmission,
} from "@/lib/contest";
import { DiscordButton } from "@/components/DiscordButton";
import { confirmDialog } from "@/components/ui";
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
  if (id === "pc") return <Monitor className="size-4" />;
  if (id === "mobile") return <Smartphone className="size-4" />;
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
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sezione">
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
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition",
              active
                ? "bg-caramel text-ink shadow-md shadow-caramel/25 ring-2 ring-caramel"
                : "bg-crema/[0.06] text-crema/65 ring-1 ring-crema/20 hover:bg-crema/10 hover:text-crema",
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
  const label = name || "—";
  return (
    <span
      className={cn(
        "inline-block max-w-full truncate align-middle",
        blurred && "select-none blur-[5px] saturate-50",
      )}
      title={blurred ? "Nome rivelato a fine evento" : undefined}
      aria-label={blurred ? "Nome nascosto" : label}
    >
      {blurred ? label || "Partecipante" : label}
    </span>
  );
}

function Podium({
  podium,
  cat,
}: {
  podium: ContestSubmission[];
  cat: string;
}) {
  if (!podium.length) return null;
  const order = [podium[1], podium[0], podium[2]].filter(Boolean) as ContestSubmission[];
  const heights = ["mt-6", "mt-0", "mt-10"];
  const medals = ["text-crema/70", "text-caramel", "text-sand/80"];
  const places = [2, 1, 3];
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
      {order.map((row, i) => {
        const place = places[i] ?? row.rank ?? i + 1;
        return (
          <div key={row.id} className={cn("flex flex-col items-center text-center", heights[i])}>
            <span className={cn("font-display text-2xl font-semibold", medals[i])}>{place}°</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={contestImageUrl(row.imageUrl)}
              alt=""
              className={cn(
                "mt-2 rounded-xl object-cover ring-1 ring-crema/15",
                place === 1 ? "size-24 sm:size-28" : "size-16 sm:size-20",
                cat === "pc" && (place === 1 ? "h-16 w-28 sm:h-20 sm:w-36" : "h-12 w-20 sm:h-14 sm:w-24"),
                place === 1 && "ring-2 ring-caramel/60",
              )}
            />
            <p className="mt-2 w-full truncate px-1 text-xs font-medium text-crema">
              <BlurName name={row.displayName} blurred={row.nameBlurred} />
            </p>
            <p className="text-[11px] text-crema/45">{Number(row.likes) || 0} like</p>
          </div>
        );
      })}
    </div>
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

  /* Sync quando arrivano le categorie API (prima del load era "main" → nessuna pill attiva). */
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
    if (status.phase === "before") return "Non ancora aperto";
    if (status.phase === "after") return "Chiuso — classifica";
    if (status.phase === "hidden") return "Non disponibile";
    if (status.staffPreview) return "Aperto (preview staff)";
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
      message: "Perderai tutti i like ricevuti su questa foto. L’azione non si può annullare.",
      danger: true,
      confirmLabel: "Sostituisci e azzera voti",
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
      message: "La foto verrà rimossa e tutti i like ricevuti andranno persi.",
      danger: true,
      confirmLabel: "Cancella e azzera voti",
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
      <div className="mx-auto max-w-lg px-6 py-16 text-center text-crema/70">
        Contest non disponibile.
      </div>
    );
  }

  const needLoginForTab = (tab === "submit" || tab === "vote") && !token;

  return (
    <div className="mx-auto max-w-lg px-6 pb-20">
      <div className="rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-crema/10">
        <p className="text-xs uppercase tracking-[0.2em] text-sand/80">{phaseLabel}</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">{status?.title || "Contest"}</h2>
        <p className="mt-2 text-sm text-crema/70">{status?.blurb}</p>
        {status?.startAt && status?.endAt ? (
          <p className="mt-2 text-xs text-crema/45">{formatRomeRange(status.startAt, status.endAt)}</p>
        ) : null}
        <p className="mt-1 text-xs text-crema/40">
          {status?.submissionCount ?? 0} invii · tuoi voti {status?.myVoteCount ?? 0}
        </p>
      </div>

      {status?.phase === "before" && !status.staffPreview ? (
        <p className="mt-8 text-center text-crema/65">
          Apre alle 19:00 (Roma). Dopo vedrai Invia, Vota e Classifica.
        </p>
      ) : null}

      {showMain ? (
        <>
          {status?.staffPreview && status.phase !== "after" && token ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-full bg-crema/10 px-4 py-2 text-xs font-medium text-crema ring-1 ring-crema/20 hover:bg-crema/15"
                onClick={async () => {
                  setBusy(true);
                  setMsg("");
                  try {
                    const out = await seedContestDemo(eventKey, token, 8);
                    setMsg(out.message || "");
                    await reload();
                    await loadBoard();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Carica 8 foto demo
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-full bg-crema/5 px-4 py-2 text-xs text-crema/70 ring-1 ring-crema/15 hover:bg-crema/10"
                onClick={async () => {
                  setBusy(true);
                  setMsg("");
                  try {
                    const out = await clearContestDemo(eventKey, token);
                    setMsg(out.message || "");
                    await reload();
                    await loadBoard();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Pulisci demo
              </button>
            </div>
          ) : null}

          <div className="mt-6 flex gap-1 rounded-full bg-espresso p-1 ring-1 ring-crema/10">
            {(status?.phase === "after"
              ? ([["board", "Classifica"]] as const)
              : ([
                  ["submit", "Invia"],
                  ["vote", "Vota"],
                  ["board", "Classifica"],
                ] as const)
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "flex-1 rounded-full py-2 text-sm font-medium",
                  tab === id ? "bg-caramel text-ink" : "text-crema/70 hover:text-crema",
                )}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {needLoginForTab ? (
            <div className="mt-10 text-center">
              <Ghost className="mx-auto size-10 text-caramel" />
              <p className="mt-4 font-display text-2xl font-semibold">Accedi per partecipare</p>
              <p className="mt-2 text-sm text-crema/65">La classifica è pubblica; per inviare o votare serve Discord.</p>
              <div className="mt-6 flex justify-center">
                <DiscordButton label="Accedi con Discord" />
              </div>
            </div>
          ) : null}

          {tab === "submit" && status?.phase !== "after" && token ? (
            <div className="mt-8 space-y-4">
              <CategoryPills cats={cats} value={catSubmit} onChange={setCatSubmit} />
              {mineByCat[catSubmit] ? (
                <div>
                  <p className="text-sm text-crema/70">
                    Hai già inviato per «{cats.find((c) => c.id === catSubmit)?.label || catSubmit}»:
                  </p>
                  <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-crema/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={contestImageUrl(mineByCat[catSubmit]!.imageUrl)}
                      alt=""
                      className={cn(
                        "w-full object-cover",
                        catSubmit === "pc" ? "aspect-video" : "aspect-[3/4]",
                      )}
                    />
                  </div>
                  <p className="mt-2 text-center text-xs text-crema/45">
                    {Number(mineByCat[catSubmit]?.likes) || 0} like · modifica/cancella azzera i voti
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-crema/10 px-4 py-2 text-xs font-medium text-crema ring-1 ring-crema/20 hover:bg-crema/15">
                      <Pencil className="size-3.5" />
                      Modifica
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
                      className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-4 py-2 text-xs font-medium text-red-300 ring-1 ring-red-400/30 hover:bg-red-500/25"
                    >
                      <Trash2 className="size-3.5" />
                      Cancella
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-crema/25 bg-crema/[0.03] px-6 py-12 text-center hover:border-caramel/50">
                  <Upload className="size-8 text-caramel" />
                  <span className="font-medium">
                    Carica sfondo {cats.find((c) => c.id === catSubmit)?.label || ""}
                  </span>
                  <span className="text-xs text-crema/50">
                    {catSubmit === "pc" ? "Consigliato 16:9" : "Consigliato verticale"} · PNG / JPG / WEBP · max 4 MB
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
              {cats.length > 1 ? (
                <p className="text-center text-xs text-crema/45">
                  Puoi inviare fino a 1 foto per sezione (PC e telefono).
                </p>
              ) : null}
              {msg ? <p className="text-center text-sm text-sand">{msg}</p> : null}
              {busy ? <Loader2 className="mx-auto size-5 animate-spin text-crema/50" /> : null}
            </div>
          ) : null}

          {tab === "vote" && status?.phase !== "after" && token ? (
            <div className="mt-8 space-y-4 overflow-x-clip">
              <CategoryPills
                cats={cats}
                value={catVote}
                onChange={(id) => {
                  setCatVote(id);
                  setDeck([]);
                }}
              />
              <p className="text-center text-xs text-crema/40">Le tue foto non compaiono nel mazzo.</p>
              {!top ? (
                <p className="py-16 text-center text-crema/60">
                  {status?.canVote ? "Hai visto tutto in questa sezione. Torna più tardi!" : "Voto non disponibile."}
                </p>
              ) : (
                <>
                  <div
                    ref={cardRef}
                    className={cn(
                      "relative mx-auto w-full max-w-sm touch-none select-none overflow-hidden rounded-3xl bg-roast shadow-2xl ring-1 ring-crema/15 will-change-transform",
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
                      className="pointer-events-none absolute left-4 top-4 rounded-lg border-2 border-emerald-400 px-3 py-1 text-sm font-bold uppercase tracking-widest text-emerald-300 opacity-0 transition-opacity duration-75"
                    >
                      Like
                    </div>
                    <div
                      ref={passBadgeRef}
                      className="pointer-events-none absolute right-4 top-4 rounded-lg border-2 border-red-400 px-3 py-1 text-sm font-bold uppercase tracking-widest text-red-300 opacity-0 transition-opacity duration-75"
                    >
                      Pass
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-center gap-6">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onSwipe("pass")}
                      className="flex size-14 items-center justify-center rounded-full bg-crema/10 text-crema ring-1 ring-crema/20 hover:bg-crema/15"
                      aria-label="Passa"
                    >
                      <SkipForward className="size-6" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onSwipe("like")}
                      className="flex size-16 items-center justify-center rounded-full bg-caramel text-ink shadow-lg shadow-caramel/30 hover:brightness-110"
                      aria-label="Mi piace"
                    >
                      <Heart className="size-7 fill-current" />
                    </button>
                  </div>
                  <p className="mt-4 text-center text-xs text-crema/40">Swipe destra = like · sinistra = passa</p>
                </>
              )}
            </div>
          ) : null}

          {tab === "board" ? (
            <div className="mt-8 space-y-5">
              <div className="flex items-center gap-2 text-sm text-crema/80">
                <Trophy className="size-4 text-caramel" />
                {boardPreview ? "Classifica live" : "Classifica finale"}
              </div>
              {boardPreview ? (
                <p className="text-xs text-crema/45">
                  Nomi sfocati fino a fine evento. Chiunque può vedere la classifica.
                </p>
              ) : null}
              <CategoryPills
                cats={cats}
                value={catBoard}
                onChange={(id) => {
                  setCatBoard(id);
                  setBoardPage(1);
                }}
              />

              {!podium.length && !board.length ? (
                <p className="py-12 text-center text-crema/55">Ancora nessun invio in questa sezione.</p>
              ) : (
                <>
                  <Podium podium={podium} cat={catBoard} />

                  {board.length ? (
                    <ol className="space-y-3">
                      {board.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-center gap-3 overflow-hidden rounded-2xl bg-crema/[0.04] p-2 ring-1 ring-crema/10"
                        >
                          <span className="w-8 shrink-0 text-center font-display text-lg font-semibold text-caramel">
                            {row.rank ?? "–"}
                          </span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={contestImageUrl(row.imageUrl)}
                            alt=""
                            className={cn(
                              "shrink-0 rounded-lg object-cover",
                              catBoard === "pc" ? "h-14 w-24" : "size-14",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-crema">
                              <BlurName name={row.displayName} blurred={row.nameBlurred} />
                            </p>
                            <p className="text-xs text-crema/45">{Number(row.likes) || 0} like</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : podium.length > 0 && boardPages <= 1 ? (
                    <p className="text-center text-xs text-crema/40">Solo il podio per ora.</p>
                  ) : null}

                  {boardPages > 1 ? (
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        disabled={busy || boardPage <= 1}
                        onClick={() => setBoardPage((p) => Math.max(1, p - 1))}
                        className="inline-flex size-9 items-center justify-center rounded-full bg-crema/10 text-crema ring-1 ring-crema/15 disabled:opacity-40"
                        aria-label="Pagina precedente"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <span className="text-xs text-crema/55">
                        {boardPage} / {boardPages}
                      </span>
                      <button
                        type="button"
                        disabled={busy || boardPage >= boardPages}
                        onClick={() => setBoardPage((p) => Math.min(boardPages, p + 1))}
                        className="inline-flex size-9 items-center justify-center rounded-full bg-crema/10 text-crema ring-1 ring-crema/15 disabled:opacity-40"
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
