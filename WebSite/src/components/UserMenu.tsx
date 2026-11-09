"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, CalendarDays, LayoutDashboard, ListChecks, LogIn, LogOut, MessageSquareText, Sparkles, UserRound, Users } from "lucide-react";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { setChromeOpen } from "@/lib/chrome-open";
import { useCloseOnScroll } from "@/lib/use-close-on-scroll";
import { readViewAs, viewAsAllowedSticky } from "@/lib/view-as";
import { isEventoHighStaff, isEventoPublicWindowOpen } from "@/lib/evento-starwars";
import { Avatar } from "@/components/Avatar";
import { HeaderNameMarquee } from "./effects/HeaderNameMarquee";
import { ThemePrefRow } from "./ThemeToggle";
import { SmartLink } from "./SmartLink";

/** Come sito vecchio: Dashboard/Bacheca sbloccate solo a founder (o view-as). */
function canOpenDashBacheca(staff: StaffAccess | null, stickyOk: boolean) {
  /* in anteprima "Visualizza come" si vede il sito come quel ruolo: niente link da Founder */
  if (readViewAs()) return false;
  if (stickyOk) return true;
  return Boolean(staff?.isFounder || staff?.viewAsAllowed);
}

function SoonRow({ icon, label, soon }: { icon: ReactNode; label: string; soon: string }) {
  return (
    <span
      role="menuitem"
      aria-disabled="true"
      title={soon}
      className="relative flex cursor-not-allowed items-center gap-2 overflow-hidden rounded-xl px-3 py-2 text-sm text-crema/45"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 blur-[2.5px] select-none" aria-hidden>
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-espresso/90 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-sand ring-1 ring-sand/30">
          {soon}
        </span>
      </span>
    </span>
  );
}

