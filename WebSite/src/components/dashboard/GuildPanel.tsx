"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  Camera,
  CalendarDays,
  Download,
  Gem,
  Shapes,
  Clock3,
  Diamond,
  Hash,
  Info,
  LayoutGrid,
  Lock,
  LogIn,
  Megaphone,
  MousePointerClick,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Server,
  SlidersHorizontal,
  Ticket,
  Upload,
  UserPlus,
  Users,
  Languages,
  Rocket,
} from "lucide-react";
import {
  Archive as IcArchive,
  Ban as IcBan,
  BellRing as IcStatusAnn,
  ClipboardList as IcForms,
  DoorOpen as IcGoodbye,
  Filter as IcFilter,
  FolderOpen as IcCases,
  Gauge as IcOverview,
  HandHeart as IcWelcome,
  History as IcHistory,
  Import as IcImport,
  Mail as IcDm,
  MessageSquareQuote as IcReplies,
  PanelsTopLeft as IcPanels,
  Rocket as IcBoost,
  Scale as IcAppeals,
  ScrollText as IcLog,
  Siren as IcPunish,
  Sparkles as IcNewRole,
  Tag as IcClanTag,
  Tags as IcAutoRoles,
  UserPlus as IcInvites,
  Hourglass as IcTenure,
  UserCog as IcManager,
  UsersRound as IcTeams,
  AudioLines as IcTts,
  BarChart3 as IcStats,
  Coins as IcEconomy,
  Code2 as IcDev,
  Crown as IcAdmin,
  Lock as IcSecurity,
  Gamepad2 as IcGames,
  Gavel as IcModeration,
  Gem as IcPremium,
  Handshake as IcPartnership,
  Hash as IcGeneric,
  LayoutGrid as IcAll,
  Music2 as IcMusic,
  Pin as IcBoard,
  Settings2 as IcSettings,
  ShieldCheck as IcStaff,
  Swords as IcStarwars,
  Terminal as IcCommands,
  Ticket as IcTicket,
  TrendingUp as IcLevel,
  Users as IcCommunity,
  Wrench as IcUtility,
  type LucideIcon,
} from "lucide-react";
import { InstagramIcon, KickIcon, TikTokIcon, TwitchIcon, YoutubeIcon } from "./guild/LivePlatformIcons";
import { SmartLink } from "@/components/SmartLink";
import { confirmDialog } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import {
  checkDashboardAccess,
  dashHref,
  isGuildId,
  readLastGuildId,
  selectGuild,
} from "@/lib/dashboard";
import {
  BOARD_FEATURES,
  EMPTY_SETTINGS_PICKERS,
  buildCommandAclBody,
  exportGuildConfig,
  importGuildConfig,
  isCommandEnabled,
  loadGuildPanel,
  readGuildPanelCache,
  writeGuildPanelCache,
  type GuildPanelBundle,
  normalizePrefixInput,
  patchGuildCommandAcl,
  patchGuildCommandEnabled,
  patchGuildCommands,
  patchGuildSettings,
  readGuildIdFromSearch,
  type BoardFeatures,
  type BoardsMode,
  type CatalogCategory,
  type CommandAcl,
  type CommandsPayload,
  type GuildOverview,
  type GuildSettings,
  type MemberHit,
  type SettingsPickers,
  type TicketsSummary,
  searchTicketMembers,
} from "@/lib/dashboard-guild";
import dynamic from "next/dynamic";
import { communityApi } from "@/lib/dashboard-community";
import { DraftTestContext } from "./guild/community/shared";
import { confirmLeaveUnsaved } from "@/lib/unsaved-changes";
import { DashboardShell, type GuildSectionId } from "./DashboardShell";
import {
  COMMAND_SECTION_TABS,
  TICKET_MODULE_TABS,
  MODERATION_MODULE_TABS,
  PARTNERSHIP_MODULE_TABS,
  ANNUNCI_MODULE_TABS,
  LIVE_MODULE_TABS,
  defaultModuleTab,
  findGuildSection,
  isCommandSectionTab,
  isGuildSection,
  isModerationModuleTab,
  isPartnershipModuleTab,
  isRegistroModuleTab,
  REGISTRO_MODULE_TABS,
  isAnnunciModuleTab,
  isLiveModuleTab,
  isTicketModuleTab,
  sectionTabs,
} from "./guildSections";
import {
  DashToast,
  Field,
  MultiCheck,
  Panel,
  PremiumBadge,
  PremiumLock,
  SettingRow,
  StateCard,
  Subnav,
  StatTile,
  Toggle,
  dashPrimaryBtn,
  dashSecondaryBtn,
  discordBtn,
  PageHero,
  GlobalSaveBar,
  TrackUnsaved,
} from "./guild/bits";

