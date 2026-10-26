"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AccessHomeRedirect } from "@/components/AccessHomeRedirect";
import { EventoHero } from "@/components/evento/EventoHero";
import { PuzzleGame } from "@/components/puzzle/PuzzleGame";
import { Reveal } from "@/components/Reveal";
import { useAuth } from "@/lib/auth";
import { canAccessPuzzle } from "@/lib/puzzle";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";

/** Gate High Staff — non autorizzati → redirect home. Shell SW via SiteShell chrome=evento. */
export function PuzzleBoard() {
  const { ready, token } = useAuth();
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setAccess(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      setAccess(r.ok ? r.data : null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  if (!ready || loading) {
    return (
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-8" aria-busy="true" aria-label="Caricamento">
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-2xl bg-[#f0e6c8]/8" />
          <div className="aspect-[1600/816] animate-pulse rounded-3xl bg-[#f0e6c8]/6" />
          <div className="h-24 animate-pulse rounded-3xl bg-[#f0e6c8]/6" />
        </div>
      </section>
    );
  }

  if (!token || !access || !canAccessPuzzle(access)) {
    return <AccessHomeRedirect active />;
  }

  return (
    <>
      <EventoHero
        icon={<Sparkles />}
        title="Puzzle"
        accent="galassia"
        text="Pezzi coperti da pescare: ricomponi la mappa stellare sul quadro."
      />
      <Reveal className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <PuzzleGame />
      </Reveal>
    </>
  );
}
