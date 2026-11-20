"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BookOpenCheck, Bot, Compass, Disc3, FolderHeart, Plus, Server, ShieldCheck, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { checkStaffAccess, loadBoardsConfig } from "@/lib/boards";
import { loadStaffAccess } from "@/lib/staff";
import { AccessHomeRedirect } from "@/components/AccessHomeRedirect";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";

type NavItem = { href: string; label: string; icon: LucideIcon; staff?: boolean };

const NAV: NavItem[] = [
  { href: "/vetrina/", label: "Esplora", icon: Compass },
  { href: "/vetrina/server/", label: "Server", icon: Server },
  { href: "/vetrina/bot/", label: "Bot", icon: Bot },
  { href: "/vetrina/le-mie/", label: "Le mie schede", icon: FolderHeart },
  { href: "/vetrina/linee-guida-recensioni/", label: "Linee guida", icon: BookOpenCheck },
  { href: "/vetrina/mod/", label: "Moderazione", icon: ShieldCheck, staff: true },
];

function useIsStaff() {
  const { ready, token } = useAuth();
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    if (!ready || !token) {
      setStaff(false);
      return;
    }
    let alive = true;
    void checkStaffAccess(token).then((ok) => alive && setStaff(ok));
    return () => {
      alive = false;
    };
  }, [ready, token]);
  return staff;
}

/** Barra della vetrina: le stesse voci su tutte le sottopagine, con l'invio sempre a portata. */
export function VetrinaNav() {
  const pathname = usePathname() || "/";
  const staff = useIsStaff();
  const clean = pathname.replace(/^\/(en|es)(?=\/)/, "");
  const isActive = (href: string) => (href === "/vetrina/" ? clean === "/vetrina/" || clean === "/vetrina" : clean.startsWith(href));
  return (
    <nav aria-label="Sezioni della vetrina" className="sticky top-[4.5rem] z-30 mx-auto max-w-6xl px-4 sm:px-6">
      <div className="flex items-center gap-2 overflow-x-auto rounded-full bg-roast/85 p-1.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV.filter((n) => !n.staff || staff).map((n) => {
          const active = isActive(n.href);
          const Icon = n.icon;
          return (
            <SmartLink
              key={n.href}
              href={page(n.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                active ? "text-ink" : "text-crema/60 hover:text-crema",
              )}
            >
              {active && (
                <motion.span
                  layoutId="vetrina-nav-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-caramel to-ember"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icon className="relative size-4" />
              <span className="relative">{n.label}</span>
            </SmartLink>
          );
        })}
        <SmartLink
          href={page("/vetrina/invia/")}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-crema px-4 py-2 text-sm font-bold text-ink transition-transform hover:-translate-y-0.5"
        >
          <Plus className="size-4" /> Metti in vetrina
        </SmartLink>
      </div>
    </nav>
  );
}

/** Intestazione compatta delle sottopagine: titolo, sottotitolo e barra della vetrina. */
export function VetrinaHeader({
  icon,
  kicker = "Vetrina",
  title,
  accent,
  text,
  children,
}: {
  icon?: ReactNode;
  kicker?: string;
  title: string;
  accent?: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <header className="relative overflow-hidden px-6 pb-10 pt-32 sm:pt-36">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(217,154,91,0.22),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute -right-24 top-16 opacity-[0.07]">
          <Disc3 className="size-96 text-sand" strokeWidth={0.6} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto max-w-6xl"
        >
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-caramel [&>svg]:size-4">
            {icon} {kicker}
          </p>
          <h1 className="mt-3 font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
            {title} {accent ? <em className="font-script text-[1.08em] font-normal not-italic text-ember">{accent}</em> : null}
          </h1>
          {text ? <p className="mt-4 max-w-2xl text-lg text-crema/60">{text}</p> : null}
          {children}
        </motion.div>
      </header>
      <VetrinaNav />
    </>
  );
}

/**
 * Finché la vetrina è in anteprima (publicOpen=false) la vede solo l'high staff:
 * tutti gli altri, anche lo staff normale, trovano la pagina chiusa. Il bot fa lo stesso controllo sulle API.
 */
export function VetrinaGate({ children }: { children: ReactNode }) {
  const { ready, token } = useAuth();
  const [state, setState] = useState<"checking" | "open" | "denied">("checking");
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void (async () => {
      const cfg = await loadBoardsConfig("", token);
      if (!alive) return;
      /* config non raggiungibile: lascio decidere alle API (che bloccano comunque) */
      if (!cfg || cfg.publicOpen) return setState("open");
      if (!token) return setState("denied");
      const r = await loadStaffAccess(token);
      if (!alive) return;
      setState(r.ok && r.data.isHighStaff ? "open" : "denied");
    })();
    return () => {
      alive = false;
    };
  }, [ready, token]);
  if (state === "denied") return <AccessHomeRedirect active />;
  if (state === "checking") return <div className="min-h-[80dvh]" aria-busy="true" />;
  return <>{children}</>;
}
