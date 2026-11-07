"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { cdnUrl } from "@/lib/site";
import { getVinylMusicApi } from "@/lib/vinyl-music-bus";

const SRC = cdnUrl("/audio/its-time-mariah-carey.mp3");
const GESTURES = ["pointerdown", "keydown", "touchstart"] as const;
const DAY_KEY = "vc_its_time_day_v1";
const COOKIE = "vc_its_time_day";
const BC = "vc-its-time-v1";
const CHROME_PREFS = "/webhooks/site-chrome-prefs";

let shared: HTMLAudioElement | null = null;
function introAudio() {
  if (!shared) {
    shared = new Audio(SRC);
    shared.preload = "auto";
    shared.volume = 0.8;
  }
  return shared;
}

/** Giorno civile Europe/Rome → YYYY-MM-DD */
function romeDayKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function readCookieDay() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)vc_its_time_day=(\d{4}-\d{2}-\d{2})/);
    return m?.[1] || "";
  } catch {
    return "";
  }
}

function writeCookieDay(day: string) {
  try {
    document.cookie = `${COOKIE}=${day};path=/;max-age=172800;SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function alreadyPlayedToday() {
  const today = romeDayKey();
  try {
    if (localStorage.getItem(DAY_KEY) === today) return true;
  } catch {
    /* ignore */
  }
  return readCookieDay() === today;
}

function markPlayedTodayLocal() {
  const today = romeDayKey();
  try {
    localStorage.setItem(DAY_KEY, today);
  } catch {
    /* ignore */
  }
  writeCookieDay(today);
  try {
    new BroadcastChannel(BC).postMessage({ type: "played", day: today });
  } catch {
    /* ignore */
  }
}

async function pullRemoteDay(token: string | null): Promise<string> {
  if (!token) return "";
  try {
    const r = await fetch(CHROME_PREFS, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; prefs?: { itsTimeDay?: string } } | null;
    const day = String(j?.prefs?.itsTimeDay || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
  } catch {
    return "";
  }
}

function pushRemoteDay(token: string | null, day: string) {
  if (!token || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  void fetch(CHROME_PREFS, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ prefs: { itsTimeDay: day } }),
  }).catch(() => null);
}

/**
 * Easter egg: "It's time" 1×/giorno sulla prima pagina.
 * Sync cross-device via chrome-prefs (loggato) + cookie/BroadcastChannel in locale.
 */
export function ItsTimeIntro() {
  const { token, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (alreadyPlayedToday()) return;

    let cancelled = false;
    let done = false;
    let resumeMusic = false;
    let bc: BroadcastChannel | null = null;
    const audio = introAudio();
    const today = romeDayKey();

    const cleanup = () => {
      for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
    };

    const onEnded = () => {
      if (!resumeMusic) return;
      resumeMusic = false;
      const api = getVinylMusicApi();
      if (api && !api.on) api.setPlaying(true);
    };

    const markAll = () => {
      markPlayedTodayLocal();
      pushRemoteDay(token, today);
    };

    const play = () => {
      if (cancelled || done || alreadyPlayedToday()) return;
      const api = getVinylMusicApi();
      if (api?.on) {
        resumeMusic = true;
        api.setPlaying(false);
      }
      audio.currentTime = 0;
      audio
        .play()
        .then(() => {
          done = true;
          markAll();
          cleanup();
        })
        .catch(() => {
          onEnded();
        });
    };

    function onGesture() {
      play();
    }

    try {
      bc = new BroadcastChannel(BC);
      bc.onmessage = (ev) => {
        const d = ev?.data;
        if (!d || d.type !== "played") return;
        if (String(d.day || "") !== today) return;
        done = true;
        markPlayedTodayLocal();
        cleanup();
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
        onEnded();
      };
    } catch {
      bc = null;
    }

    void (async () => {
      const remote = await pullRemoteDay(token);
      if (cancelled) return;
      if (remote === today) {
        markPlayedTodayLocal();
        return;
      }
      if (alreadyPlayedToday()) return;
      audio.addEventListener("ended", onEnded);
      for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
      play();
    })();

    return () => {
      cancelled = true;
      cleanup();
      audio.removeEventListener("ended", onEnded);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
      if (!done) {
        audio.pause();
        onEnded();
      }
    };
  }, [ready, token]);

  return null;
}
