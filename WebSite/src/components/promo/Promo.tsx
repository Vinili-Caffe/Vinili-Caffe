"use client";

import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { PROMO, promoEndsLabel, promoOn, promoPrice } from "@/lib/promo";
import { eur } from "@/lib/sponsor";
import { cn } from "@/lib/cn";

/** Bollino "-20%" che si attacca sulla card con un colpo di timbro. */
export function PromoSticker({ className }: { className?: string }) {
  if (!promoOn()) return null;
  return (
    <motion.span
      aria-hidden
      initial={{ scale: 2.2, rotate: -40, opacity: 0 }}
      whileInView={{ scale: 1, rotate: -12, opacity: 1 }}
      viewport={{ once: true }}
      whileHover={{ rotate: [-12, -4, -16, -12], transition: { duration: 0.5 } }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.25 }}
      className={cn(
        "pointer-events-auto flex size-[4.5rem] items-center justify-center rounded-full bg-gradient-to-br from-ember to-caramel font-display text-xl font-black text-ink shadow-[0_10px_30px_-8px_rgba(240,180,110,0.8)] ring-4 ring-roast",
        className,
      )}
    >
      <span className="flex size-[3.7rem] items-center justify-center rounded-full border-2 border-dashed border-ink/35 lining-nums">-{PROMO.percent}%</span>
    </motion.span>
  );
}

/** Prezzo vecchio barrato (la riga si disegna) e prezzo nuovo sotto. */
export function PromoPrice({ value, prefix, className, oldClassName }: { value: number; prefix?: string; className?: string; oldClassName?: string }) {
  if (!promoOn()) {
    return (
      <span className={className}>
        {prefix}
        {eur(value)}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-center leading-none">
      <span className={cn("relative inline-block text-crema/45 lining-nums", oldClassName)}>
        {eur(value)}
        <motion.span
          aria-hidden
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-[-0.15em] top-1/2 h-[0.12em] origin-left -rotate-6 rounded-full bg-ember"
        />
      </span>
      <motion.span
        initial={{ opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.8 }}
        className={cn("lining-nums", className)}
      >
        {prefix}
        {eur(promoPrice(value))}
      </motion.span>
    </span>
  );
}

/** Prezzo piccolo per le tabelle: vecchio barrato accanto al nuovo. */
export function PromoInline({ value, className }: { value: number; className?: string }) {
  if (!promoOn()) return <span className={className}>{eur(value)}</span>;
  return (
    <span className="inline-flex items-baseline justify-end gap-1.5">
      <s className="text-xs font-normal text-crema/35 decoration-ember/70">{eur(value)}</s>
      <span className={className}>{eur(promoPrice(value))}</span>
    </span>
  );
}

/** Striscia in cima alla pagina: biglietto con il bordo perforato e un riflesso che passa. */
export function PromoBanner() {
  if (!promoOn()) return null;
  const ends = promoEndsLabel();
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-caramel via-ember to-caramel text-ink shadow-[0_24px_60px_-28px_rgba(240,180,110,0.75)]">
      <motion.span
        aria-hidden
        className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent"
        animate={{ x: ["0%", "450%"] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3.5, ease: "easeInOut" }}
      />
      <div className="relative flex flex-col items-center gap-4 px-6 py-5 text-center sm:flex-row sm:text-left">
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: -8 }}
          transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.2 }}
          className="flex shrink-0 items-center justify-center rounded-2xl bg-ink px-4 py-2 font-display text-4xl font-black text-ember lining-nums shadow-lg"
        >
          -{PROMO.percent}%
        </motion.span>
        <div className="flex-1 sm:border-l-2 sm:border-dashed sm:border-ink/25 sm:pl-5">
          <p className="flex items-center justify-center gap-2 font-display text-2xl font-bold sm:justify-start">
            <Sparkles className="size-5" /> {PROMO.title}
          </p>
          <p className="mt-0.5 text-sm font-medium text-ink/75">
            {PROMO.text}
            {ends ? ` Fino al ${ends}.` : " Per un periodo limitato."} I prezzi qui sotto sono già scontati.
          </p>
        </div>
      </div>
    </div>
  );
}
