"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Download, Loader2, Share2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buildShareText, type WrappedPayload } from "@/lib/wrapped";
import {
  buildWrappedShareCards,
  shareWrappedCard,
  type WrappedShareCard,
} from "@/lib/wrappedShareCard";

type Props = {
  open: boolean;
  data: WrappedPayload;
  onClose: () => void;
};

export function WrappedShareSheet({ open, data, onClose }: Props) {
  const [cards, setCards] = useState<WrappedShareCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState(0);
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setPicked(0);
    setHint("");
    setBusy(true);

    void buildWrappedShareCards(data, {
      onFirst: (first) => {
        if (cancelled) return;
        setCards([first]);
        setBusy(false);
      },
    })
      .then((list) => {
        if (cancelled) return;
        setCards(list);
        setBusy(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Non riesco a preparare le immagini.");
        setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, data]);

  const card = cards?.[picked] || cards?.[0] || null;
  const text = buildShareText(data);
  const stillBuilding = Boolean(busy && cards?.length === 1);

  async function onShare() {
    if (!card) return;
    setHint("");
    const result = await shareWrappedCard(card, text);
    if (result === "shared") setHint("Condivisa");
    else if (result === "downloaded") setHint("Salvata");
    if (result !== "aborted") window.setTimeout(() => setHint(""), 1600);
  }

  async function onDownload() {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.objectUrl;
    a.download = card.file.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setHint("Salvata");
    window.setTimeout(() => setHint(""), 1600);
  }

  async function onCopyText() {
    try {
      await navigator.clipboard.writeText(text);
      setHint("Testo copiato");
      window.setTimeout(() => setHint(""), 1600);
    } catch {
      setError("Impossibile copiare il testo.");
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Chiudi" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Condividi Wrapped"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative z-10 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-[#16100c] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl ring-1 ring-[#c4a07a]/25 sm:rounded-[1.75rem]"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#e8c49a]/70">Pronte da condividere</p>
                <h2 className="font-display text-2xl font-semibold text-[#f4e9d8]">Le tue card</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex size-10 items-center justify-center rounded-full bg-[#f4e9d8]/8 text-[#f4e9d8] ring-1 ring-[#f4e9d8]/12"
                aria-label="Chiudi"
              >
                <X className="size-4" />
              </button>
            </div>

            {busy && !cards ? (
              <div className="flex flex-col items-center gap-3 py-16 text-[#f4e9d8]/70">
                <Loader2 className="size-7 animate-spin text-[#e8c49a]" />
                <p className="text-sm">Preparazione…</p>
              </div>
            ) : error && !cards ? (
              <p className="py-10 text-center text-sm text-[#e07a6a]">{error}</p>
            ) : cards ? (
              <>
                <div className="flex gap-2">
                  {cards.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPicked(i)}
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ring-1 transition",
                        i === picked
                          ? "bg-[#d99a5b]/25 text-[#f4e9d8] ring-[#d99a5b]/50"
                          : "bg-[#f4e9d8]/5 text-[#f4e9d8]/55 ring-[#f4e9d8]/10",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                  {stillBuilding ? (
                    <span className="inline-flex items-center gap-1.5 px-2 text-[0.65rem] uppercase tracking-[0.14em] text-[#e8c49a]/60">
                      <Loader2 className="size-3 animate-spin" /> +1
                    </span>
                  ) : null}
                </div>

                {card ? (
                  <div className="mt-4 overflow-hidden rounded-2xl bg-black/40 ring-1 ring-[#c4a07a]/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={card.objectUrl} alt={card.label} className="mx-auto max-h-[48dvh] w-full object-contain" />
                  </div>
                ) : null}

                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void onShare()}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#d99a5b] font-semibold text-[#1a100c]"
                  >
                    {hint === "Condivisa" || hint === "Salvata" ? <Check className="size-4" /> : <Share2 className="size-4" />}
                    {hint || "Condividi immagine"}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onDownload}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#f4e9d8]/8 text-sm font-semibold text-[#f4e9d8] ring-1 ring-[#f4e9d8]/12"
                    >
                      <Download className="size-4" /> Salva
                    </button>
                    <button
                      type="button"
                      onClick={() => void onCopyText()}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#f4e9d8]/8 text-sm font-semibold text-[#f4e9d8] ring-1 ring-[#f4e9d8]/12"
                    >
                      Copia testo
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