/** Navbar: Accedi da ospite; avatar + menu account (profilo / dashboard / bacheca / tema / esci). */
export function UserMenu({ className }: { className?: string }) {
  const { ready, user, token, login, logout, error } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [staff, setStaff] = useState<StaffAccess | null>(null);
  const [stickyOk, setStickyOk] = useState(false);

  // "Area staff" come nel menu del sito vecchio: solo per chi è staff (lo decide il bot)
  useEffect(() => {
    if (!token) return setStaff(null);
    let alive = true;
    loadStaffAccess(token).then((r) => alive && setStaff(r.ok ? r.data : null));
    return () => {
      alive = false;
    };
  }, [token]);

  // sessionStorage solo dopo mount (evita hydration mismatch #418)
  useEffect(() => {
    setStickyOk(viewAsAllowedSticky());
  }, []);

  useEffect(() => {
    setChromeOpen(`account-${uid}`, open);
    return () => setChromeOpen(`account-${uid}`, false);
  }, [open, uid]);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && closeMenu();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeMenu]);

  // Solo click (niente hover): chiude automaticamente allo scroll
  useCloseOnScroll(open, closeMenu);

  if (!ready && !user) {
    return <span className={cn("size-10 animate-pulse rounded-full bg-crema/10", className)} aria-hidden />;
  }

  if (!token) {
    return (
      <div className={cn("relative flex items-center gap-2", className)}>
        <button
          type="button"
          onClick={login}
          aria-label={t("auth.loginDiscord")}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#5865f2] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(88,101,242,0.9)] transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
        >
          <LogIn className="size-[1.15rem]" strokeWidth={2.25} /> <span className="hidden sm:inline">{t("auth.login")}</span>
        </button>
        {error && (
          <p className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-roast px-3 py-2 text-xs text-crema/80 ring-1 ring-red-400/40">
            {error}
          </p>
        )}
      </div>
    );
  }

  const profileHref = page(`/user/${user ? `?id=${user.id}` : ""}`);
  const dashOpen = canOpenDashBacheca(staff, stickyOk);
  const soon = t("auth.comingSoon");
  const eventoOpen = isEventoHighStaff(staff) || isEventoPublicWindowOpen();

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("auth.accountMenu")}
        className="flex h-10 items-center gap-2 rounded-full bg-crema/8 p-1 pr-3 ring-1 ring-crema/15 transition-[transform,background-color] duration-200 ease-out hover:bg-crema/15 active:scale-[0.97]"
      >
        {user ? (
          <Avatar userId={user.id} src={avatarUrl(user)} name={displayName(user)} className="size-8" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-crema/10">
            <UserRound className="size-[1.15rem]" strokeWidth={2.25} />
          </span>
        )}
        <span className="hidden max-w-32 text-sm font-medium leading-none sm:block">
          {user ? <HeaderNameMarquee text={displayName(user)} /> : t("auth.account")}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full z-[70] mt-2 max-h-[calc(100dvh-6rem)] w-64 origin-top-right overflow-y-auto rounded-2xl bg-roast/95 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
          >
            {user && (
              <div className="flex items-center gap-3 px-3 py-2.5">
                <Avatar userId={user.id} src={avatarUrl(user, 96)} name={displayName(user)} className="size-10" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{displayName(user)}</p>
                  <p className="truncate text-xs text-crema/50">@{user.username}</p>
                </div>
              </div>
            )}

            <SmartLink
              href={profileHref}
              onClick={() => window.setTimeout(() => setOpen(false), 0)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-crema/80 transition-[transform,background-color,color] duration-150 ease-out hover:bg-crema/8 hover:text-crema active:scale-[0.98]"
            >
              <UserRound className="size-4" /> {t("auth.profile")}
            </SmartLink>
            {eventoOpen ? (
              <SmartLink
                href={page("/evento/")}
                onClick={() => window.setTimeout(() => setOpen(false), 0)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-crema/80 transition-[transform,background-color,color] duration-150 ease-out hover:bg-crema/8 hover:text-crema active:scale-[0.98]"
              >
                <Sparkles className="size-4" /> {t("nav.evento")}
              </SmartLink>
            ) : (
              <SoonRow icon={<Sparkles className="size-4" />} label={t("nav.evento")} soon={soon} />
            )}
            {dashOpen ? (
              <>
                <SmartLink
                  href={page("/dashboard/")}
                  onClick={() => window.setTimeout(() => setOpen(false), 0)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-crema/80 transition-[transform,background-color,color] duration-150 ease-out hover:bg-crema/8 hover:text-crema active:scale-[0.98]"
                >
                  <LayoutDashboard className="size-4" /> {t("auth.dashboard")}
                </SmartLink>
                <SmartLink
                  href={page("/vetrina/")}
                  onClick={() => window.setTimeout(() => setOpen(false), 0)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-crema/80 transition-[transform,background-color,color] duration-150 ease-out hover:bg-crema/8 hover:text-crema active:scale-[0.98]"
                >
                  <MessageSquareText className="size-4" /> {t("auth.bacheca")}
                </SmartLink>
              </>
            ) : (
              <>
                <SoonRow icon={<LayoutDashboard className="size-4" />} label={t("auth.dashboard")} soon={soon} />
                <SoonRow icon={<MessageSquareText className="size-4" />} label={t("auth.bacheca")} soon={soon} />
              </>
            )}
            {staff && user && (
              <>
                <div className="my-1 border-t border-sand/10" />
                <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-caramel">Area staff</p>
                {[
                  { href: "/staff/guida/", label: "Guida", icon: <BookOpen className="size-4" />, show: true },
                  {
                    href: "/staff/gestione/",
                    label: "Gestione",
                    icon: <Users className="size-4" />,
                    show: Boolean(staff.canManage || staff.canManagePm),
                  },
                  { href: "/staff/compiti/", label: "Compiti", icon: <ListChecks className="size-4" />, show: staff.canCompiti },
                  { href: "/staff/pause/", label: "Pause", icon: <CalendarDays className="size-4" />, show: true },
                ]
                  .filter((x) => x.show)
                  .map((x) => (
                    <SmartLink
                      key={x.href}
                      href={x.href}
                      onClick={() => window.setTimeout(() => setOpen(false), 0)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-crema/80 transition-[transform,background-color,color] duration-150 ease-out hover:bg-crema/8 hover:text-crema active:scale-[0.98]"
                    >
                      {x.icon} {x.label}
                    </SmartLink>
                  ))}
              </>
            )}

            <div className="my-1 border-t border-sand/10" />
            <div className="px-2 py-1.5">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-crema/40">
                {t("auth.theme")}
              </p>
              <ThemePrefRow />
            </div>
            <div className="my-1 border-t border-sand/10" />

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-crema/80 transition-[transform,background-color,color] duration-150 ease-out hover:bg-crema/8 hover:text-red-300 active:scale-[0.98]"
            >
              <LogOut className="size-4" /> {t("auth.logout")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
