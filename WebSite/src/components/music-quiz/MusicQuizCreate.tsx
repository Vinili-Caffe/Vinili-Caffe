"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Loader2, Pause, Play, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { createMusicQuizPack, searchMusicQuiz, type MusicQuizTrack } from "@/lib/musicQuiz";

const MAX_TRACKS = 40;
const MIN_TRACKS = 4;

export function MusicQuizCreate() {
  const { token } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MusicQuizTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<MusicQuizTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
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

  function toggle(track: MusicQuizTrack) {
    setPicked((prev) => {
      if (prev.some((t) => t.id === track.id)) return prev.filter((t) => t.id !== track.id);
      if (prev.length >= MAX_TRACKS) return prev;
      return [...prev, track];
    });
  }

  async function publish() {
    if (!token) return;
    setBusy(true);
    setErr("");
    const r = await createMusicQuizPack(token, { title: title.trim(), tracks: picked });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    router.push(page(`/music-quiz/pack/?slug=${encodeURIComponent(r.data.pack.slug)}`));
  }

  const ready = picked.length >= MIN_TRACKS && title.trim().length >= 2;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-20 pt-24 sm:pt-28">
      <SmartLink href={page("/music-quiz/")} className="inline-flex items-center gap-1.5 text-sm text-crema/60 transition hover:text-crema">
        <ArrowLeft className="size-4" aria-hidden /> Tutti i quiz
      </SmartLink>

      <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 ring-1 ring-sand/15 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">Nuovo quiz</p>
        <input
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Dai un nome al quiz"
          className="mt-2 w-full border-0 bg-transparent font-display text-4xl font-semibold text-crema outline-none placeholder:text-crema/30"
        />
        <p className="mt-2 text-sm text-crema/60">Scegli almeno {MIN_TRACKS} brani (fino a {MAX_TRACKS}). Ogni partita ne pesca 10 a caso: più brani metti, più il quiz cambia.</p>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <label className="relative block">
            <span className="sr-only">Cerca un brano</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-crema/45" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca un brano o un artista…"
              className="w-full rounded-full border-0 bg-espresso/80 py-3 pl-11 pr-10 text-crema outline-none ring-1 ring-sand/20 placeholder:text-crema/40 focus:ring-2 focus:ring-caramel/60"
            />
            {searching ? <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-caramel" aria-hidden /> : null}
          </label>
          <ul data-lenis-prevent className="mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
            {hits.map((tr) => {
              const on = picked.some((p) => p.id === tr.id);
              return (
                <li key={tr.id} className={cn("flex items-center gap-3 rounded-2xl p-2 ring-1 transition", on ? "bg-caramel/15 ring-caramel/45" : "bg-roast/70 ring-sand/10")}>
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
                    onClick={() => toggle(tr)}
                    disabled={!on && picked.length >= MAX_TRACKS}
                    aria-label={on ? "Togli dal quiz" : "Aggiungi al quiz"}
                    className={cn("grid size-9 shrink-0 place-items-center rounded-full transition", on ? "bg-caramel text-ink" : "bg-crema/[0.07] text-crema hover:bg-caramel/25")}
                  >
                    {on ? <Check className="size-4" /> : <Plus className="size-4" />}
                  </button>
                </li>
              );
            })}
            {!hits.length && q.trim().length >= 2 && !searching ? <li className="py-6 text-center text-sm text-crema/55">Nessun brano con anteprima trovato.</li> : null}
          </ul>
        </section>

        <aside className="h-fit rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 lg:sticky lg:top-24">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/55">Nel quiz</h2>
            <span className={cn("text-sm font-semibold tabular-nums", picked.length >= MIN_TRACKS ? "text-caramel" : "text-crema/55")}>
              {picked.length}/{MAX_TRACKS}
            </span>
          </div>
          {!picked.length ? (
            <p className="py-6 text-center text-sm text-crema/50">Cerca a sinistra e aggiungi i brani con il +.</p>
          ) : (
            <ol data-lenis-prevent className="max-h-[22rem] space-y-1 overflow-y-auto overscroll-contain pr-1">
              <AnimatePresence initial={false}>
                {picked.map((tr, i) => (
                  <motion.li key={tr.id} layout initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5">
                    <span className="w-5 text-right text-xs tabular-nums text-crema/45">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tr.cover || "/images/logo-disco.png"} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                    <span className="min-w-0 flex-1 truncate text-sm text-crema">{tr.title}</span>
                    <button type="button" onClick={() => toggle(tr)} aria-label="Togli" className="rounded-full p-1 text-crema/45 hover:text-ember">
                      <X className="size-3.5" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => void publish()}
            className="mt-4 w-full rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-bold text-ink transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
          >
            {busy ? "Pubblico…" : ready ? "Pubblica il quiz" : picked.length < MIN_TRACKS ? `Mancano ${MIN_TRACKS - picked.length} brani` : "Scrivi un nome"}
          </button>
          {err ? <p className="mt-2 text-center text-sm text-ember">{err}</p> : null}
        </aside>
      </div>
    </div>
  );
}
