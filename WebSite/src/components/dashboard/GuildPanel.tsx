"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  Camera,
  CalendarDays,
  CheckCircle2,
  Circle,
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
  X,
} from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { confirmDialog } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
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
import { DashboardShell, type GuildSectionId } from "./DashboardShell";
import {
  COMMAND_SECTION_TABS,
  GUILD_MODULE_SECTIONS,
  GUILD_SERVER_SECTIONS,
  defaultModuleTab,
  findGuildSection,
  isClassificaSectionTab,
  isCommandSectionTab,
  isGuildSection,
  isModerationModuleTab,
  isPartnershipModuleTab,
  isRegistroModuleTab,
  isAnnunciModuleTab,
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
  StatTile,
  Toggle,
  dashPrimaryBtn,
  dashSecondaryBtn,
  discordBtn,
  miniBtn as miniBtnCls,
} from "./guild/bits";

const CommandAclEditor = dynamic(() => import("./guild/CommandAcl").then((m) => m.CommandAcl), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});
const SetupWizard = dynamic(() => import("./guild/SetupWizard").then((m) => m.SetupWizard), { ssr: false });

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

const HealthPanel = dynamic(() => import("./guild/HealthPanel").then((m) => m.HealthPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const AuditPanel = dynamic(() => import("./guild/AuditPanel").then((m) => m.AuditPanel), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-crema/6" />,
});

const LeaderboardPanel = dynamic(() => import("./guild/LeaderboardPanel").then((m) => m.LeaderboardPanel), {
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
  bacheca: "Quote, repost, clip e skullboard: funzioni, canali e stile delle citazioni.",
  commands: "Attiva o disattiva i comandi e scegli chi può usarli e dove.",
  tickets: "Ticket aperti, pannelli, moduli, team e blacklist.",
  moderation: "Ban, mute, warn, mod logs, ricorsi, punizioni automatiche e casi.",
  partnership: "Configurazione e gestione delle partnership del server.",
  classifica: "Classifiche partnership: server, partner manager e ingressi.",
  stats: "Ticket e partnership del server: andamento, voti, staff più attivo.",
  registro: "Chi ha cambiato cosa dalla dashboard, e quando.",
  salute: "Cosa non funziona nel server e come sistemarlo: permessi del bot, canali e ruoli.",
  messaggi: "Annunci e regolamenti con embed e pulsanti: pubblicali subito o a un'ora precisa.",
  comandipers: "Comandi con una risposta fissa, tipo +regole o +ip, creati da te.",
  ruoli: "Pannelli con pulsanti o menu per prendersi i ruoli da soli.",
  benvenuto: "Benvenuto, addio, messaggio privato a chi entra e ruoli automatici.",
};

const fieldCls =
  "w-full rounded-lg bg-espresso/70 px-3 py-2 text-sm text-crema ring-1 ring-sand/15 outline-none transition focus:ring-caramel/45 disabled:opacity-50";

function readSectionFromSearch(search: string): Section | null {
  try {
    const v = String(new URLSearchParams(search).get("s") || "");
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
  if (section === "classifica") return isClassificaSectionTab(v) ? v : "servers";
  if (section === "registro") return isRegistroModuleTab(v) ? v : "all";
  if (section === "benvenuto") return isAnnunciModuleTab(v) ? v : "welcome";
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
function setupDismissKey(guildId: string) {
  return `dash-setup-dismissed:${guildId}`;
}

function SetupGuideBanner({
  overview,
  ticketsEnabled,
  onGo,
}: {
  overview: GuildOverview;
  ticketsEnabled: boolean;
  onGo: (section: Section) => void;
}) {
  const setup = overview.setup;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(setupDismissKey(overview.id)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [overview.id]);

  if (!setup || setup.complete || dismissed || overview.isMainGuild) return null;

  const steps = [
    {
      id: "partnership-channel" as const,
      done: Boolean(setup.partnershipsChannelId),
      label: "Canale partnership",
      section: "partnership" as Section,
    },
    {
      id: "partnership-role" as const,
      done: Boolean(setup.partnerManagerRoleId),
      label: "Ruolo partner manager",
      section: "partnership" as Section,
    },
    {
      id: "tickets" as const,
      done: ticketsEnabled,
      label: "Attiva i ticket (opzionale)",
      section: "tickets" as Section,
      optional: true,
    },
  ];

  const dismiss = () => {
    try {
      localStorage.setItem(setupDismissKey(overview.id), "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-caramel/[0.14] via-roast/85 to-roast/85 p-4 ring-1 ring-caramel/25 sm:p-5">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-lg p-1.5 text-crema/50 transition hover:bg-crema/10 hover:text-crema"
        aria-label="Nascondi guida"
      >
        <X className="size-4" />
      </button>
      <p className="pr-8 text-sm font-semibold text-crema">Configurazione iniziale</p>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-crema/65">
        Completa questi passaggi per far funzionare partnership (e, se vuoi, i ticket) su questo server.
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onGo(step.section)}
              className="flex w-full items-center gap-2.5 rounded-xl bg-espresso/40 px-3 py-2 text-left text-sm text-crema/85 ring-1 ring-sand/10 transition hover:bg-espresso/55"
            >
              {step.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-[#9fd0a8]" aria-hidden />
              ) : (
                <Circle className="size-4 shrink-0 text-crema/40" aria-hidden />
              )}
              <span className="min-w-0 flex-1 font-medium">
                {step.label}
                {step.optional ? <span className="ml-1 text-xs font-normal text-crema/45">opzionale</span> : null}
              </span>
              <span className="text-xs font-semibold text-ember">Apri</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  settings: GuildSettings | null;
  pickers: SettingsPickers;
  error: string | null;
  onUpdated: (next: GuildSettings, pickers?: SettingsPickers) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [prefix, setPrefix] = useState(settings?.prefix ?? "+");
  const [updatesChannelId, setUpdatesChannelId] = useState(settings?.updatesChannelId ?? "");
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
  const roleOptions = pickers.roles
    .filter((r) => !r.managed)
    .map((r) => ({ id: r.id, label: r.name }));

  const saveRoles = async (next: string[]) => {
    setDashboardRoleIds(next);
    const ok = await save({ dashboardRoleIds: next }, "Ruoli dashboard salvati.");
    if (!ok) setDashboardRoleIds(settings.dashboardRoleIds ?? []);
  };

  const saveUsers = async (next: string[]) => {
    if (next.length > 25) {
      onToast("Puoi aggiungere al massimo 25 utenti.", true);
      return;
    }
    setDashboardUserIds(next);
    const ok = await save({ dashboardUserIds: next }, "Utenti dashboard salvati.");
    if (!ok) setDashboardUserIds(settings.dashboardUserIds ?? []);
  };

  return (
    <div className="space-y-4">
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
                onBlur={async () => {
                  if (prefixLocked || prefix === settings.prefix) return;
                  const parsed = normalizePrefixInput(prefix, settings.prefixMaxLength);
                  if (!parsed.ok) {
                    onToast(parsed.message, true);
                    setPrefix(settings.prefix);
                    return;
                  }
                  const ok = await save({ prefix: parsed.prefix }, "Prefisso salvato.");
                  if (!ok) setPrefix(settings.prefix);
                }}
                className={cn(fieldCls, "mt-1.5 font-mono")}
              />
              <span className="mt-1 block text-xs text-crema/50">
                {prefixLocked ? "Bloccato sul server Vinili." : "Si salva quando esci dal campo."}
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
                onChange={async (next) => {
                  setUpdatesChannelId(next);
                  if (updatesLocked) return;
                  const ok = await save({ updatesChannelId: next || null }, "Canale aggiornamenti salvato.");
                  if (!ok) setUpdatesChannelId(settings.updatesChannelId ?? "");
                }}
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
                selected={dashboardRoleIds}
                onChange={(ids) => {
                  if (rolesLocked || saving) return;
                  void saveRoles(ids);
                }}
                empty="Nessun ruolo disponibile."
              />
              {rolesLocked ? (
                <p className="mt-1 text-xs text-crema/50">Bloccato su questo server.</p>
              ) : (
                <p className="mt-1 text-xs text-crema/50">Chi ha uno di questi ruoli può usare la dashboard.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-crema/70">Persone</p>
              <label className="relative mt-1.5 block">
                <span className="sr-only">Cerca una persona</span>
                <input
                  name="dashboard-user-search"
                  value={userQuery}
                  disabled={rolesLocked || saving}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Cerca per nome o ID…"
                  className={cn(fieldCls, "mt-0")}
                />
                {userHits.length ? (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg bg-mocha p-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)] ring-1 ring-sand/20">
                    {userHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-crema/85 hover:bg-crema/[0.06]"
                          onClick={() => {
                            if (dashboardUserIds.includes(hit.id)) return;
                            setUserLabels((cur) => ({ ...cur, [hit.id]: hit.label }));
                            setUserQuery("");
                            setUserHits([]);
                            void saveUsers([...dashboardUserIds, hit.id]);
                          }}
                        >
                          <span className="truncate">{hit.label}</span>
                          <span className="shrink-0 font-mono text-[0.65rem] text-crema/60">{hit.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
              {dashboardUserIds.length === 0 ? (
                <p className="mt-2 text-xs text-crema/60">Nessuna persona aggiunta singolarmente.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {dashboardUserIds.map((id) => (
                    <li
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-crema/[0.07] py-1 pl-3 pr-1 text-sm text-crema ring-1 ring-sand/15"
                    >
                      <span className="max-w-[12rem] truncate">{userLabels[id] || id}</span>
                      <button
                        type="button"
                        aria-label={`Togli ${userLabels[id] || id} dall’accesso dashboard`}
                        disabled={rolesLocked || saving}
                        className="flex size-5 items-center justify-center rounded-full text-crema/60 transition hover:bg-[#a83a2c]/25 hover:text-[#f0a493] disabled:opacity-45"
                        onClick={() => void saveUsers(dashboardUserIds.filter((x) => x !== id))}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          icon={<Download />}
          title="Backup e ripristino"
          description="Esporta o importa impostazioni, bacheca, comandi, partnership e ticket (solo config)."
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
  const activeFeatures = BOARD_FEATURES.filter((f) => features[f.id]).length;
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
      <section
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-2xl p-4 ring-1 sm:p-5",
          boardsEnabled ? "bg-gradient-to-r from-caramel/[0.12] via-roast/80 to-roast/80 ring-caramel/25" : "bg-roast/80 ring-sand/10",
        )}
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1",
            boardsEnabled ? "bg-caramel/15 text-ember ring-caramel/30" : "bg-crema/[0.05] text-crema/60 ring-sand/15",
          )}
        >
          <Pin className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-crema">Bacheca</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-crema/60">
            <span className={cn("size-1.5 rounded-full", boardsEnabled ? "bg-[#7fc48c]" : "bg-crema/40")} aria-hidden />
            {boardsEnabled
              ? `Attiva · ${activeFeatures} di ${BOARD_FEATURES.length} funzioni accese`
              : "Spenta: quote, repost, clip e skullboard non pubblicano"}
          </p>
        </div>
        <Toggle
          checked={boardsEnabled}
          disabled={saving}
          label="Attiva bacheca"
          onChange={async (next) => {
            setBoardsEnabled(next);
            const ok = await save({ boards: { enabled: next, features } }, next ? "Bacheca attiva." : "Bacheca disattivata.");
            if (!ok) setBoardsEnabled(settings.boards.enabled === true);
          }}
        />
      </section>

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
  category: categoryProp,
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
  const cat = categoryProp && String(categoryProp).trim() ? String(categoryProp) : "all";
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [aclName, setAclName] = useState<string | null>(null);

  const categories = useMemo(() => commands?.catalog ?? [], [commands]);
  const activeCat: CatalogCategory | null = useMemo(() => {
    if (!commands) return null;
    if (cat === "all") return null;
    return categories.find((c) => c.id === cat) ?? null;
  }, [commands, categories, cat]);

  const rows = useMemo(() => {
    if (!commands) return [];
    const base = activeCat ? activeCat.commands : categories.flatMap((c) => c.commands);
    const q = query.trim().toLowerCase().replace(/^[/+!.]/, "");
    if (!q) return base;
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        String(c.displayName || "").toLowerCase().includes(q) ||
        String(c.description || "").toLowerCase().includes(q),
    );
  }, [commands, activeCat, categories, query]);

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

  const saveCategoryAcl = async (names: string[], next: CommandAcl) => {
    const body = buildCommandAclBody(next);
    const payload: Record<string, CommandAcl | null> = {};
    for (const name of names) payload[name] = body;
    setBusy(names[0] || "cat");
    const res = await patchGuildCommands(token, guildId, payload);
    setBusy(null);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    onUpdated(res.data);
    onToast("Impostazioni comando salvate.");
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
        bodyClassName="space-y-3 px-0 py-0 sm:px-0"
      >
        <div className="space-y-3 px-4 pt-4 sm:px-5">
          <label className="relative block">
            <span className="sr-only">Cerca comando</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/50" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca un comando…"
              className={cn(fieldCls, "pl-9 placeholder:text-crema/50")}
            />
          </label>
        </div>

        <ul className="divide-y divide-sand/[0.07] border-t border-sand/[0.08]">
          {rows.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-crema/60">
              {query ? "Nessun comando con questo nome." : "Nessun comando in questa categoria."}
            </li>
          ) : (
            rows.map((cmd) => {
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
            })
          )}
        </ul>
      </Panel>
    </div>
  );
}

/** Pannello server: impostazioni, comandi con ACL, ticket e partnership. */
export function GuildPanel() {
  const { ready, token, login } = useAuth();
  const [gate, setGate] = useState<Gate>("loading");
  const [guildId, setGuildId] = useState("");
  const [section, setSectionState] = useState<Section>("settings");
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
    (next: Section) => {
      const nextTab = defaultModuleTab(next);
      setSectionState(next);
      setModuleTabState(nextTab);
      writeNavUrl(next, nextTab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [writeNavUrl],
  );

  const setModuleTab = useCallback(
    (nextSection: Section, tab: string) => {
      const safe = sanitizeModuleTab(nextSection, tab);
      setSectionState(nextSection);
      setModuleTabState(safe);
      writeNavUrl(nextSection, safe);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [writeNavUrl],
  );

  useEffect(() => {
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

    (async () => {
      setGate("loading");
      setError("");

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
          setGate("locked");
          return;
        }
        setError(panel.message);
        setGate("ready");
        return;
      }

      const d = panel.data;
      setOverview(d.overview);
      setSettings(d.settings);
      setPickers(d.settingsPickers);
      setSettingsError(d.settingsError);
      setCommands(d.commands);
      setCommandsError(d.commandsError);
      setTickets(d.tickets);
      setTicketsError(d.ticketsError);
      setPremiumActive(d.premiumActive);
      setGate("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  const sectionMeta = findGuildSection(section);
  const commandTabsForNav = useMemo(() => {
    const cats = commands?.catalog || [];
    if (!cats.length) return [...COMMAND_SECTION_TABS];
    return [
      { id: "all", label: "Tutti" },
      ...cats.map((c) => ({
        id: c.id,
        label: c.label.charAt(0).toUpperCase() + c.label.slice(1),
      })),
    ];
  }, [commands]);
  const activeSectionTabs =
    section === "commands" ? commandTabsForNav : sectionTabs(section);
  const activeTabLabel =
    activeSectionTabs.length && moduleTab
      ? activeSectionTabs.find((t) => t.id === moduleTab)?.label || null
      : null;
  const showSections = gate === "ready" && overview?.botPresent;
  const heading = activeTabLabel ? `${sectionMeta.label} · ${activeTabLabel}` : sectionMeta.label;

  return (
    <DashboardShell
      title={showSections ? heading : "Pannello server"}
      crumb={showSections ? heading : "Pannello"}
      lead={showSections ? SECTION_LEAD[section] : "Impostazioni, comandi, ticket e partnership del server selezionato."}
      guild={overview ? { id: overview.id, name: overview.name, iconUrl: overview.iconUrl } : null}
      guildNav={
        showSections
          ? {
              active: section,
              onSelect: setSection,
              moduleTab,
              onModuleTab: setModuleTab,
              tabsBySection: { commands: commandTabsForNav },
              badges: { tickets: tickets?.overview.unclaimed || undefined },
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
                  <SmartLink href={dashHref("/dashboard/")} className={dashSecondaryBtn}>
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
                <SmartLink href={dashHref("/dashboard/")} className={dashSecondaryBtn}>
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
                <SmartLink href={dashHref("/dashboard/")} className={dashPrimaryBtn}>
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

            <GuildHero
              guild={overview}
              premiumActive={premiumActive}
              prefix={overview.botPresent ? settings?.prefix ?? commands?.prefix ?? null : null}
            />

            {overview.botPresent ? (
              <SetupGuideBanner overview={overview} ticketsEnabled={tickets?.enabled === true} onGo={setSection} />
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
                {/* telefono/tablet: chip sezioni (su pc c’è la sidebar SERVER / MODULI) */}
                <div className="space-y-2 lg:hidden">
                  <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="tablist" aria-label="Server">
                    {GUILD_SERVER_SECTIONS.map((s) => {
                      const Icon = s.icon;
                      const on = section === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => setSection(s.id)}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                            on ? "bg-caramel/15 text-ember ring-1 ring-caramel/30" : "bg-roast/70 text-crema/55 ring-1 ring-sand/10",
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="tablist" aria-label="Moduli">
                    {GUILD_MODULE_SECTIONS.map((s) => {
                      const Icon = s.icon;
                      const on = section === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => setSection(s.id)}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                            on ? "bg-caramel/15 text-ember ring-1 ring-caramel/30" : "bg-roast/70 text-crema/55 ring-1 ring-sand/10",
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                          {s.label}
                          {s.id === "tickets" && tickets?.overview.unclaimed ? (
                            <span className="rounded bg-caramel px-1 text-[0.6rem] font-bold tabular-nums text-ink">{tickets.overview.unclaimed}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
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
                {guildId && token && overview.botPresent ? <SetupWizard guildId={guildId} token={token} /> : null}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={section}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {section === "settings" && guildId && token ? (
                      <SettingsSection
                        guildId={guildId}
                        token={token}
                        settings={settings}
                        pickers={pickers}
                        error={settingsError}
                        canCustomize={premiumActive || overview.isMainGuild || overview.isProtectedGuild}
                        onUpdated={(next, nextPickers) => {
                          setSettings(next);
                          if (nextPickers) setPickers(nextPickers);
                          setSettingsError(null);
                        }}
                        onToast={showToast}
                      />
                    ) : null}
                    {section === "commands" && guildId && token ? (
                      <CommandsSection
                        guildId={guildId}
                        token={token}
                        commands={commands}
                        pickers={pickers}
                        error={commandsError}
                        category={moduleTab || "all"}
                        onUpdated={(next) => {
                          setCommands(next);
                          setCommandsError(null);
                        }}
                        onToast={showToast}
                      />
                    ) : null}
                    {section === "bacheca" && guildId && token ? (
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
                      <TicketDesk
                        guildId={guildId}
                        token={token}
                        summary={tickets}
                        error={ticketsError}
                        isMainGuild={overview.isMainGuild}
                        tab={moduleTab && isTicketModuleTab(moduleTab) ? moduleTab : "overview"}
                        onSummary={(next) => {
                          setTickets(next);
                          setTicketsError(null);
                        }}
                        onToast={showToast}
                      />
                    ) : null}
                    {section === "moderation" && guildId && token ? (
                      <ModerationPanel
                        guildId={guildId}
                        token={token}
                        tab={moduleTab && isModerationModuleTab(moduleTab) ? moduleTab : "overview"}
                        onToast={showToast}
                      />
                    ) : null}
                    {section === "partnership" && guildId && token ? (
                      <Panel>
                        <PartnershipPanel
                          guildId={guildId}
                          token={token}
                          onToast={showToast}
                          tab={moduleTab && isPartnershipModuleTab(moduleTab) ? moduleTab : "setup"}
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
                      <Panel>
                        <WelcomePanel guildId={guildId} token={token} onToast={showToast} tab={moduleTab && isAnnunciModuleTab(moduleTab) ? moduleTab : "welcome"} />
                      </Panel>
                    ) : null}

                    {section === "salute" && guildId && token ? (
                      <Panel>
                        <HealthPanel guildId={guildId} token={token} />
                      </Panel>
                    ) : null}

                    {section === "registro" && guildId && token ? (
                      <Panel>
                        <AuditPanel
                          guildId={guildId}
                          token={token}
                          area={moduleTab && isRegistroModuleTab(moduleTab) ? moduleTab : "all"}
                        />
                      </Panel>
                    ) : null}

                    {section === "classifica" && guildId && token ? (
                      <Panel>
                        <LeaderboardPanel
                          guildId={guildId}
                          token={token}
                          category={moduleTab && isClassificaSectionTab(moduleTab) ? moduleTab : "servers"}
                        />
                      </Panel>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
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
                <SmartLink href={dashHref("/dashboard/")} className={dashSecondaryBtn}>
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
