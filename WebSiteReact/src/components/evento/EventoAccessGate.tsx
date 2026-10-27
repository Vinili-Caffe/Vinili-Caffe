"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AccessHomeRedirect } from "@/components/AccessHomeRedirect";
import { useAuth } from "@/lib/auth";
import {
  canAccessEventoPage,
  isEventoHighStaff,
  isEventoPagePublic,
  isEventoPublicWindowOpen,
  type EventoPageId,
} from "@/lib/evento-starwars";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";

/** Cache breve: tra pagine /evento/* non rifare loading skeleton (flash chrome). */
let accessCache: { token: string; access: StaffAccess | null; at: number } | null = null;
const ACCESS_TTL_MS = 60_000;

function readCachedAccess(token: string | null | undefined): StaffAccess | null | undefined {
  if (!token || !accessCache) return undefined;
  if (accessCache.token !== token) return undefined;
  if (Date.now() - accessCache.at > ACCESS_TTL_MS) return undefined;
  return accessCache.access;
}

function writeCachedAccess(token: string, access: StaffAccess | null) {
  accessCache = { token, access, at: Date.now() };
}

function setEventoHold(on: boolean) {
  try {
    document.documentElement.classList.toggle("vc-evento-hold", on);
  } catch {
    /* ignore */
  }
}

/** Gate: HS sempre; pubblico dal 1° dic solo su pagine `publicFromOpen`.
 *  Non accessibile → redirect home (niente card anteprima). */
export function EventoAccessGate({
  pageId,
  children,
}: {
  pageId: EventoPageId;
  children: ReactNode;
}) {
  const { ready, token } = useAuth();
  const publicOk = isEventoPublicWindowOpen() && isEventoPagePublic(pageId);
  const cached = token ? readCachedAccess(token) : undefined;

  const [access, setAccess] = useState<StaffAccess | null>(() =>
    publicOk ? null : cached === undefined ? null : cached,
  );
  const [loading, setLoading] = useState(() => {
    if (publicOk) return false;
    if (!token) return false;
    return cached === undefined;
  });

  useEffect(() => {
    if (!ready) {
      setEventoHold(true);
      return;
    }
    if (publicOk) {
      setLoading(false);
      if (!token) setAccess(null);
      setEventoHold(false);
      return;
    }
    if (!token) {
      setAccess(null);
      setLoading(false);
      setEventoHold(false);
      return;
    }

    const hit = readCachedAccess(token);
    if (hit !== undefined) {
      setAccess(hit);
      setLoading(false);
      setEventoHold(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setEventoHold(true);
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      const next = r.ok ? r.data : null;
      writeCachedAccess(token, next);
      setAccess(next);
      setLoading(false);
      setEventoHold(false);
    });
    return () => {
      alive = false;
    };
  }, [ready, token, publicOk]);

  useEffect(() => {
    return () => setEventoHold(false);
  }, []);

  if (!ready || loading) {
    return (
      <section
        className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center px-6 pb-20"
        aria-busy="true"
        aria-label="Caricamento"
      >
        <div className="h-40 animate-pulse rounded-3xl bg-crema/8" />
      </section>
    );
  }

  if (canAccessEventoPage(pageId, access)) {
    return <>{children}</>;
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
  const [access, setAccess] = useState<StaffAccess | null>(() => (cached === undefined ? null : cached));
  const [loaded, setLoaded] = useState(() => !token || cached !== undefined);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setAccess(null);
      setLoaded(true);
      return;
    }
    const hit = readCachedAccess(token);
    if (hit !== undefined) {
      setAccess(hit);
      setLoaded(true);
      return;
    }
    let alive = true;
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      const next = r.ok ? r.data : null;
      writeCachedAccess(token, next);
      setAccess(next);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  return { ready: ready && loaded, access, highStaff: isEventoHighStaff(access) };
}
