"use client";

/**
 * Vinili Wrapped — landing stile pagine sito (PageHero) → poi story immersiva.
 * Non apre lo slideshow all’arrivo: serve “Gira il vinile”.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Disc3, Loader2, LogIn, Share2, Volume2, VolumeX, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHero } from "@/components/PageHero";
import { VinylRecord } from "@/components/VinylRecord";
import { WrappedSlideDecor } from "@/components/wrapped/WrappedSlideDecor";
import { WrappedShareSheet } from "@/components/wrapped/WrappedShareSheet";
import { WrappedRecap } from "@/components/wrapped/WrappedRecap";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { useAuth } from "@/lib/auth";
import { celebrate } from "@/lib/confetti";
import { cn } from "@/lib/cn";
import { getVinylMusicApi } from "@/lib/vinyl-music-bus";
import {
  isWrappedAudioMuted,
  playWrappedMotif,
  playWrappedWhoosh,
  setWrappedAudioMuted,
  unlockWrappedAudio,
} from "@/lib/wrappedAudio";
import { moodForStoryKey, type WrappedMood } from "@/lib/wrappedMoods";
import { loadWrapped, type WrappedPayload } from "@/lib/wrapped";
import { prefetchWrappedShareCards } from "@/lib/wrappedShareCard";
import { buildStoryCards, type StoryCard } from "@/lib/wrappedStories";

type Field = {
  key: string;
  mood: WrappedMood;
  titleText: string;
  kicker: string;
  line: ReactNode;
  whisper?: ReactNode;
  celebrate?: boolean;
};

const ease = [0.22, 1, 0.36, 1] as const;

function StaggerTitle({ text, accent }: { text: string; accent: string }) {
  const chars = Array.from(text);
  return (
    <span className="inline-block text-[0.72em] leading-[1.05]" style={{ color: accent }}>
      {chars.map((ch, i) => (
        <motion.span
          key={`${i}-${ch}`}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: Math.min(0.45, i * 0.028), duration: 0.45, ease }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

function buildFields(stories: StoryCard[]): Field[] {
  return stories.map((s) => {
    const isShare = s.key === "share";
    const mood = moodForStoryKey(s.key);
    return {
      key: s.key,
      mood,
      titleText: s.title,
      kicker: s.kicker,
      celebrate: s.celebrate,
      line: isShare ? null : <StaggerTitle text={s.title} accent="#f4e9d8" />,
      whisper: isShare ? undefined : (
        <>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.5, ease }}
            className="text-base text-[#f4e9d8]/80 sm:text-lg"
          >
            {s.body}
          </motion.p>
          {s.footnote ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="mt-4 text-sm font-semibold"
              style={{ color: mood.accent }}
            >
              {s.footnote}
            </motion.p>
          ) : null}
        </>
      ),
    };
  });
}

function WrappedShell({
  children,
  title = "Vinili Wrapped",
  accent,
  text = "Il tuo disco della community — senza brani, solo te.",
}: {
  children: ReactNode;
  title?: string;
  accent?: string;
  text?: string;
}) {
  return (
    <>
      <PageHero icon={<Disc3 />} kicker="Studio" title={title} accent={accent} text={text} />
      <div className="relative mx-auto max-w-lg px-6 pb-28">{children}</div>
    </>
  );
}

export function WrappedBoard() {
  const { ready, token, login } = useAuth();
  const reduce = useReducedMotion();
  const confettiRich = useFxCap("confettiRich");
  const [data, setData] = useState<WrappedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [shareOpen, setShareOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [soundOn, setSoundOn] = useState(() => !isWrappedAudioMuted());
  const siteMusicWasOn = useRef(false);

  useEffect(() => {
    if (!ready || !token) {
      setData(null);
      setLoading(false);
      setImmersive(false);
      setLaunching(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setDisabled(false);
    setImmersive(false);
    setLaunching(false);
    loadWrapped(token).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res.status === "ok") {
        setData(res.data);
        setIndex(0);
        /* landing hero — lo slideshow parte solo con “Gira il vinile” */
        return;
      }
      if (res.status === "disabled") return setDisabled(true);
      if (res.status === "auth") return setError("Sessione scaduta: accedi di nuovo.");
      if (res.status === "forbidden") return setError("Devi essere nel server Discord Vinili & Caffè.");
      setError(res.message || "Errore caricamento.");
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  const stories = useMemo(() => (data ? buildStoryCards(data) : []), [data]);
  const fields = useMemo(() => buildFields(stories), [stories]);
  const field = fields[index] || null;
  const last = Math.max(0, fields.length - 1);

  const go = useCallback(
    (d: -1 | 1) => {
      setDir(d);
      setIndex((i) => Math.min(last, Math.max(0, i + d)));
    },
    [last],
  );

  useEffect(() => {
    if (!immersive && !launching) return;
    const root = document.documentElement;
    const body = document.body;
    const prevRoot = root.style.overflow;
    const prevBody = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      root.style.overflow = prevRoot;
      body.style.overflow = prevBody;
    };
  }, [immersive, launching]);

  useEffect(() => {
    if (!immersive || !fields.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Escape") {
        setImmersive(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, fields.length, immersive]);

  useEffect(() => {
    if (immersive && field?.celebrate) celebrate(confettiRich);
  }, [field?.key, field?.celebrate, confettiRich, immersive]);

  /* Duck musica sito all’ingresso; motif a ogni slide. */
  useEffect(() => {
    if (!immersive) return;
    const api = getVinylMusicApi();
    siteMusicWasOn.current = Boolean(api?.on);
    if (api?.on) api.setPlaying(false);
    void unlockWrappedAudio().then(() => playWrappedWhoosh());
    return () => {
      if (siteMusicWasOn.current) getVinylMusicApi()?.setPlaying(true);
    };
  }, [immersive]);

  useEffect(() => {
    if (!immersive || !field || !soundOn) return;
    void unlockWrappedAudio().then(() => playWrappedMotif(field.mood));
  }, [immersive, field?.key, soundOn, field]);

  useEffect(() => {
    if (!data) return;
    prefetchWrappedShareCards(data);
  }, [data]);

  const openShare = useCallback(() => {
    if (!data) return;
    setShareOpen(true);
  }, [data]);

  const onStagePointer = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.28) go(-1);
    else go(1);
  };

  const finishLaunch = useCallback(() => {
    setIndex(0);
    setDir(1);
    void unlockWrappedAudio();
    setImmersive(true);
    setLaunching(false);
  }, []);

  const toggleSound = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    setSoundOn((prev) => {
      const next = !prev;
      setWrappedAudioMuted(!next);
      if (next) void unlockWrappedAudio().then(() => field && playWrappedMotif(field.mood));
      return next;
    });
  }, [field]);

  useEffect(() => {
    if (!launching || reduce) return;
    const t = window.setTimeout(finishLaunch, 1400);
    return () => window.clearTimeout(t);
  }, [launching, reduce, finishLaunch]);

  const startWrapped = () => {
    if (launching || immersive) return;
    if (reduce) {
      finishLaunch();
      return;
    }
    setLaunching(true);
  };

  if (!ready || (token && loading)) {
    return (
      <WrappedShell text="Masterizziamo il tuo vinile…">
        <div className="flex flex-col items-center gap-5 py-10 text-center">
          <motion.div
            className="size-28"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={reduce ? undefined : { duration: 2.8, repeat: Infinity, ease: "linear" }}
          >
            <VinylRecord className="size-full drop-shadow-[0_16px_40px_rgba(0,0,0,0.55)]" />
          </motion.div>
          <p className="inline-flex items-center gap-2 text-sm text-crema/55">
            <Loader2 className="size-4 animate-spin text-caramel" aria-hidden />
            Prepariamo il piatto…
          </p>
        </div>
      </WrappedShell>
    );
  }

  if (!token) {
    return (
      <WrappedShell accent="preview" text="Accedi con Discord per girare il tuo disco community.">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease }}
          className="rounded-[1.75rem] bg-ink/40 px-6 py-10 text-center ring-1 ring-crema/10 backdrop-blur-sm"
        >
          <div className="mx-auto size-28">
            <VinylRecord className="size-full drop-shadow-[0_16px_40px_rgba(0,0,0,0.55)]" />
          </div>
          <p className="mt-6 text-sm text-crema/60">Serve il login Discord per aprire il Wrapped.</p>
          <button
            type="button"
            onClick={login}
            className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#5865f2] px-7 text-sm font-semibold text-white transition-[transform,filter] duration-200 ease-out hover:brightness-110 active:scale-[0.97]"
          >
            <LogIn className="size-4" aria-hidden /> Accedi con Discord
          </button>
        </motion.div>
      </WrappedShell>
    );
  }

  if (disabled) {
    return (
      <WrappedShell title="Ancora sottochiave" text="Preview studio — non ancora aperta a tutti.">
        <div className="rounded-[1.75rem] bg-ink/40 px-6 py-10 text-center ring-1 ring-crema/10">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-sand">Soon</p>
          <p className="mt-3 font-display text-2xl text-crema">Torna più tardi</p>
        </div>
      </WrappedShell>
    );
  }

  if (error || !data) {
    return (
      <WrappedShell title="Non disponibile" text={error || "Nessun dato."}>
        <div className="rounded-[1.75rem] bg-ink/40 px-6 py-8 text-center ring-1 ring-crema/10">
          <p className="text-sm text-crema/55">{error || "Riprova tra poco."}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-caramel/90 px-6 text-sm font-semibold text-espresso"
          >
            Riprova
          </button>
        </div>
      </WrappedShell>
    );
  }

  if (!immersive) {
    return (
      <>
        <WrappedShell accent={String(data.year)} text="Il tuo disco community — senza brani, solo te.">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: launching ? 0.35 : 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="relative overflow-hidden rounded-[1.75rem] bg-ink/45 px-6 py-12 text-center ring-1 ring-crema/12 backdrop-blur-sm"
          >
            <div
              className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-caramel/15 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-16 -left-10 size-44 rounded-full bg-ember/10 blur-3xl"
              aria-hidden
            />

            <Avatar
              userId={data.user.id}
              src={data.user.avatarUrl || undefined}
              name={data.user.displayName}
              className="relative mx-auto size-24 ring-2 ring-caramel/45"
            />

            <h2 className="relative mt-6 font-display text-4xl font-semibold leading-tight text-crema sm:text-5xl">
              Pronto, {data.user.displayName}?
            </h2>
            <p className="relative mx-auto mt-3 max-w-sm text-sm leading-relaxed text-crema/60">
              Un giro di slide sul tuo anno qui. Tocca quando vuoi.
            </p>

            <button
              type="button"
              onClick={startWrapped}
              disabled={launching}
              className="relative mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-caramel px-9 text-sm font-semibold text-espresso shadow-[0_12px_40px_-12px_rgba(240,180,110,0.55)] transition hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-70"
            >
              <Disc3 className="size-4" aria-hidden />
              {launching ? "Gira…" : "Gira il vinile"}
            </button>

            {/* Disco centrato: solo VinylRecord, niente braccio decentrato */}
            <div className="relative mx-auto mt-10 flex size-36 items-center justify-center sm:size-40">
              <motion.div
                className="size-full"
                animate={
                  launching
                    ? { rotate: 360 * 3, scale: 1.06 }
                    : reduce
                      ? { rotate: 0 }
                      : { rotate: 360 }
                }
                transition={
                  launching
                    ? { duration: 1.05, ease: "linear" }
                    : reduce
                      ? undefined
                      : { duration: 14, repeat: Infinity, ease: "linear" }
                }
                style={{ transformOrigin: "50% 50%" }}
              >
                <VinylRecord className="size-full drop-shadow-[0_18px_42px_rgba(0,0,0,0.6)]" />
              </motion.div>
            </div>
          </motion.div>
        </WrappedShell>

        <AnimatePresence>
          {launching ? (
            <motion.div
              key="wrapped-zoom"
              className="fixed inset-0 z-[95] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden
            >
              <motion.div
                className="absolute inset-0 bg-[#0e0906]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.45, delay: 0.2, ease }}
              />
              <motion.div
                className="relative size-36 sm:size-44 will-change-transform"
                initial={{ scale: 1, rotate: 0 }}
                animate={{ scale: 28, rotate: 720 }}
                transition={{ duration: 1.15, ease: [0.33, 0.1, 0.25, 1], delay: 0.12 }}
                style={{ transformOrigin: "50% 50%" }}
              >
                <VinylRecord className="size-full" />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </>
    );
  }

  if (!field) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col text-[#f4e9d8]"
      style={{ background: field.mood.bg }}
      role="dialog"
      aria-modal="true"
      aria-label="Vinili Wrapped"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${field.key}`}
          className="absolute inset-0"
          style={{ background: field.mood.bg }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.15 : 0.5 }}
        >
          <WrappedSlideDecor mood={field.mood} celebrate={field.celebrate} />
        </motion.div>
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex gap-1.5 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {fields.map((f, i) => (
          <div key={f.key} className="h-1 flex-1 overflow-hidden rounded-full bg-[#f4e9d8]/12">
            <motion.div
              className="h-full rounded-full"
              style={{ background: field.mood.accent }}
              initial={false}
              animate={{ width: i < index ? "100%" : i === index ? "100%" : "0%" }}
              transition={{ duration: reduce ? 0 : 0.45, ease }}
            />
          </div>
        ))}
      </div>

      <div className="absolute right-3 top-[max(1.25rem,env(safe-area-inset-top))] z-30 flex gap-2">
        <button
          type="button"
          onClick={toggleSound}
          className="inline-flex size-11 items-center justify-center rounded-full bg-[#f4e9d8]/10 text-[#f4e9d8] ring-1 ring-[#f4e9d8]/15 backdrop-blur-sm"
          aria-label={soundOn ? "Disattiva suoni" : "Attiva suoni"}
        >
          {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
        <button
          type="button"
          onClick={openShare}
          className="inline-flex size-11 items-center justify-center rounded-full bg-[#f4e9d8]/10 text-[#f4e9d8] ring-1 ring-[#f4e9d8]/15 backdrop-blur-sm"
          aria-label="Condividi"
        >
          <Share2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setImmersive(false)}
          className="inline-flex size-11 items-center justify-center rounded-full bg-[#f4e9d8]/10 text-[#f4e9d8] ring-1 ring-[#f4e9d8]/15 backdrop-blur-sm"
          aria-label="Chiudi"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 cursor-pointer select-none flex-col" onClick={onStagePointer}>
        <div className={cn("flex flex-1 flex-col px-6 pb-16 pt-20 sm:px-12", field.key === "share" ? "overflow-y-auto" : "justify-center")}>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={field.key}
              custom={dir}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: dir * 36, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: dir * -24, scale: 1.02 }}
              transition={{ duration: reduce ? 0.15 : 0.48, ease }}
              className={cn("mx-auto w-full max-w-3xl text-center", field.key === "share" && "my-auto")}
            >
              {field.key === "share" ? (
                <WrappedRecap
                  data={data}
                  cards={stories}
                  accent={field.mood.accent}
                  onShare={openShare}
                  onReplay={() => {
                    setDir(-1);
                    setIndex(0);
                  }}
                />
              ) : (
                <>
              <motion.p
                initial={{ opacity: 0, letterSpacing: "0.4em" }}
                animate={{ opacity: 0.75, letterSpacing: "0.28em" }}
                transition={{ duration: 0.55, ease }}
                className="text-[0.7rem] font-semibold uppercase"
                style={{ color: field.mood.accent }}
              >
                {field.kicker}
              </motion.p>
              <h1 className="mt-5 font-display text-[clamp(3rem,12vw,6.5rem)] font-semibold leading-[0.92] tracking-tight drop-shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
                {field.line}
              </h1>
              {field.whisper ? (
                <div className="mx-auto mt-6 max-w-md text-base text-[#f4e9d8]/70 sm:text-lg">{field.whisper}</div>
              ) : null}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] text-center text-[0.65rem] uppercase tracking-[0.2em] text-[#f4e9d8]/30">
          tocca · {index + 1}/{fields.length}
        </p>
      </div>

      {data ? <WrappedShareSheet open={shareOpen} data={data} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}
