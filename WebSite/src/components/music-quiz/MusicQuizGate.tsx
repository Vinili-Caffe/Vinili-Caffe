"use client";

/**
 * Il Music Quiz è aperto a tutti: si gioca anche senza accesso.
 * Con l'accesso si salvano i punteggi; chi è nel server Discord prende anche l'EXP.
 * (Il componente resta per non cambiare le pagine che lo usano.)
 */
export function MusicQuizGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
