"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  ChevronsUpDown,
  CreditCard,
  Diamond,
  Handshake,
  HelpCircle,
  House,
  LayoutGrid,
  LogIn,
  Menu,
  MessageSquarePlus,
  NotebookPen,
  Settings2,
  Terminal,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { SiteShell } from "@/components/SiteShell";
import { SmartLink } from "@/components/SmartLink";
import { avatarUrl, displayName, useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { readGuildsCache, readLastGuildId, selectGuild, type DashboardGuild } from "@/lib/dashboard";
import { cdnUrl, page } from "@/lib/site";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

/** Sezioni del pannello server: nella sidebar, sotto "Server". */
export const GUILD_SECTIONS = [
  { id: "settings", label: "Impostazioni", icon: Settings2 },
  { id: "commands", label: "Comandi", icon: Terminal },
  { id: "tickets", label: "Ticket", icon: Ticket },
  { id: "partnership", label: "Partnership", icon: Handshake },
] as const;
export type GuildSectionId = (typeof GUILD_SECTIONS)[number]["id"];

export function isGuildSection(v: string): v is GuildSectionId {
  return GUILD_SECTIONS.some((s) => s.id === v);
}

const BOT_NAV = [
  { href: "/dashboard/faq/", label: "FAQ", icon: HelpCircle },
  { href: "/dashboard/feedback/", label: "Feedback", icon: MessageSquarePlus },
  { href: "/dashboard/recensioni/", label: "Recensioni", icon: NotebookPen },
] as const;

const ACCOUNT_NAV = [
  { href: "/dashboard/premium/", label: "Premium", icon: CreditCard },
  { href: "/dashboard/profilo/", label: "Profilo", icon: UserRound },
] as const;

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
  /** numeretto accanto alla voce (es. ticket in attesa) */
  badges?: Partial<Record<GuildSectionId, number>>;
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
}: {
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
      <Icon className={cn("size-[1.05rem] shrink-0", active ? "text-ember" : "text-crema/60 group-hover:text-crema/70")} />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge ? (
        <span className="rounded-md bg-caramel px-1.5 py-px text-[0.65rem] font-bold tabular-nums text-ink">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </>
  );
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

/** Selettore server in cima alla sidebar (come le dashboard dei bot). */
function ServerSwitcher({ current }: { current: ShellGuild | null }) {
  const [open, setOpen] = useState(false);
  const [guilds, setGuilds] = useState<DashboardGuild[]>([]);
  const [lastId, setLastId] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGuilds(readGuildsCache() || []);
    setLastId(readLastGuildId());
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

  const shown: ShellGuild | null = current || guilds.find((g) => g.id === lastId) || null;

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
                      onClick={() => {
                        setOpen(false);
                        if (on && current) return;
                        /* pagina intera: il pannello ricarica tutti i dati del nuovo server */
                        window.location.assign(selectGuild(g.id));
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

function UserCard() {
  const { user, ready, login } = useAuth();
  if (!ready) return <div className="h-12 animate-pulse rounded-xl bg-crema/[0.04]" />;
  if (!user) {
    return (
      <button
        type="button"
        onClick={login}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865f2] px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >
        <LogIn className="size-4" aria-hidden /> Accedi con Discord
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-espresso/60 p-2 ring-1 ring-sand/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarUrl(user, 64)} alt="" width={32} height={32} className="size-8 shrink-0 rounded-full" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-crema">{displayName(user)}</span>
        <span className="block truncate text-[0.7rem] text-crema/60">@{user.username}</span>
      </span>
    </div>
  );
}

function Sidebar({ guild, guildNav, onNavigate }: { guild: ShellGuild | null; guildNav?: GuildNav; onNavigate?: () => void }) {
  const pathname = usePathname() || "/";
  const [lastId, setLastId] = useState("");
  useEffect(() => setLastId(readLastGuildId()), []);
  const guildId = guild?.id || lastId;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 pb-3 pt-4" onClickCapture={(e) => {
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

      <ServerSwitcher current={guild} />

      <nav aria-label="Dashboard" className="flex-1 space-y-5">
        <NavGroup title="Generale">
          <NavItem animated={!onNavigate} href="/dashboard/" label="I miei server" icon={LayoutGrid} active={samePath(pathname, "/dashboard/", true)} />
        </NavGroup>

        {guildId ? (
          <NavGroup title="Server">
            {GUILD_SECTIONS.map((s) =>
              guildNav ? (
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
                  href={`/dashboard/guild/?id=${encodeURIComponent(guildId)}&s=${s.id}`}
                  label={s.label}
                  icon={s.icon}
                  active={false}
                />
              ),
            )}
          </NavGroup>
        ) : null}

        <NavGroup title="Bot">
          {BOT_NAV.map((n) => (
            <NavItem animated={!onNavigate} key={n.href} href={n.href} label={n.label} icon={n.icon} active={samePath(pathname, n.href)} />
          ))}
        </NavGroup>

        <NavGroup title="Account">
          {ACCOUNT_NAV.map((n) => (
            <NavItem animated={!onNavigate} key={n.href} href={n.href} label={n.label} icon={n.icon} active={samePath(pathname, n.href)} />
          ))}
        </NavGroup>
      </nav>

      <div className="space-y-2">
        <UserCard />
        <SmartLink
          href="/"
          className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-crema/60 transition hover:text-crema"
        >
          <House className="size-3.5" aria-hidden /> Torna al sito
        </SmartLink>
      </div>
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

        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sand/10 bg-roast lg:block" aria-label="Menu dashboard">
          <Sidebar guild={guild} guildNav={guildNav} />
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
                className="fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] border-r border-sand/12 bg-roast shadow-2xl lg:hidden"
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
                <Sidebar guild={guild} guildNav={guildNav} onNavigate={() => setOpen(false)} />
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>

        <div className="relative lg:pl-64">
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
            <nav aria-label="Percorso" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
              <SmartLink href={page("/dashboard/")} className="shrink-0 text-crema/60 transition hover:text-crema">
                Dashboard
              </SmartLink>
              {guild ? (
                <>
                  <ChevronRight className="size-3.5 shrink-0 text-crema/25" aria-hidden />
                  <span className="max-w-[10rem] truncate text-crema/60 sm:max-w-[16rem]">{guild.name}</span>
                </>
              ) : null}
              <ChevronRight className="size-3.5 shrink-0 text-crema/25" aria-hidden />
              <span className="truncate font-semibold text-crema">{crumb || title}</span>
            </nav>
          </header>

          <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
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
        </div>
      </div>
    </SiteShell>
  );
}
