"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ListMusic, Loader2, Pause, Play, Plus, Search, Trash2 } from "lucide-react";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { createMusicQuizPack, importPlaylistLink, loadMusicQuizPack, searchMusicQuiz, updateMusicQuizPack, type MusicQuizTrack } from "@/lib/musicQuiz";
import { DEFAULT_SETTINGS, MusicQuizSettings, type QuizSettings } from "./MusicQuizSettings";
import { QuestionEditor, asQuestion, isCustomized, type QuizQuestion } from "./QuestionEditor";

/* niente limite vero: solo un tetto di sicurezza, uguale a quello del server */
const MAX_TRACKS = 500;
const MIN_TRACKS = 5;

/** cosa mostra il riquadro grande: l'editor di una domanda, la ricerca (per aggiungere o cambiare un brano) o l'import */
type Panel = { kind: "edit"; id: string } | { kind: "add" } | { kind: "replace"; id: string } | { kind: "import" };

export function MusicQuizCreate() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_SETTINGS);
  /* prima si imposta il quiz, poi si aggiungono le domande */
  const [step, setStep] = useState<"details" | "questions">("details");
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [panel, setPanel] = useState<Panel>({ kind: "add" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* ?edit=slug: si modifica un proprio quiz invece di crearne uno */
  const editSlug = String(useSearchParams().get("edit") || "").trim();
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editSlug));
  const [editErr, setEditErr] = useState("");

  useEffect(() => {
    if (!editSlug || !token) return;
    let alive = true;
    void loadMusicQuizPack(token, editSlug).then((r) => {
      if (!alive) return;
      setLoadingEdit(false);
      if (!r.ok) return setEditErr(r.message);
      const p = r.data.pack;
      if (!p.mine) return setEditErr("Puoi modificare solo i quiz che hai creato tu.");
      setTitle(p.title || "");
      setSettings({
        ...DEFAULT_SETTINGS,
        coverUrl: p.customCover ? p.cover || "" : "",
        description: p.description || "",
        language: p.language || "it",
        languages: p.languages || [],
        category: p.category || "general",
        tags: p.tags || [],
        visibility: p.visibility === "unlisted" ? "unlisted" : "public",
        anonymous: Boolean(p.anonymous),
      });
      const qs = (p.tracks || []).map((t) => {
        const wrong = [...(t.wrong || [])];
        while (wrong.length < 3) wrong.push("");
        return { ...t, start: Number(t.start || 0), answer: t.answer || "", wrong: wrong.slice(0, 3) } as QuizQuestion;
      });
      setQuestions(qs);
      if (qs[0]) setPanel({ kind: "edit", id: qs[0].id });
    });
    return () => {
      alive = false;
    };
  }, [editSlug, token]);

  const current = panel.kind === "edit" ? questions.find((q) => q.id === panel.id) : undefined;

  function addTrack(t: MusicQuizTrack) {
    if (questions.some((q) => q.id === t.id) || questions.length >= MAX_TRACKS) return;
    setQuestions((prev) => [...prev, asQuestion(t)]);
    setPanel({ kind: "edit", id: t.id });
  }

  function replaceTrack(oldId: string, t: MusicQuizTrack) {
    if (questions.some((q) => q.id === t.id && q.id !== oldId)) return;
    setQuestions((prev) => prev.map((q) => (q.id === oldId ? asQuestion(t) : q)));
    setPanel({ kind: "edit", id: t.id });
  }

  function remove(id: string) {
    const i = questions.findIndex((q) => q.id === id);
    const rest = questions.filter((q) => q.id !== id);
    setQuestions(rest);
    const next = rest[Math.min(i, rest.length - 1)];
    setPanel(next ? { kind: "edit", id: next.id } : { kind: "add" });
  }

  function addImported(tracks: MusicQuizTrack[], name: string) {
    const fresh = tracks.filter((t) => !questions.some((q) => q.id === t.id)).slice(0, MAX_TRACKS - questions.length);
    if (!fresh.length) return;
    setQuestions((prev) => [...prev, ...fresh.map(asQuestion)].slice(0, MAX_TRACKS));
    if (!title.trim() && name) setTitle(name);
    /* si apre la prima domanda nuova: le altre sono nell'elenco a sinistra */
    setPanel({ kind: "edit", id: fresh[0]!.id });
  }

  async function publish() {
    if (!token) return;
    setBusy(true);
    setErr("");
    const tracks = questions.map((q) => ({
      ...q,
      answer: q.answer.trim(),
      wrong: q.wrong.map((w) => w.trim()).filter(Boolean),
    }));
    const { coverUrl: _keep, ...rest } = settings;
    void _keep;
    const body = { title: title.trim(), tracks, ...rest };
    const r = editSlug ? await updateMusicQuizPack(token, editSlug, body) : await createMusicQuizPack(token, body);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    router.push(page(`/music-quiz/pack/?slug=${encodeURIComponent(r.data.pack.slug)}`));
  }

  /* prima delle domande vanno compilati tutti i dettagli (lingua, categoria, visibilità e creatore hanno già una scelta) */
  const missing = [
    title.trim().length < 2 && "il nome",
    !settings.coverImage && !settings.coverUrl && "la copertina",
    settings.description.trim().length < 10 && "la descrizione",
    !settings.tags.length && "almeno un tag",
  ].filter(Boolean) as string[];
  const detailsDone = missing.length === 0;
  const missingText = missing.length > 1 ? `${missing.slice(0, -1).join(", ")} e ${missing[missing.length - 1]}` : missing[0] || "";
  const ready = questions.length >= MIN_TRACKS && detailsDone;
  const pool = questions.map((q) => q.title);

  const publishButton = (
    <>
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => void publish()}
        className="w-full rounded-full bg-caramel px-6 py-3 font-semibold text-ink transition  disabled:translate-y-0 disabled:opacity-40"
      >
        {busy
          ? editSlug
            ? "Salvo…"
            : "Pubblico…"
          : ready
            ? editSlug
              ? "Salva le modifiche"
              : "Pubblica il quiz"
            : questions.length < MIN_TRACKS
              ? `Mancano ${MIN_TRACKS - questions.length} ${MIN_TRACKS - questions.length === 1 ? "brano" : "brani"}`
              : "Scrivi un nome"}
      </button>
      {err ? <p className="mt-2 text-center text-sm text-ember">{err}</p> : null}
    </>
  );

  if (editSlug && (loadingEdit || editErr)) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-20 pt-32 text-center">
        {editErr ? (
          <>
            <p className="text-ember">{editErr}</p>
            <SmartLink href={page("/music-quiz/")} className="mt-4 inline-block text-sm font-semibold text-caramel">
              Torna ai quiz
            </SmartLink>
          </>
        ) : (
          <Loader2 className="mx-auto size-6 animate-spin text-caramel" aria-label="Carico il quiz" />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-20 pt-24 sm:pt-28">
      <SmartLink href={page("/music-quiz/")} className="inline-flex items-center gap-1.5 text-sm text-crema/60 transition hover:text-crema">
        <ArrowLeft className="size-4" aria-hidden /> Tutti i quiz
      </SmartLink>

      <StepTabs
        step={step}
        canGo={detailsDone}
        lockedHint={missingText ? `Manca ${missingText}` : ""}
        count={questions.length}
        onStep={(st) => (st === "questions" && !detailsDone ? undefined : setStep(st))}
      />

      {step === "details" ? (
        <>
          <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 ring-1 ring-sand/15 sm:p-8">
            <p className="text-xs font-semibold text-caramel">{editSlug ? "Modifica quiz" : "Nuovo quiz"}</p>
            <input
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dai un nome al quiz"
              className="mt-2 w-full border-0 bg-transparent font-display text-4xl font-semibold text-crema outline-none placeholder:text-crema/30"
            />
            <p className="mt-2 text-sm text-crema/60">
              Aggiungi almeno {MIN_TRACKS} brani, quanti ne vuoi. Per ognuno puoi scegliere lo spezzone e scrivere le risposte; ogni partita ne pesca 10 a caso.
            </p>
          </section>

          <MusicQuizSettings
            value={settings}
            onChange={setSettings}
            creator={{ name: user ? displayName(user) : "", avatar: user ? avatarUrl(user, 128) : "" }}
          />

          <div className="mx-auto max-w-md text-center">
            <button
              type="button"
              disabled={!detailsDone}
              onClick={() => {
                setStep("questions");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-caramel px-6 py-3 font-semibold text-ink transition  disabled:translate-y-0 disabled:opacity-40"
            >
              Continua: aggiungi le domande <ArrowRight className="size-4" aria-hidden />
            </button>
            {!detailsDone ? <p className="mt-2 text-sm text-crema/55">Per andare avanti manca {missingText}.</p> : null}
          </div>
        </>
      ) : (

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* elenco delle domande */}
        <aside className="flex h-fit flex-col rounded-3xl bg-roast/70 ring-1 ring-sand/10 lg:sticky lg:top-24">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="text-xs font-semibold text-crema/55">Domande</h2>
            <span className={cn("text-xs font-semibold tabular-nums", questions.length >= MIN_TRACKS ? "text-caramel" : "text-crema/50")}>
              {questions.length} {questions.length === 1 ? "brano" : "brani"}
            </span>
          </div>
          <ol data-lenis-prevent className="max-h-[26rem] space-y-1 overflow-y-auto overscroll-contain px-2 pb-2">
            <AnimatePresence initial={false}>
              {questions.map((q) => {
                const on = (panel.kind === "edit" || panel.kind === "replace") && panel.id === q.id;
                return (
                  <motion.li key={q.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
                    <div
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-2xl p-2 transition",
                        on ? "bg-caramel/15 ring-1 ring-caramel/40" : "hover:bg-crema/[0.05]",
                      )}
                    >
                      {on ? <span className="absolute -left-2 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-caramel" /> : null}
                      <button type="button" onClick={() => setPanel({ kind: "edit", id: q.id })} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={q.cover || "/images/logo-disco.png"} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-crema">{q.title}</span>
                          <span className="block truncate text-xs text-crema/50">{q.artist}</span>
                        </span>
                        {isCustomized(q) ? <span className="size-2 shrink-0 rounded-full bg-caramel" title="Personalizzata" /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(q.id)}
                        aria-label={`Togli ${q.title}`}
                        className="shrink-0 rounded-full p-1 text-crema/35 opacity-0 transition hover:text-ember group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
          <div className="space-y-2 border-t border-sand/10 p-3">
            <button
              type="button"
              onClick={() => setPanel({ kind: "add" })}
              disabled={questions.length >= MAX_TRACKS}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-40",
                panel.kind === "add" ? "bg-caramel text-ink" : "bg-crema/[0.07] text-crema hover:bg-crema/[0.12]",
              )}
            >
              <Plus className="size-4" aria-hidden /> Aggiungi domanda
            </button>
            <button
              type="button"
              onClick={() => setPanel({ kind: "import" })}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                panel.kind === "import" ? "text-caramel" : "text-crema/65 hover:text-crema",
              )}
            >
              <ListMusic className="size-4" aria-hidden /> Importa da una playlist
            </button>
            <div className="pt-1">{publishButton}</div>
          </div>
        </aside>

        {/* riquadro grande */}
        <div className="min-w-0">
          {panel.kind === "edit" && current ? (
            <QuestionEditor
              q={current}
              index={questions.indexOf(current)}
              total={questions.length}
              pool={pool}
              token={token}
              onChange={(next) => setQuestions((prev) => prev.map((q) => (q.id === current.id ? next : q)))}
              onReplace={() => setPanel({ kind: "replace", id: current.id })}
              onRemove={() => remove(current.id)}
            />
          ) : panel.kind === "import" ? (
            <ImportPanel token={token} full={questions.length >= MAX_TRACKS} onImported={addImported} />
          ) : (
            <TrackSearch
              token={token}
              mode={panel.kind === "replace" ? "replace" : "add"}
              taken={questions.map((q) => q.id)}
              full={questions.length >= MAX_TRACKS}
              onPick={(t) => (panel.kind === "replace" ? replaceTrack(panel.id, t) : addTrack(t))}
              onCancel={panel.kind === "replace" ? () => setPanel({ kind: "edit", id: panel.id }) : undefined}
            />
          )}
        </div>
      </div>

      )}
    </div>
  );
}

