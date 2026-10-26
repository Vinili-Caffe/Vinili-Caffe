"use client";

/**
 * BGM evento Star Wars (YouTube VOD + MusicDock).
 * Fallback multi-id: Topic channel spesso 150/embedding disabled.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MusicDock } from "@/components/MusicDock";
import {
  EVENTO_BGM_ON_KEY,
  EVENTO_BGM_VOL_KEY,
  EVENTO_YT,
  EVENTO_YT_FALLBACKS,
} from "@/lib/evento-theme";
import { loadYtApi, type YtNamespace, type YtPlayer } from "@/lib/youtube-player";

function readOn(): boolean {
  try {
    const v = localStorage.getItem(EVENTO_BGM_ON_KEY);
    if (v == null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

function readVol(): number {
  try {
    const n = Number(localStorage.getItem(EVENTO_BGM_VOL_KEY));
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  } catch {
    /* ignore */
  }
  return 0.45;
}

export function EventoMusic() {
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const booting = useRef(false);
  const volumeRef = useRef(0.45);
  const wantOn = useRef(false);
  const trackIdx = useRef(0);
  const YTref = useRef<YtNamespace | null>(null);

  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(false);
  const [label, setLabel] = useState(EVENTO_YT.title);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    const initial = readOn();
    wantOn.current = initial;
    setOn(initial);
    setVolume(readVol());
  }, []);

  const mountPlayer = useCallback((YT: YtNamespace, idx: number) => {
    if (!host.current) return;
    const track = EVENTO_YT_FALLBACKS[idx] || EVENTO_YT_FALLBACKS[0]!;
    trackIdx.current = idx;
    setLabel(track.title);
    setFailed(false);

    try {
      yt.current?.destroy?.();
    } catch {
      /* ignore */
    }
    yt.current = null;
    readyRef.current = false;
    setReady(false);

    host.current.innerHTML = "";
    const slot = document.createElement("div");
    /* YT richiede un box reale: 1×1 nascosto (h-0 rompe l’init su alcuni browser). */
    slot.style.cssText = "width:1px;height:1px;position:absolute;left:-9999px;opacity:0;pointer-events:none";
    host.current.appendChild(slot);

    new YT.Player(slot, {
      videoId: track.id,
      width: 1,
      height: 1,
      host: "https://www.youtube.com",
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        iv_load_policy: 3,
        loop: 1,
        playlist: track.id,
        origin: typeof window !== "undefined" ? window.location.origin : "https://www.viniliecaffe.it",
      },
      events: {
        onReady: (e) => {
          yt.current = e.target;
          readyRef.current = true;
          booting.current = false;
          setReady(true);
          setFailed(false);
          try {
            e.target.setVolume(Math.round(volumeRef.current * 100));
            e.target.unMute?.();
            if (wantOn.current) e.target.playVideo();
          } catch {
            /* ignore */
          }
        },
        onError: () => {
          const next = trackIdx.current + 1;
          if (next < EVENTO_YT_FALLBACKS.length && YTref.current) {
            mountPlayer(YTref.current, next);
            return;
          }
          setFailed(true);
          booting.current = false;
        },
        onStateChange: (e) => {
          /* ENDED */
          if (e.data === 0) {
            try {
              e.target.seekTo(0, true);
              if (wantOn.current) e.target.playVideo();
            } catch {
              /* ignore */
            }
          }
        },
      },
    });
  }, []);

  useEffect(() => {
    if (booting.current) return;
    let cancelled = false;
    const start = () => {
      if (cancelled || !host.current || booting.current) return;
      booting.current = true;
      loadYtApi()
        .then((YT) => {
          if (cancelled || !host.current) {
            booting.current = false;
            return;
          }
          YTref.current = YT;
          mountPlayer(YT, 0);
        })
        .catch(() => {
          if (!cancelled) {
            setFailed(true);
            booting.current = false;
          }
        });
    };
    /* ref pronto al prossimo frame (evita miss host.current) */
    const t = window.setTimeout(start, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      try {
        yt.current?.destroy?.();
      } catch {
        /* ignore */
      }
      yt.current = null;
      readyRef.current = false;
    };
  }, [mountPlayer]);

  useEffect(() => {
    const p = yt.current;
    if (!ready || !p) return;
    try {
      p.setVolume(Math.round(volume * 100));
      if (on) {
        p.unMute?.();
        p.playVideo();
      } else p.pauseVideo();
    } catch {
      /* ignore */
    }
  }, [on, volume, ready]);

  /* gesture utente: sblocca autoplay se il primo play era bloccato */
  useEffect(() => {
    if (!ready || !on) return;
    const kick = () => {
      try {
        yt.current?.playVideo?.();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", kick, { once: true, passive: true });
    window.addEventListener("keydown", kick, { once: true });
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, [ready, on]);

  const toggle = useCallback(() => {
    setOn((v) => {
      const next = !v;
      wantOn.current = next;
      try {
        localStorage.setItem(EVENTO_BGM_ON_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (!ready) setHint(true);
      return next;
    });
  }, [ready]);

  const onVolume = useCallback((v: number) => {
    const n = Math.min(1, Math.max(0, v));
    setVolume(n);
    try {
      localStorage.setItem(EVENTO_BGM_VOL_KEY, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <>
      <div ref={host} className="pointer-events-none fixed left-0 top-0 z-0 overflow-hidden" aria-hidden />
      <MusicDock
        label={label}
        on={on}
        onToggle={toggle}
        volume={volume}
        onVolume={onVolume}
        hint={hint && !ready && !failed ? "Caricamento colonna sonora…" : null}
        failed={failed ? "Musica non disponibile" : null}
      />
    </>
  );
}
