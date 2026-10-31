/** Ding notifiche (Web Audio) — parity con vc-landing-notif playNotifSound. */

import { runAfterGesturePaint } from "@/lib/audio-unlock";

const SOUND_AT_KEY = "vc_notif_sound_at_v1";
const MIN_GAP_MS = 1800;

let ctx: AudioContext | null = null;
let lastAt = 0;
let pending = false;

function getAC(): (new () => AudioContext) | null {
  const w = window as Window & { webkitAudioContext?: new () => AudioContext };
  return window.AudioContext || w.webkitAudioContext || null;
}

function tone(ac: AudioContext, freq: number, when: number, dur: number, peak: number) {
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, when);
  master.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), when + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  master.connect(ac.destination);

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3400, when);
  filter.Q.setValueAtTime(0.65, when);
  filter.connect(master);

  const sine = ac.createOscillator();
  sine.type = "sine";
  sine.frequency.setValueAtTime(freq, when);
  sine.connect(filter);
  sine.start(when);
  sine.stop(when + dur + 0.02);

  const tri = ac.createOscillator();
  tri.type = "triangle";
  tri.frequency.setValueAtTime(freq * 0.5, when);
  const triGain = ac.createGain();
  triGain.gain.setValueAtTime(0.35, when);
  tri.connect(triGain);
  triGain.connect(filter);
  tri.start(when);
  tri.stop(when + dur + 0.02);
}

async function unlock(): Promise<boolean> {
  const AC = getAC();
  if (!AC) return false;
  try {
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      await ctx.resume();
    }
    return ctx.state === "running";
  } catch {
    return false;
  }
}

export function armNotifAudioUnlock() {
  let armed = true;
  const once = () => {
    if (!armed) return;
    armed = false;
    runAfterGesturePaint(() => {
      void unlock().then((ok) => {
        if (ok && pending) {
          pending = false;
          playNotifSound();
        }
      });
    });
  };
  window.addEventListener("pointerdown", once, { once: true, passive: true });
  window.addEventListener("keydown", once, { once: true });
  window.addEventListener("touchstart", once, { once: true, passive: true });
}

export function playNotifSound() {
  const nowMs = Date.now();
  if (nowMs - lastAt < MIN_GAP_MS) return;
  try {
    const shared = Number(localStorage.getItem(SOUND_AT_KEY) || 0) || 0;
    if (shared && nowMs - shared < MIN_GAP_MS) {
      lastAt = shared;
      return;
    }
  } catch {
    /* ignore */
  }

  void unlock().then((ok) => {
    if (!ok || !ctx) {
      pending = true;
      return;
    }
    if (ctx.state === "suspended") {
      pending = true;
      return;
    }
    try {
      const stamp = Date.now();
      lastAt = stamp;
      try {
        localStorage.setItem(SOUND_AT_KEY, String(stamp));
      } catch {
        /* ignore */
      }
      const t = ctx.currentTime + 0.02;
      tone(ctx, 784.0, t, 0.17, 0.22);
      tone(ctx, 1174.7, t + 0.1, 0.22, 0.18);
    } catch {
      pending = true;
    }
  });
}
