"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Link2, Loader2, Pause, Play, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { createMusicQuizPack, importPlaylistLink, searchMusicQuiz, type MusicQuizTrack } from "@/lib/musicQuiz";

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
  const [spLink, setSpLink] = useState("");
  const [spBusy, setSpBusy] = useState(false);
  const [spMsg, setSpMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  async function importLink() {
    if (!token || !spLink.trim()) return;
    setSpBusy(true);
    setSpMsg(null);
    const r = await importPlaylistLink(token, spLink.trim());
    setSpBusy(false);
    if (!r.ok) return setSpMsg({ ok: false, text: r.message });
    const { playlist, tracks } = r.data;
    setPicked((prev) => {
      const next = [...prev];
      for (const t of tracks) {
        if (next.length >= MAX_TRACKS) break;
        if (next.some((p) => p.id === t.id)) continue;
        next.push(t);
      }
      return next;
    });
    if (!title.trim() && playlist.name) setTitle(playlist.name);
    setSpLink("");
    setSpMsg(
      tracks.length
        ? {
            ok: true,
            text: `Da «${playlist.name}» ho trovato ${tracks.length} brani con l'anteprima${tracks.length >= MAX_TRACKS ? ` (il quiz ne tiene al massimo ${MAX_TRACKS})` : ""}.`,
          }
        : { ok: false, text: "Nessun brano di questa playlist ha un'anteprima disponibile." },
    );
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

      <section className="rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-caramel text-ink">
            <Link2 className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-crema">Hai già una playlist su Spotify, Apple Music o YouTube?</h2>
            <p className="text-xs text-crema/55">Incolla il link e aggiungiamo i brani per te. La playlist deve essere pubblica; ci vuole qualche secondo.</p>
          </div>
        </div>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void importLink();
          }}
        >
          <input
            value={spLink}
            onChange={(e) => setSpLink(e.target.value)}
            placeholder="Link della playlist (Spotify, Apple Music, YouTube…)"
            inputMode="url"
            className="min-w-0 flex-1 rounded-full border-0 bg-espresso/80 px-4 py-2.5 text-sm text-crema outline-none ring-1 ring-sand/20 placeholder:text-crema/35 focus:ring-2 focus:ring-caramel/60"
          />
          <button
            type="submit"
            disabled={spBusy || !spLink.trim() || picked.length >= MAX_TRACKS}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-bold text-ink transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
          >
            {spBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {spBusy ? "Cerco i brani…" : "Importa"}
          </button>
        </form>
        {spMsg ? <p className={cn("mt-2 text-sm", spMsg.ok ? "text-emerald-300" : "text-ember")}>{spMsg.text}</p> : null}
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
