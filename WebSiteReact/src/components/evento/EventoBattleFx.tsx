"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { Shield, Swords } from "lucide-react";
import { EventoBtn } from "@/components/evento/EventoUi";

export type BattleFxData = {
  defend: boolean;
  ok: boolean;
  message?: string;
  winner?: string;
  attackPower?: number;
  defendPower?: number;
};

/** Overlay scontro attacco/difesa. */
export function EventoBattleFx({ data, onClose }: { data: BattleFxData; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const won =
    data.ok &&
    (data.winner === "attacker" || data.winner === "you" || /vitt|win|ok/i.test(data.message || ""));

  return (
    <motion.div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button type="button" className="absolute inset-0 bg-[#05070f]/88 backdrop-blur-md" aria-label="Chiudi" onClick={onClose} />
      <motion.div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-gradient-to-b from-[#1a1020] to-[#05070f] p-6 ring-1 ring-[#c9a227]/35"
        initial={{ scale: 0.88, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute size-1 rounded-full bg-[#e4c76b]"
              style={{ left: `${8 + (i * 7) % 90}%`, top: `${10 + (i * 11) % 70}%` }}
              animate={{ opacity: [0.15, 0.9, 0.2], scale: [0.6, 1.4, 0.7] }}
              transition={{ duration: 1.2 + (i % 5) * 0.15, repeat: Infinity, delay: i * 0.05 }}
            />
          ))}
        </div>

        <div className="relative flex items-center justify-center gap-6 py-4">
          <motion.div
            className="flex size-16 items-center justify-center rounded-2xl bg-rose-500/20 ring-1 ring-rose-400/40"
            animate={{ x: [0, 18, 0], rotate: [0, -8, 0] }}
            transition={{ duration: 0.9, repeat: 2 }}
          >
            <Swords className="size-8 text-rose-300" />
          </motion.div>
          <motion.span
            className="font-display text-3xl text-[#e4c76b]"
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ delay: 0.35, duration: 0.45 }}
          >
            VS
          </motion.span>
          <motion.div
            className="flex size-16 items-center justify-center rounded-2xl bg-sky-500/20 ring-1 ring-sky-400/40"
            animate={{ x: [0, -18, 0], rotate: [0, 8, 0] }}
            transition={{ duration: 0.9, repeat: 2 }}
          >
            <Shield className="size-8 text-sky-300" />
          </motion.div>
        </div>

        <p className="relative mt-2 text-center text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-crema/50">
          {data.defend ? "Difesa" : "Attacco"}
        </p>
        <p className="relative mt-2 text-center font-display text-2xl text-crema">
          {!data.ok ? "Scontro fallito" : won ? "Vittoria!" : data.winner ? `Esito: ${data.winner}` : "Scontro concluso"}
        </p>
        {data.message ? <p className="relative mt-2 text-center text-sm text-crema/65">{data.message}</p> : null}
        {(data.attackPower != null || data.defendPower != null) && (
          <p className="relative mt-3 text-center text-xs tabular-nums text-crema/45">
            Potenza ATK {data.attackPower ?? "—"} · DEF {data.defendPower ?? "—"}
          </p>
        )}
        <div className="relative mt-6 text-center">
          <EventoBtn onClick={onClose}>Chiudi</EventoBtn>
        </div>
      </motion.div>
    </motion.div>
  );
}
