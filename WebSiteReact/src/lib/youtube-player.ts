/** YouTube IFrame API minimale per il giradischi. */

import { isHalloweenSeason } from "@/lib/site-effects";

export type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (vol: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
};

export type YtNamespace = {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YtPlayer }) => void;
        onStateChange?: (e: { data: number; target: YtPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YtPlayer;
  PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT = "https://www.youtube.com/iframe_api";
let loading: Promise<YtNamespace> | null = null;

export function loadYtApi(): Promise<YtNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return Promise.reject(new Error("offline"));
    }
  } catch {
    /* ignore */
  }
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const fail = (err: Error) => {
      loading = null;
      reject(err);
    };
    const done = () => {
      if (window.YT?.Player) resolve(window.YT);
      else fail(new Error("YT missing"));
    };
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore */
      }
      done();
    };
    if (!document.querySelector(`script[src="${SCRIPT}"]`)) {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onerror = () => fail(new Error("YT script failed"));
      document.head.appendChild(s);
    }
    const poll = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(poll);
        done();
      }
    }, 100);
    window.setTimeout(() => window.clearInterval(poll), 20000);
  });
  return loading;
}

export type VinylYtTrack = {
  id: string;
  url: string;
  title: string;
};

/** VOD chill lungo (non live → seek ok). */
export const VINYL_YT_CHILL: VinylYtTrack = {
  id: "8ArUNzZZb78",
  url: "https://www.youtube.com/watch?v=8ArUNzZZb78",
  title: "Lofi chill · 12h",
};

/** Mix Halloween ~5h (stesso giro: VOD, seek ok). */
export const VINYL_YT_HALLOWEEN: VinylYtTrack = {
  id: "0ObiYkDU-qM",
  url: "https://www.youtube.com/watch?v=0ObiYkDU-qM",
  title: "Halloween lofi · spooky",
};

/** @deprecated usa resolveVinylYt() — resta il chill come fallback statico. */
export const VINYL_YT = VINYL_YT_CHILL;

/** Track del giradischi: Halloween nella stessa finestra degli FX (15 ott → 2 nov Rome). */
export function resolveVinylYt(now = new Date()): VinylYtTrack {
  return isHalloweenSeason(now) ? VINYL_YT_HALLOWEEN : VINYL_YT_CHILL;
}
