"use client";

import { useEffect, useRef } from "react";
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
    try {
      shared.load();
    } catch {
      /* ignore */
    }
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
      credentials: "omit",
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
    credentials: "omit",
    body: JSON.stringify({ prefs: { itsTimeDay: day } }),
  }).catch(() => null);
}

/** Stopper della sessione play attiva (stesso tab, sync remote → locale). */
let stopActiveIntro: (() => void) | null = null;

/**
 * Easter egg: "It's time" 1×/giorno sulla prima pagina.
 * Sync cross-device via chrome-prefs (loggato) + cookie/BroadcastChannel in locale.
 *
 * Armiamo i gesture subito (senza aspettare auth/remote): altrimenti il primo click
 * della visita (cookie banner, nav…) si perde e l'autoplay resta bloccato.
 */
export function ItsTimeIntro() {
  const { token, ready } = useAuth();
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Play locale: monta una sola volta, non si resetta al cambio token.
  useEffect(() => {
    if (alreadyPlayedToday()) return;

    let cancelled = false;
    let done = false;
    let resumeMusic = false;
    let bc: BroadcastChannel | null = null;
    const audio = introAudio();
    const today = romeDayKey();

    const cleanupGestures = () => {
      for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
    };

    const onEnded = () => {
      if (!resumeMusic) return;
      resumeMusic = false;
      const api = getVinylMusicApi();
      if (api && !api.on) api.setPlaying(true);
    };

    const confirmPlayed = () => {
      if (cancelled || done) return;
      /* Segna solo se sta davvero riproducendo (evita mark su play() “vuoto”). */
      if (!Number.isFinite(audio.currentTime) || audio.currentTime < 0.2) return;
      done = true;
      markPlayedTodayLocal();
      pushRemoteDay(tokenRef.current, today);
      cleanupGestures();
      audio.removeEventListener("timeupdate", confirmPlayed);
      audio.removeEventListener("playing", onPlaying);
    };

    const onPlaying = () => {
      /* alcuni browser aggiornano currentTime solo al timeupdate successivo */
      if (audio.currentTime >= 0.2) confirmPlayed();
    };

    const stopWithoutPlay = () => {
      if (done) return;
      done = true;
      cleanupGestures();
      audio.removeEventListener("timeupdate", confirmPlayed);
      audio.removeEventListener("playing", onPlaying);
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      onEnded();
    };

    stopActiveIntro = () => {
      markPlayedTodayLocal();
      stopWithoutPlay();
    };

    const play = () => {
      if (cancelled || done || alreadyPlayedToday()) return;
      const api = getVinylMusicApi();
      if (api?.on) {
        resumeMusic = true;
        api.setPlaying(false);
      }
      try {
        if (audio.currentTime > 0.05) audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      void audio.play().catch(() => {
        /* autoplay bloccato: si riprova al prossimo gesto */
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
        markPlayedTodayLocal();
        stopWithoutPlay();
      };
    } catch {
      bc = null;
    }

    audio.addEventListener("timeupdate", confirmPlayed);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
    play();

    return () => {
      cancelled = true;
      if (stopActiveIntro) stopActiveIntro = null;
      cleanupGestures();
      audio.removeEventListener("timeupdate", confirmPlayed);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
      /* Navigazione SPA: non tagliare l'intro se è già partita. */
      if (!done) {
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
        onEnded();
      }
    };
  }, []);

  // Sync account: se un altro device ha già suonato oggi → stop locale; se noi abbiamo già
  // suonato offline → push del giorno sul profilo.
  useEffect(() => {
    if (!ready || !token) return;
    const today = romeDayKey();
    let cancelled = false;

    void (async () => {
      if (alreadyPlayedToday()) {
        pushRemoteDay(token, today);
        return;
      }
      const remote = await pullRemoteDay(token);
      if (cancelled) return;
      if (remote === today) {
        markPlayedTodayLocal();
        stopActiveIntro?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  return null;
}
