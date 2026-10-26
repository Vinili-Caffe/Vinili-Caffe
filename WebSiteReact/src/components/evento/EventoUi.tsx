"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EventoPanel({
  children,
  className,
  glow = "gold",
}: {
  children: ReactNode;
  className?: string;
  glow?: "gold" | "blue" | "red" | "none";
}) {
  const ring =
    glow === "blue"
      ? "ring-[#2ea8ff]/25 shadow-[0_0_40px_-12px_rgba(46,168,255,0.45)]"
      : glow === "red"
        ? "ring-[#e11d48]/25 shadow-[0_0_40px_-12px_rgba(225,29,72,0.4)]"
        : glow === "none"
          ? "ring-[#f0e6c8]/12"
          : "ring-[#c9a227]/30 shadow-[0_0_48px_-14px_rgba(201,162,39,0.45)]";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.35rem] border border-[#f0e6c8]/10 bg-[rgba(10,16,32,0.78)] p-5 backdrop-blur-md ring-1 sm:p-6",
        ring,
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f0e6c8]/55 to-transparent"
        aria-hidden
      />
      {children}
    </div>
  );
}

export function EventoKicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-[#c9a227]/90">{children}</p>
  );
}

export function EventoTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "mt-1 font-display text-3xl font-semibold tracking-wide text-[#f0e6c8] sm:text-4xl",
        className,
      )}
    >
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
      ? "bg-transparent text-[#f0e6c8]/80 ring-1 ring-[#f0e6c8]/25 hover:bg-white/5"
      : variant === "danger"
        ? "bg-[#e11d48] text-white hover:brightness-110"
        : variant === "blue"
          ? "bg-[#2ea8ff] text-[#05070f] hover:brightness-110"
          : variant === "discord"
            ? "bg-[#5865f2] text-white hover:brightness-110"
            : "bg-gradient-to-b from-[#e4c76b] to-[#c9a227] text-[#1a140c] hover:brightness-105";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40",
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
    <EventoPanel className="mx-auto max-w-md text-center" glow="blue">
      <EventoKicker>Accesso richiesto</EventoKicker>
      <EventoTitle className="text-2xl sm:text-3xl">Entra nella flotta</EventoTitle>
      <p className="mt-3 text-sm leading-relaxed text-[#f0e6c8]/65">{label}</p>
      <EventoBtn className="mt-6" variant="discord" onClick={onLogin}>
        Accedi con Discord
      </EventoBtn>
    </EventoPanel>
  );
}

export function EventoSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("mx-auto h-48 max-w-2xl animate-pulse rounded-[1.35rem] bg-[#f0e6c8]/8", className)}
      aria-busy="true"
    />
  );
}
