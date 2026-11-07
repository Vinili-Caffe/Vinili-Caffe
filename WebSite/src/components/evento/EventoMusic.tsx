"use client";

/**
 * BGM evento Star Wars — mute/vol/seek in localStorage + chrome-prefs (cross-device se loggato).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MusicDock } from "@/components/MusicDock";
import { readSerataMuteBgm, subscribeSerataMuteBgm } from "@/lib/serata-mute-bgm";
import { useAuth } from "@/lib/auth";
import {
  EVENTO_BGM_ON_KEY,
  EVENTO_BGM_TIME_KEY,
  EVENTO_BGM_TRACK_KEY,
  EVENTO_BGM_VOL_KEY,
  EVENTO_YT,
  EVENTO_YT_FALLBACKS,
} from "@/lib/evento-theme";
import { loadYtApi, type YtNamespace, type YtPlayer } from "@/lib/youtube-player";

const BC = "vc-evento-bgm-v2";
const CHROME_PREFS = "/webhooks/site-chrome-prefs";
const COOKIE = "vc_sw_bgm_on";

function readCookieOn(): boolean | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)vc_sw_bgm_on=(1|0)/);
    if (!m) return null;
    return m[1] === "1";
  } catch {
    return null;
  }
}

function writeCookieOn(on: boolean) {
  try {
    document.cookie = `${COOKIE}=${on ? "1" : "0"};path=/;max-age=31536000;SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function readOn(): boolean {
  try {
    const v = localStorage.getItem(EVENTO_BGM_ON_KEY);
    if (v != null) return v === "1" || v === "true";
  } catch {
    /* ignore */
  }
  const c = typeof document !== "undefined" ? readCookieOn() : null;
  if (c != null) return c;
  return true;
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

