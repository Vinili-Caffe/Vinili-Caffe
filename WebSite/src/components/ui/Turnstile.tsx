"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCcw, ShieldCheck } from "lucide-react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-vc-turnstile="1"]');
    if (existing && window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const s = existing || document.createElement("script");
    if (!existing) {
      s.src = SRC;
      s.async = true;
      s.defer = true;
      s.dataset.vcTurnstile = "1";
      document.head.appendChild(s);
    }
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => reject(new Error("turnstile load failed"));
    if (window.turnstile) resolve(window.turnstile);
  }).catch((e) => {
    loader = null;
    throw e;
  });
  return loader;
}

/** Precarica lo script Cloudflare Turnstile (durante il countdown voto). */
export function preloadTurnstile(): void {
  if (typeof window === "undefined") return;
  void loadTurnstile().catch(() => {});
}

/** Verifica anti-robot di Cloudflare: chiama onToken col token (stringa vuota se scade o fallisce). */
export function Turnstile({ siteKey, onToken, className }: { siteKey: string; onToken: (token: string) => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let id = "";
    let alive = true;
    setFailed(false);
    loadTurnstile()
      .then((ts) => {
        if (!alive || !box.current) return;
        box.current.innerHTML = "";
        id = ts.render(box.current, {
          sitekey: siteKey,
          theme: "dark",
          language: "it",
          callback: (t: string) => cb.current(t || ""),
          "expired-callback": () => cb.current(""),
          "error-callback": () => {
            cb.current("");
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!alive) return;
        cb.current("");
        setFailed(true);
      });
    return () => {
      alive = false;
      try {
        if (id) window.turnstile?.remove(id);
      } catch {
        /* già rimosso */
      }
    };
  }, [siteKey, attempt]);

  return (
    <div className={className}>
      <div ref={box} className="flex min-h-[65px] justify-center" />
      {failed && (
        <div className="mt-2 flex flex-col items-center gap-2 text-center text-sm text-crema/60">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-ember" /> La verifica di Cloudflare non si è caricata.
          </p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-3.5 py-1.5 font-semibold text-crema ring-1 ring-sand/25">
            <RefreshCcw className="size-3.5" /> Ricarica la verifica
          </button>
        </div>
      )}
    </div>
  );
}
