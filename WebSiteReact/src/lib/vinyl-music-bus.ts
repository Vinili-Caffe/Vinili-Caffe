/** Bus sincronizzato tra VinylMusicRoot (player) e Turntable (UI disco). */

export type VinylMusicBus = {
  on: boolean;
  volume: number;
  seek: number;
  ready: boolean;
  toggle: () => void;
  setPlaying: (on: boolean) => void;
  setVolume: (v: number) => void;
  seekTo: (seconds: number) => void;
  seekRatio: (ratio: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setScrubbing: (v: boolean) => void;
};

type Listener = () => void;

let api: VinylMusicBus | null = null;
const listeners = new Set<Listener>();

export function setVinylMusicApi(next: VinylMusicBus | null) {
  api = next;
  listeners.forEach((l) => l());
}

export function getVinylMusicApi() {
  return api;
}

export function subscribeVinylMusic(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Notifica aggiornamenti di stato (on/seek/volume) senza cambiare l’API. */
export function notifyVinylMusic() {
  listeners.forEach((l) => l());
}
