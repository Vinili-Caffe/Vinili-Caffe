"use client";

/**
 * BGM evento Star Wars (YouTube VOD + MusicDock).
 * VinylMusicRoot è soppresso su /evento e /puzzle.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MusicDock } from "@/components/MusicDock";
import { EVENTO_BGM_ON_KEY, EVENTO_BGM_VOL_KEY, EVENTO_YT } from "@/lib/evento-theme";
import { loadYtApi, type YtPlayer } from "@/lib/youtube-player";

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

  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    const initial = readOn();
    wantOn.current = initial;
    setOn(initial);
    setVolume(readVol());
  }, []);

  useEffect(() => {
    if (booting.current || !host.current) return;
    booting.current = true;
    let cancelled = false;
    loadYtApi()
      .then((YT) => {
        if (cancelled || !host.current) {
          booting.current = false;
          return;
        }
        host.current.innerHTML = "";
        const slot = document.createElement("div");
        host.current.appendChild(slot);
        new YT.Player(slot, {
          videoId: EVENTO_YT.id,
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
            loop: 1,
            playlist: EVENTO_YT.id,
          },
          events: {
            onReady: (e) => {
              yt.current = e.target;
              readyRef.current = true;
              booting.current = false;
              setReady(true);
              try {
                e.target.setVolume(Math.round(volumeRef.current * 100));
                if (wantOn.current) e.target.playVideo();
              } catch {
                /* ignore */
              }
            },
            onError: () => {
              setFailed(true);
              booting.current = false;
            },
            onStateChange: (e) => {
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
      })
      .catch(() => {
        setFailed(true);
        booting.current = false;
      });
    return () => {
      cancelled = true;
      try {
        yt.current?.destroy?.();
      } catch {
        /* ignore */
      }
      yt.current = null;
      readyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const p = yt.current;
    if (!ready || !p) return;
    try {
      p.setVolume(Math.round(volume * 100));
      if (on) p.playVideo();
      else p.pauseVideo();
    } catch {
      /* ignore */
    }
  }, [on, volume, ready]);

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
      <div ref={host} className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden />
      <MusicDock
        label={EVENTO_YT.title}
        on={on}
        onToggle={toggle}
        volume={volume}
        onVolume={onVolume}
        hint={hint && !ready ? "Caricamento colonna sonora…" : null}
        failed={failed ? "Musica non disponibile" : null}
      />
    </>
  );
}
