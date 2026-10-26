"use client";

import { useEffect } from "react";

/**
 * Redirect immediato a home quando una pagina gated non è accessibile
 * (evento non pubblico, puzzle HS-only, contest hidden, ecc.).
 * Mostra solo uno skeleton finché parte il replace — niente card “accesso negato”.
 */
export function AccessHomeRedirect({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    try {
      window.location.replace("/");
    } catch {
      window.location.href = "/";
    }
  }, [active]);

  if (!active) return null;

  return (
    <section className="mx-auto max-w-lg px-6 pb-20" aria-busy="true" aria-label="Reindirizzamento">
      <div className="h-40 animate-pulse rounded-3xl bg-crema/8" />
    </section>
  );
}
