"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

/**
 * Nell'Attività di Discord il Number Quiz vive dentro il selettore dei giochi: niente cambi di pagina
 * (un ricaricamento chiude l'Attività). Qui i link diventano pulsanti che cambiano lo stato.
 */
export const NumberQuizNav = createContext<{ list: () => void; open: (id: string) => void } | null>(null);

export function NQLink({ to, className, children }: { to: { cat: string } | "list"; className?: string; children: ReactNode }) {
  const nav = useContext(NumberQuizNav);
  if (nav) {
    return (
      <button type="button" className={className} onClick={() => (to === "list" ? nav.list() : nav.open(to.cat))}>
        {children}
      </button>
    );
  }
  const href = to === "list" ? page("/quiz/numeri/") : page(`/quiz/numeri/gioca/?cat=${encodeURIComponent(to.cat)}`);
  return (
    <SmartLink href={href} className={className}>
      {children}
    </SmartLink>
  );
}
