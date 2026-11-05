"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { useEventoSortGate } from "@/components/evento/EventoSortContext";
import { SmistamentoQuiz } from "@/components/evento/SmistamentoQuiz";
import { EventoLoginGate, EventoSkeleton } from "@/components/evento/EventoUi";
import { page } from "@/lib/site";

/**
 * Hub: senza fazione → solo quiz smistamento (niente profilo/altre sezioni).
 * Completato → sblocca i children.
 * Su sottopagine evento: redirect a /evento/ finché non smistato.
 */
export function EventoSortGate({
  mode = "hub",
  children,
}: {
  mode?: "hub" | "redirect";
  children: ReactNode;
}) {
  const { ready, token, login } = useAuth();
  const { ready: staffReady, highStaff } = useEventoStaffAccess();
  const { ready: sortReady, needsSort, refresh } = useEventoSortGate();
  const router = useRouter();

  useEffect(() => {
    if (mode !== "redirect" || !sortReady || !needsSort) return;
    router.replace(page("/evento/"));
  }, [mode, sortReady, needsSort, router]);

  if (!ready || !staffReady || !sortReady) {
    return <EventoSkeleton className="mx-auto max-w-xl px-6" />;
  }

  if (mode === "redirect") {
    if (needsSort) return <EventoSkeleton className="mx-auto max-w-xl px-6" />;
    return <>{children}</>;
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-16">
        <EventoLoginGate
          label="Accedi per lo smistamento: senza fazione non puoi entrare nell’evento."
          onLogin={login}
        />
      </div>
    );
  }

  if (needsSort) {
    return (
      <div className="mx-auto max-w-2xl px-6 pb-16">
        <div className="mb-6 text-center">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">
            Ingresso obbligatorio
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-crema sm:text-3xl">Smistamento</h2>
          <p className="mt-2 text-sm text-crema/65">
            Scegli la tua fazione. Finché non completi lo smistamento non vedi profilo, inventari né le altre
            attività.
            {highStaff ? " (High Staff: anteprima bloccata finché non sei smistato.)" : ""}
          </p>
        </div>
        <SmistamentoQuiz onSorted={refresh} />
      </div>
    );
  }

  return <>{children}</>;
}
