"use client";

// Un solo lettore audio per tutta la Bacheca: card e dettaglio dello stesso audio mostrano lo stesso stato,
// e far partire un audio ferma quello che stava suonando.

import { useSyncExternalStore } from "react";

let el: HTMLAudioElement | null = null;
let currentUrl = "";
let playing = false;
let progress = 0;
const subs = new Set<() => void>();

function emit() {
  subs.forEach((f) => f());
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function toggleBachecaAudio(url: string) {
  if (!url) return;
  if (el && currentUrl === url) {
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
    return;
  }
  el?.pause();
  const a = new Audio(url);
  el = a;
  currentUrl = url;
  playing = false;
  progress = 0;
  a.ontimeupdate = () => {
    if (el !== a) return;
    progress = a.duration ? (a.currentTime / a.duration) * 100 : 0;
    emit();
  };
  a.onplay = () => el === a && ((playing = true), emit());
  a.onpause = () => el === a && ((playing = false), emit());
  a.onended = () => el === a && ((playing = false), (progress = 0), emit());
  void a.play().catch(() => {});
  emit();
}

/** Stato di un audio: [sta suonando, avanzamento 0-100]. */
export function useBachecaAudio(url: string): [boolean, number] {
  const snap = useSyncExternalStore(
    subscribe,
    () => (url && url === currentUrl ? `${playing ? 1 : 0}|${Math.round(progress)}` : "0|0"),
    () => "0|0",
  );
  const [p, prog] = snap.split("|");
  return [p === "1", Number(prog) || 0];
}
