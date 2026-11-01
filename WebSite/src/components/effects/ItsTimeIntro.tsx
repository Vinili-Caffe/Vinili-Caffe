"use client";

import { useEffect } from "react";
import { cdnUrl } from "@/lib/site";
import { getVinylMusicApi } from "@/lib/vinyl-music-bus";

const SRC = cdnUrl("/audio/its-time-mariah-carey.mp3");
const SESSION_KEY = "vc_its_time_intro_v1";
const GESTURES = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * Easter egg: "It's time" all'apertura del sito, poi parte la musica del giradischi.
 * Una volta per visita (sessionStorage). Prova subito; se il browser blocca l'audio senza interazione
 * (quasi sempre alla prima visita, sempre su iPhone) parte al primo tocco, click o tasto.
 */
export function ItsTimeIntro() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch {
      return;
    }
    let done = false;
    const audio = new Audio(SRC);
    audio.preload = "auto";
    audio.volume = 0.8;

    const startSiteMusic = () => {
      const api = getVinylMusicApi();
      if (api && !api.on) api.setPlaying(true);
    };

    const cleanup = () => {
      for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
    };

    const play = () => {
      if (done) return;
      /* la musica del giradischi, se stava già suonando, si ferma per l'intro */
      const api = getVinylMusicApi();
      if (api?.on) api.setPlaying(false);
      audio
        .play()
        .then(() => {
          done = true;
          cleanup();
          try {
            sessionStorage.setItem(SESSION_KEY, "1");
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          /* bloccato dal browser: si riprova al primo gesto */
        });
    };

    function onGesture() {
      play();
    }

    audio.addEventListener("ended", startSiteMusic, { once: true });
    for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
    play();

    return () => {
      cleanup();
      if (!done) audio.pause();
    };
  }, []);

  return null;
}
