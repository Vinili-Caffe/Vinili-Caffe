"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AccessHomeRedirect } from "@/components/AccessHomeRedirect";
import { useAuth } from "@/lib/auth";
import {
  canAccessEventoPage,
  isEventoFeatureUnlocked,
  isEventoHighStaff,
  isEventoPagePublic,
  isEventoPublicWindowOpen,
  type EventoPageId,
} from "@/lib/evento-starwars";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";
import { EventoLiveWalletPoller } from "@/lib/evento-faction-sync";

/** Cache solo esiti “sicuri”: accesso HS o 403 esplicito. Mai cache di errori rete. */
let accessCache: { token: string; access: StaffAccess | null; denied: boolean; at: number } | null = null;
const ACCESS_TTL_MS = 60_000;

function readCachedAccess(token: string | null | undefined): {
  access: StaffAccess | null;
  denied: boolean;
} | undefined {
  if (!token || !accessCache) return undefined;
  if (accessCache.token !== token) return undefined;
  if (Date.now() - accessCache.at > ACCESS_TTL_MS) return undefined;
  return { access: accessCache.access, denied: accessCache.denied };
}

function writeCachedAccess(token: string, access: StaffAccess | null, denied: boolean) {
  accessCache = { token, access, denied, at: Date.now() };
}

function setEventoHold(_on: boolean) {
  /* speedRes1: non settare più vc-evento-hold — bloccava BootGate/LCP per secondi. */
}

type GateVerdict = "loading" | "allow" | "deny";

/** Gate: HS sempre; pubblico dal 1° dic solo su pagine `publicFromOpen`.
 *  Non decide “deny” finché auth + staff non sono pronti (anti bounce → home). */
export function EventoAccessGate({
  pageId,
  children,
}: {
  pageId: EventoPageId;
  children: ReactNode;
}) {
  const { ready, token } = useAuth();
  /* Pubblico solo se finestra evento + pagina public + feature calendar sbloccata. */
  const publicOk =
    isEventoPublicWindowOpen() && isEventoPagePublic(pageId) && isEventoFeatureUnlocked(pageId);

  const [verdict, setVerdict] = useState<GateVerdict>("loading");
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [netError, setNetError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let alive = true;
    let retries = 0;

    const finishAllow = (acc: StaffAccess | null) => {
      if (!alive) return;
      setNetError(false);
      setAccess(acc);
      setVerdict("allow");
      setEventoHold(false);
    };
    const finishDeny = () => {
      if (!alive) return;
      setNetError(false);
      setAccess(null);
      setVerdict("deny");
      setEventoHold(false);
    };
    const stayLoading = () => {
      if (!alive) return;
      setVerdict("loading");
      setEventoHold(true);
    };

    if (!ready) {
      stayLoading();
      return () => {
        alive = false;
      };
    }

    // Finestra pubblica aperta: passa senza staff
    if (publicOk) {
      finishAllow(null);
      return () => {
        alive = false;
      };
    }

    // Evento ancora HS-only: senza login → deny (dopo auth ready)
    if (!token) {
      finishDeny();
      return () => {
        alive = false;
      };
    }

    const hit = readCachedAccess(token);
    if (hit) {
      if (hit.denied) finishDeny();
      else if (canAccessEventoPage(pageId, hit.access)) finishAllow(hit.access);
      else finishDeny();
      return () => {
        alive = false;
      };
    }

    stayLoading();
    setNetError(false);

    const run = () => {
      loadStaffAccess(token).then((r) => {
        if (!alive) return;
        if (r.ok) {
          writeCachedAccess(token, r.data, false);
          if (canAccessEventoPage(pageId, r.data)) finishAllow(r.data);
          else {
            writeCachedAccess(token, r.data, true);
            finishDeny();
          }
          return;
        }
        // 401/403 = davvero non autorizzato. Altri errori = retry, MAI bounce a home.
        const status = Number(r.status || 0);
        if (status === 401 || status === 403) {
          writeCachedAccess(token, null, true);
          finishDeny();
          return;
        }
        if (retries < 3) {
          retries += 1;
          window.setTimeout(run, 500 * retries);
          return;
        }
        setNetError(true);
        setVerdict("loading");
        setEventoHold(false);
      });
    };
    run();

    return () => {
      alive = false;
    };
  }, [ready, token, publicOk, pageId, retryTick]);

  useEffect(() => {
    return () => setEventoHold(false);
  }, []);

  if (verdict === "loading") {
    return (
      <section
        className="mx-auto flex min-h-[40dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 pb-20 text-center"
        aria-label={netError ? "Errore di rete" : "Caricamento"}
      >
        {netError ? (
          <>
            <p className="text-sm text-crema/70">Non riesco a verificare l&apos;accesso. Riprova.</p>
            <button
              type="button"
              className="rounded-full bg-[#c9a227]/20 px-4 py-2 text-sm font-semibold text-[#f0d78c] ring-1 ring-[#c9a227]/40"
              onClick={() => {
                setNetError(false);
                setRetryTick((n) => n + 1);
              }}
            >
              Riprova
            </button>
          </>
        ) : (
          <div className="h-40 w-full max-w-sm animate-pulse rounded-3xl bg-crema/8" />
        )}
      </section>
    );
  }

  if (verdict === "allow" || canAccessEventoPage(pageId, access)) {
    return (
      <>
        <EventoLiveWalletPoller />
        {children}
      </>
    );
  }

  return <AccessHomeRedirect active />;
}

export function useEventoStaffAccess(): {
  ready: boolean;
  access: StaffAccess | null;
  highStaff: boolean;
} {
  const { ready, token } = useAuth();
  const cached = token ? readCachedAccess(token) : undefined;
  const [access, setAccess] = useState<StaffAccess | null>(() => cached?.access ?? null);
  const [loaded, setLoaded] = useState(() => !token || cached !== undefined);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setAccess(null);
      setLoaded(true);
      return;
    }
    const hit = readCachedAccess(token);
    if (hit) {
      setAccess(hit.access);
      setLoaded(true);
      return;
    }
    let alive = true;
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      if (r.ok) {
        writeCachedAccess(token, r.data, false);
        setAccess(r.data);
      } else if (r.status === 401 || r.status === 403) {
        writeCachedAccess(token, null, true);
        setAccess(null);
      } else {
        setAccess(null);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  return { ready: ready && loaded, access, highStaff: isEventoHighStaff(access) };
}
