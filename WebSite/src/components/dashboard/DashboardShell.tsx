"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Coins,
  CreditCard,
  Diamond,
  HelpCircle,
  House,
  LayoutGrid,
  LogIn,
  Menu,
  MessageSquarePlus,
  NotebookPen,
  Pin,
  PinOff,
  Sparkles,
  Trophy,
  UserRound,
  Wrench,
  X,
  Lock,
} from "lucide-react";
import { SiteShell } from "@/components/SiteShell";
import { Footer } from "@/components/Footer";
import { SmartLink } from "@/components/SmartLink";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { confirmLeaveUnsaved } from "@/lib/unsaved-changes";
import { readGuildsCache, readLastGuildId, selectGuild, type DashboardGuild } from "@/lib/dashboard";
import { ensureIsDev, getIsDev, subscribeDev } from "@/lib/dashboard-dev";
import { ensureCreditsBalance, getCreditsBalance, subscribeCredits } from "@/lib/dashboard-premium";
import { cdnUrl, page } from "@/lib/site";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { NotificationsBell } from "./NotificationsBell";
import { LangMenu } from "@/components/LangMenu";
import { ThemePrefRow } from "@/components/ThemeToggle";
import {
  GUILD_MODULE_SECTIONS,
  GUILD_SERVER_SECTIONS,
  defaultModuleTab,
  sectionTabs,
  type GuildSectionId,
} from "./guildSections";

export {
  GUILD_MODULE_SECTIONS,
  GUILD_SECTIONS,
  GUILD_SERVER_SECTIONS,
  isGuildSection,
  type GuildSectionId,
} from "./guildSections";

function guildSectionHref(guildId: string, sectionId: GuildSectionId, tab?: string | null) {
  const qs = new URLSearchParams({ id: guildId, s: sectionId });
  const t = tab || defaultModuleTab(sectionId);
  if (t) qs.set("t", t);
  return `/dashboard/guild/?${qs.toString()}`;
}

const BOT_NAV = [
  { href: "/dashboard/faq/", label: "FAQ", icon: HelpCircle },
  { href: "/dashboard/feedback/", label: "Feedback", icon: MessageSquarePlus },
  { href: "/dashboard/recensioni/", label: "Recensioni", icon: NotebookPen },
] as const;

const ACCOUNT_NAV = [
  { href: "/dashboard/profilo/", label: "Profilo", icon: UserRound },
  { href: "/dashboard/premium/", label: "Premium", icon: CreditCard },
] as const;

const PERKS_HREF = "/dashboard/premium/vantaggi/";

const LOGO = cdnUrl("/images/logo-disco.png");
/* avatar del bot com'è adesso su Discord (il bot fa redirect al CDN Discord) */
const BOT_AVATAR = "/webhooks/site-bot-avatar?size=128";

function BotLogo() {
  const [src, setSrc] = useState(BOT_AVATAR);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={34}
      height={34}
      onError={() => setSrc(LOGO)}
      className="size-[2.1rem] rounded-full object-cover ring-1 ring-caramel/30"
    />
  );
}

type ShellGuild = { id: string; name: string; iconUrl: string | null };

export type GuildNav = {
  active: GuildSectionId;
  onSelect: (id: GuildSectionId) => void;
  /** Tab attiva della sezione corrente (comandi/classifica/ticket/…). */
  moduleTab?: string | null;
  onModuleTab?: (section: GuildSectionId, tab: string) => void;
  /** Sotto-voci dinamiche (es. categorie comandi dal catalogo). */
  tabsBySection?: Partial<Record<GuildSectionId, readonly { id: string; label: string }[]>>;
  /** numeretto accanto alla voce (es. ticket in attesa) */
  badges?: Partial<Record<GuildSectionId, number>>;
  /** moduli spenti su questo server: vanno nel gruppo "Disattivati" sotto Moduli */
  off?: readonly GuildSectionId[];
  /** moduli che qui non si gestiscono dalla dashboard: in "Disattivati", non cliccabili (valore = perché) */
  locked?: Partial<Record<GuildSectionId, string>>;
};

function samePath(pathname: string, href: string, exact = false) {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return exact ? p === href : p === href || p.startsWith(href);
}