const CommandAclEditor = dynamic(() => import("./guild/CommandAcl").then((m) => m.CommandAcl), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const ModulesPanel = dynamic(() => import("./guild/ModulesPanel").then((m) => m.ModulesPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const StatsPanel = dynamic(() => import("./guild/StatsPanel").then((m) => m.StatsPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const MessagesPanel = dynamic(() => import("./guild/community/MessagesPanel").then((m) => m.MessagesPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const CustomCommandsPanel = dynamic(() => import("./guild/community/CustomCommandsPanel").then((m) => m.CustomCommandsPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const RolePanelsPanel = dynamic(() => import("./guild/community/RolePanelsPanel").then((m) => m.RolePanelsPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const WelcomePanel = dynamic(() => import("./guild/community/WelcomePanel").then((m) => m.WelcomePanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const AutoRespondersPanel = dynamic(() => import("./guild/community/AutoRespondersPanel").then((m) => m.AutoRespondersPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const AnnouncementsPanel = dynamic(() => import("./guild/community/AnnouncementsPanel").then((m) => m.AnnouncementsPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const BumpPanel = dynamic(() => import("./guild/community/BumpVotesPanel").then((m) => m.BumpPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});
const VotesPanel = dynamic(() => import("./guild/community/BumpVotesPanel").then((m) => m.VotesPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const CountersPanel = dynamic(() => import("./guild/community/CountersPanel").then((m) => m.CountersPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const ServerLogsPanel = dynamic(() => import("./guild/community/ServerLogsPanel").then((m) => m.ServerLogsPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const GiveawaysPanel = dynamic(() => import("./guild/community/GiveawaysPanel").then((m) => m.GiveawaysPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const PollsPanel = dynamic(() => import("./guild/community/PollsPanel").then((m) => m.PollsPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const LiveVideoPanel = dynamic(() => import("./guild/community/LiveVideoPanel").then((m) => m.LiveVideoPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const BirthdaysPanel = dynamic(() => import("./guild/community/BirthdaysPanel").then((m) => m.BirthdaysPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const HealthPanel = dynamic(() => import("./guild/HealthPanel").then((m) => m.HealthPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const AuditPanel = dynamic(() => import("./guild/AuditPanel").then((m) => m.AuditPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const PartnershipPanel = dynamic(() => import("./guild/PartnershipPanel").then((m) => m.PartnershipPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});
const QuoteStyleEditor = dynamic(() => import("./guild/QuoteStyleEditor").then((m) => m.QuoteStyleEditor), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});
const TicketDesk = dynamic(() => import("./guild/TicketDesk").then((m) => m.TicketDesk), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});
const ModerationPanel = dynamic(() => import("./guild/ModerationPanel").then((m) => m.ModerationPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

type Gate = "loading" | "login" | "locked" | "noid" | "ready";
type Section = GuildSectionId;

const SECTION_LEAD: Record<Section, string> = {
  settings: "Prefisso, canale aggiornamenti e nickname del bot.",
  moduli: "Accendi e spegni i moduli del bot su questo server.",
  bacheca: "Quote, repost, clip e skullboard: funzioni, canali e stile delle citazioni.",
  commands: "Attiva o disattiva i comandi e scegli chi può usarli e dove.",
  tickets: "Ticket aperti, pannelli, moduli, team e blacklist.",
  moderation: "Ban, mute, warn, mod logs, ricorsi, punizioni automatiche e casi.",
  partnership: "Configurazione e gestione delle partnership del server.",
  stats: "Ticket e partnership del server: andamento, voti, staff più attivo.",
  registro: "Chi ha cambiato cosa dalla dashboard, e quando.",
  salute: "Cosa non funziona nel server e come sistemarlo: permessi del bot, canali e ruoli.",
  messaggi: "Annunci e regolamenti con embed e pulsanti: pubblicali subito o a un'ora precisa.",
  comandipers: "Comandi con una risposta fissa, tipo +regole o +ip, creati da te.",
  ruoli: "Pannelli dove i membri si prendono i ruoli da soli: con pulsanti, menu o reazioni.",
  benvenuto: "Annunci automatici: ingresso, uscita, boost, clan tag, status, inviti e ruoli custom.",
  risposte: "Il bot risponde da solo quando qualcuno scrive certe parole.",
  contatori: "Canali vocali che mostrano membri, boost e altri numeri, aggiornati da soli.",
  bump: "Bump di Disboard e Discadia: ringraziamenti, ricompense e promemoria quando si può ribumpare.",
  voti: "Voti su Top.gg e Discadia: webhook, ringraziamenti, ruolo e (sul principale) promemoria in DM.",
  giveaway: "Crea giveaway, guarda chi partecipa ed estrai i vincitori.",
  sondaggi: "Sondaggi di Discord pubblicati dalla dashboard, con i risultati.",
  live: "Avvisi per live, video e post su Twitch, YouTube, Kick, TikTok e Instagram: canali, messaggio e ping.",
  compleanni: "Auguri nel giorno del compleanno: canale, messaggio, ruolo del giorno e privato.",
};

/* testata di ogni pagina: spiegazione breve e colore (Bump e Voti hanno la loro, Impostazioni la scheda del server) */
const SECTION_HERO: Partial<Record<string, { text: string; accent: string }>> = {
  moduli: { text: "Accendi e spegni le parti del bot su questo server: un modulo spento non ha più comandi né azioni automatiche.", accent: "#9b8cf0" },
  commands: { text: "Accendi, spegni e limita i comandi del bot: per categoria, per canale e per ruolo.", accent: "#d99a5b" },
  stats: { text: "Come sta andando il server: ingressi, uscite, messaggi e attività nel tempo.", accent: "#5fb3c9" },
  salute: { text: "Permessi mancanti, canali che non esistono più e tutto quello che può fermare il bot.", accent: "#7fc48c" },
  registro: { text: "Chi ha cambiato cosa nella dashboard, e quando.", accent: "#b9a389" },
  bacheca: { text: "I messaggi più apprezzati finiscono in bacheca, con lo stile che scegli tu.", accent: "#e8b04b" },
  tickets: { text: "Assistenza privata con pannelli, form, team dello staff e archivio delle conversazioni.", accent: "#6f9ce8" },
  moderation: { text: "Punizioni automatiche, ricorsi, casi e registro di tutto quello che succede nel server.", accent: "#e0735f" },
  partnership: { text: "Partner in automatico: regole, filtri, manager e storico di ogni accordo.", accent: "#9b8cf0" },
  messaggi: { text: "Messaggi del bot fatti come vuoi tu, da mandare subito o a orari fissi.", accent: "#d99a5b" },
  comandipers: { text: "Comandi tuoi, con la risposta che decidi tu.", accent: "#c98bdb" },
  ruoli: { text: "Pannelli con pulsanti o menu per far prendere i ruoli da soli.", accent: "#6fc2a8" },
  benvenuto: { text: "Il bot saluta chi entra, chi esce, chi boosta e chi ottiene un ruolo.", accent: "#f08fb0" },
  risposte: { text: "Il bot risponde da solo quando qualcuno scrive certe parole.", accent: "#5fb3c9" },
  contatori: { text: "Canali che mostrano numeri sempre aggiornati: membri, boost, online.", accent: "#e8b04b" },
  giveaway: { text: "Estrazioni a premi con requisiti, durata e vincitori scelti dal bot.", accent: "#f08fb0" },
  sondaggi: { text: "Domande al server con voto a pulsanti e risultati in diretta.", accent: "#6f9ce8" },
  live: { text: "Notifiche social multi-piattaforma: live, video e post con messaggio, canale e ping.", accent: "#9146ff" },
  compleanni: { text: "Gli auguri a chi compie gli anni, con il ruolo del giorno.", accent: "#f08fb0" },
};

/* aree del registro, tutte nella stessa pagina */
const REGISTRO_AREAS = REGISTRO_MODULE_TABS.filter((t) => t.id !== "all");

/* icona per categoria (comandi e aree del registro); per le altre una generica */
const SIDE_TAB_ICONS: Record<string, LucideIcon> = {
  /* ticket, moderazione, partnership, annunci */
  overview: IcOverview,
  archive: IcArchive,
  panels: IcPanels,
  forms: IcForms,
  teams: IcTeams,
  replies: IcReplies,
  blacklist: IcBan,
  setup: IcSettings,
  filtri: IcFilter,
  manager: IcManager,
  storia: IcHistory,
  migrazione: IcImport,
  punizioni: IcPunish,
  ricorsi: IcAppeals,
  casi: IcCases,
  log: IcLog,
  welcome: IcWelcome,
  goodbye: IcGoodbye,
  dm: IcDm,
  roles: IcAutoRoles,
  boost: IcBoost,
  clantag: IcClanTag,
  status: IcStatusAnn,
  inviti: IcInvites,
  anzianita: IcTenure,
  ruolinuovi: IcNewRole,
  all: IcAll,
  tutti: IcAll,
  tutto: IcAll,
  utility: IcUtility,
  bacheca: IcBoard,
  music: IcMusic,
  musica: IcMusic,
  tts: IcTts,
  minigames: IcGames,
  minigiochi: IcGames,
  moderation: IcModeration,
  moderazione: IcModeration,
  partnership: IcPartnership,
  level: IcLevel,
  livelli: IcLevel,
  stats: IcStats,
  statistiche: IcStats,
  economy: IcEconomy,
  economia: IcEconomy,
  staff: IcStaff,
  admin: IcAdmin,
  ticket: IcTicket,
  tickets: IcTicket,
  starwars: IcStarwars,
  security: IcSecurity,
  dev: IcDev,
  settings: IcSettings,
  impostazioni: IcSettings,
  commands: IcCommands,
  comandi: IcCommands,
  community: IcCommunity,
  premium: IcPremium,
  twitch: TwitchIcon,
  youtube: YoutubeIcon,
  kick: KickIcon,
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
};
const sideTabIcon = (t: { id: string; label: string }) =>
  SIDE_TAB_ICONS[String(t.id || "").toLowerCase()] || SIDE_TAB_ICONS[String(t.label || "").toLowerCase().replace(/\s+/g, "")] || IcGeneric;

/** Categorie della pagina in un elenco a sinistra (su telefono una fila scorrevole sopra il contenuto). */
function SideTabsLayout({
  label,
  tabs,
  children,
  active: activeProp,
  onSelect,
  lockedIds,
  lockedReason,
}: {
  label: string;
  tabs: readonly { id: string; label: string }[];
  children: React.ReactNode;
  /** schede non cliccabili (es. durante un setup guidato) */
  lockedIds?: readonly string[];
  lockedReason?: string;
  /** con active + onSelect l'elenco cambia scheda; senza, tutto in una pagina e l'elenco segue lo scorrimento */
  active?: string;
  onSelect?: (id: string) => void;
}) {
  const controlled = Boolean(onSelect);
  const [spyActive, setActive] = useState<string>(tabs[0]?.id || "");
  const active = controlled ? activeProp || tabs[0]?.id || "" : spyActive;
  const locked = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (controlled) return;
    const ids = tabs.map((t) => t.id);
    const update = () => {
      if (locked.current != null) return;
      const els = ids.map((id) => document.getElementById(`spy-${id}`)).filter((e): e is HTMLElement => Boolean(e));
      if (!els.length) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      let current = els[0];
      if (atBottom) current = els[els.length - 1];
      else for (const el of els) if (el.getBoundingClientRect().top <= 140) current = el;
      const id = current.id.slice(4);
      setActive((prev) => (prev === id ? prev : id));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [tabs, controlled]);

  /* telefono: la pillola attiva resta visibile nella fila orizzontale */
  useEffect(() => {
    const ul = listRef.current;
    const chip = ul?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`);
    if (!ul || !chip || ul.scrollWidth <= ul.clientWidth) return;
    ul.scrollTo({ left: chip.offsetLeft - ul.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  const go = (id: string) => {
    if (onSelect) {
      onSelect(id);
      return;
    }
    const el = document.getElementById(`spy-${id}`);
    if (!el) return;
    setActive(id);
    if (locked.current != null) window.clearTimeout(locked.current);
    locked.current = window.setTimeout(() => (locked.current = null), 900);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start">
      <nav aria-label={label} className="sticky top-14 z-10 -mx-4 bg-espresso/90 px-4 py-2 backdrop-blur lg:top-20 lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <ul ref={listRef} className="flex gap-1 overflow-x-auto pb-0.5 lg:flex-col lg:overflow-visible lg:rounded-2xl lg:bg-roast/60 lg:p-1.5 lg:ring-1 lg:ring-sand/10">
          {tabs.map((t) => {
            const on = active === t.id;
            const Icon = sideTabIcon(t);
            return (
              <li key={t.id} className="relative shrink-0">
                {on ? (
                  <motion.span
                    layoutId={`spy-${label}`}
                    className="absolute inset-0 rounded-lg bg-caramel/15 ring-1 ring-caramel/25"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    aria-hidden
                  />
                ) : null}
                <button
                  type="button"
                  data-tab={t.id}
                  aria-current={on ? (controlled ? "page" : "location") : undefined}
                  disabled={!on && Boolean(lockedIds?.includes(t.id))}
                  title={!on && lockedIds?.includes(t.id) ? lockedReason : undefined}
                  onClick={() => go(t.id)}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm font-semibold transition-colors lg:py-2",
                    on ? "text-ember" : "text-crema/60 ring-1 ring-sand/10 hover:bg-crema/[0.05] hover:text-crema lg:ring-0",
                    !on && lockedIds?.includes(t.id) && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-crema/60",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", on ? "text-ember" : "text-crema/45")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  {!on && lockedIds?.includes(t.id) ? <Lock className="size-3.5 shrink-0 text-crema/40" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
const fieldCls =
  "w-full rounded-lg bg-espresso/70 px-3 py-2 text-sm text-crema ring-1 ring-sand/15 outline-none transition focus:ring-caramel/45 disabled:opacity-50";

function readSectionFromSearch(search: string): Section | null {
  try {
    const v = String(new URLSearchParams(search).get("s") || "");
    if (v === "bumpvoti") return "bump";
    /* classifica → sito pubblico /classifiche/?scope=bots */
    if (v === "classifica") return null;
    return isGuildSection(v) ? v : null;
  } catch {
    return null;
  }
}

function sanitizeModuleTab(section: Section, raw: string | null | undefined): string | null {
  const v = String(raw || "").trim();
  const fallback = defaultModuleTab(section);
  if (!fallback) return null;
  if (!v) return fallback;
  if (section === "tickets") return isTicketModuleTab(v) ? v : "overview";
  if (section === "moderation") return isModerationModuleTab(v) ? v : "overview";
  if (section === "partnership") return isPartnershipModuleTab(v) ? v : "setup";
  if (section === "commands") {
    if (v === "all" || isCommandSectionTab(v)) return v;
    /* categorie dinamiche dal catalogo API */
    return /^[a-z0-9_-]{1,40}$/i.test(v) ? v : "all";
  }
  if (section === "registro") return isRegistroModuleTab(v) ? v : "all";
  if (section === "benvenuto") return isAnnunciModuleTab(v) ? v : "welcome";
  if (section === "live") return isLiveModuleTab(v) ? v : "twitch";
  return fallback;
}

function readModuleTabFromSearch(search: string, section: Section): string | null {
  try {
    return sanitizeModuleTab(section, new URLSearchParams(search).get("t"));
  } catch {
    return defaultModuleTab(section);
  }
}

/* data di creazione del server dall'ID Discord (snowflake) */
function guildCreatedAt(id: string): Date | null {
  try {
    return new Date(Number((BigInt(id) >> BigInt(22)) + BigInt(1420070400000)));
  } catch {
    return null;
  }
}

function fmtNum(n: number | null) {
  return n != null ? n.toLocaleString("it-IT") : "—";
}

/** Testata del server: copertina (banner o icona sfocata), icona, badge e dati generali del server. */
function GuildHero({ guild, premiumActive, prefix }: { guild: GuildOverview; premiumActive: boolean; prefix: string | null }) {
  const initial = (guild.name.trim().charAt(0) || "?").toUpperCase();
  const created = guildCreatedAt(guild.id);
  const years = created ? Math.floor((Date.now() - created.getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
  const onlinePct =
    guild.memberCount && guild.onlineCount != null ? Math.round((guild.onlineCount / guild.memberCount) * 100) : null;
  return (
    <section className="overflow-hidden rounded-2xl bg-roast/80 ring-1 ring-sand/10">
      <div className={cn("relative overflow-hidden bg-mocha", guild.bannerUrl ? "h-32 sm:h-40" : "h-24 sm:h-28")} aria-hidden>
        {guild.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guild.bannerUrl} alt="" className="size-full object-cover" />
        ) : guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guild.iconUrl} alt="" className="size-full scale-125 object-cover opacity-40 blur-2xl" />
        ) : (
          <span className="absolute inset-0 bg-gradient-to-br from-caramel/25 via-mocha to-roast" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-roast via-roast/30 to-transparent" />
      </div>
      <div className="relative -mt-12 flex flex-wrap items-end gap-4 px-4 sm:px-6">
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guild.iconUrl} alt="" width={80} height={80} className="size-20 shrink-0 rounded-2xl object-cover ring-4 ring-roast" />
        ) : (
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-mocha font-display text-3xl font-semibold text-crema/70 ring-4 ring-roast">
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-2xl font-semibold text-crema sm:text-3xl">{guild.name}</h2>
            {premiumActive ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-caramel/15 px-2 py-0.5 text-[0.7rem] font-semibold text-ember ring-1 ring-caramel/35">
                <Diamond className="size-3" aria-hidden /> Premium
              </span>
            ) : null}
            {guild.isMainGuild ? (
              <span className="rounded-md bg-crema/10 px-2 py-0.5 text-[0.7rem] font-semibold text-crema/80 ring-1 ring-sand/25">Principale</span>
            ) : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-crema/60">
            <span className={cn("inline-flex items-center gap-1.5", guild.botPresent ? "text-[#9fd0a8] light:text-[#2f6b3f]" : "text-[#f0a493] light:text-[#a83a2c]")}>
              <span className={cn("size-1.5 rounded-full", guild.botPresent ? "bg-[#7fc48c]" : "bg-[#e0735f]")} aria-hidden />
              {guild.botPresent ? "Vinili è nel server" : "Vinili non è nel server"}
            </span>
            {prefix ? (
              <span className="inline-flex items-center gap-1">
                Prefisso <span className="rounded bg-espresso/70 px-1.5 font-mono text-crema/80">{prefix}</span>
              </span>
            ) : null}
            <span className="font-mono text-[0.65rem] text-crema/50">{guild.id}</span>
          </p>
        </div>
      </div>
      {guild.description ? <p className="mx-4 mt-3 max-w-3xl text-sm leading-relaxed text-crema/55 sm:mx-6">{guild.description}</p> : null}
      <div className="grid grid-cols-2 gap-2.5 p-4 sm:px-6 sm:pb-5 lg:grid-cols-4">
        <StatTile
          icon={<Users />}
          label="Membri"
          value={fmtNum(guild.memberCount)}
          hint={guild.onlineCount != null ? `${fmtNum(guild.onlineCount)} online${onlinePct != null ? ` · ${onlinePct}%` : ""}` : undefined}
        />
        <StatTile
          icon={<Gem />}
          label="Boost"
          value={fmtNum(guild.boostCount)}
          hint={guild.boostTier != null ? (guild.boostTier > 0 ? `Livello ${guild.boostTier}` : "Nessun livello") : undefined}
          tone="accent"
        />
        <StatTile
          icon={<Shapes />}
          label="Ruoli e canali"
          value={guild.roleCount != null ? `${fmtNum(guild.roleCount)} ruoli` : "—"}
          hint={[guild.channelCount != null ? `${fmtNum(guild.channelCount)} canali` : "", guild.emojiCount != null ? `${fmtNum(guild.emojiCount)} emoji` : ""].filter(Boolean).join(" · ") || undefined}
        />
        <StatTile
          icon={<CalendarDays />}
          label="Creato"
          value={created ? created.toLocaleDateString("it-IT", { month: "short", year: "numeric" }) : "—"}
          hint={years != null ? (years >= 1 ? `${years} ${years === 1 ? "anno" : "anni"} fa` : "meno di un anno fa") : undefined}
        />
      </div>
    </section>
  );
}

const PRESENCE: Record<string, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-[#23a55a]" },
  idle: { label: "Inattivo", dot: "bg-[#f0b232]" },
  dnd: { label: "Non disturbare", dot: "bg-[#f23f43]" },
  offline: { label: "Offline", dot: "bg-[#80848e]" },
  invisible: { label: "Offline", dot: "bg-[#80848e]" },
};

/** Il bot come appare su Discord in questo server, con lo stato attuale e il cambio del nickname. */
const IDENTITY_MAX_BYTES = 4 * 1024 * 1024;
const IDENTITY_TYPES = ["image/png", "image/jpeg", "image/gif"];

function readImageFile(file: File): Promise<{ ok: true; dataUri: string } | { ok: false; message: string }> {
  if (!IDENTITY_TYPES.includes(file.type)) return Promise.resolve({ ok: false, message: "Usa un'immagine PNG, JPG o GIF." });
  if (file.size > IDENTITY_MAX_BYTES) return Promise.resolve({ ok: false, message: "L'immagine supera 4 MB: scegline una più leggera." });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ ok: true, dataUri: String(reader.result || "") });
    reader.onerror = () => resolve({ ok: false, message: "Non riesco a leggere il file." });
    reader.readAsDataURL(file);
  });
}

function BotIdentityCard({
  settings,
  canCustomize,
  saving,
  onSave,
  onToast,
}: {
  settings: GuildSettings;
  canCustomize: boolean;
  saving: boolean;
  onSave: (body: Record<string, unknown>, okMsg: string) => Promise<boolean>;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [nick, setNick] = useState(settings.botNickname ?? "");
  const [editingNick, setEditingNick] = useState(false);
  useEffect(() => setNick(settings.botNickname ?? ""), [settings.botNickname]);
  /* anteprima immediata mentre il bot salva (Discord ci mette qualche secondo) */
  const [pending, setPending] = useState<{ avatar?: string; banner?: string }>({});
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const nickInput = useRef<HTMLInputElement>(null);

  const presence = PRESENCE[settings.botPresence?.status || "online"] ?? PRESENCE.online;
  const shownName = nick.trim() || settings.botUsername || "Vinili";
  const changed = nick.trim() !== (settings.botNickname ?? "").trim();
  const avatar = pending.avatar || settings.botAvatarUrl;
  const banner = pending.banner || settings.botBannerUrl;
  const locked = !canCustomize || saving;

  useEffect(() => {
    if (!editingNick) return;
    const el = nickInput.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingNick]);

  const submitNick = async () => {
    setEditingNick(false);
    if (!changed || locked) {
      setNick(settings.botNickname ?? "");
      return;
    }
    const ok = await onSave(
      { botNickname: nick.trim() || null },
      nick.trim() ? "Nickname del bot aggiornato." : "Nickname del bot ripristinato.",
    );
    if (!ok) setNick(settings.botNickname ?? "");
  };

  const startEditNick = () => {
    if (!canCustomize) return onToast("Il nickname del bot per server è una funzione Premium.", true);
    if (saving) return;
    setEditingNick(true);
  };

  const upload = async (kind: "avatar" | "banner", file: File) => {
    const read = await readImageFile(file);
    if (!read.ok) return onToast(read.message, true);
    setPending((p) => ({ ...p, [kind]: read.dataUri }));
    await onSave(
      kind === "avatar" ? { botAvatar: read.dataUri } : { botBanner: read.dataUri },
      kind === "avatar" ? "Avatar del bot aggiornato." : "Banner del bot aggiornato.",
    );
    setPending((p) => ({ ...p, [kind]: undefined }));
  };

  const pick = (kind: "avatar" | "banner") => {
    if (!canCustomize) return onToast("Avatar e banner del bot per server sono una funzione Premium.", true);
    if (saving) return;
    (kind === "avatar" ? avatarInput : bannerInput).current?.click();
  };

  const reset = async (kind: "avatar" | "banner") => {
    const ok = await confirmDialog({
      title: kind === "avatar" ? "Togliere l'avatar?" : "Togliere il banner?",
      message: "In questo server il bot torna a quello di sempre.",
      confirmLabel: "Togli",
      danger: true,
    });
    if (!ok) return;
    await onSave(kind === "avatar" ? { botAvatar: null } : { botBanner: null }, kind === "avatar" ? "Avatar ripristinato." : "Banner ripristinato.");
  };

  const fileInput = (kind: "avatar" | "banner") => (
    <input
      ref={kind === "avatar" ? avatarInput : bannerInput}
      id={`bot-${kind}-file`}
      name={`bot-${kind}-file`}
      type="file"
      accept="image/png,image/jpeg,image/gif"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void upload(kind, file);
      }}
    />
  );

  /* velo "Cambia" + ripristino se personalizzato */
  const mediaOverlay = (kind: "avatar" | "banner", custom: boolean, round?: boolean) =>
    canCustomize ? (
      <span
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink/55 text-[0.7rem] font-bold uppercase tracking-wider text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          round && "rounded-full",
        )}
      >
        <Camera className="size-5" aria-hidden />
        {kind === "avatar" ? "Cambia" : custom ? "Cambia banner" : "Aggiungi banner"}
        {custom ? (
          <button
            type="button"
            disabled={saving}
            title="Torna a quello di sempre"
            aria-label={kind === "avatar" ? "Ripristina avatar" : "Ripristina banner"}
            onClick={(e) => {
              e.stopPropagation();
              void reset(kind);
            }}
            className="pointer-events-auto mt-0.5 inline-flex items-center gap-1 rounded-md bg-ink/50 px-2 py-0.5 text-[0.65rem] font-semibold normal-case tracking-normal text-white/90 ring-1 ring-white/20 hover:bg-ink/70"
          >
            <RotateCcw className="size-3" aria-hidden /> Ripristina
          </button>
        ) : null}
      </span>
    ) : null;

  return (
    <Panel
      icon={<Bot />}
      title="Il bot in questo server"
      description="Clicca sul nome, sulla foto o sul banner per cambiarli. Solo i membri di questo server li vedono."
      aside={<PremiumBadge active={canCustomize} />}
    >
      {fileInput("avatar")}
      {fileInput("banner")}

      {!canCustomize ? (
        <div className="mb-4">
          <PremiumLock
            feature="L'identità del bot"
            note={
              settings.identitySuspended
                ? "Premium è scaduto: nickname, avatar e banner sono salvati e tornano appena lo rinnovi."
                : "Con Premium il bot ha nickname, avatar e banner diversi solo in questo server."
            }
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-[#232428] ring-1 ring-sand/10">
        <button
          type="button"
          onClick={() => pick("banner")}
          disabled={saving}
          aria-label={canCustomize ? "Cambia il banner del bot" : "Banner del bot"}
          className={cn("group relative block h-36 w-full overflow-hidden sm:h-44", canCustomize ? "cursor-pointer" : "cursor-default")}
        >
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="absolute inset-0 bg-gradient-to-br from-mocha via-roast to-caramel/45" aria-hidden />
          )}
          {mediaOverlay("banner", settings.hasGuildBanner)}
          {pending.banner ? <span className="absolute inset-0 animate-pulse bg-ink/40" aria-hidden /> : null}
        </button>

        <div className="relative px-5 pb-5 sm:px-6 sm:pb-6">
          <button
            type="button"
            onClick={() => pick("avatar")}
            disabled={saving}
            aria-label={canCustomize ? "Cambia l'avatar del bot" : "Avatar del bot"}
            className={cn(
              "group absolute -top-14 left-5 size-28 rounded-full ring-[6px] ring-[#232428] sm:left-6",
              canCustomize ? "cursor-pointer" : "cursor-default",
            )}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" width={112} height={112} className="size-28 rounded-full object-cover" />
            ) : (
              <span className="flex size-28 items-center justify-center rounded-full bg-mocha text-crema/60">
                <Bot className="size-10" aria-hidden />
              </span>
            )}
            {mediaOverlay("avatar", settings.hasGuildAvatar, true)}
            {pending.avatar ? <span className="absolute inset-0 animate-pulse rounded-full bg-ink/40" aria-hidden /> : null}
            <span
              className={cn("absolute bottom-1.5 right-1.5 size-5 rounded-full ring-[4px] ring-[#232428]", presence.dot)}
              title={presence.label}
              aria-hidden
            />
          </button>

          <div className="pt-16 sm:pt-[4.25rem]">
            <div className="flex min-w-0 items-center gap-2">
              {editingNick ? (
                <input
                  ref={nickInput}
                  id="bot-nick-inline"
                  name="bot-nick-inline"
                  value={nick}
                  maxLength={32}
                  disabled={saving}
                  placeholder={settings.botUsername || "Vinili"}
                  aria-label="Nickname del bot in questo server"
                  onChange={(e) => setNick(e.target.value)}
                  onBlur={() => void submitNick()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submitNick();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setNick(settings.botNickname ?? "");
                      setEditingNick(false);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md bg-[#111214] px-2 py-1 text-xl font-bold text-white outline-none ring-2 ring-[#5865f2]/placeholder:text-[#b5bac1]"
                />
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={startEditNick}
                  title={canCustomize ? "Clicca per cambiare il nickname" : undefined}
                  className={cn(
                    "group/name flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-left text-xl font-bold text-white",
                    canCustomize && "hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caramel",
                    canCustomize ? "cursor-pointer px-1.5 py-0.5 -ml-1.5" : "cursor-default",
                  )}
                >
                  <span className="truncate">{shownName}</span>
                  {canCustomize ? (
                    <Pencil className="size-3.5 shrink-0 text-white/40 opacity-0 transition-opacity group-hover/name:opacity-100" aria-hidden />
                  ) : null}
                </button>
              )}
              <span className="shrink-0 rounded bg-[#5865f2] px-1.5 py-px text-[0.6rem] font-bold uppercase text-white">Bot</span>
              {canCustomize && settings.botNickname && !editingNick ? (
                <button
                  type="button"
                  disabled={saving}
                  title="Torna al nome di sempre"
                  aria-label="Ripristina nickname"
                  onClick={async () => {
                    const sure = await confirmDialog({
                      title: "Togliere il nickname?",
                      message: "In questo server il bot torna a chiamarsi col nome di sempre.",
                      confirmLabel: "Togli",
                      danger: true,
                    });
                    if (!sure) return;
                    setNick("");
                    const ok = await onSave({ botNickname: null }, "Nickname del bot ripristinato.");
                    if (!ok) setNick(settings.botNickname ?? "");
                  }}
                  className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[#b5bac1] transition hover:bg-white/[0.06] hover:text-white"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-sm text-[#b5bac1]">{settings.botUsername || "vinili"}</p>
            <div className="mt-4 rounded-lg bg-[#111214] px-3 py-2.5">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#b5bac1]">Stato</p>
              <p className="mt-0.5 truncate text-sm text-[#dbdee1]" title={settings.botPresence?.text || presence.label}>
                {settings.botPresence?.text || presence.label}
              </p>
            </div>
          </div>
        </div>
      </div>

      {canCustomize ? (
        <p className="mt-3 text-xs text-crema/55">
          Avatar quadrato (almeno 128×128), banner orizzontale (circa 680×240). PNG, JPG o GIF fino a 4 MB. Nickname max 32 caratteri.
        </p>
      ) : null}
    </Panel>
  );
}

/* lingue dei messaggi del bot (stesse del bot) */
const SERVER_LANGUAGES = [
  ["it", "🇮🇹 Italiano"],
  ["en", "🇬🇧 English"],
  ["es", "🇪🇸 Español"],
  ["fr", "🇫🇷 Français"],
  ["de", "🇩🇪 Deutsch"],
  ["pt", "🇧🇷 Português"],
  ["ru", "🇷🇺 Русский"],
  ["zh", "🇨🇳 中文"],
  ["ja", "🇯🇵 日本語"],
  ["ko", "🇰🇷 한국어"],
  ["ar", "🇸🇦 العربية"],
  ["nl", "🇳🇱 Nederlands"],
  ["pl", "🇵🇱 Polski"],
  ["tr", "🇹🇷 Türkçe"],
  ["hi", "🇮🇳 हिन्दी"],
  ["id", "🇮🇩 Indonesia"],
  ["uk", "🇺🇦 Українська"],
  ["vi", "🇻🇳 Tiếng Việt"],
  ["ro", "🇷🇴 Română"],
  ["sv", "🇸🇪 Svenska"],
].map(([value, label]) => ({ value, label }));

/* primo avvio: una volta fatto (o se il server è già impostato) non si mostra più */
const FIRST_SETUP_KEY = (gid: string) => `vc-first-setup:${gid}`;
function firstSetupDone(gid: string, settings: GuildSettings) {
  if (settings.updatesChannelId || settings.language) return true;
  try {
    return localStorage.getItem(FIRST_SETUP_KEY(gid)) === "1";
  } catch {
    return false;
  }
}

/** Finestra a schermo intero al primo avvio: prefisso, canale aggiornamenti, lingua e fuso orario. */
function FirstSetupModal({
  guildId,
  token,
  guildName,
  settings,
  pickers,
  onDone,
  onToast,
}: {
  guildId: string;
  token: string;
  guildName: string;
  settings: GuildSettings;
  pickers: SettingsPickers;
  onDone: (next: GuildSettings, nextPickers?: SettingsPickers) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [prefix, setPrefix] = useState(settings.prefix || "+");
  const [channel, setChannel] = useState(settings.updatesChannelId || "");
  const [language, setLanguage] = useState(settings.language || settings.discordLanguage || "it");
  const [timezone, setTimezone] = useState(settings.timezone || "Europe/Rome");
  const [busy, setBusy] = useState(false);
  const tzOptions = useMemo(() => timezoneOptions(timezone), [timezone]);

  const submit = async () => {
    const parsed = normalizePrefixInput(prefix, settings.prefixMaxLength);
    if (!parsed.ok) return onToast(parsed.message, true);
    setBusy(true);
    const res = await patchGuildSettings(token, guildId, { prefix: parsed.prefix, updatesChannelId: channel || null, language: language || null, timezone });
    setBusy(false);
    if (!res.ok) return onToast(res.message, true);
    try {
      localStorage.setItem(FIRST_SETUP_KEY(guildId), "1");
    } catch {}
    onToast("Fatto! Il bot è pronto su questo server.");
    onDone(res.data.settings, res.data.pickers);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="first-setup-title">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-gradient-to-br from-mocha via-roast to-espresso p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-sand/20"
      >
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-caramel/25 blur-3xl" aria-hidden />
        <div className="relative">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
            <Rocket className="size-6" aria-hidden />
          </span>
          <h2 id="first-setup-title" className="mt-4 font-display text-2xl font-semibold text-crema">Benvenuto su Vinili!</h2>
          <p className="mt-1 text-sm text-crema/65">Prima di iniziare imposta le basi per <span className="font-semibold text-crema">{guildName}</span>. Puoi cambiarle quando vuoi da Impostazioni.</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[0.8rem] font-semibold text-crema/80">Prefisso dei comandi</span>
              <input value={prefix} maxLength={settings.prefixMaxLength} onChange={(e) => setPrefix(e.target.value)} className={cn(fieldCls, "mt-1.5 font-mono")} />
            </label>
            <label className="block">
              <span className="text-[0.8rem] font-semibold text-crema/80">Canale delle novità</span>
              <Select
                value={channel}
                onChange={setChannel}
                searchable
                searchPlaceholder="Cerca canale…"
                className={cn(fieldCls, "mt-1.5")}
                options={[{ value: "", label: "Nessuno" }, ...pickers.textChannels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
              />
            </label>
            <label className="block">
              <span className="text-[0.8rem] font-semibold text-crema/80">Lingua del bot</span>
              <Select value={language} onChange={setLanguage} searchable searchPlaceholder="Cerca lingua…" className={cn(fieldCls, "mt-1.5")} options={SERVER_LANGUAGES} />
            </label>
            <label className="block">
              <span className="text-[0.8rem] font-semibold text-crema/80">Fuso orario</span>
              <Select value={timezone} onChange={setTimezone} searchable searchPlaceholder="Cerca fuso…" className={cn(fieldCls, "mt-1.5")} options={tzOptions} />
            </label>
          </div>
          <p className="mt-2 text-xs text-crema/50">Nel canale delle novità arrivano gli aggiornamenti di Vinili. Il fuso orario serve per i messaggi programmati e gli orari.</p>

          <button type="button" disabled={busy} onClick={() => void submit()} className={cn(dashPrimaryBtn, "mt-6 w-full justify-center py-2.5")}>
            {busy ? "Salvataggio…" : "Inizia"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* fusi orari IANA del browser, con lo scarto da UTC (es. "Europe/Rome · UTC+1") */
function timezoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") || [];
  } catch {
    zones = [];
  }
  if (!zones.length) zones = ["Europe/Rome", "Europe/London", "Europe/Madrid", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "UTC"];
  if (!zones.includes("UTC")) zones = [...zones, "UTC"];
  if (current && !zones.includes(current)) zones = [current, ...zones];
  const now = new Date();
  return zones.map((z) => {
    let off = "";
    try {
      off = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "shortOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value || "";
    } catch {
      off = "";
    }
    return { value: z, label: off ? `${z.replace(/_/g, " ")} · ${off.replace("GMT", "UTC")}` : z.replace(/_/g, " ") };
  });
}

function SettingsSection({
  guildId,
  token,
  settings,
  pickers,
  error,
  canCustomize,
  onUpdated,
  onToast,
}: {
  guildId: string;
  token: string;
  canCustomize: boolean;
  premiumActive: boolean;
  premiumUntil: number | null;
  isProtectedGuild: boolean;
  settings: GuildSettings | null;
  pickers: SettingsPickers;
  error: string | null;
  onUpdated: (next: GuildSettings, pickers?: SettingsPickers) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [prefix, setPrefix] = useState(settings?.prefix ?? "+");
  const [updatesChannelId, setUpdatesChannelId] = useState(settings?.updatesChannelId ?? "");
  const [language, setLanguage] = useState(settings?.language ?? "");
  const [timezone, setTimezone] = useState(settings?.timezone ?? "Europe/Rome");
  const [dashboardRoleIds, setDashboardRoleIds] = useState<string[]>(settings?.dashboardRoleIds ?? []);
  const [dashboardUserIds, setDashboardUserIds] = useState<string[]>(settings?.dashboardUserIds ?? []);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [userQuery, setUserQuery] = useState("");
  const [userHits, setUserHits] = useState<MemberHit[]>([]);
  const [saving, setSaving] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!settings) return;
    setPrefix(settings.prefix);
    setUpdatesChannelId(settings.updatesChannelId ?? "");
    setLanguage(settings.language ?? "");
    setTimezone(settings.timezone ?? "Europe/Rome");
    setDashboardRoleIds(settings.dashboardRoleIds ?? []);
    setDashboardUserIds(settings.dashboardUserIds ?? []);
  }, [settings]);

  useEffect(() => {
    const ids = settings?.dashboardUserIds ?? [];
    if (!ids.length || !token || !guildId) return;
    let cancel = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const id of ids) {
        const res = await searchTicketMembers(token, guildId, id);
        if (cancel) return;
        if (res.ok) {
          const hit = res.data.find((h) => h.id === id) || res.data[0];
          if (hit) next[id] = hit.label;
        }
      }
      if (!cancel) setUserLabels((cur) => ({ ...cur, ...next }));
    })();
    return () => {
      cancel = true;
    };
  }, [settings?.dashboardUserIds, token, guildId]);

  useEffect(() => {
    const q = userQuery.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) {
      setUserHits([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const res = await searchTicketMembers(token, guildId, q);
      if (!res.ok) {
        setUserHits([]);
        return;
      }
      setUserHits(res.data.filter((h) => !dashboardUserIds.includes(h.id)).slice(0, 8));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [userQuery, token, guildId, dashboardUserIds]);

  const save = async (body: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    const res = await patchGuildSettings(token, guildId, body);
    setSaving(false);
    if (!res.ok) {
      onToast(res.message, true);
      return false;
    }
    onUpdated(res.data.settings, res.data.pickers);
    onToast(okMsg);
    return true;
  };

  const downloadBackup = async () => {
    setConfigBusy(true);
    const res = await exportGuildConfig(token, guildId);
    setConfigBusy(false);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    onToast(`Backup scaricato: ${res.filename}`);
  };

  const restoreBackup = async (file: File | null) => {
    if (!file) return;
    const ok = await confirmDialog({
      message:
        "Ripristinare questo backup? Sovrascrive impostazioni, comandi, partnership e ticket (non i ticket aperti né la storia).",
      danger: true,
    });
    if (!ok) return;
    setConfigBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const config =
        parsed.config && typeof parsed.config === "object"
          ? (parsed.config as Record<string, unknown>)
          : parsed;
      const res = await importGuildConfig(token, guildId, config);
      if (!res.ok) {
        onToast(res.message, true);
        return;
      }
      onToast(res.data.message);
      for (const w of res.data.warnings) onToast(w, true);
      window.location.reload();
    } catch {
      onToast("File backup non valido (serve un JSON).", true);
    } finally {
      setConfigBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (error && !settings) {
    return (
      <p className="rounded-xl bg-caramel/10 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-caramel/25">
        {error}
      </p>
    );
  }
  if (!settings) return null;

  const prefixLocked = settings.prefixLocked;
  const updatesLocked = settings.updatesLocked;
  const rolesLocked = settings.rolesLocked;
  /* ruoli con Amministratore (non dei bot): proposti già spuntati finché i ruoli non vengono salvati */
  const autoRoleIds = pickers.roles
    .filter((r) => {
      if (r.managed || /\bbots?\b/i.test(r.name)) return false;
      try {
        const p = BigInt(r.permissions || "0");
        return (p & BigInt(8)) !== BigInt(0);
      } catch {
        return false;
      }
    })
    .map((r) => r.id);
  const roleOptions = pickers.roles.filter((r) => !r.managed).map((r) => ({ id: r.id, label: r.name }));
  const shownRoleIds = settings.dashboardRolesConfigured ? dashboardRoleIds : [...new Set([...autoRoleIds, ...dashboardRoleIds])];
  const guildOwner = settings.guildOwner;

  /* le modifiche restano in sospeso finché non premi Salva nella barra in basso */
  const saveRoles = async (next: string[]) => {
    setDashboardRoleIds(next);
  };

  const saveUsers = async (next: string[]) => {
    if (next.length > 25) {
      onToast("Puoi aggiungere al massimo 25 utenti.", true);
      return;
    }
    setDashboardUserIds(next);
  };

  const pendingBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {};
    if (!prefixLocked && prefix !== settings.prefix) body.prefix = prefix;
    if (!updatesLocked && (updatesChannelId || null) !== (settings.updatesChannelId ?? null)) body.updatesChannelId = updatesChannelId || null;
    if ((language || null) !== (settings.language ?? null)) body.language = language || null;
    if (timezone !== (settings.timezone ?? "Europe/Rome")) body.timezone = timezone;
    if (JSON.stringify(dashboardRoleIds) !== JSON.stringify(settings.dashboardRoleIds ?? [])) body.dashboardRoleIds = dashboardRoleIds;
    if (JSON.stringify(dashboardUserIds) !== JSON.stringify(settings.dashboardUserIds ?? [])) body.dashboardUserIds = dashboardUserIds;
    return body;
  };
  const settingsDirty = Object.keys(pendingBody()).length > 0;
  const saveAllSettings = async () => {
    const body = pendingBody();
    if (typeof body.prefix === "string") {
      const parsed = normalizePrefixInput(body.prefix, settings.prefixMaxLength);
      if (!parsed.ok) return onToast(parsed.message, true);
      body.prefix = parsed.prefix;
    }
    if (Object.keys(body).length) await save(body, "Impostazioni salvate.");
  };
  const resetSettings = () => {
    setPrefix(settings.prefix);
    setUpdatesChannelId(settings.updatesChannelId ?? "");
    setLanguage(settings.language ?? "");
    setTimezone(settings.timezone ?? "Europe/Rome");
    setDashboardRoleIds(settings.dashboardRoleIds ?? []);
    setDashboardUserIds(settings.dashboardUserIds ?? []);
  };

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={settingsDirty} onSave={saveAllSettings} onReset={resetSettings} />
      {settings.botUsername ? (
        <BotIdentityCard settings={settings} canCustomize={canCustomize} saving={saving} onSave={save} onToast={onToast} />
      ) : null}
      <div className="min-w-0 space-y-4">
        <Panel icon={<SlidersHorizontal />} title="Generale" description="Come si chiamano i comandi e dove arrivano le novità del bot.">
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="prefix" className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-crema/70">
                <Hash className="size-3.5 text-crema/60" aria-hidden /> Prefisso comandi
                {prefixLocked ? <Lock className="size-3 text-crema/50" aria-label="Bloccato" /> : null}
              </span>
              <input
                id="prefix"
                name="prefix"
                value={prefix}
                maxLength={settings.prefixMaxLength}
                disabled={prefixLocked || saving}
                onChange={(e) => setPrefix(e.target.value)}
                className={cn(fieldCls, "mt-1.5 font-mono")}
              />
              <span className="mt-1 block text-xs text-crema/50">
                {prefixLocked ? "Bloccato sul server Vinili." : "Comando di esempio: " + (prefix || "+") + "help"}
              </span>
            </label>

            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-crema/70">
                <Megaphone className="size-3.5 text-crema/60" aria-hidden /> Canale aggiornamenti
                {updatesLocked ? <Lock className="size-3 text-crema/50" aria-label="Bloccato" /> : null}
              </span>
              <Select
                value={updatesChannelId}
                disabled={updatesLocked || saving}
                onChange={(next) => setUpdatesChannelId(next)}
                className={cn(fieldCls, "mt-1.5")}
                options={[
                  { value: "", label: "— Nessuno —" },
                  ...pickers.textChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
                ]}
              />
              <span className="mt-1 block text-xs text-crema/50">
                {updatesLocked
                  ? "Sul server principale Vinili questo canale non si configura da dashboard."
                  : "Inoltro degli aggiornamenti dal canale news di Vinili."}
              </span>
            </label>

            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-crema/70">
                <Languages className="size-3.5 text-crema/60" aria-hidden /> Lingua del server
              </span>
              <Select
                value={language}
                disabled={saving}
                searchable
                searchPlaceholder="Cerca lingua…"
                onChange={(next) => setLanguage(next)}
                className={cn(fieldCls, "mt-1.5")}
                options={[
                  {
                    value: "",
                    label: (() => {
                      const auto = SERVER_LANGUAGES.find((l) => l.value === settings.discordLanguage);
                      return auto
                        ? `${auto.label} (automatica importata da discord)`
                        : "Automatica (importata da discord)";
                    })(),
                  },
                  ...SERVER_LANGUAGES,
                ]}
              />
              <span className="mt-1 block text-xs text-crema/50">Lingua dei messaggi del bot su questo server.</span>
            </label>

            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-crema/70">
                <Clock3 className="size-3.5 text-crema/60" aria-hidden /> Fuso orario
              </span>
              <Select
                value={timezone}
                disabled={saving}
                searchable
                searchPlaceholder="Cerca fuso orario…"
                onChange={(next) => setTimezone(next)}
                className={cn(fieldCls, "mt-1.5")}
                options={timezoneOptions(timezone)}
              />
              <span className="mt-1 block text-xs text-crema/50">Usato per orari e giorni delle statistiche.</span>
            </label>
          </div>
        </Panel>

        <Panel
          icon={<UserPlus />}
          title="Accesso dashboard"
          description="Oltre a Gestisci server: scegli ruoli o persone che possono aprire la dashboard di questo server."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-crema/70">Ruoli</p>
              <MultiCheck
                options={roleOptions}
                selected={shownRoleIds}
                onChange={(ids) => {
                  if (rolesLocked || saving) return;
                  void saveRoles(ids);
                }}
                empty="Nessun ruolo disponibile."
              />
              {rolesLocked ? (
                <p className="mt-1 text-xs text-crema/50">Bloccato su questo server.</p>
              ) : (
                <p className="mt-1 text-xs text-crema/50">Chi ha uno di questi ruoli può usare la dashboard. All'inizio sono spuntati quelli con Amministratore.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-crema/70">Persone</p>
              <label className="mt-1.5 block">
                <span className="sr-only">Cerca una persona</span>
                <input
                  name="dashboard-user-search"
                  value={userQuery}
                  disabled={rolesLocked || saving}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Cerca per nome o ID…"
                  className={cn(fieldCls, "mt-0")}
                />
              </label>
              <MultiCheck
                options={(() => {
                  const seen = new Set<string>();
                  const opts: { id: string; label: string }[] = [];
                  if (guildOwner) {
                    seen.add(guildOwner.id);
                    opts.push({ id: guildOwner.id, label: `${guildOwner.label} · proprietario` });
                  }
                  for (const id of dashboardUserIds) {
                    if (seen.has(id)) continue;
                    seen.add(id);
                    opts.push({ id, label: userLabels[id] || id });
                  }
                  for (const hit of userHits) {
                    if (seen.has(hit.id)) continue;
                    seen.add(hit.id);
                    opts.push({ id: hit.id, label: hit.label });
                  }
                  return opts;
                })()}
                selected={[
                  ...(guildOwner ? [guildOwner.id] : []),
                  ...dashboardUserIds.filter((id) => id !== guildOwner?.id),
                ]}
                lockedIds={guildOwner ? [guildOwner.id] : []}
                lockedLabel=""
                onChange={(ids) => {
                  if (rolesLocked || saving) return;
                  const next = ids.filter((id) => id !== guildOwner?.id);
                  for (const hit of userHits) {
                    if (next.includes(hit.id)) setUserLabels((cur) => ({ ...cur, [hit.id]: hit.label }));
                  }
                  setUserQuery("");
                  setUserHits([]);
                  void saveUsers(next);
                }}
                empty="Cerca qualcuno per aggiungerlo all’accesso dashboard."
              />
              {rolesLocked ? (
                <p className="mt-1 text-xs text-crema/50">Bloccato su questo server.</p>
              ) : (
                <p className="mt-1 text-xs text-crema/50">
                  Persone abilitate singolarmente (oltre ai ruoli). Il proprietario ha sempre accesso.
                </p>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          icon={<Download />}
          title="Backup e ripristino"
          description="Esporta o importa impostazioni, bacheca, comandi, partnership, ticket, community (benvenuto, messaggi, risposte, ruoli, log…) e moderazione."
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={configBusy} onClick={() => void downloadBackup()} className={dashSecondaryBtn}>
              <Download className="size-4" aria-hidden /> Scarica backup
            </button>
            <button
              type="button"
              disabled={configBusy}
              onClick={() => fileRef.current?.click()}
              className={dashPrimaryBtn}
            >
              <Upload className="size-4" aria-hidden /> Ripristina da file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void restoreBackup(e.target.files?.[0] || null)}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-crema/55">
            Non include ticket aperti, transcript, storia partnership né punti manager.
          </p>
        </Panel>
      </div>
    </div>
  );
}

const BOARD_CHANNEL_LABELS: {
  id: keyof BoardFeatures;
  channelKey: "quoteChannelId" | "repostChannelId" | "clipChannelId" | "skullChannelId";
  label: string;
}[] = [
  { id: "quote", channelKey: "quoteChannelId", label: "Canale Quote" },
  { id: "repost", channelKey: "repostChannelId", label: "Canale Repost" },
  { id: "clip", channelKey: "clipChannelId", label: "Canale Clip" },
  { id: "skull", channelKey: "skullChannelId", label: "Canale Skullboard" },
];

/** Bacheca: sezione a sé (funzioni, canali, trascrizione clip, stile quote). Si salva a ogni modifica. */
function BoardsSection({
  guildId,
  token,
  settings,
  pickers,
  error,
  canCustomizeQuoteStyle,
  onUpdated,
  onToast,
}: {
  guildId: string;
  token: string;
  settings: GuildSettings | null;
  pickers: SettingsPickers;
  error: string | null;
  canCustomizeQuoteStyle: boolean;
  onUpdated: (next: GuildSettings, pickers?: SettingsPickers) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [features, setFeatures] = useState<BoardFeatures>(settings?.boards.features ?? { quote: true, repost: true, clip: true, skull: true });
  const [boardsEnabled, setBoardsEnabled] = useState(settings?.boards.enabled === true);
  const [boardsMode, setBoardsMode] = useState<BoardsMode>(settings?.boards.mode ?? "shared");
  const [sharedChannelId, setSharedChannelId] = useState(settings?.boards.sharedChannelId ?? "");
  const [quoteChannelId, setQuoteChannelId] = useState(settings?.boards.quoteChannelId ?? "");
  const [repostChannelId, setRepostChannelId] = useState(settings?.boards.repostChannelId ?? "");
  const [clipChannelId, setClipChannelId] = useState(settings?.boards.clipChannelId ?? "");
  const [skullChannelId, setSkullChannelId] = useState(settings?.boards.skullChannelId ?? "");
  const [clipTranscription, setClipTranscription] = useState(settings?.boards.clipTranscription !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setFeatures(settings.boards.features);
    setBoardsEnabled(settings.boards.enabled === true);
    setBoardsMode(settings.boards.mode === "split" ? "split" : "shared");
    setSharedChannelId(settings.boards.sharedChannelId ?? "");
    setQuoteChannelId(settings.boards.quoteChannelId ?? "");
    setRepostChannelId(settings.boards.repostChannelId ?? "");
    setClipChannelId(settings.boards.clipChannelId ?? "");
    setSkullChannelId(settings.boards.skullChannelId ?? "");
    setClipTranscription(settings.boards.clipTranscription !== false);
  }, [settings]);

  const channelState = { sharedChannelId, quoteChannelId, repostChannelId, clipChannelId, skullChannelId } as const;
  const setChannelState = {
    sharedChannelId: setSharedChannelId,
    quoteChannelId: setQuoteChannelId,
    repostChannelId: setRepostChannelId,
    clipChannelId: setClipChannelId,
    skullChannelId: setSkullChannelId,
  } as const;

  const channelOptions = useMemo(
    () => [{ value: "", label: "— Nessuno —" }, ...pickers.textChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` }))],
    [pickers.textChannels],
  );

  const save = async (body: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    const res = await patchGuildSettings(token, guildId, body);
    setSaving(false);
    if (!res.ok) {
      onToast(res.message, true);
      return false;
    }
    onUpdated(res.data.settings, res.data.pickers);
    onToast(okMsg);
    return true;
  };

  if (error && !settings) {
    return <p className="rounded-xl bg-caramel/10 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-caramel/25">{error}</p>;
  }
  if (!settings) return null;

  const channelsLocked = settings.updatesLocked;
  const off = saving || !boardsEnabled;

  const saveBoardChannel = async (key: keyof typeof channelState, next: string, label: string) => {
    const prev = channelState[key];
    setChannelState[key](next);
    if (channelsLocked) return;
    const ok = await save({ boards: { [key]: next || null } }, `${label} salvato.`);
    if (!ok) setChannelState[key](prev);
  };

  return (
    <div className="space-y-4">
      {/* modulo: stato + interruttore principale */}
      <div className={cn("grid gap-4 transition-opacity xl:grid-cols-2", !boardsEnabled && "opacity-50")}>
        <Panel icon={<SlidersHorizontal />} title="Funzioni" description="Accendi solo quello che usate sul server.">
          <div className="divide-y divide-sand/[0.07]">
            {BOARD_FEATURES.map((feat) => (
              <SettingRow key={feat.id} title={feat.title} description={feat.hint}>
                <Toggle
                  size="sm"
                  checked={features[feat.id]}
                  disabled={off}
                  label={`Attiva ${feat.title}`}
                  onChange={async (next) => {
                    const nextFeats = { ...features, [feat.id]: next };
                    setFeatures(nextFeats);
                    const ok = await save({ boards: { enabled: boardsEnabled, features: nextFeats } }, "Funzioni bacheca salvate.");
                    if (!ok) setFeatures(settings.boards.features);
                  }}
                />
              </SettingRow>
            ))}
          </div>
        </Panel>

        <Panel
          icon={<Hash />}
          title="Dove si pubblica"
          description={channelsLocked ? "Sul server Vinili i contenuti vanno sulla Bacheca del sito." : "Un canale per tutto, oppure uno per funzione."}
          aside={channelsLocked ? <Lock className="size-3.5 text-crema/60" aria-label="Bloccato" /> : null}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Modalità canali">
              {(["shared", "split"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={boardsMode === mode}
                  disabled={off || channelsLocked}
                  onClick={async () => {
                    if (mode === boardsMode) return;
                    const prev = boardsMode;
                    setBoardsMode(mode);
                    if (channelsLocked) return;
                    const patch: Record<string, unknown> = { mode };
                    if (mode === "split" && sharedChannelId) {
                      /* parte dal canale unico: ogni funzione eredita quello finché non lo cambi */
                      if (!quoteChannelId) (setQuoteChannelId(sharedChannelId), (patch.quoteChannelId = sharedChannelId));
                      if (!repostChannelId) (setRepostChannelId(sharedChannelId), (patch.repostChannelId = sharedChannelId));
                      if (!clipChannelId) (setClipChannelId(sharedChannelId), (patch.clipChannelId = sharedChannelId));
                      if (!skullChannelId) (setSkullChannelId(sharedChannelId), (patch.skullChannelId = sharedChannelId));
                    }
                    const ok = await save({ boards: patch }, "Modalità bacheca salvata.");
                    if (!ok) {
                      setBoardsMode(prev);
                      setQuoteChannelId(settings.boards.quoteChannelId ?? "");
                      setRepostChannelId(settings.boards.repostChannelId ?? "");
                      setClipChannelId(settings.boards.clipChannelId ?? "");
                      setSkullChannelId(settings.boards.skullChannelId ?? "");
                    }
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed",
                    boardsMode === mode ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema",
                  )}
                >
                  {mode === "shared" ? "Un canale unico" : "Un canale per funzione"}
                </button>
              ))}
            </div>
            {boardsMode === "shared" ? (
              <Field label="Canale della bacheca">
                <Select
                  value={sharedChannelId}
                  disabled={off || channelsLocked}
                  onChange={(next) => void saveBoardChannel("sharedChannelId", next, "Canale bacheca")}
                  className={cn(fieldCls, "mt-1.5")}
                  options={channelOptions}
                />
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {BOARD_CHANNEL_LABELS.filter((row) => features[row.id]).map((row) => (
                  <Field key={row.channelKey} label={row.label}>
                    <Select
                      value={channelState[row.channelKey]}
                      disabled={off || channelsLocked}
                      onChange={(next) => void saveBoardChannel(row.channelKey, next, row.label)}
                      className={cn(fieldCls, "mt-1.5")}
                      options={channelOptions}
                    />
                  </Field>
                ))}
              </div>
            )}
            {features.clip ? (
              <div className="divide-y divide-sand/[0.07] border-t border-sand/[0.07] pt-3">
                <SettingRow title="Trascrizione delle clip" description="Scrive il testo automatico quando viene pubblicata una clip vocale.">
                  <Toggle
                    size="sm"
                    checked={clipTranscription}
                    disabled={off}
                    label="Trascrizione delle clip"
                    onChange={async (next) => {
                      setClipTranscription(next);
                      const ok = await save({ boards: { clipTranscription: next } }, next ? "Trascrizione clip attiva." : "Trascrizione clip disattivata.");
                      if (!ok) setClipTranscription(settings.boards.clipTranscription !== false);
                    }}
                  />
                </SettingRow>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      {features.quote ? (
        <Panel icon={<Pin />} title="Stile delle quote" description="Come appare l'immagine delle citazioni: anteprima e personalizzazione." aside={<PremiumBadge active={canCustomizeQuoteStyle} />}>
          <QuoteStyleEditor
            guildId={guildId}
            token={token}
            value={settings.boards.quoteStyle}
            disabled={off}
            locked={!canCustomizeQuoteStyle}
            saving={saving}
            onSave={async (next) => {
              if (!canCustomizeQuoteStyle) {
                onToast("Lo stile delle quote è riservato a Premium e ai server protetti.", true);
                return false;
              }
              return save({ boards: { quoteStyle: next } }, "Stile quote salvato.");
            }}
          />
        </Panel>
      ) : null}
    </div>
  );
}

function CommandsSection({
  guildId,
  token,
  commands,
  pickers,
  error,
  onUpdated,
  onToast,
}: {
  guildId: string;
  token: string;
  commands: CommandsPayload | null;
  pickers: SettingsPickers;
  error: string | null;
  onUpdated: (next: CommandsPayload) => void;
  onToast: (msg: string, err?: boolean) => void;
  /** Categoria dalla sidebar (senza chip orizzontali). */
  category?: string;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [aclName, setAclName] = useState<string | null>(null);

  const categories = useMemo(() => commands?.catalog ?? [], [commands]);

  /* tutte le categorie una sotto l'altra (la ricerca filtra dentro ognuna, quelle vuote spariscono) */
  const groups: CatalogCategory[] = useMemo(() => {
    if (!commands) return [];
    const q = query.trim().toLowerCase().replace(/^[/+!.]/, "");
    if (!q) return categories.filter((c) => c.commands.length);
    return categories
      .map((c) => ({
        ...c,
        commands: c.commands.filter(
          (x) =>
            x.name.toLowerCase().includes(q) ||
            String(x.displayName || "").toLowerCase().includes(q) ||
            String(x.description || "").toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.commands.length);
  }, [commands, categories, query]);

  /* permessi comuni di ogni categoria: se tutti i comandi hanno gli stessi li mostra, altrimenti parte vuoto */
  const categoryAcls = useMemo(() => {
    const out: Record<string, CommandAcl> = {};
    const acls = commands?.commands || {};
    const sig = (x?: CommandAcl) =>
      JSON.stringify([x?.roleMode || null, [...(x?.roleIds || [])].sort(), x?.channelMode || null, [...(x?.channelIds || [])].sort()]);
    for (const g of categories) {
      const first = acls[g.commands[0]?.name || ""];
      const same = g.commands.every((c) => sig(acls[c.name]) === sig(first));
      out[g.id] = same && first ? { ...first, enabled: true, boardFeatureLocked: false } : { enabled: true, roleMode: null, roleIds: [], channelMode: null, channelIds: [] };
    }
    return out;
  }, [commands, categories]);

  const totals = useMemo(() => {
    if (!commands) return { all: 0, on: 0 };
    const all = categories.flatMap((c) => c.commands);
    return { all: all.length, on: all.filter((c) => isCommandEnabled(commands.commands, c.name)).length };
  }, [commands, categories]);

  if (error && !commands) {
    return (
      <p className="rounded-xl bg-caramel/10 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-caramel/25">
        {error}
      </p>
    );
  }
  if (!commands) return null;

  const toggle = async (name: string, next: boolean, prev: CommandAcl | undefined) => {
    if (prev?.boardFeatureLocked) {
      onToast("Comando bloccato: attiva prima la funzione bacheca collegata.", true);
      return;
    }
    setBusy(name);
    const optimistic = {
      ...commands,
      commands: {
        ...commands.commands,
        [name]: { ...(prev || { enabled: true, roleMode: null, roleIds: [], channelMode: null, channelIds: [] }), enabled: next },
      },
    };
    onUpdated(optimistic);
    const res = await patchGuildCommandEnabled(token, guildId, name, next, prev);
    setBusy(null);
    if (!res.ok) {
      onUpdated(commands);
      onToast(res.message, true);
      return;
    }
    onUpdated(res.data);
  };

  const saveAcl = async (name: string, next: CommandAcl) => {
    setBusy(name);
    const res = await patchGuildCommandAcl(token, guildId, name, next);
    setBusy(null);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    onUpdated(res.data);
    onToast("Impostazioni comando salvate.");
  };

  /* stessi ruoli/canali per tutta la categoria: ogni comando resta acceso o spento com'era */
  const saveCategoryAcl = async (names: string[], next: CommandAcl, busyKey?: string) => {
    const payload: Record<string, CommandAcl | null> = {};
    for (const name of names) {
      if (commands.commands[name]?.boardFeatureLocked) continue;
      payload[name] = buildCommandAclBody({ ...next, enabled: isCommandEnabled(commands.commands, name) });
    }
    if (!Object.keys(payload).length) return;
    setBusy(busyKey || names[0] || "cat");
    const res = await patchGuildCommands(token, guildId, payload);
    setBusy(null);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    onUpdated(res.data);
    onToast(busyKey ? "Permessi applicati a tutta la categoria." : "Impostazioni comando salvate.");
  };

  /* accende o spegne tutti i comandi della categoria, tenendo i loro permessi */
  const toggleCategory = async (group: CatalogCategory, next: boolean) => {
    const payload: Record<string, CommandAcl | null> = {};
    for (const c of group.commands) {
      const prev = commands.commands[c.name];
      if (prev?.boardFeatureLocked) continue;
      payload[c.name] = buildCommandAclBody({ ...(prev || { enabled: true, roleMode: null, roleIds: [], channelMode: null, channelIds: [] }), enabled: next });
    }
    if (!Object.keys(payload).length) return;
    setBusy(`cat:${group.id}`);
    const res = await patchGuildCommands(token, guildId, payload);
    setBusy(null);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    onUpdated(res.data);
    onToast(next ? "Categoria accesa." : "Categoria spenta.");
  };


  const aclChannels = [...pickers.textChannels, ...pickers.voiceChannels];

  return (
    <div className="space-y-4">
      {commands.discordWarning ? (
        <p className="flex gap-2 rounded-xl bg-caramel/10 px-3 py-2.5 text-xs text-crema/75 ring-1 ring-caramel/25">
          <Info className="mt-0.5 size-3.5 shrink-0 text-caramel" aria-hidden />
          {commands.discordWarning}
        </p>
      ) : null}

      <Panel
        title="Comandi"
        description={
          <>
            Prefisso attuale <span className="rounded bg-espresso/70 px-1 font-mono text-crema/75">{commands.prefix}</span> ·{" "}
            <span className="tabular-nums">
              {totals.on} attivi su {totals.all}
            </span>
          </>
        }
      >
        <label className="relative block">
            <span className="sr-only">Cerca comando</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/50" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca un comando…"
              className={cn(fieldCls, "mt-0 pl-9 placeholder:text-crema/50")}
            />
          </label>
      </Panel>

      {groups.length === 0 ? (
        <p className="rounded-3xl bg-roast/60 px-4 py-10 text-center text-sm text-crema/60 ring-1 ring-sand/10">
          {query ? "Nessun comando con questo nome." : "Nessun comando disponibile."}
        </p>
      ) : null}

      {groups.map((group) => {
        const GroupIcon = sideTabIcon({ id: group.id, label: group.label });
        const groupOn = group.commands.filter((x) => isCommandEnabled(commands.commands, x.name)).length;
        const fullGroup = categories.find((c) => c.id === group.id) || group;
        const groupLabel = group.label.charAt(0).toUpperCase() + group.label.slice(1);
        const catOpen = aclName === `cat:${group.id}`;
        const catBusy = busy === `cat:${group.id}`;
        return (
      <section key={group.id} id={`spy-${group.id}`} data-spy={group.id} className="scroll-mt-24 overflow-hidden rounded-3xl bg-roast/70 ring-1 ring-sand/10">
        <header className={cn("border-b border-sand/[0.08] px-4 py-3.5 sm:px-5", catOpen && "bg-espresso/40")}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-caramel/20 to-ember/5 text-ember ring-1 ring-caramel/20">
              <GroupIcon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-crema">{groupLabel}</h3>
              <p className="text-xs tabular-nums text-crema/55">
                {groupOn} attivi su {fullGroup.commands.length}
              </p>
            </div>
            <button
              type="button"
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition",
                catOpen ? "bg-caramel/15 text-ember ring-caramel/30" : "text-crema/55 ring-sand/15 hover:text-crema hover:ring-sand/30",
              )}
              aria-expanded={catOpen}
              onClick={() => setAclName(catOpen ? null : `cat:${group.id}`)}
            >
              Permessi categoria
            </button>
            <Toggle
              checked={groupOn > 0}
              disabled={catBusy}
              label={`Attiva tutta la categoria ${groupLabel}`}
              onChange={(next) => void toggleCategory(fullGroup, next)}
            />
          </div>
          {catOpen ? (
            <div className="mt-3">
              <p className="text-xs leading-relaxed text-crema/60">
                Ruoli e canali scelti qui valgono per tutti i {fullGroup.commands.length} comandi di {groupLabel}. Chi è acceso resta acceso; dopo puoi
                cambiare il singolo comando.
              </p>
              <CommandAclEditor
                acl={categoryAcls[group.id]!}
                roles={pickers.roles}
                channels={aclChannels}
                busy={catBusy}
                onSave={(next) => void saveCategoryAcl(fullGroup.commands.map((c) => c.name), next, `cat:${group.id}`)}
              />
            </div>
          ) : null}
        </header>
        <ul className="divide-y divide-sand/[0.07]">
          {group.commands.map((cmd) => {
              const acl = commands.commands[cmd.name];
              const on = isCommandEnabled(commands.commands, cmd.name);
              const locked = acl?.boardFeatureLocked === true;
              const category = categories.find((c) => c.commands.some((x) => x.name === cmd.name));
              const categoryNames = category?.commands.map((x) => x.name) || [cmd.name];
              const restricted = Boolean(acl && ((acl.roleIds?.length ?? 0) > 0 || (acl.channelIds?.length ?? 0) > 0));
              /* menu contestuali (tasto destro su utente/messaggio): niente "/" e badge proprio */
              const context = cmd.kind === "slash" && (cmd.slashType === "user" || cmd.slashType === "message");
              const baseName = String(cmd.displayName || cmd.name).replace(/^\//, "");
              const shownName = context ? baseName : `${cmd.kind === "slash" ? "/" : commands.prefix}${baseName}`;
              const badge = context ? (cmd.slashType === "user" ? "menu utente" : "menu messaggio") : cmd.kind === "slash" ? "slash" : "prefix";
              const openAcl = aclName === cmd.name;
              return (
                <li key={cmd.name} className={cn("px-4 py-3 transition-colors sm:px-5", openAcl && "bg-espresso/40")}>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "hidden size-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold sm:flex",
                        on ? "bg-caramel/12 text-ember" : "bg-crema/[0.04] text-crema/50",
                      )}
                      aria-hidden
                    >
                      {context ? <MousePointerClick className="size-4" /> : cmd.kind === "slash" ? "/" : commands.prefix.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-sm font-semibold", !context && "font-mono", on ? "text-crema" : "text-crema/60")}>
                          {shownName}
                        </span>
                        <span className="rounded bg-crema/[0.06] px-1.5 py-px text-[0.58rem] font-semibold uppercase tracking-wider text-crema/60">
                          {badge}
                        </span>
                        {restricted ? (
                          <span className="rounded bg-caramel/12 px-1.5 py-px text-[0.58rem] font-semibold uppercase tracking-wider text-ember/90">
                            limitato
                          </span>
                        ) : null}
                      </div>
                      {cmd.description ? <p className="mt-0.5 truncate text-xs text-crema/60">{cmd.description}</p> : null}
                      {locked ? <p className="mt-0.5 text-[0.68rem] text-caramel/85">Bloccato da funzione bacheca</p> : null}
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition",
                        openAcl ? "bg-caramel/15 text-ember ring-caramel/30" : "text-crema/55 ring-sand/15 hover:text-crema hover:ring-sand/30",
                      )}
                      aria-expanded={openAcl}
                      onClick={() => setAclName(openAcl ? null : cmd.name)}
                    >
                      Permessi
                    </button>
                    <Toggle checked={on} disabled={busy === cmd.name || locked} label={`Attiva ${cmd.name}`} onChange={(next) => toggle(cmd.name, next, acl)} />
                  </div>
                  {openAcl ? (
                    <div className="mt-3">
                      <CommandAclEditor
                        acl={acl || { enabled: on, roleMode: null, roleIds: [], channelMode: null, channelIds: [] }}
                        roles={pickers.roles}
                        channels={aclChannels}
                        busy={busy === cmd.name}
                        categoryNames={categoryNames}
                        onSave={(next) => saveAcl(cmd.name, next)}
                        onSaveCategory={(next) => saveCategoryAcl(categoryNames, next)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
        </ul>
      </section>
        );
      })}
    </div>
  );
}

/** Pannello server: impostazioni, comandi con ACL, ticket e partnership. */
export function GuildPanel() {
  const { ready, token, login, user } = useAuth();
  const userId = user?.id || null;
  const [gate, setGate] = useState<Gate>("loading");
  const [guildId, setGuildId] = useState("");
  const [section, setSectionState] = useState<Section>("moduli");
  const [moduleTab, setModuleTabState] = useState<string | null>(null);
  const [overview, setOverview] = useState<GuildOverview | null>(null);
  const [settings, setSettings] = useState<GuildSettings | null>(null);
  const [pickers, setPickers] = useState<SettingsPickers>(EMPTY_SETTINGS_PICKERS);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [commands, setCommands] = useState<CommandsPayload | null>(null);
  const [commandsError, setCommandsError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketsSummary | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [premiumActive, setPremiumActive] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
  }, []);

  /* sezione (+ tab modulo) anche nell'indirizzo (?s=…&t=…): ricaricando si riapre la stessa */
  const writeNavUrl = useCallback((nextSection: Section, nextTab: string | null) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("s", nextSection);
      if (nextTab) url.searchParams.set("t", nextTab);
      else url.searchParams.delete("t");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const setSection = useCallback(
    async (next: Section) => {
      if (!(await confirmLeaveUnsaved())) return;
      const nextTab = defaultModuleTab(next);
      /* transizione: il clic risponde subito e la sezione nuova si disegna senza bloccare la pagina */
      startTransition(() => {
        setSectionState(next);
        setModuleTabState(nextTab);
      });
      writeNavUrl(next, nextTab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [writeNavUrl],
  );

  const setModuleTab = useCallback(
    async (nextSection: Section, tab: string) => {
      if (!(await confirmLeaveUnsaved())) return;
      const safe = sanitizeModuleTab(nextSection, tab);
      startTransition(() => {
        setSectionState(nextSection);
        setModuleTabState(safe);
      });
      writeNavUrl(nextSection, safe);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [writeNavUrl],
  );

  useEffect(() => {
    try {
      if (String(new URLSearchParams(window.location.search).get("s") || "") === "classifica") {
        window.location.replace(page("/classifiche/?scope=bots"));
        return;
      }
    } catch {
      /* ignore */
    }
    const fromUrl = readSectionFromSearch(window.location.search);
    if (fromUrl) {
      setSectionState(fromUrl);
      setModuleTabState(readModuleTabFromSearch(window.location.search, fromUrl));
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!ready) return;

    const fromUrl = readGuildIdFromSearch(typeof window !== "undefined" ? window.location.search : "");
    const fromLast = readLastGuildId();
    const id = fromUrl || fromLast;

    if (!token) {
      setGate("login");
      return;
    }
    if (!isGuildId(id)) {
      setGate("noid");
      setGuildId("");
      return;
    }

    if (fromUrl) selectGuild(fromUrl);
    else if (fromLast && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("id", fromLast);
      window.history.replaceState({}, "", url.toString());
    }

    setGuildId(id);
    let cancelled = false;

    /* dati del pannello → stato della pagina (dal bot o dalla memoria della scheda) */
    const applyBundle = (d: GuildPanelBundle) => {
      setOverview(d.overview);
      /* ticket del principale: si gestiscono dal sito, la sezione non si apre nemmeno da un link diretto */
      if (d.overview?.isMainGuild) setSectionState((cur) => (cur === "tickets" ? "moduli" : cur));
      /* moderazione e bacheca: solo sul principale, sugli altri server non si aprono */
      else setSectionState((cur) => (cur === "moderation" || cur === "bacheca" ? "moduli" : cur));
      setSettings(d.settings);
      setPickers(d.settingsPickers);
      setSettingsError(d.settingsError);
      setCommands(d.commands);
      setCommandsError(d.commandsError);
      setTickets(d.tickets);
      setTicketsError(d.ticketsError);
      setPremiumActive(d.premiumActive);
      setPremiumUntil(d.premiumUntil ?? null);
    };

    (async () => {
      setError("");
      /* già aperto da poco in questa scheda: pagina subito, poi si aggiorna in silenzio */
      const cached = readGuildPanelCache(userId, id);
      if (cached) {
        applyBundle(cached);
        setGate("ready");
      } else {
        setGate("loading");
      }

      /* accesso e pannello partono insieme (il pannello si scarta se l'accesso è negato) */
      const panelPromise = loadGuildPanel(token, id);
      panelPromise.catch(() => null);
      const access = await checkDashboardAccess(token);
      if (cancelled) return;
      if (!access.ok) {
        if (access.status === 401) {
          setGate("login");
          return;
        }
        setError(access.message);
        setGate("ready");
        return;
      }
      if (access.access.blacklisted || !access.access.allowed) {
        writeGuildPanelCache(userId, id, null);
        setGate("locked");
        return;
      }

      const panel = await panelPromise;
      if (cancelled) return;
      if (!panel.ok) {
        if (panel.status === 401) {
          setGate("login");
          return;
        }
        if (panel.status === 403) {
          writeGuildPanelCache(userId, id, null);
          setGate("locked");
          return;
        }
        /* aggiornamento fallito ma la pagina c'è già (dalla memoria): resta com'è */
        if (!cached) setError(panel.message);
        setGate("ready");
        return;
      }

      applyBundle(panel.data);
      writeGuildPanelCache(userId, id, panel.data);
      setGate("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, token, userId]);

  /* moduli spenti su questo server: nel menu vanno nel gruppo "Disattivati" (si aggiorna cambiando sezione) */
  const [modulesOff, setModulesOff] = useState<GuildSectionId[]>([]);
  const [firstSetupClosed, setFirstSetupClosed] = useState(false);
  /* setup partnership in corso: le altre schede della Partnership restano chiuse */
  const [partnerSetupLock, setPartnerSetupLock] = useState(false);
  /* interruttori dei moduli (stessi della pagina Moduli) */
  const [moduleStates, setModuleStates] = useState<Record<string, { on: boolean; locked: boolean }>>({});
  const [moduleBusy, setModuleBusy] = useState(false);
  /* cambia quando si accende/spegne un modulo: il menu si riaggiorna */
  const [modulesRev, setModulesRev] = useState(0);
  useEffect(() => {
    if (!guildId || !token || gate !== "ready") return;
    let alive = true;
    void communityApi.modulesStatus(token, guildId).then((r) => {
      if (alive && r.ok) setModulesOff((r.data.off || []) as GuildSectionId[]);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token, gate, section, modulesRev]);
  useEffect(() => {
    if (!guildId || !token || gate !== "ready") return;
    let alive = true;
    void communityApi.listModules(token, guildId).then((r) => {
      if (alive && r.ok) setModuleStates(Object.fromEntries(r.data.modules.map((m) => [m.id, { on: m.on, locked: m.locked }])));
    });
    return () => {
      alive = false;
    };
  }, [guildId, token, gate, modulesRev]);
  const toggleModule = async (id: string, next: boolean) => {
    if (!guildId || !token) return;
    setModuleBusy(true);
    setModuleStates((cur) => ({ ...cur, [id]: { on: next, locked: cur[id]?.locked === true } }));
    /* sidebar subito: non aspettare modulesStatus */
    setModulesOff((cur) => {
      const sid = id as GuildSectionId;
      if (next) return cur.filter((x) => x !== sid);
      return cur.includes(sid) ? cur : [...cur, sid];
    });
    const r = await communityApi.setModule(token, guildId, id, next);
    setModuleBusy(false);
    if (!r.ok) {
      setModuleStates((cur) => ({ ...cur, [id]: { on: !next, locked: cur[id]?.locked === true } }));
      setModulesOff((cur) => {
        const sid = id as GuildSectionId;
        if (!next) return cur.filter((x) => x !== sid);
        return cur.includes(sid) ? cur : [...cur, sid];
      });
      return showToast(r.message, true);
    }
    setModuleStates(Object.fromEntries(r.data.modules.map((m) => [m.id, { on: m.on, locked: m.locked }])));
    setModulesOff(r.data.modules.filter((m) => !m.on && !m.locked).map((m) => m.id as GuildSectionId));
    /* bacheca: lo stesso interruttore delle sue impostazioni */
    if (id === "bacheca") setSettings((cur) => (cur ? { ...cur, boards: { ...cur.boards, enabled: next } } : cur));
    showToast(next ? "Modulo acceso." : "Modulo spento: comandi e azioni automatiche fermi.");
    setModulesRev((n) => n + 1);
  };
  /* la Bacheca ha già la sua barra; i moduli bloccati (ticket del principale) non hanno interruttore */
  const moduleState = moduleStates[section];
  const showModuleBar = Boolean(moduleState && !moduleState.locked);
  const moduleOff = showModuleBar && moduleState?.on === false;
  /* "Disattivati": modulesStatus + stato locale (così non resta “attivo” se lo status arriva in ritardo) */
  const navOff: GuildSectionId[] = useMemo(() => {
    const set = new Set<string>(modulesOff);
    for (const [id, st] of Object.entries(moduleStates)) {
      if (st.locked) continue;
      if (st.on === false) set.add(id);
      else if (st.on === true) set.delete(id);
    }
    return [...set] as GuildSectionId[];
  }, [modulesOff, moduleStates]);

  const sectionMeta = findGuildSection(section);
  const commandTabsForNav = useMemo(() => {
    const cats = commands?.catalog || [];
    if (!cats.length) return COMMAND_SECTION_TABS.filter((t) => t.id !== "all");
    return cats
      .filter((c) => c.commands.length)
      .map((c) => ({
        id: c.id,
        label: c.label.charAt(0).toUpperCase() + c.label.slice(1),
      }));
  }, [commands]);
  /* Comandi e Registro: le categorie si scelgono dentro la pagina, in un elenco a sinistra */
  const inPageTabs: readonly { id: string; label: string }[] | null =
    section === "commands" ? commandTabsForNav : section === "registro" ? REGISTRO_AREAS : null;
  const switchTabs: readonly { id: string; label: string }[] | null =
    section === "tickets"
      ? overview?.isMainGuild
        ? null
        : TICKET_MODULE_TABS
      : section === "moderation"
        ? MODERATION_MODULE_TABS
        : section === "partnership"
          ? PARTNERSHIP_MODULE_TABS
          : section === "benvenuto"
            ? ANNUNCI_MODULE_TABS
            : section === "live"
              ? LIVE_MODULE_TABS
              : null;
  const switchActive = moduleTab || defaultModuleTab(section) || "";
  const withSwitchTabs = (node: React.ReactNode) =>
    switchTabs ? (
      <SideTabsLayout
        label={`Sezioni ${sectionMeta.label}`}
        tabs={switchTabs}
        active={section === "partnership" && partnerSetupLock ? "setup" : switchActive}
        onSelect={(t) => setModuleTab(section, t)}
        lockedIds={section === "partnership" && partnerSetupLock ? switchTabs.filter((t) => t.id !== "setup").map((t) => t.id) : undefined}
        lockedReason="Completa prima il setup della partnership"
      >
        {node}
      </SideTabsLayout>
    ) : (
      node
    );
  const activeSectionTabs = inPageTabs || switchTabs ? [] : sectionTabs(section);
  const labelTabs = inPageTabs || switchTabs || activeSectionTabs;
  const activeTabLabel =
    !inPageTabs && labelTabs.length
      ? labelTabs.find((t) => t.id === (moduleTab || defaultModuleTab(section) || ""))?.label || null
      : null;
  const showSections = gate === "ready" && overview?.botPresent;
  const heading = activeTabLabel ? `${sectionMeta.label} · ${activeTabLabel}` : sectionMeta.label;
  const pathCrumbs = showSections
    ? ([sectionMeta.label, activeTabLabel].filter(Boolean) as string[])
    : ["Pannello"];

  return (
    <DashboardShell
      /* con le sezioni aperte il titolo lo mostra già la testata della pagina: niente doppione sopra */
      bare={Boolean(showSections)}
      title={showSections ? heading : "Pannello server"}
      crumb={showSections ? heading : "Pannello"}
      crumbs={pathCrumbs}
      lead={showSections ? SECTION_LEAD[section] : "Impostazioni, comandi, ticket e partnership del server selezionato."}
      guild={overview ? { id: overview.id, name: overview.name, iconUrl: overview.iconUrl } : null}
      guildNav={
        showSections
          ? {
              active: section,
              onSelect: setSection,
              moduleTab,
              onModuleTab: setModuleTab,
              badges: { tickets: tickets?.overview.unclaimed || undefined },
              off: navOff,
              /* moderazione e bacheca solo sul server principale */
              hidden: overview && !overview.isMainGuild ? ["moderation", "bacheca"] : undefined,
              /* sul principale i ticket si gestiscono dal sito, non dalla dashboard */
              locked: overview?.isMainGuild ? { tickets: "Sul server principale i ticket si gestiscono dal sito, non da qui." } : undefined,
            }
          : undefined
      }
    >
      <AnimatePresence mode="wait">
        {(gate === "loading" || !ready) && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
            role="status"
            aria-label="Caricamento pannello"
          >
            <div className="h-56 animate-pulse rounded-2xl bg-roast/70 ring-1 ring-sand/10" />
            <div className="h-64 animate-pulse rounded-2xl bg-roast/60 ring-1 ring-sand/10" />
          </motion.div>
        )}

        {gate === "login" && (
          <motion.div key="login" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <StateCard
              icon={<Server />}
              title="Accedi per continuare"
              actions={
                <>
                  <button type="button" onClick={login} className={discordBtn}>
                    <LogIn className="size-4" /> Accedi con Discord
                  </button>
                  <SmartLink href={dashHref("/dashboard/server/")} className={dashSecondaryBtn}>
                    Torna ai server
                  </SmartLink>
                </>
              }
            >
              Per gestire un server serve il login Discord.
            </StateCard>
          </motion.div>
        )}

        {gate === "locked" && (
          <motion.div key="locked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <StateCard
              icon={<Lock />}
              title="Accesso non disponibile"
              actions={
                <SmartLink href={dashHref("/dashboard/server/")} className={dashSecondaryBtn}>
                  Torna ai server
                </SmartLink>
              }
            >
              Questa sezione non è disponibile con il tuo account.
            </StateCard>
          </motion.div>
        )}

        {gate === "noid" && (
          <motion.div key="noid" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <StateCard
              icon={<LayoutGrid />}
              title="Nessun server selezionato"
              actions={
                <SmartLink href={dashHref("/dashboard/server/")} className={dashPrimaryBtn}>
                  Scegli un server
                </SmartLink>
              }
            >
              Scegli un server dalla home dashboard per aprire il pannello.
            </StateCard>
          </motion.div>
        )}

        {gate === "ready" && overview && (
          <motion.div key="ready" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {error ? (
              <p className="rounded-xl bg-[#a83a2c]/15 px-3 py-2 text-sm text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30">
                {error}
              </p>
            ) : null}

            {section === "settings" || !showSections ? (
              <GuildHero
                guild={overview}
                premiumActive={premiumActive}
                prefix={overview.botPresent ? settings?.prefix ?? commands?.prefix ?? null : null}
              />
            ) : null}

            {/* primo avvio: finestra a schermo intero (prefisso, novità, lingua, fuso) */}
            {overview.botPresent && !overview.isMainGuild && guildId && token && settings && !firstSetupClosed && !firstSetupDone(guildId, settings) ? (
              <FirstSetupModal
                guildId={guildId}
                token={token}
                guildName={overview.name}
                settings={settings}
                pickers={pickers}
                onToast={showToast}
                onDone={(next, nextPickers) => {
                  setSettings(next);
                  if (nextPickers) setPickers(nextPickers);
                  setFirstSetupClosed(true);
                }}
              />
            ) : null}

            {!overview.botPresent ? (
              <StateCard
                icon={<Plus />}
                title="Aggiungi Vinili al server"
                actions={
                  overview.inviteUrl ? (
                    <a href={overview.inviteUrl} target="_blank" rel="noreferrer" className={discordBtn}>
                      <Plus className="size-4" aria-hidden /> Invita il bot
                    </a>
                  ) : null
                }
              >
                {settingsError || "Il bot non è presente in questo server."}
              </StateCard>
            ) : (
              <>
                {/* telefono/tablet: sotto-schede della sezione (le sezioni stanno nel menu laterale) */}
                <div className="space-y-2 lg:hidden">
                  {activeSectionTabs.length > 0 ? (
                    <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-0.5" role="tablist" aria-label={`Sezioni ${sectionMeta.label}`}>
                      {activeSectionTabs.map((t) => {
                        const on = moduleTab === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => setModuleTab(section, t.id)}
                            className={cn(
                              "inline-flex shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                              on ? "bg-caramel/12 text-crema ring-1 ring-caramel/25" : "text-crema/50 ring-1 ring-sand/10 hover:text-crema/80",
                            )}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {/* primo avvio guidato: compare finché manca un passo (si può nascondere) */}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={section}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-5"
                  >
                    {SECTION_HERO[section] ? (
                      <PageHero
                        icon={sectionMeta.icon}
                        title={activeTabLabel && !inPageTabs ? `${sectionMeta.label} · ${activeTabLabel}` : sectionMeta.label}
                        text={SECTION_HERO[section]!.text}
                        accent={SECTION_HERO[section]!.accent}
                        on={showModuleBar ? moduleState?.on === true : undefined}
                        onToggle={showModuleBar ? (next) => { if (!moduleBusy) void toggleModule(section, next); } : undefined}
                        toggleLabel={`${moduleState?.on ? "Spegni" : "Accendi"} ${sectionMeta.label}`}
                      />
                    ) : null}
                    <DraftTestContext.Provider value={guildId && token ? { guildId, token, onToast: showToast } : null}>
                    <div inert={moduleOff} aria-disabled={moduleOff} className={cn("space-y-5 transition-opacity", moduleOff && "pointer-events-none select-none opacity-45")}>
                    {section === "settings" && guildId && token ? (
                      <SettingsSection
                        guildId={guildId}
                        token={token}
                        settings={settings}
                        pickers={pickers}
                        error={settingsError}
                        canCustomize={premiumActive || overview.isMainGuild || overview.isProtectedGuild}
                        premiumActive={premiumActive}
                        premiumUntil={premiumUntil}
                        isProtectedGuild={overview.isProtectedGuild || overview.isMainGuild}
                        onUpdated={(next, nextPickers) => {
                          setSettings(next);
                          if (nextPickers) setPickers(nextPickers);
                          setSettingsError(null);
                        }}
                        onToast={showToast}
                      />
                    ) : null}
                    {section === "commands" && guildId && token ? (
                      <SideTabsLayout label="Categorie dei comandi" tabs={commandTabsForNav}>
                      <CommandsSection
                        guildId={guildId}
                        token={token}
                        commands={commands}
                        pickers={pickers}
                        error={commandsError}
                        onUpdated={(next) => {
                          setCommands(next);
                          setCommandsError(null);
                        }}
                        onToast={showToast}
                      />
                      </SideTabsLayout>
                    ) : null}
                    {section === "bacheca" && overview.isMainGuild && guildId && token ? (
                      <BoardsSection
                        guildId={guildId}
                        token={token}
                        settings={settings}
                        pickers={pickers}
                        error={settingsError}
                        canCustomizeQuoteStyle={premiumActive || overview.isMainGuild || overview.isProtectedGuild}
                        onUpdated={(next, nextPickers) => {
                          setSettings(next);
                          if (nextPickers) setPickers(nextPickers);
                          setSettingsError(null);
                        }}
                        onToast={showToast}
                      />
                    ) : null}
                    {section === "tickets" && guildId && token ? (
                      overview.isMainGuild ? (
                        <TicketDesk
                          guildId={guildId}
                          token={token}
                          summary={tickets}
                          error={ticketsError}
                          isMainGuild
                          tab="overview"
                          onSummary={(next) => {
                            setTickets(next);
                            setTicketsError(null);
                          }}
                          onToast={showToast}
                        />
                      ) : (
                        withSwitchTabs(
                          <TicketDesk
                            guildId={guildId}
                            token={token}
                            summary={tickets}
                            error={ticketsError}
                            isMainGuild={false}
                            tab={moduleTab && isTicketModuleTab(moduleTab) ? moduleTab : "overview"}
                            onSummary={(next) => {
                              setTickets(next);
                              setTicketsError(null);
                            }}
                            onToast={showToast}
                          />,
                        )
                      )
                    ) : null}
                    {section === "moderation" && overview.isMainGuild && guildId && token && moduleTab === "log" ? (
                      withSwitchTabs(
                      <Panel>
                        <ServerLogsPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                      )
                    ) : null}
                    {section === "moderation" && overview.isMainGuild && guildId && token && moduleTab !== "log" ? (
                      withSwitchTabs(
                      <ModerationPanel
                        guildId={guildId}
                        token={token}
                        tab={moduleTab && isModerationModuleTab(moduleTab) ? moduleTab : "overview"}
                        onToast={showToast}
                      />
                      )
                    ) : null}
                    {section === "partnership" && guildId && token ? (
                      withSwitchTabs(
                      <Panel>
                        <PartnershipPanel
                          guildId={guildId}
                          token={token}
                          onToast={showToast}
                          tab={moduleTab && isPartnershipModuleTab(moduleTab) ? moduleTab : "setup"}
                          onSetupLock={setPartnerSetupLock}
                        />
                      </Panel>
                      )
                    ) : null}

                    {section === "moduli" && guildId && token ? (
                      <Panel>
                        <ModulesPanel
                          guildId={guildId}
                          token={token}
                          hideIds={overview.isMainGuild ? undefined : ["moderation", "bacheca"]}
                          onToast={showToast}
                          onOpen={(s) => void setSection(s)}
                          onChanged={(mods) => {
                            setModuleStates(Object.fromEntries(mods.map((m) => [m.id, { on: m.on, locked: m.locked }])));
                            setModulesOff(mods.filter((m) => !m.on && !m.locked).map((m) => m.id as GuildSectionId));
                            setModulesRev((n) => n + 1);
                          }}
                        />
                      </Panel>
                    ) : null}

                    {section === "stats" && guildId && token ? (
                      <Panel>
                        <StatsPanel guildId={guildId} token={token} />
                      </Panel>
                    ) : null}

                    {section === "messaggi" && guildId && token ? (
                      <Panel>
                        <MessagesPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "comandipers" && guildId && token ? (
                      <Panel>
                        <CustomCommandsPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "ruoli" && guildId && token ? (
                      <Panel>
                        <RolePanelsPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "benvenuto" && guildId && token ? (
                      withSwitchTabs(
                      <Panel>
                        {moduleTab === "boost" ||
                        moduleTab === "ruolinuovi" ||
                        moduleTab === "clantag" ||
                        moduleTab === "status" ||
                        moduleTab === "inviti" ||
                        moduleTab === "anzianita" ? (
                          <AnnouncementsPanel
                            key={moduleTab}
                            guildId={guildId}
                            token={token}
                            onToast={showToast}
                            tab={moduleTab as "boost" | "ruolinuovi" | "clantag" | "status" | "inviti" | "anzianita"}
                          />
                        ) : (
                          <WelcomePanel
                            guildId={guildId}
                            token={token}
                            onToast={showToast}
                            tab={moduleTab === "goodbye" ? "goodbye" : "welcome"}
                          />
                        )}
                      </Panel>
                      )
                    ) : null}

                    {section === "risposte" && guildId && token ? (
                      <Panel>
                        <AutoRespondersPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "contatori" && guildId && token ? (
                      <Panel>
                        <CountersPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "bump" && guildId && token ? (
                      <Panel>
                        <BumpPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "voti" && guildId && token ? (
                      <Panel>
                        <VotesPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "giveaway" && guildId && token ? (
                      <Panel>
                        <GiveawaysPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "sondaggi" && guildId && token ? (
                      <Panel>
                        <PollsPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "compleanni" && guildId && token ? (
                      <Panel>
                        <BirthdaysPanel guildId={guildId} token={token} onToast={showToast} />
                      </Panel>
                    ) : null}

                    {section === "live" && guildId && token ? (
                      withSwitchTabs(
                        <Panel>
                          <LiveVideoPanel
                            key={moduleTab}
                            guildId={guildId}
                            token={token}
                            onToast={showToast}
                            tab={moduleTab && isLiveModuleTab(moduleTab) ? moduleTab : "twitch"}
                          />
                        </Panel>,
                      )
                    ) : null}

                    {section === "salute" && guildId && token ? (
                      <Panel>
                        <HealthPanel guildId={guildId} token={token} />
                      </Panel>
                    ) : null}

                    {section === "registro" && guildId && token ? (
                      <SideTabsLayout label="Aree del registro" tabs={REGISTRO_AREAS}>
                        <div className="space-y-5">
                          <p className="text-sm text-crema/65">
                            Ogni modifica fatta dalla dashboard su questo server, con chi l&apos;ha fatta, divisa per area. Clicca una riga per i dettagli.
                          </p>
                          {REGISTRO_AREAS.map((a) => (
                            <AuditPanel key={a.id} guildId={guildId} token={token} area={a.id} title={a.label} icon={sideTabIcon(a)} />
                          ))}
                        </div>
                      </SideTabsLayout>
                    ) : null}

                    </div>
                    </DraftTestContext.Provider>
                  </motion.div>
                </AnimatePresence>
                <GlobalSaveBar />
              </>
            )}
          </motion.div>
        )}

        {gate === "ready" && !overview && error ? (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <StateCard
              icon={<Info />}
              title="Pannello non disponibile"
              actions={
                <SmartLink href={dashHref("/dashboard/server/")} className={dashSecondaryBtn}>
                  Torna ai server
                </SmartLink>
              }
            >
              {error}
            </StateCard>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DashToast toast={toast} />
    </DashboardShell>
  );
}
