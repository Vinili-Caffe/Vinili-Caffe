"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Disc3, Loader2, LogIn } from "lucide-react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";
import { Avatar } from "@/components/Avatar";
import { VinylRecord } from "@/components/VinylRecord";
import { moodForStoryKey } from "@/lib/wrappedMoods";
import { cn } from "@/lib/cn";

const ease = [0.22, 1, 0.36, 1] as const;

/* le copertine delle schede (stessi colori della storia), a ventaglio dietro la tua */
const FAN = ["messages", "voice", "support", "games", "particular", "boost"].map((k) => moodForStoryKey(k).paper);

type Props = {
  mode: "login" | "loading" | "ready" | "error";
  name?: string;
  userId?: string;
  avatarUrl?: string | null;
  periodLabel?: string;
  monthly?: boolean;
  launching?: boolean;
  message?: string;
  /* scelta Anno / Mese, se ci sono tutti e due */
  periodSwitch?: ReactNode;
  onAction?: () => void;
};

/**
 * Pagina d'ingresso del Wrapped: a sinistra il titolo enorme e il tasto, a destra la tua busta
 * con il disco che spunta e le copertine delle schede a ventaglio dietro.
 */
export function WrappedLanding({ mode, name, userId, avatarUrl, periodLabel, monthly, launching, message, periodSwitch, onAction }: Props) {
  const reduce = useReducedMotionSafe();
  const ready = mode === "ready";

  return (
    <section className="relative isolate overflow-hidden bg-[#140d09] text-[#f4e9d8]">
      {/* fascia di colore e retino: la pagina sembra il retro di un vinile */}
      <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full bg-[#d4512c] [clip-path:polygon(58%_0,100%_0,100%_100%,38%_100%)] max-lg:[clip-path:polygon(0_62%,100%_48%,100%_100%,0_100%)]" />
      <div
        className="pointer-events-none absolute -z-10 opacity-20 max-lg:bottom-0 max-lg:left-0 max-lg:h-1/2 max-lg:w-full lg:right-0 lg:top-0 lg:h-full lg:w-1/2"
        style={{ backgroundImage: "radial-gradient(#2a120a 1.6px, transparent 1.7px)", backgroundSize: "14px 14px" }}
      />

      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-10 px-6 pb-16 pt-28 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pt-24">
        {/* testo */}
        <div className="relative z-10">
          <motion.p
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease }}
            className="inline-flex items-center gap-2 rounded-full border border-[#f4e9d8]/25 px-3.5 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.24em]"
          >
            <span className="size-1.5 rounded-full bg-[#f0b46e]" />
            Vinili & Caffè · Wrapped
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.7, ease }}
            className="mt-5 font-display text-[clamp(3.6rem,11vw,7.8rem)] font-semibold leading-[0.86] tracking-tight"
          >
            {ready && name ? (
              <>
                Il disco
                <br />
                di <span className="italic text-[#f0b46e]">{name}</span>
              </>
            ) : (
              <>
                Il tuo
                <br />
                <span className="italic text-[#f0b46e]">Wrapped</span>
              </>
            )}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease }}
            className="mt-6 max-w-md text-lg leading-snug text-[#f4e9d8]/75"
          >
            {mode === "login"
              ? "Messaggi, ore in vocale, voti, minigiochi e il ruolo che ti sei guadagnato: tutto il tuo tempo sul server, in un disco. Accedi con Discord per ascoltarlo."
              : mode === "loading"
                ? "Stiamo masterizzando il tuo disco: un attimo."
                : mode === "error"
                  ? message || "Il disco non è pronto. Riprova tra poco."
                  : monthly
                    ? `Il tuo ${periodLabel} sul server, lato A e lato B: una scheda alla volta, tocca per andare avanti.`
                    : "Il tuo anno sul server, lato A e lato B: una scheda alla volta, tocca per andare avanti."}
          </motion.p>

          {ready && periodSwitch ? <div className="mt-6">{periodSwitch}</div> : null}

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5, ease }} className="mt-8">
            {mode === "login" ? (
              <button
                type="button"
                onClick={onAction}
                className="inline-flex min-h-14 items-center gap-2.5 rounded-full bg-[#5865f2] px-8 text-base font-bold text-white shadow-[0_16px_40px_-14px_rgba(88,101,242,0.8)] transition hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]"
              >
                <LogIn className="size-5" aria-hidden /> Accedi con Discord
              </button>
            ) : mode === "loading" ? (
              <span className="inline-flex min-h-14 items-center gap-2.5 rounded-full bg-[#f4e9d8]/10 px-8 text-base font-bold text-[#f4e9d8]/80 ring-1 ring-[#f4e9d8]/15">
                <Loader2 className="size-5 animate-spin" aria-hidden /> Masterizzo…
              </span>
            ) : mode === "error" ? (
              <button
                type="button"
                onClick={onAction}
                className="inline-flex min-h-14 items-center gap-2.5 rounded-full bg-[#f4e9d8] px-8 text-base font-bold text-[#140d09] transition hover:-translate-y-0.5"
              >
                Riprova
              </button>
            ) : (
              <button
                type="button"
                onClick={onAction}
                disabled={launching}
                className="group inline-flex min-h-14 items-center gap-3 rounded-full bg-[#f0b46e] py-2 pl-2 pr-8 text-base font-bold text-[#140d09] shadow-[0_18px_44px_-14px_rgba(240,180,110,0.75)] transition hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none"
              >
                <span className="grid size-10 place-items-center rounded-full bg-[#140d09] text-[#f0b46e]">
                  <Disc3 className={cn("size-5 transition-transform duration-700 group-hover:rotate-180", launching && "animate-spin")} aria-hidden />
                </span>
                {launching ? "Gira…" : "Metti il disco"}
              </button>
            )}
          </motion.div>
        </div>

        {/* busta e ventaglio */}
        <div className="relative mx-auto aspect-square w-[min(84vw,27rem)] lg:mr-0">
          {/* le copertine delle schede, a ventaglio */}
          {FAN.map((color, i) => {
            const angle = -18 + i * 7;
            return (
              <motion.div
                key={color}
                className="absolute inset-0 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.6)]"
                style={{ background: color, transformOrigin: "50% 110%" }}
                initial={reduce ? false : { rotate: 0, opacity: 0 }}
                animate={{ rotate: launching ? angle * 1.8 : angle, opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.25 + i * 0.06, duration: 0.7, ease }}
              />
            );
          })}

          {/* il disco che spunta dalla busta */}
          <motion.div
            className="absolute inset-y-[5%] right-0 aspect-square"
            initial={reduce ? false : { x: "0%" }}
            animate={{ x: launching ? "62%" : ready ? "36%" : "16%" }}
            transition={{ delay: reduce ? 0 : 0.6, duration: 0.9, ease }}
          >
            <motion.div
              className="size-full"
              animate={reduce ? undefined : { rotate: 360 }}
              transition={reduce ? undefined : { duration: launching ? 0.9 : mode === "loading" ? 2.4 : 12, repeat: Infinity, ease: "linear" }}
            >
              <VinylRecord className="size-full drop-shadow-[0_24px_50px_rgba(0,0,0,0.6)]" />
            </motion.div>
          </motion.div>

          {/* la busta: la tua copertina */}
          <motion.div
            initial={reduce ? false : { y: 30, opacity: 0, rotate: -6 }}
            animate={{ y: 0, opacity: 1, rotate: -2 }}
            transition={{ delay: 0.15, duration: 0.8, ease }}
            className="absolute inset-0 flex flex-col justify-between overflow-hidden bg-[#f2e6d0] p-6 text-[#1b1410] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.75)]"
          >
            <div
              className="pointer-events-none absolute -bottom-12 -right-12 size-56 opacity-25"
              style={{ backgroundImage: "radial-gradient(#c8553d 1.8px, transparent 1.9px)", backgroundSize: "13px 13px" }}
              aria-hidden
            />
            <div className="relative flex items-start justify-between text-[0.62rem] font-bold uppercase tracking-[0.25em] text-[#1b1410]/70">
              <span>Vinili Wrapped</span>
              <span>{periodLabel || "Lato A"}</span>
            </div>
            <div className="relative">
              {ready && userId ? (
                <Avatar userId={userId} src={avatarUrl || undefined} name={name || ""} noPresence className="size-24 ring-4 ring-[#c8553d] sm:size-28" />
              ) : (
                <span className="grid size-24 place-items-center rounded-full bg-[#1b1410]/10 font-display text-5xl text-[#1b1410]/40 sm:size-28">?</span>
              )}
            </div>
            <div className="relative">
              <p className="font-display text-[clamp(2.3rem,8vw,3.6rem)] font-semibold leading-[0.88]">{ready && name ? name : "Il tuo nome qui"}</p>
              <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[#c8553d]">Lato A · 33 giri</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
