/** Soft click digitazione — condiviso tra TypeSfx (input) e Wordle (griglia/tastiera). */

import { getLiveCaps } from "@/lib/device-fx";
import { EFFECT_KEYS, effectEnabled, typeSfxVolume } from "@/lib/site-effects";

const MAX_RATE_MS = 90;
const BASE_PEAK = 0.55;

let unlocked = false;
let lastPlay = 0;
let ctx: AudioContext | null = null;
let bufs: AudioBuffer[] | null = null;
let gain: GainNode | null = null;

function buildClickBuffer(ac: AudioContext, seed: number): AudioBuffer {
  const sr = ac.sampleRate || 44100;
  const len = Math.max(32, Math.floor(sr * 0.028));
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const base = 880 + (seed % 5) * 70;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 95);
    const click = Math.sin(2 * Math.PI * base * t);
    const noise = (((seed * 1103515245 + i * 12345) & 0xffff) / 0xffff) - 0.5;
    d[i] = (click * 0.72 + noise * 0.38) * env;
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC({ latencyHint: "interactive" });
    } catch {
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
  }
  if (!gain || gain.context !== ctx) {
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    const tick = ctx.createGain();
    tick.connect(master);
    gain = tick;
  }
  if (!bufs) {
    bufs = [0, 1, 2, 3, 4].map((i) => buildClickBuffer(ctx!, i + 3));
  }
  return ctx;
}

export function unlockTypeSfx() {
  unlocked = true;
  const c = ensure();
  if (c && c.state === "suspended") void c.resume();
}

export function playTypeSfx() {
  if (!getLiveCaps().sound) return;
  if (!effectEnabled(EFFECT_KEYS.typeSfx, true)) return;
  const vol = typeSfxVolume();
  if (vol <= 0.001 || !unlocked) return;
  const now = performance.now();
  if (now - lastPlay < MAX_RATE_MS) return;
  const c = ensure();
  if (!c || !gain || !bufs) return;

  const emit = () => {
    try {
      gain!.gain.value = Math.max(0.001, BASE_PEAK * vol);
      const src = c.createBufferSource();
      src.buffer = bufs![(Math.random() * bufs!.length) | 0]!;
      src.connect(gain!);
      src.start(0);
    } catch {
      /* ignore */
    }
  };

  lastPlay = now;
  if (c.state === "suspended") {
    void c.resume().then(() => {
      if (effectEnabled(EFFECT_KEYS.typeSfx, true) && typeSfxVolume() > 0.001) emit();
    });
    return;
  }
  emit();
}

/** Chiude il contesto (smontaggio TypeSfx globale). */
export function disposeTypeSfx() {
  const c = ctx;
  ctx = null;
  gain = null;
  bufs = null;
  unlocked = false;
  lastPlay = 0;
  if (c) void c.close().catch(() => {});
}
