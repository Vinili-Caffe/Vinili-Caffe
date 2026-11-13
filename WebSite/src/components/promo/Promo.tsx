"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Eye } from "lucide-react";
import { isPromoPreview, promoEndsLabel, promoPrice, usePromo } from "@/lib/promo";
import { eur } from "@/lib/sponsor";
import { cn } from "@/lib/cn";

const noop = () => () => {};
const usePreview = () => useSyncExternalStore(noop, isPromoPreview, () => false);

/** Bollino nero "-50%" che si attacca sulla card con un colpo di timbro. */
export function PromoSticker({ className }: { className?: string }) {
  const promo = usePromo();
  if (!promo) return null;
  return (
    <motion.span
      aria-hidden
      initial={{ scale: 2.2, rotate: -40, opacity: 0 }}
      whileInView={{ scale: 1, rotate: -12, opacity: 1 }}
      viewport={{ once: true }}
      whileHover={{ rotate: [-12, -4, -16, -12], transition: { duration: 0.5 } }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.25 }}
      className={cn(
        "pointer-events-auto flex size-[4.75rem] items-center justify-center rounded-full bg-[#0a0807] ring-4 ring-roast",
        className,
      )}
      style={{ boxShadow: `0 10px 30px -8px ${promo.accent}99` }}
    >
      <span
        className="flex size-[4rem] flex-col items-center justify-center rounded-full border-2 border-dashed leading-none"
        style={{ borderColor: `${promo.accent}88`, color: promo.accent }}
      >
        <span className="text-[0.42rem] font-black uppercase tracking-[0.12em]">{promo.name}</span>
        <span className="mt-0.5 font-display text-xl font-black lining-nums">-{promo.percent}%</span>
      </span>
    </motion.span>
  );
}

/** Prezzo vecchio barrato (la riga si disegna) e prezzo nuovo sotto. */
export function PromoPrice({ value, prefix, className, oldClassName }: { value: number; prefix?: string; className?: string; oldClassName?: string }) {
  const promo = usePromo();
  if (!promo) {
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
          className="absolute inset-x-[-0.15em] top-1/2 h-[0.12em] origin-left -rotate-6 rounded-full"
          style={{ background: promo.accent }}
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
        {eur(promoPrice(value, promo))}
      </motion.span>
    </span>
  );
}

/** Prezzo piccolo per le tabelle: vecchio barrato accanto al nuovo. */
export function PromoInline({ value, className }: { value: number; className?: string }) {
  const promo = usePromo();
  if (!promo) return <span className={className}>{eur(value)}</span>;
  return (
    <span className="inline-flex items-baseline justify-end gap-1.5">
      <s className="text-xs font-normal text-crema/35" style={{ textDecorationColor: promo.accent }}>
        {eur(value)}
      </s>
      <span className={className}>{eur(promoPrice(value, promo))}</span>
    </span>
  );
}

/** Conto alla rovescia (solo nel browser: al primo disegno resta vuoto, così l'HTML statico combacia). */
function Countdown({ to, accent }: { to: string; accent: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t0 = window.setTimeout(() => setNow(Date.now()), 0);
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(id);
    };
  }, []);
  const left = now == null ? null : Math.max(0, Date.parse(to) - now);
  const parts: [string, number | null][] = [
    ["giorni", left == null ? null : Math.floor(left / 86_400_000)],
    ["ore", left == null ? null : Math.floor(left / 3_600_000) % 24],
    ["min", left == null ? null : Math.floor(left / 60_000) % 60],
    ["sec", left == null ? null : Math.floor(left / 1000) % 60],
  ];
  return (
    <div className="flex gap-1.5" aria-label="Tempo rimasto">
      {parts.map(([label, n]) => (
        <span key={label} className="flex w-14 flex-col items-center rounded-xl bg-white/[0.04] py-2 ring-1" style={{ ["--tw-ring-color" as string]: `${accent}40` }}>
          <span className="font-display text-2xl font-black leading-none text-white lining-nums tabular-nums">{n == null ? "--" : String(n).padStart(2, "0")}</span>
          <span className="mt-1 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-white/45">{label}</span>
        </span>
      ))}
    </div>
  );
}

/** Striscia in cima alla pagina: nastro "Black Friday" che scorre, percentuale al neon e conto alla rovescia. */
export function PromoBanner() {
  const promo = usePromo();
  const preview = usePreview();
  const still = useReducedMotion();
  if (!promo) return null;
  const ends = promoEndsLabel(promo);
  const tape = Array.from({ length: 10 }, () => promo.name.toUpperCase());

  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-[#0a0807] text-white ring-1"
      style={{ ["--tw-ring-color" as string]: `${promo.accent}55`, boxShadow: `0 30px 70px -35px ${promo.accent}88` }}
    >
      {/* fondo: righe diagonali e bagliore del colore della promo */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 14px)" }}
      />
      <div aria-hidden className="absolute -left-20 top-1/2 size-72 -translate-y-1/2 rounded-full blur-3xl" style={{ background: `${promo.accent}2a` }} />

      {/* nastro che scorre */}
      <div className="relative overflow-hidden py-1.5 text-[#0a0807]" style={{ background: promo.accent }}>
        <motion.div className="flex w-max" animate={still ? undefined : { x: ["0%", "-50%"] }} transition={{ duration: 22, ease: "linear", repeat: Infinity }} aria-hidden>
          {[0, 1].map((k) => (
            <span key={k} className="flex shrink-0">
              {tape.map((t, i) => (
                <span key={i} className="px-4 text-xs font-black tracking-[0.3em]">
                  {t} ✦ -{promo.percent}%
                </span>
              ))}
            </span>
          ))}
        </motion.div>
      </div>

      {preview ? (
        <span className="absolute right-3 top-11 z-10 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/80 ring-1 ring-white/15">
          <Eye className="size-3" aria-hidden /> Anteprima
        </span>
      ) : null}

      <div className="relative grid items-center gap-6 px-6 py-7 sm:px-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.15 }}
          className="font-display text-7xl font-black leading-none lining-nums sm:text-8xl"
          style={{ color: promo.accent, textShadow: `0 0 28px ${promo.accent}88, 0 0 2px ${promo.accent}` }}
        >
          -{promo.percent}%
        </motion.span>

        <div className="min-w-0 lg:border-l lg:border-dashed lg:border-white/15 lg:pl-6">
          <p className="font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">{promo.title}</p>
          <p className="mt-1.5 text-sm text-white/70">{promo.text} I prezzi qui sotto sono già scontati.</p>
          <p className="mt-2 text-xs font-semibold" style={{ color: promo.accent }}>
            {ends ? `Fino al ${ends}.` : "Per un periodo limitato."}
            {promo.next ? <span className="text-white/55"> {promo.next}</span> : null}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.24em] text-white/45">Finisce tra</span>
          <Countdown to={promo.ends} accent={promo.accent} />
        </div>
      </div>
    </div>
  );
}
