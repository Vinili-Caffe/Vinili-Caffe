"use client";

/**
 * BGM evento Star Wars — mute/volume/posizione in localStorage + BroadcastChannel
 * così al cambio pagina SiteShell remount riprende lo stesso punto.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MusicDock } from "@/components/MusicDock";
import {
  EVENTO_BGM_ON_KEY,
  EVENTO_BGM_TIME_KEY,
  EVENTO_BGM_TRACK_KEY,
  EVENTO_BGM_VOL_KEY,
  EVENTO_YT,
  EVENTO_YT_FALLBACKS,
} from "@/lib/evento-theme";
import { loadYtApi, type YtNamespace, type YtPlayer } from "@/lib/youtube-player";

const BC = "vc-evento-bgm-v1";

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

function readTime(): number {
  try {
    const n = Number(localStorage.getItem(EVENTO_BGM_TIME_KEY));
    if (Number.isFinite(n) && n >= 0) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

function readTrackIdx(): number {
  try {
    const n = Math.floor(Number(localStorage.getItem(EVENTO_BGM_TRACK_KEY)));
    if (Number.isFinite(n) && n >= 0 && n < EVENTO_YT_FALLBACKS.length) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

function persistTime(t: number) {
  try {
    localStorage.setItem(EVENTO_BGM_TIME_KEY, String(Math.max(0, t)));
  } catch {
    /* ignore */
  }
}

function broadcast(msg: Record<string, unknown>) {
  try {
    new BroadcastChannel(BC).postMessage(msg);
  } catch {
    /* ignore */
  }
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
  const saveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(false);
  const [label, setLabel] = useState(EVENTO_YT.title);
  const [seek, setSeek] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    const initial = readOn();
    wantOn.current = initial;
    setOn(initial);
    setVolume(readVol());
  }, []);

  const savePos = useCallback(() => {
    const p = yt.current;
    if (!p || !readyRef.current) return;
    try {
      const t = Number(p.getCurrentTime?.()) || 0;
      const d = Number(p.getDuration?.()) || 0;
      if (t > 0) persistTime(t);
      if (d > 0) {
        setDuration(d);
        setSeek(Math.min(1, t / d));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const mountPlayer = useCallback(
    (YT: YtNamespace, idx: number) => {
      if (!host.current) return;
      const track = EVENTO_YT_FALLBACKS[idx] || EVENTO_YT_FALLBACKS[0]!;
      trackIdx.current = idx;
      try {
        localStorage.setItem(EVENTO_BGM_TRACK_KEY, String(idx));
      } catch {
        /* ignore */
      }
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
      slot.style.cssText =
        "width:1px;height:1px;position:absolute;left:-9999px;opacity:0;pointer-events:none";
      host.current.appendChild(slot);

      const resumeAt = readTime();

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
          start: Math.floor(resumeAt),
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
              if (resumeAt > 1) e.target.seekTo(resumeAt, true);
              const d = Number(e.target.getDuration?.()) || 0;
              if (d > 0) {
                setDuration(d);
                setSeek(Math.min(1, resumeAt / d));
              }
              if (wantOn.current) {
                e.target.unMute?.();
                e.target.playVideo();
              } else {
                e.target.pauseVideo();
              }
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
            if (e.data === 0) {
              try {
                persistTime(0);
                e.target.seekTo(0, true);
                if (wantOn.current) e.target.playVideo();
              } catch {
                /* ignore */
              }
            }
          },
        },
      });
    },
    [],
  );

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
          mountPlayer(YT, readTrackIdx());
        })
        .catch(() => {
          if (!cancelled) {
            setFailed(true);
            booting.current = false;
          }
        });
    };
    const t = window.setTimeout(start, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      savePos();
      try {
        yt.current?.destroy?.();
      } catch {
        /* ignore */
      }
      yt.current = null;
      readyRef.current = false;
    };
  }, [mountPlayer, savePos]);

  useEffect(() => {
    if (!ready) return;
    saveTimer.current = setInterval(savePos, 2000);
    return () => {
      if (saveTimer.current) clearInterval(saveTimer.current);
      savePos();
    };
  }, [ready, savePos]);

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
    broadcast({ type: "state", on, volume });
  }, [on, volume, ready]);

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

  /* sync da altre tab */
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC);
      bc.onmessage = (ev) => {
        const m = ev.data;
        if (!m || typeof m !== "object") return;
        if (m.type === "state") {
          if (typeof m.on === "boolean") {
            wantOn.current = m.on;
            setOn(m.on);
          }
          if (typeof m.volume === "number") setVolume(m.volume);
        }
        if (m.type === "seek" && typeof m.t === "number" && yt.current) {
          try {
            yt.current.seekTo(m.t, true);
            persistTime(m.t);
          } catch {
            /* ignore */
          }
        }
      };
    } catch {
      /* ignore */
    }
    return () => {
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

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
      savePos();
      return next;
    });
  }, [ready, savePos]);

  const onVolume = useCallback((v: number) => {
    const n = Math.min(1, Math.max(0, v));
    setVolume(n);
    try {
      localStorage.setItem(EVENTO_BGM_VOL_KEY, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  const onSeek = useCallback(
    (v: number) => {
      const p = yt.current;
      if (!p || !duration) return;
      const t = Math.max(0, Math.min(1, v)) * duration;
      try {
        p.seekTo(t, true);
        persistTime(t);
        setSeek(v);
        broadcast({ type: "seek", t });
        if (wantOn.current) p.playVideo();
      } catch {
        /* ignore */
      }
    },
    [duration],
  );

  return (
    <>
      <div ref={host} className="pointer-events-none fixed left-0 top-0 z-0 overflow-hidden" aria-hidden />
      <MusicDock
        label={label}
        on={on}
        onToggle={toggle}
        volume={volume}
        onVolume={onVolume}
        seek={seek}
        onSeek={duration > 0 ? onSeek : undefined}
        seekEnabled={duration > 0 && ready}
        hint={hint && !ready && !failed ? "Caricamento colonna sonora…" : null}
        failed={failed ? "Musica non disponibile" : null}
      />
    </>
  );
}
