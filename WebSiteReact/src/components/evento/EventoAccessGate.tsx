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

/** Gate: HS sempre; pubblico dal 1° dic solo su pagine `publicFromOpen`.
 *  Non accessibile ? redirect home (niente card anteprima). */
export function EventoAccessGate({
  pageId,
  children,
}: {
  pageId: EventoPageId;
  children: ReactNode;
}) {
  const { ready, token } = useAuth();
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const publicOk = isEventoPublicWindowOpen() && isEventoPagePublic(pageId);

  useEffect(() => {
    if (!ready) return;
    if (publicOk) {
      setLoading(false);
      if (!token) setAccess(null);
      return;
    }
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
  }, [ready, token, publicOk]);

  if (!ready || loading) {
    return (
      <section className="mx-auto max-w-lg px-6 pb-20" aria-busy="true" aria-label="Caricamento">
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
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setAccess(null);
      setLoaded(true);
      return;
    }
    let alive = true;
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      setAccess(r.ok ? r.data : null);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  return { ready: ready && loaded, access, highStaff: isEventoHighStaff(access) };
}
