"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { EventoBtn } from "@/components/evento/EventoUi";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

export type BattleFxData = {
  defend: boolean;
  ok: boolean;
  message?: string;
  winner?: string;
  attackPower?: number;
  defendPower?: number;
};

function Lightsaber({
  color,
  side,
  clash,
}: {
  color: "red" | "blue" | "green";
  side: "left" | "right";
  clash: boolean;
}) {
  const blade =
    color === "red"
      ? { core: "#fff5f5", glow: "#ff2a2a", mid: "#ff4d4d" }
      : color === "blue"
        ? { core: "#f0f9ff", glow: "#2ea8ff", mid: "#38bdf8" }
        : { core: "#f0fdf4", glow: "#22c55e", mid: "#4ade80" };

  const left = side === "left";

  return (
    <motion.div
      className="absolute bottom-[18%] origin-bottom"
      style={{
        left: left ? "18%" : undefined,
        right: left ? undefined : "18%",
        width: 28,
        height: "58%",
        rotate: left ? -28 : 28,
      }}
      animate={
        clash
          ? {
              rotate: left ? [-28, -8, -42, -18, -28] : [28, 8, 42, 18, 28],
              x: left ? [0, 36, -8, 22, 0] : [0, -36, 8, -22, 0],
              y: [0, -18, 6, -10, 0],
            }
          : { rotate: left ? -28 : 28, x: 0, y: 0 }
      }
      transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1], repeat: clash ? 1 : 0 }}
    >
      {/* lama */}
      <div className="absolute inset-x-[32%] bottom-[18%] top-0 overflow-visible rounded-full">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `linear-gradient(180deg, ${blade.core} 0%, ${blade.mid} 35%, ${blade.glow} 100%)`,
            boxShadow: `0 0 14px 3px ${blade.glow}, 0 0 28px 6px ${blade.glow}66`,
          }}
        />
        <div
          className="absolute inset-x-[28%] inset-y-[4%] rounded-full opacity-90"
          style={{ background: blade.core }}
        />
      </div>
      {/* elsa */}
      <div
        className="absolute bottom-0 left-1/2 h-[18%] w-[150%] -translate-x-1/2 rounded-md"
        style={{
          background: "linear-gradient(180deg,#d4d4d8,#52525b 40%,#18181b)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}
      >
        <div className="absolute inset-x-[10%] top-[18%] h-[12%] rounded-sm bg-[#a1a1aa]/80" />
        <div
          className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: blade.glow, boxShadow: `0 0 10px ${blade.glow}` }}
        />
      </div>
    </motion.div>
  );
}

/** Overlay scontro: duello spade laser a tema Star Wars. */
export function EventoBattleFx({ data, onClose }: { data: BattleFxData; onClose: () => void }) {
  useBodyScrollLock(true);
  const [phase, setPhase] = useState<"ignite" | "clash" | "result">("ignite");

  const won =
    data.ok &&
    (data.winner === "attacker" || data.winner === "you" || /vitt|win|ok/i.test(data.message || ""));

  const atkColor: "red" | "blue" = data.defend ? "blue" : "red";
  const defColor: "blue" | "green" = data.defend ? "green" : "blue";

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("clash"), 700);
    const t2 = window.setTimeout(() => setPhase("result"), 2200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "result") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  return (
    <motion.div
      className="fixed inset-0 z-[85] flex items-center justify-center overflow-hidden p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#02040a]/94"
        aria-label={phase === "result" ? "Chiudi" : "Duello in corso"}
        onClick={() => phase === "result" && onClose()}
      />

      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(201,162,39,0.16), transparent 70%), radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.35), transparent), radial-gradient(1px 1px at 70% 20%, rgba(255,255,255,0.28), transparent), radial-gradient(1px 1px at 45% 60%, rgba(255,255,255,0.22), transparent)",
        }}
      />

      {/* arena duello */}
      <div className="pointer-events-none relative z-[1] h-[min(62vh,420px)] w-full max-w-xl">
        <Lightsaber color={atkColor} side="left" clash={phase !== "ignite"} />
        <Lightsaber color={defColor} side="right" clash={phase !== "ignite"} />

        {/* flash clash al centro */}
        <AnimatePresence>
          {phase === "clash" ? (
            <motion.div
              className="absolute left-1/2 top-[38%] size-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(228,199,107,0.55) 35%, transparent 70%)",
              }}
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 1, 0.4, 1, 0], scale: [0.2, 1.6, 1.1, 1.8, 2.2] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1 }}
              aria-hidden
            />
          ) : null}
        </AnimatePresence>

        {/* scintille */}
        {phase === "clash"
          ? Array.from({ length: 12 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-[38%] size-1.5 rounded-full bg-[#f0d78c]"
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{
                  opacity: 0,
                  x: (i % 2 === 0 ? 1 : -1) * (40 + (i % 5) * 18),
                  y: -30 - (i % 4) * 22,
                  scale: 0.2,
                }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.04 }}
                aria-hidden
              />
            ))
          : null}

        <motion.p
          className="absolute inset-x-0 top-2 text-center text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[#e4c76b]/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {data.defend ? "Difesa · Forza" : "Attacco · Duello"}
        </motion.p>
      </div>

      {/* risultato */}
      <AnimatePresence>
        {phase === "result" ? (
          <motion.div
            className="absolute inset-x-4 bottom-[8%] z-10 mx-auto w-full max-w-md rounded-3xl bg-[#0a1020]/96 p-6 text-center ring-1 ring-[#c9a227]/40 sm:inset-x-auto"
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 240, damping: 20 }}
          >
            <motion.p
              className="font-display text-3xl font-semibold"
              style={{ color: !data.ok ? "#fb7185" : won ? "#86efac" : "#f0d78c" }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
            >
              {!data.ok ? "Scontro fallito" : won ? "Vittoria!" : data.winner ? `Esito: ${data.winner}` : "Scontro concluso"}
            </motion.p>
            {data.message ? <p className="mt-2 text-sm leading-relaxed text-crema/65">{data.message}</p> : null}
            {(data.attackPower != null || data.defendPower != null) && (
              <div className="mt-4 flex items-center justify-center gap-4 text-xs tabular-nums text-crema/50">
                <span className="rounded-full bg-rose-500/15 px-3 py-1 ring-1 ring-rose-400/30">
                  ATK {data.attackPower ?? "—"}
                </span>
                <span className="font-display text-sm text-[#e4c76b]">VS</span>
                <span className="rounded-full bg-sky-500/15 px-3 py-1 ring-1 ring-sky-400/30">
                  DEF {data.defendPower ?? "—"}
                </span>
              </div>
            )}
            <div className="mt-6">
              <EventoBtn onClick={onClose}>Chiudi</EventoBtn>
            </div>
          </motion.div>
        ) : (
          <motion.p
            className="absolute bottom-[12%] z-10 text-center text-sm text-crema/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {phase === "ignite" ? "Le spade si accendono…" : "Scontro in corso…"}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
