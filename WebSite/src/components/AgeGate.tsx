"use client";

import { useEffect, useMemo, useState } from "react";
import { Cake, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import { isCookieBannerSkippedPath } from "@/lib/cookie-consent";
import {
  AGE_MIN,
  clearLocalAge,
  fetchAgeAttest,
  readLocalAgeOk,
  submitAgeAttest,
  writeLocalAgeOk,
} from "@/lib/age-attest";
import { Checkbox } from "@/components/ui";
import { SmartLink } from "./SmartLink";

/**
 * Solo dopo login Discord: autodichiarazione età a spunta (niente data di nascita).
 * Una volta registrata sul server non ripropone il modal.
 */
export function AgeGate() {
  const { ready, user, token, logout } = useAuth();
  const pathname = usePathname();
  const [attested, setAttested] = useState(false);
  const [err, setErr] = useState("");
  const [need, setNeed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const skip = useMemo(() => isCookieBannerSkippedPath(pathname || "/"), [pathname]);
  const loggedIn = Boolean(ready && user?.id && token);

  useEffect(() => {
    if (!loggedIn || skip) {
      setNeed(false);
      setBlocked(false);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      try {
        const state = await fetchAgeAttest(token!);
        if (cancelled) return;
        if (state.status === "ok") {
          writeLocalAgeOk(user!.id, state.birthIso);
          setBlocked(false);
          setNeed(false);
          return;
        }
        if (state.status === "blocked") {
          clearLocalAge();
          setBlocked(true);
          setNeed(true);
          setErr(
            state.message ||
              `Accesso non consentito: è richiesta un’età minima di ${AGE_MIN} anni.`,
          );
          return;
        }
        /* missing / errore rete: localStorage ok solo come fallback soft se API down */
        if (readLocalAgeOk(user!.id) && state.error) {
          setBlocked(false);
          setNeed(false);
          return;
        }
        setBlocked(false);
        setNeed(true);
      } catch {
        if (cancelled) return;
        if (readLocalAgeOk(user!.id)) {
          setBlocked(false);
          setNeed(false);
          return;
        }
        setNeed(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loggedIn, user?.id, token, skip]);

  if (!loggedIn || !need || !user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    if (!attested) {
      setErr("È necessario confermare l’autodichiarazione di età.");
      return;
    }
    if (!token) {
      setErr("Sessione non valida. Effettua di nuovo l’accesso.");
      return;
    }

    setSaving(true);
    setErr("");
    try {
      const state = await submitAgeAttest(token);
      if (state.status === "ok") {
        writeLocalAgeOk(user.id, state.birthIso);
        setBlocked(false);
        setNeed(false);
        return;
      }
      if (state.status === "blocked" || state.reason === "underage" || state.error === "underage") {
        clearLocalAge();
        setBlocked(true);
        setErr(
          state.message ||
            `Accesso non consentito: è richiesta un’età minima di ${AGE_MIN} anni.`,
        );
        return;
      }
      setErr(state.message || "Impossibile registrare l’autodichiarazione. Riprova.");
    } catch {
      setErr("Errore di rete. Riprova tra poco.");
    } finally {
      setSaving(false);
    }
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
          {blocked ? "Accesso non consentito" : "Verifica dell\u2019età"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-crema/70">
          {blocked ? (
            <>
              L&apos;account risulta bloccato perché è stata dichiarata un&apos;età inferiore a{" "}
              <strong className="text-crema">{AGE_MIN} anni</strong>. L&apos;autodichiarazione è
              registrata sul server ed è immutabile. Per assistenza contattare lo staff tramite i
              canali ufficiali.
            </>
          ) : (
            <>
              L&apos;accesso è consentito esclusivamente a chi abbia compiuto almeno{" "}
              <strong className="text-crema">{AGE_MIN} anni</strong>, in linea con l&apos;età minima
              globale di Discord (fermo restando eventuali soglie più elevate richieste dalla legge del
              Paese di residenza). Al primo accesso è richiesta un&apos;autodichiarazione vincolante
              all&apos;account Discord: non è pubblicata sul profilo e non è modificabile dopo la
              conferma.
            </>
          )}
        </p>

        {blocked ? (
          <div className="mt-5 space-y-4">
            {err ? (
              <p role="alert" className="text-sm font-medium text-[#f0a493] light:text-[#a83a2c]">
                {err}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-espresso transition hover:brightness-110"
            >
              <LogOut className="size-3.5" aria-hidden /> Esci
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-5 space-y-4">
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-crema/75">
              <Checkbox
                id="vc-age-attest"
                checked={attested}
                disabled={checking || saving}
                onChange={(v) => {
                  setAttested(v);
                  if (err) setErr("");
                }}
                aria-label="Confermo autodichiarazione età"
                className="mt-0.5"
              />
              <span>
                Dichiaro sotto la mia responsabilità di avere almeno {AGE_MIN} anni. Prendo atto che
                false dichiarazioni possono comportare la limitazione o l&apos;esclusione
                dall&apos;utilizzo dei servizi, ai sensi dei{" "}
                <SmartLink href="/terms/" className="underline decoration-sand/50 underline-offset-2 hover:text-crema">
                  Termini di Servizio
                </SmartLink>{" "}
                e dell&apos;
                <SmartLink href="/privacy/" className="underline decoration-sand/50 underline-offset-2 hover:text-crema">
                  Informativa sulla privacy
                </SmartLink>
                .
              </span>
            </label>

            {err ? (
              <p id="vc-age-gate-err" role="alert" className="text-sm font-medium text-[#f0a493] light:text-[#a83a2c]">
                {err}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={checking || saving}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-espresso transition hover:brightness-110 disabled:opacity-60"
              >
                {saving ? "Registrazione…" : "Conferma"}
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
        )}
      </div>
    </div>
  );
}
