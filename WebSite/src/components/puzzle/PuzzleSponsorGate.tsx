"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ensureMonetagScripts, monetagConfigured, showMonetagAd } from "@/lib/monetag";

/** Gate pubblicità Monetag OnClick/Vignette: click → ads + countdown → onDone. */
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
  const [left, setLeft] = useState(Math.max(1, watchSec));
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const [err, setErr] = useState("");
  const ready = useMemo(() => monetagConfigured(), []);

  useEffect(() => {
    if (!ready) return;
    void ensureMonetagScripts().catch(() => undefined);
  }, [ready]);

  useEffect(() => {
    if (!watching || left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [watching, left]);

  async function startWatch() {
    if (!ready || watching || busy) return;
    setErr("");
    setWatching(true);
    setBusy(true);
    try {
      // Il click su questo bottone è il gesto che fa partire OnClick/Vignette Monetag.
      await showMonetagAd();
    } catch {
      setErr("Annuncio non disponibile. Puoi comunque attendere il countdown.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (busy || left > 0) return;
    setBusy(true);
    try {
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-espresso/85 p-5">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md rounded-[1.75rem] bg-gradient-to-b from-[#1a2744] to-[#05070f] p-6 ring-1 ring-[#c9a227]/40"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e4c76b]">Pubblicità</p>
        <h3 className="mt-1 font-display text-2xl font-semibold text-crema">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-crema/60">{subtitle}</p> : null}

        <div className="mt-5 rounded-2xl bg-black/35 p-4 ring-1 ring-white/10">
          <p className="text-sm text-crema/70">
            Premi “Guarda annuncio”: può aprirsi una scheda o una vignetta Monetag. Poi attendi il countdown e
            sblocca il bonus.
          </p>
          {err ? <p className="mt-2 text-sm text-ember">{err}</p> : null}
        </div>

        {watching ? (
          <>
            <p className="mt-5 text-center font-display text-5xl lining-nums text-sand">{left}</p>
            <p className="mt-1 text-center text-xs text-crema/45">
              {left > 0 ? "Attendi la fine del countdown" : "Puoi confermare il bonus"}
            </p>
          </>
        ) : (
          <p className="mt-5 text-center text-sm text-crema/55">Premi “Guarda annuncio” per iniziare</p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {!watching ? (
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void startWatch()}
              className="w-full rounded-full bg-gradient-to-r from-caramel to-ember py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {busy ? "…" : "Guarda annuncio"}
            </button>
          ) : (
            <button
              type="button"
              disabled={left > 0 || busy}
              onClick={() => void finish()}
              className="w-full rounded-full bg-gradient-to-r from-caramel to-ember py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {busy ? "…" : "Sblocca"}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-full bg-crema/8 py-2.5 text-sm font-semibold ring-1 ring-sand/20"
          >
            Annulla
          </button>
        </div>
      </motion.div>
    </div>
  );
}
