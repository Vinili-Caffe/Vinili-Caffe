"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { SmartLink } from "@/components/SmartLink";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
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

/** Prima pagina staff consentita (nav), altrimenti guida. */
function staffFallbackHref(access: StaffAccess): string {
  const nav = staffNavFor(access);
  return nav[0]?.href || "/staff/guida/";
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

function loadingBody() {
  return (
    <div className="space-y-3" aria-label="Caricamento">
      <div className="h-10 animate-pulse rounded-2xl bg-crema/8" />
      <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />
    </div>
  );
}

/** Shell densità-strumento: gate site-staff-access + nav laterale. Senza permesso → redirect, mai pagina deny. */
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
  const { ready, token } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/staff/";
  const [access, setAccess] = useState<StaffAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [redirecting, setRedirecting] = useState(false);

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
      if (!r.ok) {
        setAccess(null);
        setLoading(false);
        return;
      }
      setAccess(r.data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [ready, token, tick]);

  const pageBlocked = useMemo(() => {
    if (!access) return false;
    if (requireCompiti && !access.canCompiti) return true;
    if (requirePmShop && !canAccessPmShop(access)) return true;
    if (requirePuntiTolti && !canAccessPuntiTolti(access)) return true;
    if (requireInbox && !canAccessInbox(access)) return true;
    if (requireGestione && !canAccessGestione(access)) return true;
    return false;
  }, [access, requireCompiti, requirePmShop, requirePuntiTolti, requireInbox, requireGestione]);

  /* Senza login / senza staff / pagina non consentita → esci subito (niente schermata deny). */
  useEffect(() => {
    if (!ready || loading) return;
    if (!token) {
      setRedirecting(true);
      router.replace(page("/"));
      return;
    }
    if (!access) {
      setRedirecting(true);
      router.replace(page("/"));
      return;
    }
    if (pageBlocked) {
      setRedirecting(true);
      router.replace(page(staffFallbackHref(access)));
    }
  }, [ready, loading, token, access, pageBlocked, router]);

  const nav = useMemo(() => (access && !pageBlocked ? staffNavFor(access) : []), [access, pageBlocked]);

  const pathNorm = pathname.replace(/\/+$/, "") || "/";
  const isActive = (href: string) => {
    const h = href.replace(/\/+$/, "") || "/";
    if (h === "/staff") return pathNorm === "/staff";
    return pathNorm === h || pathNorm.startsWith(`${h}/`);
  };

  const gatedOut = !ready || loading || redirecting || !token || !access || pageBlocked;

  let body: React.ReactNode;
  if (gatedOut) {
    body = loadingBody();
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
        {access && !pageBlocked ? (
          <div className="flex items-center gap-2.5 rounded-2xl bg-roast/60 px-3 py-2 ring-1 ring-sand/12">
            <Avatar
              userId={access.identity.userId}
              src={access.identity.avatarUrl}
              name={access.identity.displayName}
              className="size-8 text-xs"
            />
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
        </nav>
        <div className="min-w-0">{body}</div>
      </div>
    </div>
  );
}