function persistLocal(partial: { on?: boolean; volume?: number; time?: number; trackIdx?: number }) {
  try {
    if (typeof partial.on === "boolean") {
      localStorage.setItem(EVENTO_BGM_ON_KEY, partial.on ? "1" : "0");
      writeCookieOn(partial.on);
    }
    if (typeof partial.volume === "number") localStorage.setItem(EVENTO_BGM_VOL_KEY, String(partial.volume));
    if (typeof partial.time === "number") localStorage.setItem(EVENTO_BGM_TIME_KEY, String(Math.max(0, partial.time)));
    if (typeof partial.trackIdx === "number") localStorage.setItem(EVENTO_BGM_TRACK_KEY, String(partial.trackIdx));
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
  const { token } = useAuth();
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const booting = useRef(false);
  const volumeRef = useRef(readVol());
  const wantOn = useRef(readOn());
  const trackIdx = useRef(readTrackIdx());
  const YTref = useRef<YtNamespace | null>(null);
  const saveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(() => readOn());
  const [volume, setVolume] = useState(() => readVol());
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(false);
  const [label, setLabel] = useState(EVENTO_YT.title);
  const [seek, setSeek] = useState(0);
  const [duration, setDuration] = useState(0);
  const [suppress, setSuppress] = useState(false);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => subscribeSerataMuteBgm(setSuppress), []);

  /* Pausa in countdown/film serata; riprendi al termine se era attiva. */
  useEffect(() => {
    const p = yt.current;
    if (!p || !readyRef.current) return;
    try {
      if (suppress) {
        p.pauseVideo?.();
        p.mute?.();
      } else if (wantOn.current) {
        p.unMute?.();
        p.setVolume?.(Math.round(volumeRef.current * 100));
        p.playVideo?.();
        setOn(true);
      }
    } catch {
      /* ignore */
    }
  }, [suppress]);

  const schedulePush = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const tok = tokenRef.current;
      if (!tok) return;
      let t = 0;
      try {
        t = Number(yt.current?.getCurrentTime?.()) || readTime();
      } catch {
        t = readTime();
      }
      void fetch(CHROME_PREFS, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          prefs: {
            eventoBgm: {
              enabled: wantOn.current,
              volume: volumeRef.current,
              seek: t,
              trackIdx: trackIdx.current,
              at: Date.now(),
            },
          },
        }),
      }).catch(() => null);
    }, 400);
  }, []);

  const applyOn = useCallback(
    (next: boolean, opts?: { skipPush?: boolean }) => {
      wantOn.current = next;
      setOn(next);
      persistLocal({ on: next });
      broadcast({ type: "state", on: next, volume: volumeRef.current });
      try {
        const p = yt.current;
        if (p && readyRef.current) {
          if (next) {
            p.unMute?.();
            p.playVideo();
          } else {
            p.pauseVideo();
            p.mute?.();
          }
        }
      } catch {
        /* ignore */
      }
      if (!opts?.skipPush) schedulePush();
    },
    [schedulePush],
  );

  /* pull remote (cross-device) quando c'e' token */
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch(CHROME_PREFS, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (!alive || !j?.ok || !j.prefs?.eventoBgm) return;
        const bgm = j.prefs.eventoBgm as {
          enabled?: boolean;
          volume?: number;
          seek?: number;
          trackIdx?: number;
          at?: number;
        };
        if (typeof bgm.enabled === "boolean") {
          wantOn.current = bgm.enabled;
          setOn(bgm.enabled);
          persistLocal({ on: bgm.enabled });
        }
        if (typeof bgm.volume === "number" && Number.isFinite(bgm.volume)) {
          const v = Math.min(1, Math.max(0, bgm.volume));
          volumeRef.current = v;
          setVolume(v);
          persistLocal({ volume: v });
        }
        if (typeof bgm.seek === "number" && bgm.seek >= 0) {
          persistLocal({ time: bgm.seek });
          try {
            yt.current?.seekTo?.(bgm.seek, true);
          } catch {
            /* ignore */
          }
        }
        if (typeof bgm.trackIdx === "number" && bgm.trackIdx >= 0) {
          trackIdx.current = bgm.trackIdx;
          persistLocal({ trackIdx: bgm.trackIdx });
        }
        try {
          const p = yt.current;
          if (p && readyRef.current) {
            if (wantOn.current) {
              p.unMute?.();
              p.playVideo();
            } else {
              p.pauseVideo();
              p.mute?.();
            }
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === EVENTO_BGM_ON_KEY && e.newValue != null) {
        const next = e.newValue === "1" || e.newValue === "true";
        wantOn.current = next;
        setOn(next);
      }
      if (e.key === EVENTO_BGM_VOL_KEY && e.newValue != null) {
        const n = Number(e.newValue);
        if (Number.isFinite(n)) {
          volumeRef.current = Math.min(1, Math.max(0, n));
          setVolume(volumeRef.current);
        }
      }
      if (e.key === EVENTO_BGM_TIME_KEY && e.newValue != null && yt.current) {
        const t = Number(e.newValue);
        if (Number.isFinite(t) && t >= 0) {
          try {
            yt.current.seekTo(t, true);
          } catch {
            /* ignore */
          }
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const savePos = useCallback(() => {
    const p = yt.current;
    if (!p || !readyRef.current) return;
    try {
      const t = Number(p.getCurrentTime?.()) || 0;
      const d = Number(p.getDuration?.()) || 0;
      if (t > 0) persistLocal({ time: t });
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
      persistLocal({ trackIdx: idx });
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
      /* rileggi mute fresco (dopo pull prefs / GC fix) */
      wantOn.current = readOn();

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
            setOn(wantOn.current);
            try {
              e.target.setVolume(Math.round(volumeRef.current * 100));
              if (resumeAt > 1) e.target.seekTo(resumeAt, true);
              const d = Number(e.target.getDuration?.()) || 0;
              if (d > 0) {
                setDuration(d);
                setSeek(Math.min(1, resumeAt / d));
              }
              if (wantOn.current && !readSerataMuteBgm()) {
                e.target.unMute?.();
                e.target.playVideo();
              } else {
                e.target.mute?.();
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
                persistLocal({ time: 0 });
                e.target.seekTo(0, true);
                if (wantOn.current) e.target.playVideo();
              } catch {
                /* ignore */
              }
            }
            /* se mutato, non lasciare che YT riparta da solo */
            if (!wantOn.current && (e.data === 1 || e.data === 3)) {
              try {
                e.target.pauseVideo();
                e.target.mute?.();
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
      booting.current = false;
      setReady(false);
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
      } else {
        p.pauseVideo();
        p.mute?.();
      }
    } catch {
      /* ignore */
    }
    broadcast({ type: "state", on, volume });
  }, [on, volume, ready]);

  /* autoplay unlock SOLO se musica voluta ON — altrimenti riattivava il mute */
  useEffect(() => {
    if (!ready || !on) return;
    const kick = () => {
      if (!wantOn.current) return;
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
            persistLocal({ on: m.on });
          }
          if (typeof m.volume === "number") {
            volumeRef.current = m.volume;
            setVolume(m.volume);
          }
        }
        if (m.type === "seek" && typeof m.t === "number" && yt.current) {
          try {
            yt.current.seekTo(m.t, true);
            persistLocal({ time: m.t });
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
    const next = !wantOn.current;
    applyOn(next);
    if (!ready) setHint(true);
    savePos();
  }, [applyOn, ready, savePos]);

  const onVolume = useCallback(
    (v: number) => {
      const n = Math.min(1, Math.max(0, v));
      volumeRef.current = n;
      setVolume(n);
      persistLocal({ volume: n });
      schedulePush();
    },
    [schedulePush],
  );

  const onSeek = useCallback(
    (v: number) => {
      const p = yt.current;
      if (!p || !duration) return;
      const t = Math.max(0, Math.min(1, v)) * duration;
      try {
        p.seekTo(t, true);
        persistLocal({ time: t });
        setSeek(v);
        broadcast({ type: "seek", t });
        if (wantOn.current) p.playVideo();
        schedulePush();
      } catch {
        /* ignore */
      }
    },
    [duration, schedulePush],
  );

  useEffect(
    () => () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    },
    [],
  );

  return (
    <>
      <div ref={host} className="pointer-events-none fixed left-0 top-0 z-0 overflow-hidden" aria-hidden />
      {!suppress ? (
        <MusicDock
          label={label}
          on={on}
          onToggle={toggle}
          volume={volume}
          onVolume={onVolume}
          seek={seek}
          onSeek={duration > 0 ? onSeek : undefined}
          seekEnabled={duration > 0 && ready}
          duration={duration}
          hint={hint && !ready && !failed ? "Caricamento colonna sonora…" : null}
          failed={failed ? "Musica non disponibile" : null}
        />
      ) : null}
    </>
  );
}
