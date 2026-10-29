/** Persistenza giradischi/musica sito: volume + minutaggio su disco. */

import { resolveVinylYt } from "@/lib/youtube-player";

export const VINYL_MUSIC_KEY = "vc_vinyl_music_v1";

export type VinylMusicSaved = {
  trackId: string;
  /** secondi nel brano */
  t: number;
  /** 0–1 */
  vol: number;
  /** l’utente voleva ascoltare (riprendi al cambio pagina) */
  wantPlay: boolean;
  /** epoch ms dell’ultimo save */
  savedAt: number;
};

const DEFAULT_VOL = 0.5;

export function readVinylMusic(): VinylMusicSaved {
  const track = resolveVinylYt();
  const fallback: VinylMusicSaved = {
    trackId: track.id,
    t: 0,
    vol: DEFAULT_VOL,
    wantPlay: false,
    savedAt: Date.now(),
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(VINYL_MUSIC_KEY);
    if (!raw) return fallback;
    const j = JSON.parse(raw) as Partial<VinylMusicSaved>;
    const vol = Number(j.vol);
    const t = Number(j.t);
    return {
      trackId: String(j.trackId || track.id),
      t: Number.isFinite(t) && t >= 0 ? t : 0,
      vol: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : DEFAULT_VOL,
      wantPlay: Boolean(j.wantPlay),
      savedAt: Number(j.savedAt) > 0 ? Number(j.savedAt) : Date.now(),
    };
  } catch {
    return fallback;
  }
}

export function writeVinylMusic( partial: Partial<VinylMusicSaved>) {
  if (typeof window === "undefined") return;
  try {
    const cur = readVinylMusic();
    const next: VinylMusicSaved = {
      trackId: partial.trackId ?? cur.trackId,
      t: partial.t != null && Number.isFinite(partial.t) ? Math.max(0, Number(partial.t)) : cur.t,
      vol: partial.vol != null && Number.isFinite(partial.vol) ? Math.min(1, Math.max(0, Number(partial.vol))) : cur.vol,
      wantPlay: partial.wantPlay != null ? Boolean(partial.wantPlay) : cur.wantPlay,
      savedAt: Date.now(),
    };
    localStorage.setItem(VINYL_MUSIC_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

/** Tempo da ripristinare: se era in play, avanza del tempo passato offline (cambio pagina). */
export function resumeTimeFromSaved(saved: VinylMusicSaved, durationSec = 0): number {
  let t = saved.t;
  if (saved.wantPlay && saved.savedAt > 0) {
    t += Math.max(0, (Date.now() - saved.savedAt) / 1000);
  }
  if (durationSec > 1) {
    t = ((t % durationSec) + durationSec) % durationSec;
  }
  return Math.max(0, t);
}
