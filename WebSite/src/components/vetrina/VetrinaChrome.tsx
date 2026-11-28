"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSitePathname } from "@/lib/locale-path";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Bot, ChevronDown, FolderHeart, House, LogIn, Server, ShieldCheck, type LucideIcon } from "lucide-react";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { checkStaffAccess, loadBoardsConfig } from "@/lib/boards";
import { loadStaffAccess } from "@/lib/staff";
import { cdnUrl, page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { AccessHomeRedirect } from "@/components/AccessHomeRedirect";
import { SiteShell } from "@/components/SiteShell";
import { Footer } from "@/components/Footer";
import { SmartLink } from "@/components/SmartLink";
import { NavNotifBell } from "@/components/NavNotifBell";
import { ThemePrefRow } from "@/components/ThemeToggle";
import { useDeviceFx } from "@/components/effects/DeviceFxProvider";
import { useAutoHideNav } from "@/lib/use-auto-hide-nav";
import { HERO_ATMO_BAND, HERO_ATMO_VIDEO, HERO_ATMO_VIDEO_MOBILE, HeroBackdrop } from "@/components/HeroBackdrop";

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
export const VETRINA_FROM_KEY = "vc_vetrina_from";

/** Ricorda da quale pagina della vetrina si apre una scheda (per le fonti di traffico delle statistiche). */
function useRememberListingSource() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !/\/vetrina\/scheda\//.test(a.getAttribute("href") || "")) return;
      try {
        sessionStorage.setItem(VETRINA_FROM_KEY, JSON.stringify({ from: location.pathname + location.search, at: Date.now() }));
      } catch {
        /* niente */
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

export function VetrinaShell({ children }: { children: ReactNode }) {
  useRememberListingSource();
  return (
    <SiteShell chrome="app">
      <div className="relative min-h-dvh bg-espresso text-crema">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_srgb,var(--color-caramel)_10%,transparent),transparent_70%)]"
        />
        <VetrinaTopBar />
        <main className="relative min-h-dvh">{children}</main>
        <Footer />
      </div>
    </SiteShell>
  );
}

const BOT_AVATAR = "/webhooks/site-bot-avatar?size=128";
const LOGO = cdnUrl("/images/logo-disco.png");

/** Avatar del bot, come nella dashboard (col logo del disco se non si carica). */
function BotLogo() {
  const [src, setSrc] = useState(BOT_AVATAR);
  return (
     
    <img src={src} alt="" width={36} height={36} onError={() => setSrc(LOGO)} className="size-9 rounded-full object-cover ring-1 ring-caramel/30" />
  );
}

/** Come la navbar delle pagine pubbliche: trasparente in cima, scura e sfocata scorrendo, sparisce e torna col mouse in alto. */
function VetrinaTopBar() {
  const pathname = cleanPath(useSitePathname() || "/");
  const { caps } = useDeviceFx();
  const softBlur = caps.blur;
  const headerRef = useRef<HTMLElement>(null);
  const hidden = useAutoHideNav(headerRef, false);
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));
  return (
    <motion.header
      ref={headerRef}
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: hidden ? "-115%" : 0, opacity: 1 }}
      transition={{ duration: hidden ? 0.45 : 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed inset-x-0 top-[var(--vc-view-as-h,0px)] z-50 transition-[background-color,box-shadow,border-color,backdrop-filter] duration-500",
        scrolled
          ? cn("border-b border-sand/15 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.85)]", softBlur ? "bg-roast/80 backdrop-blur-xl vc-ui-blur" : "bg-roast/95")
          : cn("border-b border-transparent bg-transparent", softBlur ? "light:bg-roast/80 light:backdrop-blur-xl light:vc-ui-blur" : "light:bg-roast/95"),
      )}
    >
      {/* tre colonne: logo e lingua | schede (al centro esatto) | notifiche e account */}
      <div className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <SmartLink href={page("/vetrina/")} className="group flex shrink-0 items-center gap-2.5">
            <BotLogo />
            <span className="hidden leading-none sm:block">
              <span className="block font-display text-lg font-semibold text-crema transition-colors group-hover:text-ember">Vetrina</span>
              <span className="block text-xs font-semibold text-crema/40">Vinili &amp; Caffè</span>
            </span>
          </SmartLink>
          <span className="hidden sm:block">
          </span>
        </div>

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
          <NavNotifBell />
          <VetrinaAccountMenu />
        </div>
      </div>
    </motion.header>
  );
}

