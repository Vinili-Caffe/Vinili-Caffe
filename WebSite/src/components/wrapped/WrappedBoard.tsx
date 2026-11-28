"use client";

/**
 * Vinili Wrapped — pagina d'ingresso (WrappedLanding) → poi la storia a tutta pagina.
 * Non apre lo slideshow all’arrivo: serve “Gira il vinile”.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";
import { Share2, Volume2, VolumeX, X } from "lucide-react";
import { VinylRecord } from "@/components/VinylRecord";
import { WrappedSlideDecor } from "@/components/wrapped/WrappedSlideDecor";
import { WrappedShareSheet } from "@/components/wrapped/WrappedShareSheet";
import { WrappedRecap } from "@/components/wrapped/WrappedRecap";
import { WrappedStorySlide } from "@/components/wrapped/WrappedStorySlide";
import { WrappedLanding } from "@/components/wrapped/WrappedLanding";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { useAuth } from "@/lib/auth";
import { celebrate } from "@/lib/confetti";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import { getVinylMusicApi } from "@/lib/vinyl-music-bus";
import {
  isWrappedAudioMuted,
  playWrappedMotif,
  playWrappedWhoosh,
  setWrappedAudioMuted,
  unlockWrappedAudio,
} from "@/lib/wrappedAudio";
import { moodForStoryKey, type WrappedMood } from "@/lib/wrappedMoods";
import { isWrappedSeason, isWrappedYearlySeason } from "@/lib/site-effects";
import { loadStaffAccess } from "@/lib/staff";
import {
  completeWrapped,
  loadWrapped,
  wrappedPeriodLabel,
  type LoadWrappedOpts,
  type WrappedPayload,
} from "@/lib/wrapped";
import { prefetchWrappedShareCards } from "@/lib/wrappedShareCard";
import { buildStoryCards, type StoryCard } from "@/lib/wrappedStories";

const ease = [0.22, 1, 0.36, 1] as const;

type Field = { key: string; mood: WrappedMood; card: StoryCard; celebrate?: boolean };

function buildFields(stories: StoryCard[]): Field[] {
  return stories.map((s) => ({ key: s.key, mood: moodForStoryKey(s.key), card: s, celebrate: s.celebrate }));
}

export function WrappedBoard() {
  const { ready, token, login } = useAuth();
  const router = useRouter();
  const reduce = useReducedMotionSafe();
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
  /* Default sempre annuale (come prima). Mensile solo dal toggle Anno/Mese. */
  const [periodOpts, setPeriodOpts] = useState<LoadWrappedOpts>({ period: "yearly" });
  const siteMusicWasOn = useRef(false);
  const completeSent = useRef(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    const kickHome = () => {
      if (!alive) return;
      setData(null);
      setLoading(false);
      setDisabled(true);
      setImmersive(false);
      setLaunching(false);
      router.replace(page("/"));
    };

    const run = async () => {
      /* Fuori stagione (né annuale né mensile): solo high staff. Override: vc_wrapped_force=1 */
      const inSeason = isWrappedSeason();
      if (!inSeason) {
        if (!token) {
          kickHome();
          return;
        }
        setLoading(true);
        const staff = await loadStaffAccess(token);
        if (!alive) return;
        if (!staff.ok || !staff.data.isHighStaff) {
          kickHome();
          return;
        }
      }

      if (!token) {
        setDisabled(false);
        setData(null);
        setLoading(false);
        setImmersive(false);
        setLaunching(false);
        return;
      }

      setDisabled(false);
      setLoading(true);
      setError(null);
      setImmersive(false);
      setLaunching(false);
      completeSent.current = false;
      const res = await loadWrapped(token, periodOpts);
      if (!alive) return;
      setLoading(false);
      if (res.status === "ok") {
        setData(res.data);
        setIndex(0);
        /* landing hero — lo slideshow parte solo con “Gira il vinile” */
        return;
      }
      if (res.status === "disabled") {
        kickHome();
        return;
      }
      if (res.status === "auth") return setError("Sessione scaduta: accedi di nuovo.");
      if (res.status === "forbidden") return setError("Devi essere nel server Discord Vinili & Caffè.");
      setError(res.message || "Errore caricamento.");
    };

    void run();
    return () => {
      alive = false;
    };
  }, [ready, token, router, periodOpts]);

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

  /* Ultima slide (share) = Wrapped finito → ruolo Discord solo sull’annuale. */
  useEffect(() => {
    if (!immersive || !token || !field || field.key !== "share") return;
    if (completeSent.current) return;
    completeSent.current = true;
    void completeWrapped(token, periodOpts);
  }, [immersive, field, token, periodOpts]);

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

  if (disabled) {
    return null;
  }

  /* pagina d'ingresso: una sola, con titolo enorme, la tua busta e le copertine delle schede a ventaglio */
  if (!ready || (token && loading)) return <WrappedLanding mode="loading" />;
  if (!token) return <WrappedLanding mode="login" onAction={login} />;
  if (error || !data) return <WrappedLanding mode="error" message={error || undefined} onAction={() => window.location.reload()} />;

  if (!immersive) {
    const periodLabel = wrappedPeriodLabel(data);
    const monthly = data.period === "monthly";
    const canYearly = Boolean(data.available?.yearly) || isWrappedYearlySeason();
    const canMonthly = data.available?.monthly !== false;
    return (
      <>
        <WrappedLanding
          mode="ready"
          name={data.user.displayName}
          userId={data.user.id}
          avatarUrl={data.user.avatarUrl}
          periodLabel={periodLabel}
          monthly={monthly}
          launching={launching}
          onAction={startWrapped}
          periodSwitch={
            canYearly && canMonthly ? (
              <div className="inline-flex rounded-full bg-[#f4e9d8]/10 p-1 ring-1 ring-[#f4e9d8]/15" role="group" aria-label="Periodo Wrapped">
                {([
                  ["yearly", "Anno"],
                  ["monthly", "Mese"],
                ] as const).map(([p, label]) => {
                  const on = (p === "monthly") === monthly;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={launching || on}
                      onClick={() => setPeriodOpts({ period: p })}
                      className={on ? "rounded-full bg-[#f4e9d8] px-4 py-1.5 text-xs font-bold text-[#140d09]" : "rounded-full px-4 py-1.5 text-xs font-semibold text-[#f4e9d8]/70 transition hover:text-[#f4e9d8]"}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null
          }
        />

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

  const ink = field.mood.ink;
  const iconBtn = "inline-flex size-10 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-105";
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col"
      style={{ background: field.mood.paper, color: ink }}
      role="dialog"
      aria-modal="true"
      aria-label="Vinili & Caffè Wrapped"
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={`bg-${field.key}`}
          className="absolute inset-0"
          initial={reduce ? { opacity: 0 } : { clipPath: dir > 0 ? "circle(0% at 100% 50%)" : "circle(0% at 0% 50%)" }}
          animate={reduce ? { opacity: 1 } : { clipPath: dir > 0 ? "circle(150% at 100% 50%)" : "circle(150% at 0% 50%)" }}
          exit={{ opacity: 1 }}
          transition={{ duration: reduce ? 0.15 : 0.7, ease }}
        >
          <WrappedSlideDecor mood={field.mood} celebrate={field.celebrate} />
        </motion.div>
      </AnimatePresence>

      {/* tacche in alto: una per scheda */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {fields.map((f, i) => (
          <div key={f.key} className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: `${ink}26` }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: ink }}
              initial={false}
              animate={{ width: i <= index ? "100%" : "0%" }}
              transition={{ duration: reduce ? 0 : 0.45, ease }}
            />
          </div>
        ))}
      </div>

      <div className="absolute inset-x-3 top-[max(1.4rem,env(safe-area-inset-top))] z-30 flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.25em]" style={{ opacity: 0.7 }}>
          Vinili Wrapped · {wrappedPeriodLabel(data)}
        </p>
        <div className="flex gap-1.5">
          <button type="button" onClick={toggleSound} className={iconBtn} style={{ background: `${ink}1a` }} aria-label={soundOn ? "Disattiva suoni" : "Attiva suoni"}>
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <button type="button" onClick={openShare} className={iconBtn} style={{ background: `${ink}1a` }} aria-label="Condividi">
            <Share2 className="size-4" />
          </button>
          <button type="button" onClick={() => setImmersive(false)} className={iconBtn} style={{ background: `${ink}1a` }} aria-label="Chiudi">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 cursor-pointer select-none flex-col" onClick={onStagePointer}>
        <div className={cn("flex flex-1 flex-col px-6 pb-14 pt-24 sm:px-14", field.key === "share" ? "overflow-y-auto" : "justify-end sm:justify-center")}>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={field.key}
              custom={dir}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -30 }}
              transition={{ duration: reduce ? 0.15 : 0.4, ease }}
              className={cn("mx-auto w-full max-w-4xl", field.key === "share" && "my-auto text-center")}
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
                <WrappedStorySlide card={field.card} mood={field.mood} data={data} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        {index === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 1.6 }}
            className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Tocca per andare avanti →
          </motion.p>
        ) : null}
      </div>

      {data ? <WrappedShareSheet open={shareOpen} data={data} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}