function GuildIcon({ guild, className }: { guild: Pick<ShellGuild, "name" | "iconUrl">; className?: string }) {
  const initial = (guild.name.trim().charAt(0) || "?").toUpperCase();
  return guild.iconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={guild.iconUrl} alt="" width={36} height={36} className={cn("size-9 shrink-0 rounded-xl object-cover", className)} />
  ) : (
    <span
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-mocha font-display text-sm font-semibold text-crema/75", className)}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function NavItem({
  href,
  onClick,
  active,
  icon: Icon,
  label,
  badge,
  animated = true,
  off = false,
  lockedReason,
}: {
  /** modulo che qui non si apre: voce non cliccabile con l'etichetta "bloccato" */
  lockedReason?: string;
  /** modulo spento: voce attenuata con l'etichetta "disattivo" */
  off?: boolean;
  /** pill animata solo nella sidebar fissa (quella del telefono è un'altra istanza) */
  animated?: boolean;
  href?: string;
  onClick?: () => void;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
}) {
  const cls = cn(
    "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
    active ? "bg-caramel/12 text-crema" : "text-crema/55 hover:bg-crema/[0.04] hover:text-crema",
  );
  const inner = (
    <>
      {active && animated ? (
        <motion.span
          layoutId="dash-nav-pill"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-ember to-caramel"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          aria-hidden
        />
      ) : active ? (
        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-ember to-caramel" aria-hidden />
      ) : null}
      <Icon className={cn("size-[1.05rem] shrink-0", active ? "text-ember" : off ? "text-crema/35 group-hover:text-crema/60" : "text-crema/60 group-hover:text-crema/70")} />
      <span className={cn("min-w-0 flex-1 truncate text-left", off && !active && "text-crema/45")}>{label}</span>
      {lockedReason ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-crema/[0.06] px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wider text-crema/45">
          <Lock className="size-2.5" aria-hidden /> bloccato
        </span>
      ) : off ? (
        <span className="rounded-full bg-crema/[0.06] px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wider text-crema/45">disattivo</span>
      ) : null}
      {badge ? (
        <span className="rounded-md bg-caramel px-1.5 py-px text-[0.65rem] font-bold tabular-nums text-ink">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </>
  );
  if (lockedReason) {
    return (
      <span role="link" aria-disabled="true" title={lockedReason} className={cn(cls, "cursor-not-allowed hover:bg-transparent hover:text-crema/55")}>
        {inner}
      </span>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={cls}>
        {inner}
      </button>
    );
  }
  return (
    <SmartLink href={page(href || "/dashboard/")} aria-current={active ? "page" : undefined} className={cls}>
      {inner}
    </SmartLink>
  );
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-crema/50">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** Modulo con sotto-voci (sostituisce le tab orizzontali Ticket/Partnership). */
function ModuleNavItem({
  item,
  active,
  moduleTab,
  badge,
  animated,
  tabsOverride,
  guildId,
  onSelect,
  onModuleTab,
  onNavigate,
  off = false,
  lockedReason,
}: {
  off?: boolean;
  lockedReason?: string;
  item: { id: GuildSectionId; label: string; icon: React.ComponentType<{ className?: string }>; tabs?: readonly { id: string; label: string }[] };
  active: boolean;
  moduleTab?: string | null;
  badge?: number;
  animated: boolean;
  tabsOverride?: readonly { id: string; label: string }[];
  /** Senza callback in-page: naviga a /dashboard/guild/?id=&s=&t= */
  guildId?: string;
  onSelect?: (id: GuildSectionId) => void;
  onModuleTab?: (section: GuildSectionId, tab: string) => void;
  onNavigate?: () => void;
}) {
  const tabs =
    (tabsOverride && tabsOverride.length > 0 ? tabsOverride : null) ||
    (item.tabs && item.tabs.length > 0 ? item.tabs : null) ||
    sectionTabs(item.id);
  const hasTabs = tabs.length > 0;
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const Icon = item.icon;
  const go = (tabId?: string) => {
    if (onSelect) {
      if (tabId && onModuleTab) onModuleTab(item.id, tabId);
      else onSelect(item.id);
      onNavigate?.();
      return;
    }
    if (guildId) {
      window.location.assign(page(guildSectionHref(guildId, item.id, tabId || null)));
    }
  };

  if (!hasTabs) {
    return (
      <NavItem
        animated={animated}
        label={item.label}
        icon={Icon}
        active={active}
        badge={badge}
        off={off}
        lockedReason={lockedReason}
        onClick={onSelect ? () => go() : undefined}
        href={!onSelect && guildId ? guildSectionHref(guildId, item.id) : undefined}
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          active ? "bg-caramel/12 text-crema" : "text-crema/55 hover:bg-crema/[0.04] hover:text-crema",
        )}
      >
        {active && animated ? (
          <motion.span
            layoutId="dash-nav-pill"
            className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-ember to-caramel"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            aria-hidden
          />
        ) : active ? (
          <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-ember to-caramel" aria-hidden />
        ) : null}
        <Icon className={cn("size-[1.05rem] shrink-0", active ? "text-ember" : "text-crema/60 group-hover:text-crema/70")} />
        <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
        {badge ? (
          <span className="rounded-md bg-caramel px-1.5 py-px text-[0.65rem] font-bold tabular-nums text-ink">{badge > 99 ? "99+" : badge}</span>
        ) : null}
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-crema/40 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="tabs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-sand/12 py-0.5 pl-2">
              {tabs.map((tab) => {
                const on = active && moduleTab === tab.id;
                if (!onSelect && guildId) {
                  return (
                    <SmartLink
                      key={tab.id}
                      href={page(guildSectionHref(guildId, item.id, tab.id))}
                      aria-current={on ? "page" : undefined}
                      onClick={() => onNavigate?.()}
                      className={cn(
                        "flex w-full rounded-md px-2.5 py-1.5 text-left text-[0.8rem] font-medium transition-colors",
                        on ? "bg-caramel/10 text-crema" : "text-crema/50 hover:bg-crema/[0.04] hover:text-crema/80",
                      )}
                    >
                      {tab.label}
                    </SmartLink>
                  );
                }
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => go(tab.id)}
                    className={cn(
                      "flex w-full rounded-md px-2.5 py-1.5 text-left text-[0.8rem] font-medium transition-colors",
                      on ? "bg-caramel/10 text-crema" : "text-crema/50 hover:bg-crema/[0.04] hover:text-crema/80",
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Selettore server in cima alla sidebar (come le dashboard dei bot). */
function ServerSwitcher({ current }: { current: ShellGuild | null }) {
  const [open, setOpen] = useState(false);
  const [guilds, setGuilds] = useState<DashboardGuild[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGuilds(readGuildsCache() || []);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* fuori dal pannello di un server: nessun server selezionato */
  const shown: ShellGuild | null = current;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-xl bg-espresso/60 p-2 text-left ring-1 ring-sand/12 transition hover:ring-sand/25"
      >
        {shown ? (
          <GuildIcon guild={shown} />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mocha text-crema/50">
            <LayoutGrid className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-crema/50">Server</span>
          <span className="block truncate text-sm font-semibold text-crema">{shown ? shown.name : "Scegli un server"}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-crema/50" aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl bg-mocha shadow-[0_24px_50px_-20px_rgba(0,0,0,0.8)] ring-1 ring-sand/20"
            role="listbox"
          >
            <div className="max-h-72 overflow-y-auto p-1">
              {guilds.length === 0 ? (
                <p className="px-2.5 py-3 text-xs text-crema/60">L&apos;elenco compare dopo aver aperto &quot;I miei server&quot;.</p>
              ) : (
                guilds.map((g) => {
                  const on = shown?.id === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={async () => {
                        setOpen(false);
                        if (on && current) return;
                        if (!(await confirmLeaveUnsaved())) return;
                        /* pagina intera: il pannello ricarica tutti i dati del nuovo server.
                           Stessa sezione e scheda di adesso, se il bot è anche lì (altrimenti la pagina del server) */
                        const href = selectGuild(g.id);
                        const cur = new URLSearchParams(window.location.search);
                        const s = cur.get("s");
                        const t = cur.get("t");
                        if (current && g.botPresent && s) {
                          const u = new URL(href, window.location.href);
                          u.searchParams.set("s", s);
                          if (t) u.searchParams.set("t", t);
                          window.location.assign(u.pathname + u.search);
                          return;
                        }
                        window.location.assign(href);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                        on ? "bg-caramel/15 text-crema" : "text-crema/70 hover:bg-crema/[0.05] hover:text-crema",
                      )}
                    >
                      <GuildIcon guild={g} className="size-7 rounded-lg" />
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      {g.premiumActive ? <Diamond className="size-3.5 shrink-0 text-ember" aria-label="Premium" /> : null}
                      {!g.botPresent ? <span className="shrink-0 text-[0.6rem] font-semibold uppercase text-crema/50">invita</span> : null}
                    </button>
                  );
                })
              )}
            </div>
            <SmartLink
              href={page("/dashboard/")}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-sand/12 px-3 py-2.5 text-xs font-semibold text-crema/60 transition hover:bg-crema/[0.04] hover:text-crema"
            >
              <LayoutGrid className="size-3.5" aria-hidden /> Tutti i server
            </SmartLink>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Saldo crediti sempre in vista nella barra in alto (si aggiorna quando spendi). */
function CreditsChip() {
  const { token } = useAuth();
  const credits = useSyncExternalStore(subscribeCredits, getCreditsBalance, () => null);
  useEffect(() => {
    if (token) void ensureCreditsBalance(token);
  }, [token]);
  if (!token || credits == null) return null;
  return (
    <SmartLink
      href={page("/dashboard/premium/crediti/")}
      title="I tuoi crediti Premium"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-caramel/12 py-1 pl-2 pr-3 text-sm font-semibold text-crema ring-1 ring-caramel/30 transition hover:bg-caramel/20 hover:ring-caramel/50"
    >
      <Coins className="size-4 text-ember" aria-hidden />
      <span className="tabular-nums">{credits.toLocaleString("it-IT")}</span>
      <span className="hidden text-crema/60 2xl:inline">crediti</span>
    </SmartLink>
  );
}

/** FAQ, Feedback e Recensioni nella barra in alto (da tablet in su; su telefono stanno nel menu account). */
function topLinks(guild: ShellGuild | null, guildNav: GuildNav | undefined, pathname: string) {
  const rankHref = (id: string) => `/dashboard/guild/?id=${encodeURIComponent(id)}&s=classifica&t=servers`;
  return [
    {
      href: guild?.id ? rankHref(guild.id) : "/dashboard/",
      label: "Classifica",
      icon: Trophy,
      active: guildNav?.active === "classifica",
      /* nel pannello del server cambia sezione senza ricaricare; altrove apre l'ultimo server usato */
      onClick: guildNav
        ? () => guildNav.onSelect("classifica")
        : guild?.id
          ? undefined
          : () => {
              const last = readLastGuildId();
              window.location.href = page(last ? rankHref(last) : "/dashboard/");
            },
    },
    { href: PERKS_HREF, label: "Vantaggi", icon: Sparkles, active: samePath(pathname, PERKS_HREF), onClick: undefined },
    ...BOT_NAV.map((n) => ({ href: n.href as string, label: n.label as string, icon: n.icon, active: samePath(pathname, n.href), onClick: undefined })),
  ];
}

function TopNavLinks({ guild, guildNav }: { guild: ShellGuild | null; guildNav?: GuildNav }) {
  const pathname = usePathname() || "";
  return (
    <nav aria-label="Dashboard" className="hidden shrink-0 items-center gap-0.5 lg:flex">
      {topLinks(guild, guildNav, pathname).map((n) => {
        const active = n.active;
        const Icon = n.icon;
        return (
          <SmartLink
            key={n.label}
            href={page(n.href)}
            onClick={
              n.onClick
                ? (e: React.MouseEvent) => {
                    e.preventDefault();
                    n.onClick?.();
                  }
                : undefined
            }
            aria-current={active ? "page" : undefined}
            aria-label={n.label}
            title={n.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold transition 2xl:px-2.5",
              active ? "bg-caramel/15 text-ember" : "text-crema/65 hover:bg-crema/[0.05] hover:text-crema",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {/* testo solo sugli schermi larghi, sotto resta l'icona (nome nel suggerimento) */}
            <span className="hidden 2xl:inline">{n.label}</span>
          </SmartLink>
        );
      })}
    </nav>
  );
}

/** Menu account in alto a destra: nome utente, voci dell'account e ritorno al sito. */
function AccountMenu({ guild, guildNav, inline = false }: { guild: ShellGuild | null; guildNav?: GuildNav; inline?: boolean }) {
  const { user, ready, login, token } = useAuth();
  const pathname = usePathname() || "";
  const isDev = useSyncExternalStore(subscribeDev, getIsDev, () => null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token) void ensureIsDev(token);
  }, [token]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* chiudi quando cambi pagina */
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (open) setOpen(false);
  }

  if (!ready) return <div className={cn("shrink-0 animate-pulse bg-crema/[0.06]", inline ? "h-12 w-full rounded-xl" : "h-9 w-9 rounded-full sm:w-36 sm:rounded-xl")} />;
  if (!user) {
    return (
      <button
        type="button"
        onClick={login}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#5865f2] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110",
          inline && "w-full justify-center py-2.5",
        )}
      >
        <LogIn className="size-4" aria-hidden /> <span className={inline ? undefined : "hidden sm:inline"}>Accedi</span>
      </button>
    );
  }

  const items = [ACCOUNT_NAV[0], ...(isDev ? [{ href: "/dashboard/sviluppatore/", label: "Sviluppatore", icon: Wrench }] : []), ACCOUNT_NAV[1]];
  const itemClass = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
      active ? "bg-caramel/15 text-ember" : "text-crema/80 hover:bg-crema/[0.06] hover:text-crema",
    );
  const isActive = (href: string) => samePath(pathname, href) && !samePath(pathname, PERKS_HREF) && !items.some((o) => o.href.length > href.length && samePath(pathname, o.href));

  return (
    <div ref={root} className={cn("relative", inline ? "w-full" : "shrink-0")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu account"
        className={cn(
          "flex items-center gap-2 rounded-xl ring-1 transition",
          inline ? "w-full px-2 py-2" : "p-1 sm:py-1 sm:pl-1 sm:pr-2",
          open ? "bg-crema/[0.07] ring-sand/25" : "ring-sand/10 hover:bg-crema/[0.05] hover:ring-sand/20",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl(user, 64)} alt="" width={28} height={28} className={cn("shrink-0 rounded-full", inline ? "size-8" : "size-7")} />
        <span className={cn("min-w-0 text-left leading-tight", inline ? "block flex-1" : "hidden sm:block")}>
          <span className={cn("block truncate text-[0.8rem] font-semibold text-crema", !inline && "max-w-[9rem]")}>{displayName(user)}</span>
          <span className={cn("block truncate text-[0.68rem] text-crema/55", !inline && "max-w-[9rem]")}>@{user.username}</span>
        </span>
        <ChevronDown className={cn("size-3.5 text-crema/50 transition", inline ? "rotate-180" : "hidden sm:block", open && (inline ? "rotate-0" : "rotate-180"))} aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={inline ? { opacity: 0, y: 6 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={inline ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={inline ? { opacity: 0, y: 4 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "z-50 overflow-hidden rounded-2xl bg-roast p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] ring-1 ring-sand/20",
              /* nel menu laterale si apre sopra il pulsante, che sta in fondo */
              inline ? "absolute inset-x-0 bottom-full mb-2 max-h-[70vh] origin-bottom overflow-y-auto" : "absolute right-0 top-full mt-2 w-64 origin-top-right",
            )}
          >
            <div className={cn("flex items-center gap-2.5 px-2.5 pb-2.5 pt-1.5", inline && "hidden")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl(user, 64)} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-crema">{displayName(user)}</span>
                <span className="block truncate text-xs text-crema/55">@{user.username}</span>
              </span>
            </div>
            <div className={cn("pt-1.5", !inline && "border-t border-sand/10")}>
              <p className="px-2.5 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-crema/45">Account</p>
              {items.map((n) => {
                const Icon = n.icon;
                return (
                  <SmartLink key={n.href} href={page(n.href)} role="menuitem" className={itemClass(isActive(n.href))}>
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {n.label}
                  </SmartLink>
                );
              })}
            </div>
            <div className="mt-1.5 border-t border-sand/10 pt-1.5 lg:hidden">
              <p className="px-2.5 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-crema/45">Dashboard</p>
              {topLinks(guild, guildNav, pathname).map((n) => {
                const Icon = n.icon;
                return (
                  <SmartLink
                    key={n.label}
                    href={page(n.href)}
                    role="menuitem"
                    onClick={
                      n.onClick
                        ? (e: React.MouseEvent) => {
                            e.preventDefault();
                            setOpen(false);
                            n.onClick?.();
                          }
                        : undefined
                    }
                    className={itemClass(n.active)}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
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
                <House className="size-4 shrink-0" aria-hidden />
                Torna al sito
              </SmartLink>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Sidebar({
  guild,
  guildNav,
  onNavigate,
  pinned,
  onTogglePin,
}: {
  guild: ShellGuild | null;
  guildNav?: GuildNav;
  onNavigate?: () => void;
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  const pathname = usePathname() || "/";
  /* sezioni del server solo con un server aperto (in "I miei server" non si è ancora scelto) */
  const guildId = guild?.id || "";

  return (
    <div className="relative flex h-full flex-col gap-5 overflow-y-auto px-3 pb-3 pt-4" onClickCapture={(e) => {
      /* telefono: chiudi il menu quando si sceglie una voce */
      if ((e.target as HTMLElement).closest("a")) onNavigate?.();
    }}>
      <SmartLink href={page("/dashboard/")} className="flex items-center gap-2.5 px-1.5">
        <BotLogo />
        <span className="min-w-0">
          <span className="block font-display text-lg font-semibold leading-none text-crema">Vinili</span>
          <span className="mt-1 block text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-caramel">Dashboard bot</span>
        </span>
      </SmartLink>
      {onTogglePin ? (
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={pinned}
          title={pinned ? "Lascia che si nasconda da sola" : "Tienila sempre aperta"}
          className={cn(
            "absolute right-3 top-5 inline-flex size-8 items-center justify-center rounded-lg ring-1 transition",
            pinned ? "bg-caramel/15 text-ember ring-caramel/30" : "text-crema/50 ring-sand/15 hover:text-crema",
          )}
        >
          {pinned ? <Pin className="size-4" aria-hidden /> : <PinOff className="size-4" aria-hidden />}
        </button>
      ) : null}

      <ServerSwitcher current={guild} />

      <nav aria-label="Dashboard" className="flex-1 space-y-5">
        <NavGroup title="Generale">
          <NavItem animated={!onNavigate} href="/dashboard/" label="I miei server" icon={LayoutGrid} active={samePath(pathname, "/dashboard/", true)} />
        </NavGroup>

        {guildId ? (
          <>
            <NavGroup title="Server">
              {GUILD_SERVER_SECTIONS.map((s) => {
                const override = guildNav?.tabsBySection?.[s.id];
                const hasTabs = sectionTabs(s.id).length > 0 || Boolean(override?.length);
                if (hasTabs) {
                  return (
                    <ModuleNavItem
                      key={s.id}
                      item={s}
                      active={guildNav?.active === s.id}
                      moduleTab={guildNav?.moduleTab}
                      badge={guildNav?.badges?.[s.id]}
                      animated={!onNavigate}
                      tabsOverride={override}
                      guildId={guildId}
                      onSelect={guildNav?.onSelect}
                      onModuleTab={guildNav?.onModuleTab}
                      onNavigate={onNavigate}
                    />
                  );
                }
                return guildNav ? (
                  <NavItem
                    animated={!onNavigate}
                    key={s.id}
                    label={s.label}
                    icon={s.icon}
                    active={guildNav.active === s.id}
                    badge={guildNav.badges?.[s.id]}
                    onClick={() => {
                      guildNav.onSelect(s.id);
                      onNavigate?.();
                    }}
                  />
                ) : (
                  <NavItem
                    animated={!onNavigate}
                    key={s.id}
                    href={guildSectionHref(guildId, s.id)}
                    label={s.label}
                    icon={s.icon}
                    active={false}
                  />
                );
              })}
            </NavGroup>

            {(() => {
              /* moduli spenti in un gruppo a parte, sotto */
              const lockedMap = guildNav?.locked || {};
              const offSet = new Set<string>([...(guildNav?.off || []), ...Object.keys(lockedMap)]);
              const item = (s: (typeof GUILD_MODULE_SECTIONS)[number], off: boolean) => (
                <ModuleNavItem
                  key={s.id}
                  item={s}
                  off={off}
                  lockedReason={lockedMap[s.id]}
                  active={guildNav?.active === s.id}
                  moduleTab={guildNav?.moduleTab}
                  badge={guildNav?.badges?.[s.id]}
                  animated={!onNavigate}
                  tabsOverride={guildNav?.tabsBySection?.[s.id]}
                  guildId={guildId}
                  onSelect={guildNav?.onSelect}
                  onModuleTab={guildNav?.onModuleTab}
                  onNavigate={onNavigate}
                />
              );
              const onList = GUILD_MODULE_SECTIONS.filter((s) => !offSet.has(s.id));
              const offList = GUILD_MODULE_SECTIONS.filter((s) => offSet.has(s.id));
              return (
                <>
                  <NavGroup title="Moduli">{onList.map((s) => item(s, false))}</NavGroup>
                  {offList.length ? <NavGroup title="Disattivati">{offList.map((s) => item(s, true))}</NavGroup> : null}
                </>
              );
            })()}
          </>
        ) : null}

      </nav>
    </div>
  );
}

/**
 * Guscio della dashboard del bot: sidebar fissa (server, sezioni, bot, account) e barra in alto,
 * senza navbar e footer del sito. Su telefono la sidebar si apre dal pulsante menu.
 */
export function DashboardShell({
  title,
  lead,
  children,
  bare,
  guild = null,
  guildNav,
  crumb,
  actions,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
  /** Senza intestazione (es. transcript a tutta pagina). */
  bare?: boolean;
  /** Server aperto (pannello): selettore e briciole lo mostrano. */
  guild?: ShellGuild | null;
  /** Sezioni del pannello server gestite dalla pagina (al posto dei link). */
  guildNav?: GuildNav;
  /** Ultima voce delle briciole (default: titolo). */
  crumb?: string;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "/";
  useBodyScrollLock(open);

  useEffect(() => setOpen(false), [pathname]);

  /* Desktop: la sidebar si nasconde da sola se non la usi e ricompare portando il mouse sul bordo sinistro
     (come la navbar delle altre pagine). Con la puntina resta sempre aperta. */
  const [sideHidden, setSideHidden] = useState(false);
  const [sidePeek, setSidePeek] = useState(false);
  const [sidePinned, setSidePinned] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const overSide = useRef(false);
  const clearHide = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const scheduleHide = (ms: number) => {
    clearHide();
    hideTimer.current = window.setTimeout(() => {
      if (overSide.current) return;
      setSidePeek(false);
      setSideHidden(true);
      try {
        sessionStorage.setItem("vc-dash-side", "hidden");
      } catch {
        /* ignore */
      }
    }, ms);
  };
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      let pin = false;
      let wasHidden = false;
      try {
        pin = localStorage.getItem("vc-dash-side-pin") === "1";
        wasHidden = sessionStorage.getItem("vc-dash-side") === "hidden";
      } catch {
        /* ignore */
      }
      setSidePinned(pin);
      if (pin) return;
      /* già nascosta in questa visita: le pagine dopo partono nascoste, niente salto del contenuto */
      if (wasHidden) setSideHidden(true);
      else scheduleHide(4000);
    });
    return () => {
      window.cancelAnimationFrame(raf);
      clearHide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleSidePin = () => {
    const next = !sidePinned;
    setSidePinned(next);
    try {
      localStorage.setItem("vc-dash-side-pin", next ? "1" : "0");
      if (next) sessionStorage.removeItem("vc-dash-side");
    } catch {
      /* ignore */
    }
    clearHide();
    if (next) {
      setSideHidden(false);
      setSidePeek(false);
    }
  };
  const sideShown = sidePinned || !sideHidden || sidePeek;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <SiteShell chrome="app">
      <div className="relative min-h-dvh bg-espresso text-crema">
        {/* bagliore caldo dietro al contenuto */}
        <div
          className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_30rem_at_70%_-10%,color-mix(in_srgb,var(--color-caramel)_9%,transparent),transparent_70%)]"
          aria-hidden
        />

        {/* bordo sinistro: avvicinando il mouse la sidebar ricompare */}
        {!sidePinned && sideHidden && !sidePeek ? (
          <div
            className="fixed inset-y-0 left-0 z-40 hidden w-3 lg:block"
            aria-hidden
            onMouseEnter={() => {
              clearHide();
              setSidePeek(true);
            }}
          />
        ) : null}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sand/10 bg-roast transition-[transform,box-shadow] duration-300 ease-out lg:block",
            sideShown ? "translate-x-0" : "-translate-x-full",
            sideHidden && sidePeek && !sidePinned && "shadow-[24px_0_60px_-20px_rgba(0,0,0,0.85)]",
          )}
          aria-label="Menu dashboard"
          onMouseEnter={() => {
            overSide.current = true;
            clearHide();
          }}
          onMouseLeave={() => {
            overSide.current = false;
            if (!sidePinned) scheduleHide(sideHidden ? 700 : 2500);
          }}
          onFocusCapture={() => {
            clearHide();
            if (sideHidden) setSidePeek(true);
          }}
        >
          <Sidebar guild={guild} guildNav={guildNav} pinned={sidePinned} onTogglePin={toggleSidePin} />
        </aside>

        <AnimatePresence>
          {open ? (
            <>
              <motion.button
                type="button"
                aria-label="Chiudi menu"
                className="fixed inset-0 z-50 bg-ink/70 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              />
              <motion.aside
                className="fixed inset-y-0 left-0 z-50 flex w-full flex-col bg-roast shadow-2xl sm:w-[20rem] sm:border-r sm:border-sand/12 lg:hidden"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 420, damping: 40 }}
                aria-label="Menu dashboard"
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="absolute right-2 top-3 z-10 inline-flex size-9 items-center justify-center rounded-lg text-crema/50 hover:bg-crema/5 hover:text-crema"
                  aria-label="Chiudi menu"
                >
                  <X className="size-4.5" />
                </button>
                <div className="min-h-0 flex-1">
                  <Sidebar guild={guild} guildNav={guildNav} onNavigate={() => setOpen(false)} />
                </div>
                <div
                  className="relative shrink-0 border-t border-sand/10 p-3"
                  onClickCapture={(e) => {
                    if ((e.target as HTMLElement).closest("a")) setOpen(false);
                  }}
                >
                  <AccountMenu guild={guild} guildNav={guildNav} inline />
                </div>
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>

        <div className={cn("relative transition-[padding] duration-300 ease-out", !sidePinned && sideHidden ? "lg:pl-0" : "lg:pl-64")}>
          <header className="sticky top-[var(--vc-view-as-h,0px)] z-30 flex h-14 items-center gap-3 border-b border-sand/10 bg-espresso/85 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="-ml-1 inline-flex size-9 items-center justify-center rounded-lg text-crema/70 ring-1 ring-sand/15 hover:text-crema lg:hidden"
              aria-label="Apri menu"
              aria-expanded={open}
            >
              <Menu className="size-[1.1rem]" />
            </button>
            {/* il server è già nella barra laterale: qui solo Dashboard › pagina (su telefono solo la pagina) */}
            <nav aria-label="Percorso" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
              <SmartLink href={page("/dashboard/")} className="hidden shrink-0 text-crema/60 transition hover:text-crema sm:inline">
                Dashboard
              </SmartLink>
              <ChevronRight className="hidden size-3.5 shrink-0 text-crema/25 sm:block" aria-hidden />
              <span className="min-w-0 truncate font-semibold text-crema" title={guild ? `${guild.name} · ${crumb || title}` : undefined}>
                {crumb || title}
              </span>
            </nav>
            <TopNavLinks guild={guild} guildNav={guildNav} />
            <CreditsChip />
            <LangMenu />
            <NotificationsBell />
            <div className="hidden sm:block">
              <AccountMenu guild={guild} guildNav={guildNav} />
            </div>
          </header>

          {/* pannello server: più largo, così editor e anteprima stanno comodi affiancati */}
          <main className={cn("mx-auto px-4 pb-16 pt-6 sm:px-6 sm:pt-8", guildNav ? "max-w-[100rem]" : "max-w-6xl")}>
            {!bare ? (
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-3xl font-semibold text-crema sm:text-[2.1rem]">{title}</h1>
                  {lead ? <p className="mt-1.5 max-w-2xl text-sm text-crema/50">{lead}</p> : null}
                </div>
                {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
              </div>
            ) : null}
            {children}
          </main>
          <Footer />
        </div>
      </div>
    </SiteShell>
  );
}
