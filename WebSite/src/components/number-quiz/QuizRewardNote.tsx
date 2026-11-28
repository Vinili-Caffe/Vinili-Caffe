"use client";

import { motion } from "motion/react";
import { LogIn, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DISCORD_INVITE } from "@/lib/site";

export type QuizReward = { auth: "guest" | "outsider" | "member"; exp: number; capped?: boolean } | null | undefined;

/**
 * Fine partita, uguale per tutti i quiz: chi gioca senza accesso sa che può salvare i punteggi,
 * chi non è nel server sa come prendere l'EXP, chi è nel server vede l'EXP guadagnata.
 */
export function QuizRewardNote({ reward, className = "" }: { reward: QuizReward; className?: string }) {
  const { login } = useAuth();
  if (!reward) return null;
  const box = `mt-4 rounded-2xl px-4 py-3 text-sm ring-1 ${className}`;

  if (reward.auth === "guest") {
    return (
      <div className={`${box} bg-crema/[0.05] text-crema/75 ring-sand/15`}>
        <p>Stai giocando senza accesso: accedi con Discord per salvare i tuoi punteggi.</p>
        <button
          type="button"
          onClick={() => login()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#5865F2] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          <LogIn className="size-3.5" /> Accedi
        </button>
      </div>
    );
  }
  if (reward.auth === "outsider") {
    return (
      <div className={`${box} bg-crema/[0.05] text-crema/75 ring-sand/15`}>
        <p>Punteggio salvato. Entra nel server Discord per prendere anche EXP a ogni partita.</p>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-caramel px-4 py-1.5 text-xs font-semibold text-ink transition hover:brightness-110"
        >
          <Users className="size-3.5" /> Entra nel server
        </a>
      </div>
    );
  }
  if (reward.exp > 0) {
    return (
      <motion.p
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.3 }}
        className={`${box} inline-flex items-center justify-center gap-2 bg-caramel/15 font-semibold text-caramel ring-caramel/40`}
      >
        <Sparkles className="size-4" /> +{reward.exp} EXP sul tuo livello
        {reward.capped ? <span className="font-normal text-crema/60">· massimo di oggi raggiunto</span> : null}
      </motion.p>
    );
  }
  return (
    <p className={`${box} bg-crema/[0.05] text-crema/60 ring-sand/15`}>
      {reward.capped ? "Per oggi hai già preso il massimo di EXP dai quiz: torna domani." : "Punteggio salvato."}
    </p>
  );
}
