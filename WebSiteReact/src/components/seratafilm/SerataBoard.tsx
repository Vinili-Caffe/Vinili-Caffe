"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Clapperboard, Ticket } from "lucide-react";
import { AuthGateCard } from "@/components/AuthGateCard";
import { useAuth } from "@/lib/auth";
import {
  COUNTDOWN_BEEP_AT_SEC,
  COUNTDOWN_LEAD_MS,
  COUNTDOWN_MP3,
  CREDITS_SKIP,
  FILM_POSTER,
  FINAL_COUNTDOWN_MS,
  SERATA_EVENT,
  countdownParts,
  filmTitle,
  loadSerataAccess,
  liveFilmStartMs,
  nextFilmAtMs,
  resolveSerataBgmYtId,
} from "@/lib/seratafilm";
import { page } from "@/lib/site";
import { loadYtApi, type YtPlayer } from "@/lib/youtube-player";
import { cn } from "@/lib/cn";
import { MusicDock } from "@/components/MusicDock";

const VOL_KEY = "vc_seratafilm_bgm_volume_v1";

function readVol() {
  try {
    const n = Number(localStorage.getItem(VOL_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch {
    /* ignore */
  }
  return 0.34;
}

function Countdown({ now, target }: { now: number | null; target: number }) {
  const c = now == null ? { live: false, days: 0, hours: 0, minutes: 0, seconds: 0 } : countdownParts(target, now);
  if (c.live) {
    return <p className="font-display text-4xl text-sand sm:text-5xl">Serata in corso</p>;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex flex-wrap justify-center gap-3 sm:gap-5">
      {[
        { label: "giorni", v: c.days },
        { label: "ore", v: c.hours },
        { label: "min", v: c.minutes },
        { label: "sec", v: c.seconds },
      ].map((x) => (
        <div key={x.label} className="min-w-[4.5rem] rounded-2xl bg-espresso/70 px-3 py-3 ring-1 ring-sand/15 sm:min-w-[5.5rem]">
          <p className="font-display text-3xl lining-nums text-sand sm:text-4xl">{now == null ? "--" : pad(x.v)}</p>
          <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-crema/40">{x.label}</p>
        </div>
      ))}
    </div>
  );
}

/** BGM YouTube: volume + seek; dock sale solo con freccia torna-su; stop a inizio film. */
function SerataBgm({ armed, stop }: { armed: boolean; stop: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<YtPlayer | null>(null);
  const videoId = resolveSerataBgmYtId();
  const [on, setOn] = useState(false);
  const [hint, setHint] = useState(true);
  const [volume, setVolume] = useState(0.34);
  const [seek, setSeek] = useState(0);
  const seeking = useRef(false);

  useEffect(() => {
    setVolume(readVol());
  }, []);

  useEffect(() => {
    if (!armed || stop) return;
    let cancelled = false;
    loadYtApi()
      .then((YT) => {
        if (cancelled || !host.current || yt.current) return;
        host.current.innerHTML = "";
        const slot = document.createElement("div");
        host.current.appendChild(slot);
        new YT.Player(slot, {
          videoId,
          width: 1,
          height: 1,
          host: "https://www.youtube-nocookie.com",
          playerVars: { autoplay: 0, controls: 0, loop: 1, playlist: videoId, playsinline: 1, modestbranding: 1 },
          events: {
            onReady: (e) => {
              yt.current = e.target;
              try {
                e.target.setVolume(Math.round(readVol() * 100));
              } catch {
                /* ignore */
              }
            },
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) {
                try {
                  e.target.seekTo(0, true);
                  e.target.playVideo();
                } catch {
                  /* ignore */
                }
              }
            },
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      try {
        yt.current?.destroy();
      } catch {
        /* ignore */
      }
      yt.current = null;
      try {
        if (host.current) host.current.innerHTML = "";
      } catch {
        /* ignore */
      }
    };
  }, [armed, videoId, stop]);

  useEffect(() => {
    if (!stop) return;
    try {
      yt.current?.pauseVideo();
    } catch {
      /* ignore */
    }
    setOn(false);
  }, [stop]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(false), 4500);
    return () => window.clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    const p = yt.current;
    if (!p) return;
    try {
      p.setVolume(Math.round(Math.min(1, Math.max(0, volume)) * 100));
    } catch {
      /* ignore */
    }
  }, [volume]);

  useEffect(() => {
    if (!on || stop) return;
    const id = window.setInterval(() => {
      if (seeking.current) return;
      const p = yt.current;
      if (!p) return;
      try {
        const dur = p.getDuration() || 0;
        const cur = p.getCurrentTime() || 0;
        if (dur > 0) setSeek(Math.min(1, Math.max(0, cur / dur)));
      } catch {
        /* ignore */
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [on, stop]);

  const setVol = (v: number) => {
    const next = Math.min(1, Math.max(0, v));
    setVolume(next);
    try {
      localStorage.setItem(VOL_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const onSeek = (ratio: number) => {
    seeking.current = true;
    setSeek(ratio);
    const p = yt.current;
    if (!p) {
      seeking.current = false;
      return;
    }
    try {
      const dur = p.getDuration() || 0;
      if (dur > 0) p.seekTo(ratio * dur, true);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      seeking.current = false;
    }, 200);
  };

  const toggle = () => {
    const p = yt.current;
    if (!p) return;
    try {
      if (on) {
        p.pauseVideo();
        setOn(false);
      } else {
        p.unMute();
        p.setVolume(Math.round(volume * 100));
        p.playVideo();
        setOn(true);
        setHint(false);
      }
    } catch {
      setOn(false);
    }
  };

  if (!armed || stop) {
    return <div ref={host} className="pointer-events-none absolute size-px overflow-hidden opacity-0" aria-hidden />;
  }

  return (
    <>
      <div ref={host} className="pointer-events-none absolute size-px overflow-hidden opacity-0" aria-hidden />
      <MusicDock
        on={on}
        onToggle={toggle}
        volume={volume}
        onVolume={setVol}
        seek={seek}
        onSeek={onSeek}
        seekEnabled
        hint={hint && !on ? "Tocca per avviare la musica" : null}
      />
    </>
  );
}

function requestFs(el: HTMLElement | null) {
  if (!el) return;
  const anyEl = el as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  try {
    if (document.fullscreenElement) return;
    if (anyEl.requestFullscreen) void anyEl.requestFullscreen().catch(() => {});
    else anyEl.webkitRequestFullscreen?.();
  } catch {
    /* ignore — browser può richiedere gesto */
  }
}

function exitFs() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Allinea currentTime del mp3 al secondo visuale ancora da mostrare. */
function syncCountdownAudioOffset(a: HTMLAudioElement, remainingMs: number) {
  const r = Number(remainingMs);
  if (!Number.isFinite(r) || r <= 0) return;
  const n = Math.max(1, Math.min(10, Math.ceil(r / 1000)));
  const idx = 10 - n;
  const beepAt = COUNTDOWN_BEEP_AT_SEC[idx];
  if (!Number.isFinite(beepAt)) return;
  const target = Math.max(0, beepAt - 0.08);
  try {
    if (Math.abs((a.currentTime || 0) - target) > 0.35) a.currentTime = target;
  } catch {
    /* ignore */
  }
}

/** Cinema: countdown, BGM, ultimi 10s fullscreen + audio sync, autoplay, redirect a /grazie/, copertina. */
export function SerataBoard() {
  const { ready, token } = useAuth();
  const router = useRouter();
  const [stream, setStream] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [filmPlaying, setFilmPlaying] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const autoTriedRef = useRef(false);
  const redirectedRef = useRef(false);
  const fsAskedRef = useRef(false);
  const cdAudioRef = useRef<HTMLAudioElement | null>(null);
  const cdTriggeredRef = useRef(false);
  const cdWarmRef = useRef(false);
  const title = filmTitle();
  // serata già iniziata (entro 4 ore): il countdown resta a zero e il film si può avviare
  const liveStart = now == null ? null : liveFilmStartMs(SERATA_EVENT, now);
  const target = liveStart ?? nextFilmAtMs(SERATA_EVENT, now ?? Date.now());
  const leftMs = now == null ? Number.POSITIVE_INFINITY : Math.max(0, target - now);
  const inFinal10 = now != null && leftMs > 0 && leftMs <= FINAL_COUNTDOWN_MS;
  const inCountdownLead = now != null && leftMs > 0 && leftMs <= COUNTDOWN_LEAD_MS;
  const isLive = now != null && leftMs <= 0;
  const finalSec = Math.max(0, Math.ceil(leftMs / 1000));

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = () => {
      if (!alive) return;
      const n = Date.now();
      setNow(n);
      const left = Math.max(0, nextFilmAtMs(SERATA_EVENT, n) - n);
      // 250ms solo nel countdown; altrimenti 1s (meno re-render)
      const ms = left > 0 && left <= COUNTDOWN_LEAD_MS ? 250 : 1_000;
      timer = window.setTimeout(tick, ms);
    };
    tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  // Audio countdown.mp3 sincronizzato col “10…1” (parity sfCountdownSync3)
  useEffect(() => {
    if (!ready) return;
    const ensure = () => {
      if (cdAudioRef.current) return cdAudioRef.current;
      try {
        const a = new Audio(COUNTDOWN_MP3);
        a.preload = "auto";
        a.load();
        cdAudioRef.current = a;
        return a;
      } catch {
        return null;
      }
    };

    const warm = () => {
      if (cdWarmRef.current) return;
      const a = ensure();
      if (!a) return;
      cdWarmRef.current = true;
      try {
        a.load();
      } catch {
        /* ignore */
      }
      void fetch(COUNTDOWN_MP3, { cache: "force-cache", credentials: "same-origin" }).catch(() => {});
    };

    const tryPlay = (remaining: number) => {
      if (cdTriggeredRef.current) return;
      const a = ensure();
      if (!a) return;
      warm();
      if (remaining < COUNTDOWN_LEAD_MS - 250) syncCountdownAudioOffset(a, remaining);
      else {
        try {
          a.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      const mark = () => {
        cdTriggeredRef.current = true;
      };
      a.addEventListener("playing", mark, { once: true });
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(mark).catch(() => {
          /* retry via tick / fast guard */
        });
      }
    };

    const tick = () => {
      const filmAt = nextFilmAtMs(SERATA_EVENT, Date.now());
      const remaining = filmAt - Date.now();
      if (remaining <= 0) {
        try {
          cdAudioRef.current?.pause();
        } catch {
          /* ignore */
        }
        return;
      }
      if (remaining <= 180_000) warm();
      else ensure();
      if (remaining <= COUNTDOWN_LEAD_MS) tryPlay(remaining);
    };

    tick();
    const id = window.setInterval(tick, 1_000);
    // Guard vicino allo zero: retry play se autoplay ha fallito (250ms basta)
    const fast = window.setInterval(() => {
      if (cdTriggeredRef.current) return;
      const remaining = nextFilmAtMs(SERATA_EVENT, Date.now()) - Date.now();
      if (remaining <= 0) return;
      if (remaining <= 28_000 && remaining <= COUNTDOWN_LEAD_MS) {
        tick();
        tryPlay(remaining);
      }
    }, 250);

    return () => {
      window.clearInterval(id);
      window.clearInterval(fast);
      try {
        cdAudioRef.current?.pause();
      } catch {
        /* ignore */
      }
    };
  }, [ready]);

  // Reset audio se si ricarica / riparte un countdown futuro
  useEffect(() => {
    if (leftMs > COUNTDOWN_LEAD_MS + 2_000) {
      cdTriggeredRef.current = false;
      try {
        const a = cdAudioRef.current;
        if (a && !a.paused) a.pause();
      } catch {
        /* ignore */
      }
    }
    if (isLive || filmPlaying) {
      try {
        cdAudioRef.current?.pause();
      } catch {
        /* ignore */
      }
    }
  }, [leftMs, isLive, filmPlaying]);

  const pullAccess = useCallback(() => {
    if (!token) return Promise.resolve();
    return loadSerataAccess(token).then((r) => {
      if (!r.ok) {
        // In proiezione non spegnere lo stream per un 403/rete momentaneo
        if (startedRef.current) return;
        setErr(r.message);
        setStream("");
        return;
      }
      setErr("");
      const next = String(r.filmStreamUrl || "").trim();
      if (!next) return;
      setStream((prev) => {
        // Ogni access firma un token nuovo: rimontare <video> (key/src) esce dal fullscreen e blocca.
        if (startedRef.current && prev) return prev;
        return next;
      });
    });
  }, [token]);

  useEffect(() => {
    if (!ready || !token) {
      setStream("");
      return;
    }
    let alive = true;
    setLoading(true);
    setErr("");
    void pullAccess().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [ready, token, pullAccess]);

  // Niente poll mentre il film gira: focus/visibility + URL firmato = kill playback
  useLiveRefresh(pullAccess, {
    intervalMs: 120_000,
    enabled: ready && Boolean(token) && !filmPlaying,
    boot: false,
    topics: ["serata"],
  });

  const goThanks = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    exitFs();
    router.push(page("/seratafilm/grazie/"));
  }, [router]);

  const startFilm = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !stream || startedRef.current) return;
    startedRef.current = true;
    setFilmPlaying(true);
    try {
      v.muted = false;
      v.controls = true;
      await v.play();
    } catch {
      /* autoplay bloccato: resta la copertina / controls */
      startedRef.current = false;
      setFilmPlaying(false);
    }
    requestFs(stageRef.current || v);
  }, [stream]);

  // Ultimi 10s: overlay + richiesta fullscreen; a 0 avvio film
  useEffect(() => {
    if (!stream || !token) return;
    if (inFinal10) {
      if (!fsAskedRef.current) {
        fsAskedRef.current = true;
        requestFs(stageRef.current);
      }
      return;
    }
    // avvio automatico tentato una volta sola: se il browser lo blocca resta "Avvia proiezione" (click sempre libero)
    if (isLive && !startedRef.current && !autoTriedRef.current) {
      autoTriedRef.current = true;
      void startFilm();
    }
    if (leftMs > FINAL_COUNTDOWN_MS) fsAskedRef.current = false;
  }, [inFinal10, isLive, leftMs, stream, token, startFilm]);

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (CREDITS_SKIP.enabled && Number.isFinite(v.currentTime) && v.currentTime + 0.15 >= CREDITS_SKIP.startSeconds) {
      setShowCredits(true);
    } else {
      setShowCredits(false);
    }
    if (Number.isFinite(v.duration) && v.duration > 0 && v.currentTime >= v.duration - 0.4) {
      goThanks();
    }
  };

  const showPlayer = Boolean(stream && token && !err);
  const coverVisible = showPlayer && !filmPlaying;

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <SerataBgm armed={Boolean(ready)} stop={filmPlaying || isLive || inCountdownLead || inFinal10} />

      {inFinal10 ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/95" aria-live="assertive">
          <p className="font-display text-[min(40vw,12rem)] font-semibold leading-none text-sand tabular-nums drop-shadow-[0_0_40px_rgba(212,145,80,0.45)]">
            {finalSec}
          </p>
        </div>
      ) : null}

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-caramel/15 to-roast p-6 ring-1 ring-sand/15 shadow-[0_30px_80px_-30px_rgba(212,145,80,0.4)] sm:p-10"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top,rgba(212,145,80,0.25),transparent_70%)]" />
        <div className="relative text-center">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-caramel">
            <Clapperboard className="size-3.5" /> Serata film
          </p>
          <h2 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">
            Prossima serata: <span className="italic text-sand">{title}</span>
          </h2>
          <div className="mt-8">
            <Countdown now={now} target={target} />
          </div>
        </div>

        <div className="relative mt-10">
          {!ready || loading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-espresso/50" />
          ) : !token ? (
            <AuthGateCard
              title="Sblocca l’accesso"
              text="Accedi con Discord per verificare l’accesso alla serata film."
              why="Serve il login Discord (High Staff) per lo streaming."
            />
          ) : err ? (
            <div className="rounded-2xl bg-ember/10 p-6 text-center ring-1 ring-ember/25">
              <p className="font-semibold text-ember">Accesso negato</p>
              <p className="mt-2 text-sm text-crema/70">{err}</p>
            </div>
          ) : showPlayer ? (
            <div ref={stageRef} className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-sand/20">
              <video
                ref={videoRef}
                className="aspect-video w-full bg-black"
                playsInline
                preload="auto"
                poster={FILM_POSTER}
                src={stream || undefined}
                controls={filmPlaying}
                onPlay={() => {
                  startedRef.current = true;
                  setFilmPlaying(true);
                }}
                onEnded={goThanks}
                onTimeUpdate={onTimeUpdate}
              />

              {/* Copertina finché non parte la proiezione (click solo a serata iniziata / fallback autoplay) */}
              {coverVisible ? (
                <div
                  className={cn(
                    "absolute inset-0 z-10 flex flex-col items-center justify-center overflow-hidden",
                    isLive ? "cursor-pointer" : "cursor-default",
                  )}
                  role={isLive ? "button" : undefined}
                  tabIndex={isLive ? 0 : undefined}
                  onClick={() => {
                    if (isLive) void startFilm();
                  }}
                  onKeyDown={(e) => {
                    if (isLive && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      void startFilm();
                    }
                  }}
                  aria-label={isLive ? `Avvia ${title}` : undefined}
                >
                  <img src={FILM_POSTER} alt="" className="absolute inset-0 size-full object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/40 to-ink/30" />
                  {isLive ? (
                    <span className="relative z-10 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-semibold text-ink shadow-lg">
                      Avvia proiezione
                    </span>
                  ) : (
                    <span className="relative z-10 rounded-full bg-espresso/80 px-5 py-2 text-sm font-semibold text-crema/80 ring-1 ring-sand/20">
                      In attesa del countdown
                    </span>
                  )}
                  <span className="relative z-10 mt-3 font-display text-2xl text-sand sm:text-3xl">{title}</span>
                </div>
              ) : null}

              {showCredits && CREDITS_SKIP.enabled ? (
                <button
                  type="button"
                  onClick={goThanks}
                  className={cn(
                    "absolute bottom-4 right-4 z-20 rounded-full bg-espresso/90 px-4 py-2 text-sm font-semibold text-sand",
                    "ring-1 ring-sand/30 backdrop-blur hover:bg-caramel/30",
                  )}
                >
                  {CREDITS_SKIP.label}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-center text-sm text-crema/50">Stream non disponibile al momento.</p>
          )}
        </div>
      </motion.div>
    </section>
  );
}
