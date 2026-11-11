"use client";

import { useEffect, useMemo, useState } from "react";
import { Cake, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import { isCookieBannerSkippedPath } from "@/lib/cookie-consent";
import { SmartLink } from "./SmartLink";

const AGE_KEY = "vc_age_gate_v1";

/** Sito IT-first: soglia unica 14 anni. */
const MIN_AGE = 14;

type Stored = { userId: string; birthIso: string; okAt: number };

function readStored(userId: string): Stored | null {
  try {
    const raw = localStorage.getItem(AGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Stored;
    if (!j || j.userId !== userId || !j.birthIso) return null;
    return j;
  } catch {
    return null;
  }
}

function writeStored(v: Stored) {
  try {
    localStorage.setItem(AGE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function ageFromIso(iso: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(birth.getTime())) return null;
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday =
    now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

/**
 * Dopo il login Discord: chiede data di nascita e blocca sotto i 14 anni.
 */
export function AgeGate() {
  const { ready, user, logout } = useAuth();
  const pathname = usePathname();
  const [birth, setBirth] = useState("");
  const [err, setErr] = useState("");
  const [need, setNeed] = useState(false);

  const skip = useMemo(() => isCookieBannerSkippedPath(pathname || "/"), [pathname]);

  useEffect(() => {
    if (!ready || !user?.id || skip) {
      setNeed(false);
      return;
    }
    const prev = readStored(user.id);
    if (prev) {
      const age = ageFromIso(prev.birthIso);
      if (age != null && age >= MIN_AGE) {
        setNeed(false);
        return;
      }
    }
    setNeed(true);
  }, [ready, user?.id, skip]);

  if (!need || !user) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const age = ageFromIso(birth);
    if (age == null) {
      setErr("Inserisci una data di nascita valida.");
      return;
    }
    if (age < MIN_AGE) {
      setErr(`Devi avere almeno ${MIN_AGE} anni per usare questo sito.`);
      return;
    }
    writeStored({ userId: user.id, birthIso: birth, okAt: Date.now() });
    setNeed(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vc-age-gate-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-espresso/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl bg-roast p-6 shadow-2xl ring-1 ring-sand/20 sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <Cake className="size-6" aria-hidden />
        </div>
        <h2 id="vc-age-gate-title" className="mt-4 font-display text-2xl font-semibold text-crema">
          Conferma la tua età
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-crema/70">
          Per usare il sito devi avere almeno <strong className="text-crema">14 anni</strong> (soglia del progetto,
          allineata all&apos;Italia). Non pubblichiamo la data: resta sul tuo dispositivo.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-crema/85">
            Data di nascita
            <input
              type="date"
              required
              value={birth}
              max={new Date().toISOString().slice(0, 10)}
              min="1900-01-01"
              onChange={(e) => setBirth(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-espresso/80 px-3 py-2.5 text-sm text-crema ring-1 ring-sand/20 outline-none focus:ring-caramel/50"
            />
          </label>
          {err ? <p className="text-sm font-medium text-[#f0a493] light:text-[#a83a2c]">{err}</p> : null}
          <p className="text-xs text-crema/50">
            Usando il sito accetti anche{" "}
            <SmartLink href="/terms/" className="underline decoration-sand/50 underline-offset-2 hover:text-crema">
              Termini
            </SmartLink>{" "}
            e{" "}
            <SmartLink href="/privacy/" className="underline decoration-sand/50 underline-offset-2 hover:text-crema">
              Privacy
            </SmartLink>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex flex-1 items-center justify-center rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-espresso transition hover:brightness-110"
            >
              Confermo
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 hover:bg-crema/5"
            >
              <LogOut className="size-3.5" aria-hidden /> Esci
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
