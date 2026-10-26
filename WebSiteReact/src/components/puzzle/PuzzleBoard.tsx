"use client";

import { useEffect, useState } from "react";
import { LogIn, ShieldAlert } from "lucide-react";
import { LoginRequired } from "@/components/LoginRequired";
import { PuzzleGame } from "@/components/puzzle/PuzzleGame";
import { Reveal } from "@/components/Reveal";
import { useAuth } from "@/lib/auth";
import { canAccessPuzzle } from "@/lib/puzzle";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";

/** Gate High Staff (site-staff-access) + jigsaw galassia. */
export function PuzzleBoard() {
  const { ready, token, login } = useAuth();
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setAccess(null);
      setError("");
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setAccess(null);
        setError(r.message);
        setLoading(false);
        return;
      }
      setAccess(r.data);
      setError("");
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  if (!ready || loading) {
    return (
      <section className="mx-auto max-w-5xl px-6 pb-20" aria-busy="true" aria-label="Caricamento">
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-2xl bg-crema/8" />
          <div className="aspect-[1600/816] animate-pulse rounded-3xl bg-crema/6" />
          <div className="h-24 animate-pulse rounded-3xl bg-crema/6" />
        </div>
      </section>
    );
  }

  if (!token) {
    return (
      <LoginRequired
        title="Accesso richiesto"
        text="Accesso riservato allo staff: accedi con Discord per giocare."
      />
    );
  }

  if (error || !access) {
    return (
      <section className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-[2rem] bg-roast/70 p-8 ring-1 ring-sand/12">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
              <ShieldAlert className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-semibold">Non autorizzato</h2>
              <p className="mt-2 text-sm text-crema/60">
                {error || "Questa area è riservata allo staff del server Vinili & Caffè."}
              </p>
              <button
                type="button"
                onClick={login}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink"
              >
                <LogIn className="size-4" /> Cambia account Discord
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!canAccessPuzzle(access)) {
    return (
      <section className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-[2rem] bg-roast/70 p-8 ring-1 ring-sand/12">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
              <ShieldAlert className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-semibold">Solo High Staff</h2>
              <p className="mt-2 text-sm text-crema/60">
                Il puzzle galassia è riservato all&apos;High Staff. Il tuo account non ha i permessi
                necessari.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <Reveal className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
      <PuzzleGame />
    </Reveal>
  );
}
