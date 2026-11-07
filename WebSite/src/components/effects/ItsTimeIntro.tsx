"use client";

import { useEffect } from "react";
import { cdnUrl } from "@/lib/site";
import { getVinylMusicApi } from "@/lib/vinyl-music-bus";

const SRC = cdnUrl("/audio/its-time-mariah-carey.mp3");
const GESTURES = ["pointerdown", "keydown", "touchstart"] as const;
const DAY_KEY = "vc_its_time_day_v1";

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

function alreadyPlayedToday() {
  try {
    return localStorage.getItem(DAY_KEY) === romeDayKey();
  } catch {
    return false;
  }
}

function markPlayedToday() {
  try {
    localStorage.setItem(DAY_KEY, romeDayKey());
  } catch {
    /* ignore */
  }
}

/**
 * Easter egg: "It's time" una sola volta al giorno, sulla prima pagina visitata.
 * La musica del giradischi riparte dopo (se era già on).
 * Se il browser blocca l'audio senza interazione, parte al primo tocco/click/tasto.
 */
export function ItsTimeIntro() {
  useEffect(() => {
    if (alreadyPlayedToday()) return;

    let done = false;
    let resumeMusic = false;
    const audio = introAudio();

    const cleanup = () => {
      for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
    };

    const onEnded = () => {
      if (!resumeMusic) return;
      resumeMusic = false;
      const api = getVinylMusicApi();
      if (api && !api.on) api.setPlaying(true);
    };

    const play = () => {
      if (done || alreadyPlayedToday()) return;
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
          markPlayedToday();
          cleanup();
        })
        .catch(() => {
          /* bloccato dal browser: si riprova al primo gesto */
          onEnded();
        });
    };

    function onGesture() {
      play();
    }

    audio.addEventListener("ended", onEnded);
    for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
    play();

    return () => {
      cleanup();
      audio.removeEventListener("ended", onEnded);
      /* Non stoppare se sta già suonando: navigazione SPA non deve tagliare l'intro del giorno. */
      if (!done) {
        audio.pause();
        onEnded();
      }
    };
  }, []);

  return null;
}
