"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

const GLOW_EDGE: Record<"gold" | "blue" | "red" | "none", string> = {
  gold: "linear-gradient(145deg, rgba(125,211,252,0.7), rgba(56,189,248,0.12) 38%, rgba(240,193,74,0.32) 72%, rgba(14,165,233,0.45))",
  blue: "linear-gradient(145deg, rgba(125,211,252,0.78), rgba(56,189,248,0.18) 42%, rgba(14,165,233,0.5))",
  red: "linear-gradient(145deg, rgba(251,113,133,0.65), rgba(244,63,94,0.12) 40%, rgba(240,193,74,0.22) 78%, rgba(225,29,72,0.4))",
  none: "linear-gradient(145deg, rgba(125,211,252,0.28), rgba(56,189,248,0.06) 50%, rgba(14,165,233,0.2))",
};

/** Pannello ologramma — stesso materiale delle classifiche, riusato su tutto `/evento`. */
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
      initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      className="relative"
    >
      <div className="relative overflow-hidden rounded-[1.35rem] p-[1px]" style={{ background: GLOW_EDGE[glow] }}>
        {/* className qui: `!p-0` / overflow dei giochi e hub devono colpire lo shell interno */}
        <div
          className={cn(
            "relative overflow-hidden rounded-[1.3rem] bg-[linear-gradient(168deg,rgba(6,18,32,0.94),rgba(3,8,16,0.98)_52%,rgba(2,6,12,0.99))] px-4 py-5 sm:px-5 sm:py-6",
            className,
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(125,211,252,0.09) 2px, rgba(125,211,252,0.09) 3px)",
            }}
          />
          {!reduce ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 h-14 bg-gradient-to-b from-cyan-300/0 via-cyan-200/10 to-cyan-300/0"
              initial={{ top: "-18%" }}
              animate={{ top: ["-18%", "118%"] }}
              transition={{ duration: 5.8, repeat: Infinity, ease: "linear", delay: delay + 0.3 }}
            />
          ) : null}
          <span aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 z-[1] h-3.5 w-3.5 border-l-2 border-t-2 border-cyan-300/55" />
          <span aria-hidden className="pointer-events-none absolute right-2.5 top-2.5 z-[1] h-3.5 w-3.5 border-r-2 border-t-2 border-cyan-300/55" />
          <span aria-hidden className="pointer-events-none absolute bottom-2.5 left-2.5 z-[1] h-3.5 w-3.5 border-b-2 border-l-2 border-amber-300/40" />
          <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-2.5 z-[1] h-3.5 w-3.5 border-b-2 border-r-2 border-amber-300/40" />
          <div aria-hidden className="pointer-events-none absolute -left-10 top-1/4 h-36 w-36 rounded-full bg-cyan-400/12 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="relative z-[1]">{children}</div>
        </div>
      </div>
    </motion.div>
  );
}

export function EventoKicker({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-cyan-300/70">
      {children}
    </p>
  );
}

export function EventoTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("mt-1 font-display text-3xl font-semibold tracking-tight text-[#eaf6ff] sm:text-4xl", className)}>
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
      ? "bg-black/40 text-cyan-50 ring-1 ring-cyan-300/25 hover:bg-cyan-400/10 hover:ring-cyan-300/40"
      : variant === "danger"
        ? "bg-gradient-to-r from-rose-600 to-rose-500 text-crema shadow-[0_0_22px_rgba(244,63,94,0.28)] hover:brightness-110"
        : variant === "blue"
          ? "bg-gradient-to-r from-sky-400 to-cyan-300 text-ink shadow-[0_0_22px_rgba(56,189,248,0.35)] hover:brightness-105"
          : variant === "discord"
            ? "bg-[#5865f2] text-white hover:brightness-110"
            : "bg-gradient-to-r from-cyan-300 via-sky-400 to-amber-300 text-ink shadow-[0_0_24px_rgba(56,189,248,0.32)] hover:brightness-105";
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
        <EventoKicker>Canale · accesso</EventoKicker>
        <EventoTitle className="text-2xl sm:text-3xl">Entra nella flotta</EventoTitle>
        <p className="mt-3 text-sm leading-relaxed text-sky-100/65">{label}</p>
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
      className={cn(
        "mx-auto h-48 max-w-2xl animate-pulse rounded-[1.35rem] bg-[linear-gradient(145deg,rgba(56,189,248,0.08),rgba(0,0,0,0.35))] ring-1 ring-cyan-300/20",
        className,
      )}
      aria-busy="true"
    />
  );
}

/** Barra progresso ologramma (livello, missioni, …). */
export function EventoProgressBar({ pct, className }: { pct: number; className?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-cyan-950/90 ring-1 ring-cyan-400/15", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-200 via-sky-400 to-amber-300 transition-[width] duration-500"
        style={{ width: `${w}%`, boxShadow: "0 0 12px rgba(125,211,252,0.55)" }}
      />
    </div>
  );
}
