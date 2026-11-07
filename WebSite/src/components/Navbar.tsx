"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  Menu,
  MessageSquareText,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { NAV_DIRECT, NAV_GROUPS, NAV_MOBILE_SECTIONS, page, type NavLink } from "@/lib/site";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { EventoNavIcon, NavIcon } from "@/lib/nav-icons";
import { useCloseOnScroll } from "@/lib/use-close-on-scroll";
import { useAutoHideNav } from "@/lib/use-auto-hide-nav";
import { viewAsAllowedSticky } from "@/lib/view-as";
import { Avatar } from "@/components/Avatar";
import { SmartLink } from "./SmartLink";
import { UserMenu } from "./UserMenu";
import { NavNotifBell } from "./NavNotifBell";
import { LangMenu } from "./LangMenu";
import { BrandMark } from "./BrandMark";
import { navUnderlineClass } from "./NavUnderline";
import { ThemePrefRow } from "./ThemeToggle";
import { ViewAsLaunch, useViewAsChrome } from "./view-as/ViewAsChrome";
import { useDeviceFx } from "./effects/DeviceFxProvider";
import {
  eventoEventiNavForViewer,
  eventoPrimaryNavForViewer,
  isEventoHighStaff,
  isEventoPublicWindowOpen,
  type EventoNavItemView,
} from "@/lib/evento-starwars";
import { useEventoChrome } from "./evento/EventoChrome";
import { useEventoSortGate } from "./evento/EventoSortContext";
import { ContestNavPill } from "./contest/ContestNavPill";

function canHoverNav() {
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return true;
  }
}

/** Un solo dropdown nav aperto: chi apre claima e gli altri chiudono (anche se pinned). */
const NAV_DROP_CLAIM = "vc:nav-drop-claim";

function claimNavDrop(id: string) {
  try {
    window.dispatchEvent(new CustomEvent(NAV_DROP_CLAIM, { detail: { id } }));
  } catch {
    /* ignore */
  }
}

function useExclusiveNavDrop(id: string, collapse: () => void) {
  useEffect(() => {
    const onClaim = (e: Event) => {
      const other = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (other && other !== id) collapse();
    };
    window.addEventListener(NAV_DROP_CLAIM, onClaim);
    return () => window.removeEventListener(NAV_DROP_CLAIM, onClaim);
  }, [id, collapse]);
}

function linkLocked(l: NavLink, highStaff: boolean, eventoNavOpen = false) {
  if (l.gate === "highStaff") return !highStaff;
  if (l.gate === "evento") return !(highStaff || eventoNavOpen);
  return false;
}

function SoonNavItem({
  label,
  soon,
  icon,
  className,
}: {
  label: string;
  soon: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      role="link"
      aria-disabled="true"
      title={soon}
      className={cn("relative flex cursor-not-allowed items-center justify-center overflow-hidden", className)}
    >
      <span className="flex items-center gap-2 blur-[2.5px] select-none" aria-hidden>
        {icon}
        {label}
      </span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-espresso/90 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-sand ring-1 ring-sand/30">
          {soon}
        </span>
      </span>
    </span>
  );
}

function pathActive(pathname: string, href: string) {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const h = href.endsWith("/") ? href : `${href}/`;
  if (h === "/") return p === "/";
  return p === h || p.startsWith(h);
}

/** Hub solo su `/evento/` esatto — non su avvento/gara/… (prefix match spegneva le altre). */
function eventoLinkActive(pathname: string, href: string, id: string) {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const h = href.endsWith("/") ? href : `${href}/`;
  if (id === "hub" || h === "/evento/") return p === "/evento/";
  if (h === "/puzzle/") return p === "/puzzle/" || p.startsWith("/puzzle/");
  return p === h || p.startsWith(h);
}