function StepTabs({
  step,
  canGo,
  lockedHint,
  count,
  onStep,
}: {
  step: "details" | "questions";
  canGo: boolean;
  lockedHint?: string;
  count: number;
  onStep: (s: "details" | "questions") => void;
}) {
  const tabs = [
    { id: "details" as const, n: 1, label: "Dettagli", sub: "Nome, copertina, categoria…" },
    { id: "questions" as const, n: 2, label: "Domande", sub: count ? `${count} ${count === 1 ? "brano" : "brani"}` : "Brani e risposte" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 rounded-3xl bg-roast/70 p-1.5 ring-1 ring-sand/10">
      {tabs.map((t) => {
        const on = step === t.id;
        const locked = t.id === "questions" && !canGo;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onStep(t.id)}
            disabled={locked}
            title={locked ? lockedHint || "Completa prima i dettagli" : undefined}
            className="relative flex items-center gap-3 rounded-[1.25rem] px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45"
          >
            {on ? <motion.span layoutId="create-step" className="absolute inset-0 rounded-[1.25rem] bg-gradient-to-br from-mocha to-roast ring-1 ring-caramel/45" /> : null}
            <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold", on ? "bg-caramel text-ink" : "bg-crema/[0.08] text-crema/60")}>
              {t.n}
            </span>
            <span className="relative min-w-0">
              <span className={cn("block font-semibold", on ? "text-crema" : "text-crema/70")}>{t.label}</span>
              <span className="block truncate text-xs text-crema/45">{t.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- cerca un brano (per aggiungerlo o per cambiarne uno) ---------- */

function TrackSearch({
  token,
  mode,
  taken,
  full,
  onPick,
  onCancel,
}: {
  token: string | null;
  mode: "add" | "replace";
  taken: string[];
  full: boolean;
  onPick: (t: MusicQuizTrack) => void;
  onCancel?: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MusicQuizTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!token || q.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const id = window.setTimeout(() => {
      void searchMusicQuiz(token, q.trim()).then((r) => {
        if (!alive) return;
        setSearching(false);
        setHits(r.ok ? (r.data.tracks || []).filter((t) => t.previewUrl) : []);
      });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [q, token]);

  useEffect(() => () => audio.current?.pause(), []);

  function listen(track: MusicQuizTrack) {
    if (!track.previewUrl) return;
    const a = audio.current || new Audio();
    audio.current = a;
    if (playing === track.id) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.src = track.previewUrl;
    a.onended = () => setPlaying(null);
    void a.play().then(() => setPlaying(track.id)).catch(() => setPlaying(null));
  }

  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-5 ring-1 ring-sand/15 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-crema">{mode === "replace" ? "Cambia brano" : "Aggiungi una domanda"}</h2>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-sm font-semibold text-crema/60 hover:text-crema">
            Annulla
          </button>
        ) : null}
      </div>
      <label className="relative block">
        <span className="sr-only">Cerca un brano</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-crema/45" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un brano o un artista…"
          className="w-full rounded-full border-0 bg-espresso/80 py-3 pl-11 pr-10 text-crema outline-none ring-1 ring-sand/20 placeholder:text-crema/40 focus:ring-2 focus:ring-caramel/60"
        />
        {searching ? <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-caramel" aria-hidden /> : null}
      </label>
      {full && mode === "add" ? <p className="mt-3 text-sm text-ember">Il quiz ha già {MAX_TRACKS} brani.</p> : null}
      <ul data-lenis-prevent className="mt-3 max-h-[30rem] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
        {hits.map((tr) => {
          const already = taken.includes(tr.id);
          return (
            <li key={tr.id} className={cn("flex items-center gap-3 rounded-2xl p-2 ring-1 transition", already ? "bg-caramel/10 ring-caramel/35" : "bg-roast/70 ring-sand/10")}>
              <button type="button" onClick={() => listen(tr)} aria-label={playing === tr.id ? "Ferma l'anteprima" : "Ascolta l'anteprima"} className="relative size-12 shrink-0 overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tr.cover || "/images/logo-disco.png"} alt="" className="size-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-ink/45 text-crema">{playing === tr.id ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}</span>
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-crema">{tr.title}</span>
                <span className="block truncate text-xs text-crema/55">{tr.artist}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  audio.current?.pause();
                  setPlaying(null);
                  onPick(tr);
                }}
                disabled={already || (full && mode === "add")}
                aria-label={mode === "replace" ? "Usa questo brano" : "Aggiungi al quiz"}
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full transition disabled:cursor-default",
                  already ? "bg-caramel text-ink" : "bg-crema/[0.07] text-crema hover:bg-caramel hover:text-ink",
                )}
              >
                {already ? <Check className="size-4" /> : <Plus className="size-4" />}
              </button>
            </li>
          );
        })}
        {!hits.length && q.trim().length >= 2 && !searching ? <li className="py-6 text-center text-sm text-crema/55">Nessun brano con anteprima trovato.</li> : null}
        {q.trim().length < 2 ? (
          <li className="py-8 text-center text-sm text-crema/45">Scrivi il nome di un brano o di un artista: aggiungendolo si apre la sua domanda.</li>
        ) : null}
      </ul>
    </section>
  );
}

/* ---------- import da Spotify / Apple Music / YouTube ---------- */

function ImportPanel({
  token,
  full,
  onImported,
}: {
  token: string | null;
  full: boolean;
  onImported: (tracks: MusicQuizTrack[], name: string) => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /* secondi passati dall'inizio dell'importazione (per far vedere che sta lavorando) */
  const [elapsed, setElapsed] = useState(0);

  /* mentre importa: chi prova a chiudere, ricaricare o cambiare pagina viene avvisato */
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const guardLinks = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!a) return;
      if (!window.confirm("Sto ancora importando i brani: se esci adesso l'importazione si perde. Vuoi uscire lo stesso?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [busy]);

  const step = elapsed < 4 ? "Leggo la playlist…" : elapsed < 15 ? "Cerco ogni brano su Deezer…" : elapsed < 35 ? "Controllo le anteprime…" : "Quasi fatto: le playlist lunghe richiedono un po' di più…";

  async function run() {
    if (!token || !link.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await importPlaylistLink(token, link.trim());
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    const { playlist, tracks } = r.data;
    if (!tracks.length) return setMsg({ ok: false, text: "Nessun brano di questa playlist ha un'anteprima disponibile." });
    setLink("");
    setMsg({
      ok: true,
      text: playlist.capped
        ? `Da «${playlist.name}» ho trovato ${tracks.length} brani con l'anteprima. Apple Music fa leggere solo i primi 300 brani di una playlist: per gli altri, dividila in Musica e importa anche la seconda parte (i brani si aggiungono a questi).`
        : `Da «${playlist.name}» ho trovato ${tracks.length} brani con l'anteprima.`,
    });
    onImported(tracks, playlist.name);
  }

  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-5 ring-1 ring-sand/15 sm:p-8">
      <h2 className="font-display text-2xl font-semibold text-crema">Importa da una playlist</h2>
      <p className="mt-1 text-sm text-crema/60">
        Incolla il link di una playlist pubblica di Spotify, Apple Music o YouTube: aggiungiamo i brani per te. Ci vuole qualche secondo.
      </p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Link della playlist (Spotify, Apple Music, YouTube…)"
          inputMode="url"
          className="min-w-0 flex-1 rounded-full border-0 bg-espresso/80 px-4 py-3 text-sm text-crema outline-none ring-1 ring-sand/20 placeholder:text-crema/35 focus:ring-2 focus:ring-caramel/60"
        />
        <button
          type="submit"
          disabled={busy || !link.trim() || full}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-caramel px-6 py-3 text-sm font-semibold text-ink transition  disabled:translate-y-0 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? "Cerco i brani…" : "Importa"}
        </button>
      </form>
      {busy ? (
        /* si vede bene che sta lavorando: barra che scorre, cosa sta facendo, da quanto, e di non uscire */
        <div className="mt-4 overflow-hidden rounded-2xl bg-espresso/70 ring-1 ring-caramel/30" role="status" aria-live="polite">
          <div className="relative h-1.5 w-full overflow-hidden bg-crema/[0.07]">
            <motion.span
              className="absolute inset-y-0 w-1/3 rounded-full bg-caramel"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <div className="flex items-start gap-3 p-4">
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-caramel" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-crema">Sto importando la playlist</p>
              <p className="mt-0.5 text-sm text-crema/65">
                {step} <span className="tabular-nums text-crema/45">· {elapsed} s</span>
              </p>
              <p className="mt-2 text-xs font-semibold text-ember">Non chiudere e non lasciare questa pagina finché non ho finito.</p>
            </div>
          </div>
        </div>
      ) : null}
      {full ? <p className="mt-2 text-sm text-ember">Il quiz ha già {MAX_TRACKS} brani.</p> : null}
      {msg ? <p className={cn("mt-3 text-sm", msg.ok ? "text-emerald-300" : "text-ember")}>{msg.text}</p> : null}
    </section>
  );
}

