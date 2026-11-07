"use client";

/**
 * Musica giradischi globale (SiteShell): minutaggio/volume su disco + MusicDock.
 * Pausa su confessionale, /evento, /puzzle; su /seratafilm resta attiva (mute solo in countdown/film).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MusicDock } from "@/components/MusicDock";
import { loadYtApi, resolveVinylYt, type YtPlayer } from "@/lib/youtube-player";
import {
  getVinylMusicApi,
  notifyVinylMusic,
  setVinylMusicApi,
  type VinylMusicBus,
} from "@/lib/vinyl-music-bus";
import {
  readVinylMusic,
  resumeTimeFromSaved,
  writeVinylMusic,
} from "@/lib/vinyl-music-store";
import { subscribeSerataMuteBgm } from "@/lib/serata-mute-bgm";

function pathSuppressesSiteMusic(pathname: string) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/confessionale") return true;
  /* Evento Star Wars: BGM dedicato (EventoMusic). */
  if (p === "/evento" || p.startsWith("/evento/")) return true;
  if (p === "/puzzle" || p.startsWith("/puzzle/")) return true;
  /* /seratafilm resta sulla musica sito (o EventoMusic se immersione SW). */
  return false;
}

export function VinylMusicRoot() {
  /** Host React-owned; dentro creiamo un div monouso per YT (altrimenti insertBefore/removeChild). */
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const booting = useRef(false);
  const wantPlay = useRef(false);
  const scrubbing = useRef(false);
  const seekingUi = useRef(false);
  const volumeRef = useRef(0.5);
  const suppressRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [volume, setVolumeState] = useState(0.5);
  const [seek, setSeek] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hint, setHint] = useState(false);
  const [suppress, setSuppress] = useState(false);
  const [failed, setFailed] = useState(false);
  const trackTitle = resolveVinylYt().title;

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  useEffect(() => {
    suppressRef.current = suppress;
  }, [suppress]);

  useEffect(() => {
    let serataMute = false;
    const sync = () => {
      try {
        setSuppress(pathSuppressesSiteMusic(location.pathname) || serataMute);
      } catch {
        setSuppress(serataMute);
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    const unsub = subscribeSerataMuteBgm((on) => {
      serataMute = on;
      sync();
    });
    return () => {
      window.removeEventListener("popstate", sync);
      unsub();
    };
  }, []);

  const persistNow = useCallback((extra?: { wantPlay?: boolean; t?: number }) => {
    const p = yt.current;
    let t = extra?.t;
    if (t == null) {
      try {
        t = p && readyRef.current ? p.getCurrentTime() : readVinylMusic().t;
      } catch {
        t = readVinylMusic().t;
      }
    }
    writeVinylMusic({
      trackId: resolveVinylYt().id,
      t: Number(t) || 0,
      vol: volumeRef.current,
      wantPlay: extra?.wantPlay != null ? extra.wantPlay : wantPlay.current && !suppressRef.current,
    });
  }, []);

  const applyPlayState = useCallback(() => {
    const p = yt.current;
    if (!p || !readyRef.current) return;
    if (suppressRef.current || scrubbing.current) {
      try {
        p.pauseVideo();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      if (wantPlay.current) {
        p.unMute();
        p.setVolume(Math.round(volumeRef.current * 100));
        const st = p.getPlayerState();
        if (st !== 1 && st !== 3) p.playVideo();
      } else {
        p.pauseVideo();
      }
    } catch {
      /* ignore */
    }
  }, []);

  const ensureYt = useCallback(() => {
    if (yt.current || booting.current) return;
    const shell = host.current;
    if (!shell) return;
    booting.current = true;
    const track = resolveVinylYt();
    const saved = readVinylMusic();
    loadYtApi()
      .then((YT) => {
        if (!host.current) {
          booting.current = false;
          return;
        }
        /* YT rimpiazza il nodo: non passare mai un ref React diretto */
        host.current.innerHTML = "";
        const slot = document.createElement("div");
        host.current.appendChild(slot);
        new YT.Player(slot, {
          videoId: track.id,
          width: 1,
          height: 1,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: (e) => {
              yt.current = e.target;
              readyRef.current = true;
              booting.current = false;
              setReady(true);
              try {
                e.target.setVolume(Math.round(volumeRef.current * 100));
                const dur = e.target.getDuration() || 0;
                if (dur > 0) setDuration(dur);
                const sameTrack = !saved.trackId || saved.trackId === track.id;
                const t = sameTrack ? resumeTimeFromSaved(saved, dur) : 0;
                if (t > 0.4) e.target.seekTo(t, true);
                if (dur > 0) setSeek(Math.min(1, t / dur));
              } catch {
                /* ignore */
              }
              applyPlayState();
              if (wantPlay.current && !suppressRef.current) {
                try {
                  e.target.playVideo();
                } catch {
                  setHint(true);
                }
              }
              notifyVinylMusic();
            },
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) {
                try {
                  e.target.seekTo(0, true);
                  if (wantPlay.current && !suppressRef.current) e.target.playVideo();
                } catch {
                  /* ignore */
                }
              }
              if (e.data === YT.PlayerState.PLAYING) {
                setOn(true);
                setFailed(false);
                setHint(false);
                wantPlay.current = true;
                notifyVinylMusic();
              }
            },
            onError: () => {
              booting.current = false;
              setFailed(true);
              setOn(false);
              notifyVinylMusic();
            },
          },
        });
      })
      .catch(() => {
        booting.current = false;
        setFailed(true);
      });
  }, [applyPlayState]);

  useEffect(() => {
    const saved = readVinylMusic();
    volumeRef.current = saved.vol;
    setVolumeState(saved.vol);
    wantPlay.current = saved.wantPlay;
    if (saved.wantPlay) setHint(true);
    // YT iframe solo se già in play (o al prossimo play) — non montarlo idle
    let saveData = false;
    try {
      saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    } catch {
      /* ignore */
    }
    let online = true;
    try {
      online = navigator.onLine !== false;
    } catch {
      /* ignore */
    }
    if (saved.wantPlay && !saveData && online) ensureYt();
    return () => {
      try {
        yt.current?.destroy();
      } catch {
        /* ignore */
      }
      yt.current = null;
      readyRef.current = false;
      booting.current = false;
      try {
        if (host.current) host.current.innerHTML = "";
      } catch {
        /* ignore */
      }
    };
  }, [ensureYt]);

  useEffect(() => {
    if (suppress) {
      try {
        yt.current?.pauseVideo();
      } catch {
        /* ignore */
      }
      setOn(false);
      notifyVinylMusic();
      return;
    }
    applyPlayState();
    if (wantPlay.current) setOn(true);
    notifyVinylMusic();
  }, [suppress, applyPlayState]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (scrubbing.current || seekingUi.current || suppressRef.current) return;
      const p = yt.current;
      if (!p || !readyRef.current) return;
      try {
        const dur = p.getDuration() || 0;
        const cur = p.getCurrentTime() || 0;
        if (dur > 0) {
          setDuration(dur);
          setSeek(Math.min(1, Math.max(0, cur / dur)));
        }
        if (wantPlay.current) persistNow({ t: cur, wantPlay: true });
        notifyVinylMusic();
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [persistNow]);

  useEffect(() => {
    const flush = () => persistNow();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [persistNow]);

  const setVol = useCallback((v: number) => {
    const next = Math.min(1, Math.max(0, v));
    volumeRef.current = next;
    setVolumeState(next);
    try {
      yt.current?.setVolume(Math.round(next * 100));
    } catch {
      /* ignore */
    }
    writeVinylMusic({ vol: next });
    notifyVinylMusic();
  }, []);

  const setPlaying = useCallback(
    (next: boolean) => {
      wantPlay.current = next;
      setOn(next);
      setHint(false);
      ensureYt();
      applyPlayState();
      if (!next) {
        try {
          const t = yt.current?.getCurrentTime() || 0;
          persistNow({ wantPlay: false, t });
        } catch {
          persistNow({ wantPlay: false });
        }
      } else {
        persistNow({ wantPlay: true });
      }
      notifyVinylMusic();
    },
    [applyPlayState, ensureYt, persistNow],
  );

  const toggle = useCallback(() => {
    setPlaying(!wantPlay.current);
  }, [setPlaying]);

  const seekTo = useCallback(
    (seconds: number) => {
      const p = yt.current;
      if (!p || !readyRef.current) {
        writeVinylMusic({ t: Math.max(0, seconds) });
        return;
      }
      try {
        const dur = p.getDuration() || 0;
        let t = Math.max(0, seconds);
        if (dur > 0) t = ((t % dur) + dur) % dur;
        p.seekTo(t, true);
        if (dur > 0) setSeek(t / dur);
        persistNow({ t });
        notifyVinylMusic();
      } catch {
        /* ignore */
      }
    },
    [persistNow],
  );

  const seekRatio = useCallback(
    (ratio: number) => {
      seekingUi.current = true;
      const r = Math.min(1, Math.max(0, ratio));
      setSeek(r);
      const p = yt.current;
      try {
        const dur = p && readyRef.current ? p.getDuration() || 0 : 0;
        if (dur > 0) seekTo(r * dur);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        seekingUi.current = false;
      }, 250);
      notifyVinylMusic();
    },
    [seekTo],
  );

  const getCurrentTime = useCallback(() => {
    try {
      return yt.current && readyRef.current ? yt.current.getCurrentTime() || 0 : readVinylMusic().t;
    } catch {
      return readVinylMusic().t;
    }
  }, []);

  const getDuration = useCallback(() => {
    try {
      return yt.current && readyRef.current ? yt.current.getDuration() || 0 : 0;
    } catch {
      return 0;
    }
  }, []);

  const setScrubbing = useCallback(
    (v: boolean) => {
      scrubbing.current = v;
      if (!v) applyPlayState();
      else {
        try {
          yt.current?.pauseVideo();
        } catch {
          /* ignore */
        }
      }
    },
    [applyPlayState],
  );

  /* registra API sul bus per il Turntable */
  useEffect(() => {
    const bus: VinylMusicBus = {
      on: on && !suppress,
      volume,
      seek,
      ready,
      toggle,
      setPlaying,
      setVolume: setVol,
      seekTo,
      seekRatio,
      getCurrentTime,
      getDuration,
      setScrubbing,
    };
    setVinylMusicApi(bus);
    return () => {
      if (getVinylMusicApi() === bus) setVinylMusicApi(null);
    };
  }, [on, suppress, volume, seek, ready, toggle, setPlaying, setVol, seekTo, seekRatio, getCurrentTime, getDuration, setScrubbing]);

  return (
    <>
      <div ref={host} className="pointer-events-none fixed size-px overflow-hidden opacity-0" aria-hidden />
      {!suppress ? (
        <MusicDock
          label={trackTitle}
          on={on}
          onToggle={toggle}
          volume={volume}
          onVolume={setVol}
          seek={seek}
          onSeek={seekRatio}
          seekEnabled
          duration={duration}
          hint={hint && !on ? "Tocca play per riprendere" : null}
          failed={failed && !on ? "Musica non disponibile" : null}
        />
      ) : null}
    </>
  );
}