/** Dropdown “Eventi” (Accademia / Gara / Miniera / Puzzle) — blur se locked. */
function EventoEventiDrop({ items, soon }: { items: EventoNavItemView[]; soon: string }) {
  const pathname = usePathname() || "/";
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const open = hover || pinned;
  const groupActive = items.some((l) => !l.locked && eventoLinkActive(pathname, l.href, l.id));

  const collapse = useCallback(() => {
    setHover(false);
    setPinned(false);
  }, []);

  useExclusiveNavDrop(uid, collapse);

  useEffect(() => {
    setChromeOpen(`navdrop-${uid}`, open);
    return () => setChromeOpen(`navdrop-${uid}`, false);
  }, [open, uid]);

  useEffect(() => {
    if (open) claimNavDrop(uid);
  }, [open, uid]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) collapse();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && collapse();
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, collapse]);

  useCloseOnScroll(pinned, collapse);

  if (!items.length) return null;

  return (
    <div
      ref={box}
      className="relative"
      onMouseEnter={() => {
        if (!canHoverNav()) return;
        claimNavDrop(uid);
        setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => {
          setPinned((p) => {
            const next = !p;
            if (next) claimNavDrop(uid);
            return next;
          });
        }}
        aria-expanded={open}
        className={navUnderlineClass(groupActive)}
      >
        <Sparkles className="size-3.5 shrink-0 opacity-75" aria-hidden />
        Eventi
        <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 top-full z-[70] mt-1 min-w-[14rem] -translate-x-1/2 origin-top overflow-hidden rounded-2xl bg-[#060f1c]/95 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-cyan-300/25 backdrop-blur-xl"
          >
            <ul className="py-0.5">
              {items.map((l) => {
                const on = eventoLinkActive(pathname, l.href, l.id);
                const ico = <EventoNavIcon id={l.id} />;
                return (
                  <li key={l.href}>
                    {l.locked ? (
                      <SoonNavItem
                        label={l.label}
                        soon={soon}
                        icon={ico}
                        className="justify-start rounded-xl px-3 py-2 text-sm font-medium text-crema/45"
                      />
                    ) : (
                      <SmartLink
                        href={l.href}
                        onClick={collapse}
                        className={cn(
                          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                          on
                            ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/35"
                            : "text-crema/80 hover:bg-cyan-400/10 hover:text-crema",
                        )}
                      >
                        {ico}
                        {l.label}
                      </SmartLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavDrop({
  labelKey,
  links,
  highStaff,
  eventoNavOpen,
}: {
  labelKey: string;
  links: NavLink[];
  highStaff: boolean;
  eventoNavOpen: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname() || "/";
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const soon = t("auth.comingSoon");
  const label = t(labelKey);
  const open = hover || pinned;
  const groupActive = links.some((l) => !linkLocked(l, highStaff, eventoNavOpen) && pathActive(pathname, l.href));

  const collapse = useCallback(() => {
    setHover(false);
    setPinned(false);
  }, []);

  useExclusiveNavDrop(uid, collapse);

  useEffect(() => {
    setChromeOpen(`navdrop-${uid}`, open);
    return () => setChromeOpen(`navdrop-${uid}`, false);
  }, [open, uid]);

  useEffect(() => {
    if (open) claimNavDrop(uid);
  }, [open, uid]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) collapse();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && collapse();
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, collapse]);

  // Click sticky: resta aperto finché non scrolli
  useCloseOnScroll(pinned, collapse);

  return (
    <div
      ref={box}
      className="relative"
      onMouseEnter={() => {
        if (!canHoverNav()) return;
        claimNavDrop(uid);
        setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => {
          setPinned((p) => {
            const next = !p;
            if (next) claimNavDrop(uid);
            return next;
          });
        }}
        aria-expanded={open}
        className={navUnderlineClass(groupActive)}
      >
        <NavIcon labelKey={labelKey} className="size-3.5 shrink-0 opacity-75" />
        {label}
        <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 top-full z-[70] mt-1 min-w-[14rem] -translate-x-1/2 origin-top overflow-hidden rounded-2xl bg-roast/95 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
          >
            <ul className="py-0.5">
              {links.map((l) => {
                const on = pathActive(pathname, l.href);
                const locked = linkLocked(l, highStaff, eventoNavOpen);
                const ico = <NavIcon labelKey={l.labelKey} className="size-3.5 shrink-0 opacity-70" />;
                return (
                  <li key={l.href}>
                    {locked ? (
                      <SoonNavItem
                        label={t(l.labelKey)}
                        soon={soon}
                        icon={ico}
                        className="justify-start rounded-xl px-3 py-2 text-sm font-medium text-crema/45"
                      />
                    ) : (
                      <SmartLink
                        href={l.href}
                        onClick={collapse}
                        className={cn(
                          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                          on ? "bg-caramel/12 text-ember" : "text-crema/80 hover:bg-crema/8 hover:text-crema",
                        )}
                      >
                        {ico}
                        {t(l.labelKey)}
                      </SmartLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function canOpenDashBacheca(staff: StaffAccess | null, stickyOk: boolean) {
  if (stickyOk) return true;
  return Boolean(staff?.isFounder || staff?.viewAsAllowed);
}

/** Account solo nel drawer mobile: login / profilo / staff / tema (le notifiche hanno la campanella nella navbar). */
function MobileDrawerAccount({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { ready, user, token, login, logout } = useAuth();
  const [staff, setStaff] = useState<StaffAccess | null>(null);
  const [stickyOk, setStickyOk] = useState(false);

  useEffect(() => {
    if (!token) {
      setStaff(null);
      return;
    }
    let alive = true;
    loadStaffAccess(token).then((r) => alive && setStaff(r.ok ? r.data : null));
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    setStickyOk(viewAsAllowedSticky());
  }, []);

  if (!ready && !user) {
    return <div className="h-14 animate-pulse rounded-2xl bg-crema/8" aria-hidden />;
  }

  if (!token) {
    return (
      <button
        type="button"
        onClick={() => {
          onClose();
          login();
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5865f2] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_28px_-12px_rgba(88,101,242,0.85)]"
      >
        <LogIn className="size-4" /> {t("auth.loginDiscord")}
      </button>
    );
  }

  const profileHref = page(`/user/${user ? `?id=${user.id}` : ""}`);
  const dashOpen = canOpenDashBacheca(staff, stickyOk);
  const soon = t("auth.comingSoon");
  const eventoOpen = isEventoHighStaff(staff) || isEventoPublicWindowOpen();
  const links = [
    { href: profileHref, label: t("auth.profile"), icon: <UserRound className="size-4" />, locked: false },
    {
      href: page("/evento/"),
      label: t("nav.evento"),
      icon: <Sparkles className="size-4" />,
      locked: !eventoOpen,
    },
    {
      href: page("/dashboard/"),
      label: t("auth.dashboard"),
      icon: <LayoutDashboard className="size-4" />,
      locked: !dashOpen,
    },
    {
      href: page("/vetrina/"),
      label: t("auth.bacheca"),
      icon: <MessageSquareText className="size-4" />,
      locked: !dashOpen,
    },
  ];
  const staffLinks =
    staff && user
      ? [
          { href: "/staff/guida/", label: "Guida", icon: <BookOpen className="size-4" />, show: true },
          {
            href: "/staff/gestione/",
            label: "Gestione",
            icon: <Users className="size-4" />,
            show: Boolean(staff.canManage || staff.canManagePm),
          },
          { href: "/staff/compiti/", label: "Compiti", icon: <ListChecks className="size-4" />, show: staff.canCompiti },
          { href: "/staff/pause/", label: "Pause", icon: <CalendarDays className="size-4" />, show: true },
        ].filter((x) => x.show)
      : [];

  return (
    <div className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/85 to-roast p-3 ring-1 ring-sand/15">
      {user ? (
        <div className="mb-3 flex items-center gap-3 px-1">
          <Avatar userId={user.id} src={avatarUrl(user, 96)} name={displayName(user)} className="size-11" />
          <div className="min-w-0">
            <p className="truncate font-medium text-crema">{displayName(user)}</p>
            <p className="truncate text-xs text-crema/50">@{user.username}</p>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5">
        {links.map((l) =>
          l.locked ? (
            <span
              key={l.href}
              title={soon}
              aria-disabled="true"
              className="relative inline-flex cursor-not-allowed items-center gap-2 overflow-hidden rounded-xl bg-crema/5 px-3 py-2.5 text-sm font-medium text-crema/45 ring-1 ring-sand/10"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 blur-[2.5px] select-none" aria-hidden>
                {l.icon}
                <span className="truncate">{l.label}</span>
              </span>
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-espresso/90 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-sand ring-1 ring-sand/30">
                  {soon}
                </span>
              </span>
            </span>
          ) : (
            <SmartLink
              key={l.href}
              href={l.href}
              onClick={() => window.setTimeout(onClose, 0)}
              className="inline-flex items-center gap-2 rounded-xl bg-crema/5 px-3 py-2.5 text-sm font-medium text-crema/85 ring-1 ring-sand/10 transition-colors hover:bg-crema/10"
            >
              {l.icon}
              <span className="truncate">{l.label}</span>
            </SmartLink>
          ),
        )}
      </div>
      {staffLinks.length ? (
        <>
          <p className="mb-1.5 mt-3 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-caramel">Area staff</p>
          <div className="grid grid-cols-2 gap-1.5">
            {staffLinks.map((l) => (
              <SmartLink
                key={l.href}
                href={l.href}
                onClick={() => window.setTimeout(onClose, 0)}
                className="inline-flex items-center gap-2 rounded-xl bg-crema/5 px-3 py-2.5 text-sm font-medium text-crema/85 ring-1 ring-sand/10 transition-colors hover:bg-crema/10"
              >
                {l.icon}
                <span className="truncate">{l.label}</span>
              </SmartLink>
            ))}
          </div>
        </>
      ) : null}
      <div className="mt-3 border-t border-sand/10 pt-3">
        <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-crema/40">{t("auth.theme")}</p>
        <ThemePrefRow />
      </div>
      <button
        type="button"
        onClick={() => {
          onClose();
          logout();
        }}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-crema/75 ring-1 ring-sand/15 transition-colors hover:bg-crema/8 hover:text-red-300"
      >
        <LogOut className="size-4" /> {t("auth.logout")}
      </button>
    </div>
  );
}

export function Navbar() {
  const { caps } = useDeviceFx();
  const softBlur = caps.blur;
  const { t } = useI18n();
  const { bar } = useViewAsChrome();
  const { token } = useAuth();
  const pathname = usePathname() || "/";
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [highStaff, setHighStaff] = useState(false);
  const [staffAccess, setStaffAccess] = useState<StaffAccess | null>(null);
  const eventoChrome = useEventoChrome();
  const { needsSort: eventoNeedsSort } = useEventoSortGate();
  const eventoNavOpen = isEventoPublicWindowOpen();
  /* Dentro lo shell evento: Hub top-level + dropdown Eventi; feature finite spariscono.
   * Non smistati: solo Hub (niente Fazione / Eventi). */
  const eventoPrimary: EventoNavItemView[] = eventoChrome
    ? eventoPrimaryNavForViewer(staffAccess).filter((l) => !eventoNeedsSort || l.id === "hub")
    : [];
  const eventoEventi: EventoNavItemView[] =
    eventoChrome && !eventoNeedsSort ? eventoEventiNavForViewer(staffAccess) : [];
  const soon = t("auth.comingSoon");
  const headerRef = useRef<HTMLElement>(null);
  const navHidden = useAutoHideNav(headerRef, open);

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  useEffect(() => {
    if (!token) {
      setHighStaff(false);
      setStaffAccess(null);
      return;
    }
    let alive = true;
    loadStaffAccess(token).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setStaffAccess(r.data);
        setHighStaff(isEventoHighStaff(r.data));
      } else {
        setStaffAccess(null);
        setHighStaff(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [token]);

  useBodyScrollLock(open);

  useEffect(() => {
    setChromeOpen("mobile-nav", open);
    return () => setChromeOpen("mobile-nav", false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <motion.header
        ref={headerRef}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: navHidden ? "-115%" : 0, opacity: 1 }}
        transition={{ duration: navHidden ? 0.45 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
          "fixed inset-x-0 z-50 transition-[background-color,box-shadow,border-color,backdrop-filter] duration-500",
          bar ? "top-[var(--vc-view-as-h,3.1rem)]" : "top-0",
            scrolled
            ? cn(
                "border-b border-sand/15 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.85)]",
                softBlur ? "bg-roast/80 backdrop-blur-xl vc-ui-blur" : "bg-roast/95",
                eventoChrome && "border-cyan-300/20 shadow-[0_12px_40px_-18px_rgba(5,7,15,0.9)]",
              )
            : cn(
                "border-b border-transparent bg-transparent",
                softBlur ? "light:bg-roast/80 light:backdrop-blur-xl light:vc-ui-blur" : "light:bg-roast/95",
                eventoChrome && softBlur && "bg-[#060f1c]/72 backdrop-blur-xl",
              ),
        )}
      >
        {/*
          Mobile: flex brand | azioni (se usi grid 3 col con ul hidden, il chrome finisce in colonna 2 e overlap).
          Desktop: brand sx · link centro · chrome dx.
        */}
        <nav className="flex w-full items-center gap-2 px-3 py-2.5 sm:px-5 sm:py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 lg:w-full lg:justify-self-start">
            <BrandMark navUnderline />
            <LangMenu />
          </div>

          <ul className="hidden items-center justify-self-center gap-0.5 lg:flex">
            {eventoChrome ? (
              <>
                <li>
                  <SmartLink href={page("/")} className={navUnderlineClass(pathActive(pathname, page("/")))}>
                    <EventoNavIcon id="sito" />
                    Sito
                  </SmartLink>
                </li>
                <li aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-crema/20" />
                {eventoPrimary.map((l) => (
                  <li key={l.href}>
                    {l.locked ? (
                      <SoonNavItem
                        label={l.label}
                        soon={soon}
                        icon={<EventoNavIcon id={l.id} />}
                        className={cn(navUnderlineClass(false), "text-crema/45")}
                      />
                    ) : (
                      <SmartLink href={l.href} className={navUnderlineClass(eventoLinkActive(pathname, l.href, l.id))}>
                        <EventoNavIcon id={l.id} />
                        {l.label}
                      </SmartLink>
                    )}
                  </li>
                ))}
                {eventoEventi.length ? (
                  <li>
                    <EventoEventiDrop items={eventoEventi} soon={soon} />
                  </li>
                ) : null}
              </>
            ) : (
              <>
                {NAV_DIRECT.map((l) => (
                  <li key={l.href}>
                    <SmartLink href={l.href} className={navUnderlineClass(pathActive(pathname, l.href))}>
                      <NavIcon labelKey={l.labelKey} className="size-3.5 shrink-0 opacity-75" />
                      {t(l.labelKey)}
                    </SmartLink>
                  </li>
                ))}
                <li aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-crema/20" />
                {NAV_GROUPS.map((g) => (
                  <li key={g.labelKey}>
                    <NavDrop labelKey={g.labelKey} links={g.links} highStaff={highStaff} eventoNavOpen={eventoNavOpen} />
                  </li>
                ))}
              </>
            )}
          </ul>

          <div className="flex shrink-0 items-center justify-self-end gap-1 sm:gap-1.5">
            {!eventoChrome ? <ContestNavPill /> : null}
            <ViewAsLaunch />
            <NavNotifBell />
            {/* Desktop: account in navbar. Mobile: solo nel menu hamburger. */}
            <UserMenu className="hidden lg:flex" />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-crema/8 text-crema ring-1 ring-crema/15 transition-[transform,background-color,box-shadow] duration-200 ease-out hover:bg-crema/15 active:scale-[0.96] lg:hidden"
              aria-expanded={open}
              aria-controls="vc-menu"
              aria-label={t("nav.openMenu")}
            >
              <Menu className="size-[1.15rem]" strokeWidth={2.25} />
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="vc-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.menuAria")}
            className={cn(
              "fixed inset-x-0 bottom-0 z-[60] overflow-y-auto bg-espresso/95 lg:hidden",
              softBlur && "backdrop-blur-2xl vc-ui-blur",
              bar ? "top-[var(--vc-view-as-h,3.1rem)]" : "top-0",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <span className="font-display text-2xl font-semibold">{t("nav.menuTitle")}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-11 items-center justify-center rounded-full bg-crema/8 ring-1 ring-crema/15 transition-[transform,background-color,box-shadow] duration-200 ease-out hover:bg-crema/15 active:scale-[0.96]"
                aria-label={t("nav.closeMenu")}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mx-auto max-w-6xl space-y-7 px-5 pb-10 pt-7 sm:px-6">
              {eventoChrome ? (
                <>
                  <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <h3 className="mb-2 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-cyan-300/75">
                      Navigazione
                    </h3>
                    <ul className="grid grid-cols-2 gap-2">
                      <li>
                        <SmartLink
                          href={page("/")}
                          onClick={() => {
                            window.setTimeout(() => setOpen(false), 0);
                          }}
                          className="flex min-h-[3.1rem] flex-col items-center justify-center gap-1 rounded-2xl bg-crema/[0.05] px-2.5 py-2.5 text-center text-sm font-semibold leading-snug text-crema/90 ring-1 ring-sand/12 transition-[transform,background-color] duration-200 ease-out hover:bg-crema/10 active:scale-[0.98]"
                        >
                          <EventoNavIcon id="sito" />
                          Sito
                        </SmartLink>
                      </li>
                      {eventoPrimary.map((l) => {
                        const on = eventoLinkActive(pathname, l.href, l.id);
                        const ico = <EventoNavIcon id={l.id} />;
                        return (
                          <li key={l.href}>
                            {l.locked ? (
                              <SoonNavItem
                                label={l.label}
                                soon={soon}
                                icon={ico}
                                className="min-h-[3.1rem] flex-col gap-1 rounded-2xl bg-crema/[0.05] px-2.5 py-2.5 text-center text-sm font-semibold leading-snug text-crema/45 ring-1 ring-sand/12"
                              />
                            ) : (
                              <SmartLink
                                href={l.href}
                                onClick={() => {
                                  window.setTimeout(() => setOpen(false), 0);
                                }}
                                className={cn(
                                  "flex min-h-[3.1rem] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2.5 text-center text-sm font-semibold leading-snug ring-1 transition-[transform,background-color,color] duration-200 ease-out active:scale-[0.98]",
                                  on
                                    ? "bg-cyan-400/15 text-cyan-100 ring-cyan-300/35"
                                    : "bg-crema/[0.05] text-crema/90 ring-sand/12 hover:bg-crema/10",
                                )}
                              >
                                {ico}
                                {l.label}
                              </SmartLink>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </motion.section>
                  {eventoEventi.length ? (
                    <motion.section
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <h3 className="mb-2 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-cyan-300/75">
                        <Sparkles className="size-3 opacity-90" aria-hidden />
                        Eventi
                      </h3>
                      <ul className="grid grid-cols-2 gap-2">
                        {eventoEventi.map((l) => {
                          const on = eventoLinkActive(pathname, l.href, l.id);
                          const ico = <EventoNavIcon id={l.id} />;
                          return (
                            <li key={l.href}>
                              {l.locked ? (
                                <SoonNavItem
                                  label={l.label}
                                  soon={soon}
                                  icon={ico}
                                  className="min-h-[3.1rem] flex-col gap-1 rounded-2xl bg-crema/[0.05] px-2.5 py-2.5 text-center text-sm font-semibold leading-snug text-crema/45 ring-1 ring-sand/12"
                                />
                              ) : (
                                <SmartLink
                                  href={l.href}
                                  onClick={() => {
                                    window.setTimeout(() => setOpen(false), 0);
                                  }}
                                  className={cn(
                                    "flex min-h-[3.1rem] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2.5 text-center text-sm font-semibold leading-snug ring-1 transition-[transform,background-color,color] duration-200 ease-out active:scale-[0.98]",
                                    on
                                      ? "bg-cyan-400/15 text-cyan-100 ring-cyan-300/35"
                                      : "bg-crema/[0.05] text-crema/90 ring-sand/12 hover:bg-crema/10",
                                  )}
                                >
                                  {ico}
                                  {l.label}
                                </SmartLink>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </motion.section>
                  ) : null}
                </>
              ) : (
                NAV_MOBILE_SECTIONS.map((g, gi) => (
                <motion.section
                  key={g.labelKey}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * gi, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h3 className="mb-2 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-caramel">
                    <NavIcon labelKey={g.labelKey} className="size-3 opacity-90" />
                    {t(g.labelKey)}
                  </h3>
                  <ul className="grid grid-cols-2 gap-2">
                    {g.links.map((l) => {
                      const on = pathActive(pathname, l.href);
                      const locked = linkLocked(l, highStaff, eventoNavOpen);
                      const ico = <NavIcon labelKey={l.labelKey} className="size-3.5 shrink-0 opacity-75" />;
                      return (
                      <li key={l.href}>
                          {locked ? (
                            <SoonNavItem
                              label={t(l.labelKey)}
                              soon={soon}
                              icon={ico}
                              className="min-h-[3.1rem] flex-col gap-1 rounded-2xl bg-crema/[0.05] px-2.5 py-2.5 text-center text-sm font-semibold leading-snug text-crema/45 ring-1 ring-sand/12"
                            />
                          ) : (
                        <SmartLink
                          href={l.href}
                          onClick={() => {
                            window.setTimeout(() => setOpen(false), 0);
                          }}
                              className={cn(
                                "flex min-h-[3.1rem] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2.5 text-center text-sm font-semibold leading-snug ring-1 transition-[transform,background-color,color] duration-200 ease-out active:scale-[0.98]",
                                on
                                  ? "bg-caramel/15 text-ember ring-caramel/35"
                                  : "bg-crema/[0.05] text-crema/90 ring-sand/12 hover:bg-crema/10",
                              )}
                            >
                              {ico}
                              {t(l.labelKey)}
                        </SmartLink>
                          )}
                      </li>
                      );
                    })}
                  </ul>
                </motion.section>
              ))
              )}

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22, duration: 0.4 }}
              >
                <h3
                  className={cn(
                    "mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em]",
                    eventoChrome ? "text-cyan-300/75" : "text-caramel",
                  )}
                >
                  {t("auth.account")}
                </h3>
                <MobileDrawerAccount onClose={() => setOpen(false)} />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
