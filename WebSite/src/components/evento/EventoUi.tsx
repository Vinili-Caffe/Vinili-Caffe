"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Bordo SW: navy + accento fazione — statico (niente sweep/blur animati). */
const EDGE: Record<"gold" | "blue" | "red" | "none", string> = {
  gold: "linear-gradient(160deg, rgba(228,199,107,0.55), rgba(56,189,248,0.18) 45%, rgba(14,165,233,0.28))",
  blue: "linear-gradient(160deg, rgba(125,211,252,0.55), rgba(56,189,248,0.12) 55%, rgba(14,165,233,0.35))",
  red: "linear-gradient(160deg, rgba(251,113,133,0.5), rgba(244,63,94,0.12) 50%, rgba(225,29,72,0.32))",
  none: "linear-gradient(160deg, rgba(148,163,184,0.22), rgba(30,41,59,0.35))",
};

/**
 * Pannello comando Star Wars — vetro scuro quieto.
 * Niente scanline/sweep/orb blur: su hub con N pannelli facevano framelag.
 */
export function EventoPanel({
  children,
  className,
  glow = "gold",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  glow?: "gold" | "blue" | "red" | "none";
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      className="relative"
    >
      <div className="relative rounded-2xl p-px" style={{ background: EDGE[glow] }}>
        <div
          className={cn(
            "relative rounded-[0.95rem] bg-[#070d18]/92 px-4 py-5 sm:rounded-[1.05rem] sm:px-5 sm:py-6",
            className,
          )}
        >
          {/* highlight statico in alto — depth senza compositing continuo */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent"
          />
          <div className="relative">{children}</div>
        </div>
      </div>
    </motion.div>
  );
}

export function EventoKicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.26em] text-[#e4c76b]/85">
      {children}
    </p>
  );
}

export function EventoTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("mt-1 font-display text-3xl font-semibold tracking-tight text-[#f0e6c8] sm:text-4xl", className)}>
      {children}
    </h2>
  );
}

export function EventoBtn({
  children,
  className,
  variant = "gold",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "gold" | "ghost" | "danger" | "blue" | "discord";
}) {
  const styles =
    variant === "ghost"
      ? "bg-white/[0.06] text-[#f0e6c8] ring-1 ring-white/15 hover:bg-white/[0.1]"
      : variant === "danger"
        ? "bg-[#a83a2c] text-[#f0e6c8] hover:brightness-110"
        : variant === "blue"
          ? "bg-[#2ea8ff] text-[#05070f] hover:brightness-110"
          : variant === "discord"
            ? "bg-[#5865f2] text-white hover:brightness-110"
            : "bg-gradient-to-r from-[#c9a227] to-[#e4c76b] text-[#05070f] hover:brightness-105";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        styles,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EventoLoginGate({
  label,
  onLogin,
}: {
  label: string;
  onLogin: () => void;
}) {
  return (
    <div className="mx-auto max-w-md">
      <EventoPanel className="text-center" glow="blue">
        <EventoKicker>Accesso flotta</EventoKicker>
        <EventoTitle className="text-2xl sm:text-3xl">Entra nella flotta</EventoTitle>
        <p className="mt-3 text-sm leading-relaxed text-[#f0e6c8]/70">{label}</p>
        <EventoBtn className="mt-6" variant="discord" onClick={onLogin}>
          Accedi con Discord
        </EventoBtn>
      </EventoPanel>
    </div>
  );
}

export function EventoSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("mx-auto h-48 max-w-2xl animate-pulse rounded-2xl bg-white/[0.06] ring-1 ring-white/10", className)}
      aria-busy="true"
    />
  );
}

/** Barra progresso — gradient CSS statico, niente box-shadow animati. */
export function EventoProgressBar({ pct, className }: { pct: number; className?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#2ea8ff] via-[#7dd3fc] to-[#e4c76b] transition-[width] duration-500"
        style={{ width: `${w}%` }}
      />
    </div>
  );
}