/** Sfondo degli hero come nelle pagine pubbliche: l'atmosfera del caffè, sfumata verso il fondo. */
export function VetrinaHeroBg() {
  return (
    <>
      <HeroBackdrop
        poster={HERO_ATMO_BAND}
        videoSrc={HERO_ATMO_VIDEO}
        videoSrcMobile={HERO_ATMO_VIDEO_MOBILE}
        priority
        imgClassName="size-full object-cover opacity-55 sm:opacity-60"
        objectPosition="50% 42%"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(ellipse 90% 45% at 50% 0%, rgba(217,154,91,0.16), transparent 55%)",
            "linear-gradient(to bottom, rgba(14,9,6,0.5) 0%, rgba(14,9,6,0.78) 42%, rgba(14,9,6,0.94) 78%, var(--color-espresso) 100%)",
          ].join(", "),
        }}
      />
    </>
  );
}

/** Menu account: le voci della vetrina, il tema e il ritorno al sito (come nella dashboard). */
function VetrinaAccountMenu() {
  const { user, ready, login } = useAuth();
  const staff = useIsStaff();
  const pathname = cleanPath(useSitePathname() || "/");
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
    { href: "/vetrina/le-mie/", label: "Le mie · Seguiti", icon: FolderHeart },
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
        { }
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
              { }
              <img src={avatarUrl(user, 64)} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-crema">{displayName(user)}</span>
                <span className="block truncate text-xs text-crema/55">@{user.username}</span>
              </span>
            </div>
            <div className="border-t border-sand/10 pt-1.5">
              <p className="px-2.5 pb-1 text-xs font-semibold text-crema/45">Vetrina</p>
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
              <p className="px-1.5 pb-1.5 text-xs font-semibold text-crema/45">Tema</p>
              <ThemePrefRow />
            </div>
            <div className="mt-1.5 border-t border-sand/10 pt-1.5">
              <SmartLink
                href="/"
                role="menuitem"
                className="flex items-center justify-center gap-2 rounded-lg bg-caramel px-2.5 py-2 text-sm font-semibold text-ink shadow-[0_8px_20px_-12px_rgba(0,0,0,0.55)] transition hover:brightness-110"
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
    <header className="relative isolate overflow-hidden px-6 pb-14 pt-28 sm:pt-36">
      <VetrinaHeroBg />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-6xl"
      >
        <p className="flex items-center gap-2 text-xs font-semibold text-caramel [&>svg]:size-4">
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
 * Finché la vetrina è in anteprima (publicOpen=false) elenco/cerca restano high-staff.
 * Su scheda e voto qualsiasi utente loggato può entrare (segnalare / votare in test);
 * senza login resta chiusa.
 */
export function VetrinaGate({ children, allowLoggedInPreview = false }: { children: ReactNode; allowLoggedInPreview?: boolean }) {
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
      if (allowLoggedInPreview) return setState("open");
      const r = await loadStaffAccess(token);
      if (!alive) return;
      setState(r.ok && r.data.isHighStaff ? "open" : "denied");
    })();
    return () => {
      alive = false;
    };
  }, [ready, token, allowLoggedInPreview]);
  if (state === "denied") return <AccessHomeRedirect active />;
  if (state === "checking") return <div className="min-h-[80dvh]" aria-busy="true" />;
  return <>{children}</>;
}
