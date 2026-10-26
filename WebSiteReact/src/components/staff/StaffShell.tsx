"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ClipboardList, LogIn, ShieldAlert, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { SmartLink } from "@/components/SmartLink";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  canAccessGestione,
  canAccessInbox,
  canAccessPmShop,
  canAccessPuntiTolti,
  loadStaffAccess,
  staffNavFor,
  type StaffAccess,
} from "@/lib/staff";

type StaffCtx = {
  token: string;
  access: StaffAccess;
  reload: () => void;
};

const Ctx = createContext<StaffCtx | null>(null);

export function useStaff(): StaffCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStaff fuori da StaffShell");
  return v;
}

function gateDenied(title: string, text: string) {
  return (
    <div className="rounded-2xl bg-roast/70 p-6 ring-1 ring-sand/15 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <ShieldAlert className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-crema/65">{text}</p>
        </div>
      </div>
    </div>
  );
}

type Props = {
  title: string;
  accent?: string;
  kicker?: string;
  text?: string;
  /** Compiti: richiede canCompiti dall'access API. */
  requireCompiti?: boolean;
  /** Shop premi Partner Manager. */
  requirePmShop?: boolean;
  /** Cronologia / review punti tolti. */
  requirePuntiTolti?: boolean;
  /** Inbox workflow (code review). */
  requireInbox?: boolean;
  /** Gestione pex/depex (High Staff / gestore PM). */
  requireGestione?: boolean;
  children: React.ReactNode;
};

/** Shell densità-strumento: gate site-staff-access + nav laterale D1–D9. */
export function StaffShell({
  title,
  accent,
  kicker = "Area staff",
  text,
  requireCompiti,
  requirePmShop,
  requirePuntiTolti,
  requireInbox,
  requireGestione,
  children,
}: Props) {
  const { ready, token, login, user } = useAuth();
  const pathname = usePathname() || "/staff/";
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

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
  }, [ready, token, tick]);

  const nav = useMemo(() => (access ? staffNavFor(access) : []), [access]);

  const pathNorm = pathname.replace(/\/+$/, "") || "/";
  const isActive = (href: string) => {
    const h = href.replace(/\/+$/, "") || "/";
    if (h === "/staff") return pathNorm === "/staff";
    return pathNorm === h || pathNorm.startsWith(`${h}/`);
  };

  let body: React.ReactNode;
  if (!ready || loading) {
    body = (
      <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
        <div className="h-10 animate-pulse rounded-2xl bg-crema/8" />
        <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />
      </div>
    );
  } else if (!token) {
    body = (
      <div className="rounded-2xl bg-roast/70 p-6 ring-1 ring-sand/15 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
            <LogIn className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-semibold">Accedi per continuare</h2>
            <p className="mt-1 text-sm text-crema/65">
              L&apos;area staff richiede l&apos;accesso con Discord sullo stesso account del server.
            </p>
            <button
              type="button"
              onClick={login}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5"
            >
              <LogIn className="size-4" /> Accedi con Discord
            </button>
          </div>
        </div>
      </div>
    );
  } else if (!access) {
    body = (
      <div className="rounded-2xl bg-roast/70 p-6 ring-1 ring-[#a83a2c]/35 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#a83a2c]/20 text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/35">
            <ShieldAlert className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-semibold">Accesso non consentito</h2>
            <p className="mt-1 text-sm text-crema/65">
              {error || "Questa area è riservata allo staff del server Vinili & Caffè."}
            </p>
            {user ? (
              <p className="mt-2 text-xs text-crema/40">
                Sei connesso come {user.global_name || user.username}.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  } else if (requireCompiti && !access.canCompiti) {
    body = (
      <div className="rounded-2xl bg-roast/70 p-6 ring-1 ring-sand/15 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
            <ClipboardList className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-semibold">Compiti non disponibili</h2>
            <p className="mt-1 text-sm text-crema/65">
              I compiti settimanali sono riservati allo staff operativo (Helper / Mod / Senior / Director o High
              Staff).
            </p>
          </div>
        </div>
      </div>
    );
  } else if (requirePmShop && !canAccessPmShop(access)) {
    body = gateDenied(
      "Shop non disponibile",
      "Lo shop premi è riservato ai Partner Manager (e all'High Staff per riscatti manuali).",
    );
  } else if (requirePuntiTolti && !canAccessPuntiTolti(access)) {
    body = gateDenied(
      "Punti tolti non disponibili",
      "Puoi vedere solo i tuoi punti tolti da Partner Manager, oppure essere High Staff.",
    );
  } else if (requireInbox && !canAccessInbox(access)) {
    body = gateDenied(
      "Inbox non disponibile",
      "Nessuna coda di revisione è abilitata per il tuo ruolo.",
    );
  } else if (requireGestione && !canAccessGestione(access)) {
    body = gateDenied(
      "Gestione non disponibile",
      "Pex e depex sono riservati all’High Staff (e ai gestori PM sui Partner Manager).",
    );
  } else {
    body = <Ctx.Provider value={{ token, access, reload: () => setTick((n) => n + 1) }}>{children}</Ctx.Provider>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-sand/10 pb-5">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-caramel">{kicker}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold lining-nums sm:text-4xl">
            {title}
            {accent ? <span className="italic text-sand"> {accent}</span> : null}
          </h1>
          {text ? <p className="mt-1.5 max-w-2xl text-sm text-crema/60">{text}</p> : null}
        </div>
        {access ? (
          <div className="flex items-center gap-2.5 rounded-2xl bg-roast/60 px-3 py-2 ring-1 ring-sand/12">
            <Avatar userId={access.identity.userId} src={access.identity.avatarUrl} name={access.identity.displayName} className="size-8 text-xs" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-crema">{access.identity.displayName}</p>
              <p className="flex items-center gap-1 text-[0.7rem] text-crema/45">
                <ShieldCheck className="size-3 text-ember" />
                {access.isHighStaff ? "High Staff" : "Staff"}
              </p>
            </div>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[11.5rem_minmax(0,1fr)]">
        <nav
          aria-label="Navigazione staff"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {nav.map((item) => {
            const on = isActive(item.href);
            return (
              <SmartLink
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:w-full",
                  on
                    ? "bg-caramel/20 text-ember ring-1 ring-caramel/30"
                    : "bg-crema/5 text-crema/65 ring-1 ring-sand/10 hover:bg-crema/8 hover:text-crema",
                )}
              >
                <span className="block">{item.label}</span>
                <span className="mt-0.5 hidden text-[0.65rem] font-medium text-crema/40 lg:block">{item.hint}</span>
              </SmartLink>
            );
          })}
          {!access && !loading && ready ? (
            <span className="shrink-0 rounded-xl px-3 py-2 text-sm text-crema/35 ring-1 ring-sand/10 lg:w-full">
              Guida · Compiti · Pause
            </span>
          ) : null}
        </nav>
        <div className="min-w-0">{body}</div>
      </div>
    </div>
  );
}
