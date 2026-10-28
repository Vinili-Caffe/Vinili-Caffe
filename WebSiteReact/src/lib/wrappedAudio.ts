import type { WrappedMood } from "./wrappedMoods";

/** Stings sintetici per slide — niente file audio esterni. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function setWrappedAudioMuted(next: boolean) {
  muted = next;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(muted ? 0 : 0.22, ctx.currentTime);
  }
}

export function isWrappedAudioMuted() {
  return muted;
}

export async function unlockWrappedAudio() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") await c.resume().catch(() => null);
}

function tone(
  c: AudioContext,
  dest: AudioNode,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak = 0.18,
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Motivo breve legato al mood della slide. */
export function playWrappedMotif(mood: WrappedMood) {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === "suspended") void c.resume().catch(() => null);

  const t0 = c.currentTime + 0.02;
  const notes = mood.motif.length ? mood.motif : [220, 277, 330];
  const kind = mood.motifKind;

  if (kind === "chord") {
    notes.forEach((f, i) => tone(c, master!, f, t0 + i * 0.02, 0.55, i % 2 ? "triangle" : "sine", 0.12));
    return;
  }
  if (kind === "rise") {
    notes.forEach((f, i) => tone(c, master!, f, t0 + i * 0.12, 0.35, "triangle", 0.14 + i * 0.02));
    return;
  }
  if (kind === "pulse") {
    notes.forEach((f, i) => tone(c, master!, f, t0 + i * 0.09, 0.14, "square", 0.07));
    return;
  }
  if (kind === "twinkle") {
    notes.forEach((f, i) => tone(c, master!, f * (i % 2 ? 2 : 1), t0 + i * 0.11, 0.22, "sine", 0.1));
    return;
  }
  /* arpeggio */
  notes.forEach((f, i) => tone(c, master!, f, t0 + i * 0.1, 0.28, "triangle", 0.13));
}

/** Whoosh soft all’ingresso immersivo. */
export function playWrappedWhoosh() {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === "suspended") void c.resume().catch(() => null);
  const t0 = c.currentTime;
  const buffer = c.createBuffer(1, c.sampleRate * 0.45, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(400, t0);
  filter.frequency.exponentialRampToValueAtTime(2400, t0 + 0.35);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
}
