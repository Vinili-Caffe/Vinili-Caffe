"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LogIn, ShieldAlert } from "lucide-react";
import { LoginRequired } from "@/components/LoginRequired";
import { useAuth } from "@/lib/auth";
import {
  canAccessEventoPage,
  isEventoHighStaff,
  isEventoPagePublic,
  isEventoPublicWindowOpen,
  type EventoPageId,
} from "@/lib/evento-starwars";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";

/** Gate: HS sempre; pubblico dal 1° dic solo su pagine `publicFromOpen`. */
export function EventoAccessGate({
  pageId,
  children,
}: {
  pageId: EventoPageId;
  children: ReactNode;
}) {
  const { ready, token, login } = useAuth();
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const publicOk = isEventoPublicWindowOpen() && isEventoPagePublic(pageId);

  useEffect(() => {
    if (!ready) return;
    // Pagina già pubblica: niente staff check obbligatorio
    if (publicOk) {
      setLoading(false);
      setError("");
      if (!token) {
        setAccess(null);
        return;
      }
    }
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

  // Prima del 1° dic / pagine non pubbliche: serve HS
  if (!token) {
    return (
      <LoginRequired
        title="Accesso riservato"
        text="L’evento Star Wars in anteprima è solo High Staff. Accedi con Discord."
      />
    );
  }

  if (error && !publicOk) {
    return (
      <Denied
        title="Non autorizzato"
        text={error || "Questa area è riservata allo staff."}
        onLogin={login}
      />
    );
  }

  if (!isEventoPublicWindowOpen()) {
    return (
      <Denied
        title="Anteprima High Staff"
        text="L’evento apre al pubblico il 1° dicembre. Fino ad allora solo High Staff può entrare."
      />
    );
  }

  return (
    <Denied
      title="Non ancora aperta"
      text="Questa sezione dell’evento non è ancora pubblica. Dal 1° dicembre sono aperti Avvento e Smistamento."
    />
  );
}

function Denied({
  title,
  text,
  onLogin,
}: {
  title: string;
  text: string;
  onLogin?: () => void;
}) {
  return (
    <section className="mx-auto max-w-md px-6 pb-20">
      <div className="rounded-[2rem] bg-roast/70 p-8 ring-1 ring-sand/12">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
            <ShieldAlert className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-crema/60">{text}</p>
            {onLogin ? (
              <button
                type="button"
                onClick={onLogin}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink"
              >
                <LogIn className="size-4" /> Cambia account Discord
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
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
