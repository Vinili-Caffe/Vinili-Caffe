"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

/** Zucca intagliata: la luce dentro tremola appena (solo con il movimento attivo). */
function Pumpkin({ className, live, delay = 0 }: { className?: string; live: boolean; delay?: number }) {
  return (
    <svg viewBox="0 0 100 92" className={className} aria-hidden>
      <defs>
        <radialGradient id="hwd-pk" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#ffa040" />
          <stop offset="0.7" stopColor="#e06a12" />
          <stop offset="1" stopColor="#9a3f08" />
        </radialGradient>
      </defs>
      <path d="M47 14 C46 7 50 3 56 2 C54 6 53 10 54 15 Z" fill="#4d6b2a" />
      <path d="M54 12 C62 6 70 8 72 12 C65 11 60 13 56 16 Z" fill="#5f8433" />
      <ellipse cx="30" cy="52" rx="24" ry="34" fill="url(#hwd-pk)" />
      <ellipse cx="70" cy="52" rx="24" ry="34" fill="url(#hwd-pk)" />
      <ellipse cx="50" cy="52" rx="24" ry="36" fill="url(#hwd-pk)" />
      <path d="M50 17 C44 30 44 74 50 88 M50 17 C56 30 56 74 50 88" stroke="#8a3606" strokeWidth="1.4" fill="none" opacity="0.55" />
      <motion.g
        initial={false}
        animate={live ? { opacity: [1, 0.72, 0.95, 0.8, 1] } : { opacity: 1 }}
        transition={live ? { duration: 2.6, repeat: Infinity, ease: "easeInOut", delay } : undefined}
        fill="#ffe08a"
      >
        <path d="M28 42 L38 34 L41 46 Z" />
        <path d="M72 42 L62 34 L59 46 Z" />
        <path d="M46 52 L50 45 L54 52 Z" />
        <path d="M24 60 C34 74 66 74 76 60 L69 63 L66 58 L60 64 L55 59 L50 65 L45 59 L40 64 L34 58 L31 63 Z" />
      </motion.g>
    </svg>
  );
}

/** Pipistrello appeso a testa in giù, ali chiuse. */
function HangingBat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 60" className={className} aria-hidden stroke="rgba(255,190,120,0.55)" strokeWidth="0.9" strokeLinejoin="round">
      <path d="M20 0 L20 8" stroke="rgba(244,233,216,0.5)" strokeWidth="1.2" />
      <path d="M17 8 L23 8 L26 14 C31 22 30 40 22 52 L20 56 L18 52 C10 40 9 22 14 14 Z" fill="#1d120c" />
      <path d="M14 14 C8 22 8 36 14 44 C12 34 13 24 17 16 Z M26 14 C32 22 32 36 26 44 C28 34 27 24 23 16 Z" fill="#2c1b12" />
      <path d="M16 50 L14 57 L18 54 Z M24 50 L26 57 L22 54 Z" fill="#1d120c" />
      <circle cx="17.5" cy="45" r="1.7" fill="#ffc266" stroke="none" />
      <circle cx="22.5" cy="45" r="1.7" fill="#ffc266" stroke="none" />
    </svg>
  );
}

/** Ragnetto con le zampe. */
function Spider({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 34" className={className} aria-hidden>
      <g stroke="#3a2418" strokeWidth="1.8" fill="none" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 1px rgba(255,190,120,0.8))" }}>
        <path d="M14 14 C8 8 4 9 2 4 M14 17 C7 15 3 17 1 14 M14 20 C8 22 4 26 2 30 M15 22 C11 27 9 31 9 33" />
        <path d="M26 14 C32 8 36 9 38 4 M26 17 C33 15 37 17 39 14 M26 20 C32 22 36 26 38 30 M25 22 C29 27 31 31 31 33" />
      </g>
      <ellipse cx="20" cy="20" rx="7" ry="8" fill="#2c1b12" stroke="rgba(255,190,120,0.6)" strokeWidth="0.9" />
      <circle cx="20" cy="11" r="4.5" fill="#2c1b12" stroke="rgba(255,190,120,0.6)" strokeWidth="0.9" />
      <path d="M20 15 L17 19 L20 23 L23 19 Z" fill="#c2410c" />
      <circle cx="18.4" cy="10.4" r="1" fill="#ff8c3a" />
      <circle cx="21.6" cy="10.4" r="1" fill="#ff8c3a" />
    </svg>
  );
}

/**
 * Decorazioni di Halloween ferme ai bordi dello schermo (zucche, ragno appeso, pipistrelli):
 * le vede chiunque, anche su telefoni deboli o con "riduci movimento"; con il movimento attivo
 * oscillano appena. Non intercettano i click.
 */
export function HalloweenDecor({ live }: { live: boolean }) {
  const sway = (amp: number, dur: number, delay = 0) =>
    live ? { animate: { rotate: [-amp, amp, -amp] }, transition: { duration: dur, repeat: Infinity, ease: "easeInOut" as const, delay } } : {};

  return (
    <>
      {/* ragno che pende dalla ragnatela in alto a sinistra */}
      <motion.div className="absolute left-[4.5rem] top-0 flex origin-top flex-col items-center sm:left-[7rem]" {...sway(4, 5.5)}>
        <span className="h-24 w-px bg-gradient-to-b from-crema/10 to-crema/45 sm:h-36" />
        <Spider className="-mt-1 w-7 drop-shadow-[0_0_6px_rgba(255,170,80,0.35)] sm:w-9" />
      </motion.div>

      {/* pipistrelli appesi in alto a destra, sotto la barra */}
      <div className="absolute right-3 top-16 flex gap-2.5 sm:right-8 sm:top-20 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className={cn("origin-top", i === 1 && "mt-3", i === 2 && "hidden sm:block")} {...sway(6, 3.8 + i * 0.7, i * 0.4)}>
            <HangingBat className={cn("w-5 drop-shadow-[0_0_6px_rgba(255,150,60,0.45)] sm:w-7", i === 1 && "w-4 sm:w-6")} />
          </motion.div>
        ))}
      </div>

      {/* zucche BL — nascoste se c’è il PiP Twitch/Kick (stesso angolo; vedi globals html[data-vc-live-pip]) */}
      <div className="vc-hw-pumpkins absolute bottom-2 left-2 flex items-end gap-1 drop-shadow-[0_0_18px_rgba(255,130,40,0.45)] sm:bottom-3 sm:left-4">
        <Pumpkin live={live} className="w-12 sm:w-20" />
        <Pumpkin live={live} delay={0.8} className="-ml-2 w-8 sm:w-12" />
      </div>
    </>
  );
}
