"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Pannelli evento: stessi token crema/sand del sito (contrasto leggibile). */
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
      ? "ring-sky-400/35"
      : glow === "red"
        ? "ring-rose-400/35"
        : glow === "none"
          ? "ring-sand/15"
          : "ring-caramel/35";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-roast/80 p-5 ring-1 backdrop-blur-sm sm:p-6",
        ring,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EventoKicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-caramel">{children}</p>
  );
}

export function EventoTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("mt-1 font-display text-3xl font-semibold text-crema sm:text-4xl", className)}>
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
      ? "bg-crema/8 text-crema ring-1 ring-sand/25 hover:bg-crema/12"
      : variant === "danger"
        ? "bg-[#a83a2c] text-crema hover:brightness-110"
        : variant === "blue"
          ? "bg-sky-500 text-ink hover:brightness-110"
          : variant === "discord"
            ? "bg-[#5865f2] text-white hover:brightness-110"
            : "bg-gradient-to-r from-caramel to-ember text-ink hover:brightness-105";
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
    <EventoPanel className="mx-auto max-w-md text-center" glow="blue">
      <EventoKicker>Accesso richiesto</EventoKicker>
      <EventoTitle className="text-2xl sm:text-3xl">Entra nella flotta</EventoTitle>
      <p className="mt-3 text-sm leading-relaxed text-crema/75">{label}</p>
      <EventoBtn className="mt-6" variant="discord" onClick={onLogin}>
        Accedi con Discord
      </EventoBtn>
    </EventoPanel>
  );
}

export function EventoSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto h-48 max-w-2xl animate-pulse rounded-3xl bg-crema/8", className)} aria-busy="true" />
  );
}
