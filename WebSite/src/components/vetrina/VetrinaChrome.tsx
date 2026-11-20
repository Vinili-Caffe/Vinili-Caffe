"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BookOpenCheck, Bot, ChevronDown, Disc3, FolderHeart, House, LogIn, Plus, Server, ShieldCheck, type LucideIcon } from "lucide-react";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { checkStaffAccess, loadBoardsConfig } from "@/lib/boards";
import { loadStaffAccess } from "@/lib/staff";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { AccessHomeRedirect } from "@/components/AccessHomeRedirect";
import { SiteShell } from "@/components/SiteShell";
import { Footer } from "@/components/Footer";
import { SmartLink } from "@/components/SmartLink";
import { NavNotifBell } from "@/components/NavNotifBell";
import { LangMenu } from "@/components/LangMenu";
import { ThemePrefRow } from "@/components/ThemeToggle";

const cleanPath = (p: string) => p.replace(/^\/(en|es)(?=\/)/, "");

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

/* ─────────── guscio della vetrina (come la dashboard: barra sua, niente navbar del sito) ─────────── */

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/vetrina/server/", label: "Server", icon: Server },
  { href: "/vetrina/bot/", label: "Bot", icon: Bot },
];

/** Pagina della vetrina: barra propria in alto, contenuto, footer del sito. */
export function VetrinaShell({ children }: { children: ReactNode }) {
  return (
    <SiteShell chrome="app">
      <div className="relative min-h-dvh bg-espresso text-crema">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_srgb,var(--color-caramel)_10%,transparent),transparent_70%)]"
        />
        <VetrinaTopBar />
        <main className="relative min-h-[calc(100dvh-4rem)]">{children}</main>
        <Footer />
      </div>
    </SiteShell>
  );
}

function VetrinaTopBar() {
  const pathname = cleanPath(usePathname() || "/");
  return (
    <header className="sticky top-[var(--vc-view-as-h,0px)] z-40 border-b border-sand/10 bg-espresso/85 backdrop-blur-md">
      {/* tre colonne: logo | schede (al centro esatto) | azioni */}
      <div className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-8">
        <SmartLink href={page("/vetrina/")} className="group flex shrink-0 items-center gap-2.5 justify-self-start">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-caramel to-ember text-ink shadow-[0_8px_24px_-10px_rgba(240,180,110,0.9)] transition-transform group-hover:rotate-[-12deg]">
            <Disc3 className="size-5" />
          </span>
          <span className="hidden leading-none sm:block">
            <span className="block font-display text-xl font-semibold text-crema">Vetrina</span>
            <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-crema/40">Vinili &amp; Caffè</span>
          </span>
        </SmartLink>

        <nav aria-label="Vetrina" className="flex items-center rounded-full bg-roast p-1 ring-1 ring-sand/12">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <SmartLink
                key={t.href}
                href={page(t.href)}
                aria-current={active ? "page" : undefined}
                className={cn("relative inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors sm:px-5", active ? "text-ink" : "text-crema/60 hover:text-crema")}
              >
                {active && <motion.span layoutId="vetrina-top-tab" className="absolute inset-0 rounded-full bg-crema" transition={{ type: "spring", stiffness: 450, damping: 36 }} />}
                <Icon className="relative size-4" />
                <span className="relative">{t.label}</span>
              </SmartLink>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 justify-self-end">
          <SmartLink
            href={page("/vetrina/invia/")}
            className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-bold text-ink transition-transform hover:-translate-y-0.5 md:inline-flex"
          >
            <Plus className="size-4" /> Metti in vetrina
          </SmartLink>
          <span className="hidden sm:block">
            <LangMenu />
          </span>
          <NavNotifBell />
          <VetrinaAccountMenu />
        </div>
      </div>
    </header>
  );
}

/** Menu account: le voci della vetrina, il tema e il ritorno al sito (come nella dashboard). */
function VetrinaAccountMenu() {
  const { user, ready, login } = useAuth();
  const staff = useIsStaff();
  const pathname = cleanPath(usePathname() || "/");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    if (open) setOpen(false);
  }

  if (!ready) return <div className="size-9 shrink-0 animate-pulse rounded-full bg-crema/[0.06] sm:w-36 sm:rounded-xl" />;
  if (!user) {
    return (
      <button type="button" onClick={login} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#5865f2] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110">
        <LogIn className="size-4" /> <span className="hidden sm:inline">Accedi</span>
      </button>
    );
  }

  const items: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/vetrina/le-mie/", label: "Le mie schede", icon: FolderHeart },
    { href: "/vetrina/invia/", label: "Metti in vetrina", icon: Plus },
    { href: "/vetrina/linee-guida-recensioni/", label: "Linee guida recensioni", icon: BookOpenCheck },
    ...(staff ? [{ href: "/vetrina/mod/", label: "Moderazione", icon: ShieldCheck }] : []),
  ];

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu account"
        className={cn("flex items-center gap-2 rounded-xl p-1 ring-1 transition sm:py-1 sm:pl-1 sm:pr-2", open ? "bg-crema/[0.07] ring-sand/25" : "ring-sand/10 hover:bg-crema/[0.05] hover:ring-sand/20")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl(user, 64)} alt="" width={28} height={28} className="size-7 shrink-0 rounded-full" />
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-[9rem] truncate text-[0.8rem] font-semibold text-crema">{displayName(user)}</span>
          <span className="block max-w-[9rem] truncate text-[0.68rem] text-crema/55">@{user.username}</span>
        </span>
        <ChevronDown className={cn("hidden size-3.5 text-crema/50 transition sm:block", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl bg-roast p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] ring-1 ring-sand/20"
          >
            <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl(user, 64)} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-crema">{displayName(user)}</span>
                <span className="block truncate text-xs text-crema/55">@{user.username}</span>
              </span>
            </div>
            <div className="border-t border-sand/10 pt-1.5">
              <p className="px-2.5 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-crema/45">Vetrina</p>
              {items.map((n) => {
                const Icon = n.icon;
                const active = pathname.startsWith(n.href);
                return (
                  <SmartLink
                    key={n.href}
                    href={page(n.href)}
                    role="menuitem"
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                      active ? "bg-caramel/15 text-ember" : "text-crema/80 hover:bg-crema/[0.06] hover:text-crema",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {n.label}
                  </SmartLink>
                );
              })}
            </div>
            <div className="mt-1.5 border-t border-sand/10 px-1 pb-1 pt-2">
              <p className="px-1.5 pb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-crema/45">Tema</p>
              <ThemePrefRow />
            </div>
            <div className="mt-1.5 border-t border-sand/10 pt-1.5">
              <SmartLink
                href="/"
                role="menuitem"
                className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-caramel to-ember px-2.5 py-2 text-sm font-semibold text-ink shadow-[0_8px_20px_-12px_rgba(217,154,91,0.9)] transition hover:brightness-110"
              >
                <House className="size-4 shrink-0" /> Torna al sito
              </SmartLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Intestazione compatta delle sottopagine. */
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
    <header className="relative overflow-hidden px-6 pb-10 pt-12 sm:pt-16">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-10 opacity-[0.07]">
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
