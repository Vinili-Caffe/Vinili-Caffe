"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cdnUrl } from "@/lib/site";
import { getVinylMusicApi } from "@/lib/vinyl-music-bus";

const SRC = cdnUrl("/audio/its-time-mariah-carey.mp3");
const GESTURES = ["pointerdown", "keydown", "touchstart"] as const;

let shared: HTMLAudioElement | null = null;
function introAudio() {
  if (!shared) {
    shared = new Audio(SRC);
    shared.preload = "auto";
    shared.volume = 0.8;
  }
  return shared;
}

/**
 * Easter egg: "It's time" a ogni pagina, subito. La musica del giradischi parte solo col click sul player:
 * se stava già suonando si ferma per l'intro e riprende dopo.
 * Se il browser blocca l'audio senza interazione (di solito solo all'apertura del sito) parte al primo tocco, click o tasto.
 */
export function ItsTimeIntro() {
  const pathname = usePathname();

  useEffect(() => {
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
      if (done) return;
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
      audio.pause();
      onEnded();
    };
  }, [pathname]);

  return null;
}
