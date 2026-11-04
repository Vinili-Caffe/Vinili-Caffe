"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { readSponsorAd, sponsorAdLive, sponsorHref } from "@/lib/sponsor-ad";

/** Countdown sponsor VC (niente AdSense): poi onDone. */
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
  const cfg = readSponsorAd();
  const live = sponsorAdLive(cfg);
  const href = live ? sponsorHref(cfg?.buttonUrl) : "";

  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [left]);

  async function finish() {
    if (left > 0 || busy) return;
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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e4c76b]">Sponsor</p>
        <h3 className="mt-1 font-display text-2xl font-semibold text-crema">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-crema/60">{subtitle}</p> : null}

        <div className="mt-5 rounded-2xl bg-black/35 p-4 ring-1 ring-white/10">
          {live && cfg ? (
            <>
              {cfg.badge ? (
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-caramel/90">{cfg.badge}</p>
              ) : null}
              <p className="mt-1 font-display text-lg font-semibold text-crema">{cfg.title}</p>
              <p className="mt-2 whitespace-pre-line text-sm text-crema/65">{cfg.description}</p>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-4 inline-flex rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink"
                >
                  {cfg.buttonLabel || "Apri"}
                </a>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-crema/70">
              Supporta Vinili &amp; Caffè: resta su questa schermata per sbloccare il bonus.
            </p>
          )}
        </div>

        <p className="mt-5 text-center font-display text-5xl lining-nums text-sand">{left}</p>
        <p className="mt-1 text-center text-xs text-crema/45">
          {left > 0 ? "Attendi la fine del countdown" : "Puoi confermare il bonus"}
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full bg-crema/8 py-2.5 text-sm font-semibold ring-1 ring-sand/20"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={left > 0 || busy}
            onClick={() => void finish()}
            className="flex-1 rounded-full bg-gradient-to-r from-caramel to-ember py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
          >
            {busy ? "…" : "Sblocca"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
