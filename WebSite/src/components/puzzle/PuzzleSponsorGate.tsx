"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { adinplayConfigured, showAdInPlayRewarded } from "@/lib/adinplay";

/** Gate bonus puzzle: AdInPlay rewarded on-demand (fallback countdown se no fill / adblock). */
export function PuzzleSponsorGate({
  watchSec,
  title,
  subtitle,
  onCancel,
  onDone,
}: {
  watchSec: number;
  title: string;
  subtitle?: string;
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}) {
  const adsOn = adinplayConfigured();
  const [left, setLeft] = useState(Math.max(1, watchSec));
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const [mode, setMode] = useState<"idle" | "ad" | "fallback">("idle");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "fallback" || !watching || left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [mode, watching, left]);

  async function finish() {
    if (busy) return;
    if (mode === "fallback" && left > 0) return;
    setBusy(true);
    try {
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  async function startAd() {
    if (busy) return;
    setHint(null);
    setBusy(true);
    setMode("ad");
    try {
      const result = await showAdInPlayRewarded();
      if (result === "granted") {
        await onDone();
        return;
      }
      if (result === "canceled") {
        setMode("idle");
        setHint("Pubblicità interrotta — riprova o annulla.");
        return;
      }
      // off / error → countdown di fallback così non resti bloccato
      setMode("fallback");
      setWatching(true);
      setLeft(Math.max(1, watchSec));
      setHint(
        result === "off"
          ? "AdInPlay non configurato — countdown di sblocco."
          : "Nessuna pub disponibile (adblock/rete) — countdown di sblocco.",
      );
    } finally {
      setBusy(false);
    }
  }

  function startFallbackOnly() {
    setMode("fallback");
    setWatching(true);
    setLeft(Math.max(1, watchSec));
    setHint(null);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-espresso/85 p-5">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md rounded-[1.75rem] bg-gradient-to-b from-[#1a2744] to-[#05070f] p-6 ring-1 ring-[#c9a227]/40"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e4c76b]">Bonus</p>
        <h3 className="mt-1 font-display text-2xl font-semibold text-crema">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-crema/60">{subtitle}</p> : null}

        <div className="mt-5 rounded-2xl bg-black/35 p-4 ring-1 ring-white/10">
          <p className="text-sm text-crema/70">
            {adsOn
              ? "Guarda una pubblicità breve (rewarded) per sbloccare il bonus. Solo qui, mai sul resto del sito."
              : "Attendi il countdown, poi conferma per sbloccare il bonus."}
          </p>
        </div>

        {hint ? <p className="mt-3 text-center text-xs text-sand/80">{hint}</p> : null}

        {mode === "fallback" && watching ? (
          <>
            <p className="mt-5 text-center font-display text-5xl lining-nums text-sand">{left}</p>
            <p className="mt-1 text-center text-xs text-crema/45">
              {left > 0 ? "Attendi…" : "Puoi confermare"}
            </p>
          </>
        ) : mode === "ad" ? (
          <p className="mt-5 text-center text-sm text-crema/55">Caricamento pubblicità…</p>
        ) : (
          <p className="mt-5 text-center text-sm text-crema/55">
            {adsOn ? "Premi Guarda per la pubblicità" : "Premi Avvia per il countdown"}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {mode === "idle" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void (adsOn ? startAd() : startFallbackOnly())}
              className="w-full rounded-full bg-gradient-to-r from-caramel to-ember py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {busy ? "…" : adsOn ? "Guarda" : "Avvia"}
            </button>
          ) : mode === "fallback" ? (
            <button
              type="button"
              disabled={left > 0 || busy}
              onClick={() => void finish()}
              className="w-full rounded-full bg-gradient-to-r from-caramel to-ember py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {busy ? "…" : "Sblocca"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy && mode === "ad"}
            onClick={onCancel}
            className="w-full rounded-full bg-crema/8 py-2.5 text-sm font-semibold ring-1 ring-sand/20 disabled:opacity-40"
          >
            Annulla
          </button>
        </div>
      </motion.div>
    </div>
  );
}
