import {
  BarChart3,
  Gavel,
  Handshake,
  History,
  HeartPulse,
  Gauge,
  Gift,
  MessageSquareReply,
  Vote,
  Megaphone,
  PartyPopper,
  Tags,
  TerminalSquare,
  Pin,
  Rocket,
  Settings2,
  Terminal,
  Ticket,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/** Voce piatta del pannello server (URL `?s=`). */
export type GuildSectionId =
  | "stats"
  | "salute"
  | "messaggi"
  | "comandipers"
  | "ruoli"
  | "benvenuto"
  | "risposte"
  | "contatori"
  | "bump"
  | "voti"
  | "giveaway"
  | "sondaggi"
  | "settings"
  | "commands"
  | "bacheca"
  | "tickets"
  | "moderation"
  | "partnership"
  | "classifica"
  | "registro";

export type GuildModuleTab = { id: string; label: string };

export type GuildNavItem = {
  id: GuildSectionId;
  label: string;
  icon: LucideIcon;
  /** Sotto-voci (menù apribile). */
  tabs?: readonly GuildModuleTab[];
};

export const COMMAND_SECTION_TABS = [
  { id: "all", label: "Tutti" },
  { id: "partnership", label: "Partnership" },
  { id: "utility", label: "Utility" },
  { id: "bacheca", label: "Bacheca" },
  { id: "music", label: "Musica" },
  { id: "tts", label: "TTS" },
  { id: "minigames", label: "Minigiochi" },
  { id: "moderation", label: "Moderazione" },
] as const satisfies readonly GuildModuleTab[];

export type CommandSectionTabId = (typeof COMMAND_SECTION_TABS)[number]["id"];

export const CLASSIFICA_SECTION_TABS = [
  { id: "servers", label: "Server" },
  { id: "partners", label: "Partner manager" },
  { id: "join", label: "Ingressi" },
] as const satisfies readonly GuildModuleTab[];

export type ClassificaSectionTabId = (typeof CLASSIFICA_SECTION_TABS)[number]["id"];

export const TICKET_MODULE_TABS = [
  { id: "overview", label: "Panoramica" },
  { id: "archive", label: "Archivio" },
  { id: "panels", label: "Pannelli" },
  { id: "forms", label: "Form" },
  { id: "teams", label: "Team" },
  { id: "replies", label: "Risposte rapide" },
  { id: "blacklist", label: "Blacklist" },
] as const satisfies readonly GuildModuleTab[];

export type TicketModuleTabId = (typeof TICKET_MODULE_TABS)[number]["id"];

export const PARTNERSHIP_MODULE_TABS = [
  { id: "setup", label: "Impostazioni" },
  { id: "filtri", label: "Filtri" },
  { id: "blacklist", label: "Blacklist" },
  { id: "manager", label: "Manager" },
  { id: "storia", label: "Cronologia" },
  { id: "migrazione", label: "Importazione" },
] as const satisfies readonly GuildModuleTab[];

export type PartnershipModuleTabId = (typeof PARTNERSHIP_MODULE_TABS)[number]["id"];

export const MODERATION_MODULE_TABS = [
  { id: "overview", label: "Panoramica" },
  { id: "punizioni", label: "Punizione automatica" },
  { id: "ricorsi", label: "Ricorsi" },
  { id: "casi", label: "Casi" },
  { id: "log", label: "Log del server" },
] as const satisfies readonly GuildModuleTab[];

export type ModerationModuleTabId = (typeof MODERATION_MODULE_TABS)[number]["id"];

export const REGISTRO_MODULE_TABS = [
  { id: "all", label: "Tutto" },
  { id: "settings", label: "Impostazioni" },
  { id: "commands", label: "Comandi" },
  { id: "moderation", label: "Moderazione" },
  { id: "tickets", label: "Ticket" },
  { id: "partnership", label: "Partnership" },
  { id: "community", label: "Community" },
  { id: "premium", label: "Premium" },
] as const satisfies readonly GuildModuleTab[];

export type RegistroModuleTabId = (typeof REGISTRO_MODULE_TABS)[number]["id"];

export const ANNUNCI_MODULE_TABS = [
  { id: "welcome", label: "Benvenuto" },
  { id: "goodbye", label: "Addio" },
  { id: "dm", label: "Messaggio privato" },
  { id: "roles", label: "Ruoli automatici" },
  { id: "boost", label: "Boost" },
  { id: "clantag", label: "Clan tag" },
  { id: "status", label: "Status" },
  { id: "inviti", label: "Inviti" },
  { id: "ruolinuovi", label: "Ruoli custom" },
] as const satisfies readonly GuildModuleTab[];

export type AnnunciModuleTabId = (typeof ANNUNCI_MODULE_TABS)[number]["id"];

export function isAnnunciModuleTab(v: string): v is AnnunciModuleTabId {
  return ANNUNCI_MODULE_TABS.some((t) => t.id === v);
}

/** Core del server: sotto SERVER (Comandi/Classifica con sotto-menù). */
export const GUILD_SERVER_SECTIONS = [
  { id: "settings", label: "Impostazioni", icon: Settings2 },
  /* le categorie stanno dentro la pagina (elenco a sinistra), non nel menu laterale */
  { id: "commands", label: "Comandi", icon: Terminal },
  { id: "stats", label: "Statistiche", icon: BarChart3 },
  { id: "salute", label: "Salute del bot", icon: HeartPulse },
  { id: "registro", label: "Registro modifiche", icon: History },
] as const satisfies readonly GuildNavItem[];

/** Funzioni opzionali: sotto MODULI. */
export const GUILD_MODULE_SECTIONS = [
  { id: "bacheca", label: "Bacheca", icon: Pin, tabs: [] as const },
  /* Ticket, Moderazione, Partnership e Annunci: le schede stanno nella pagina, in un elenco a sinistra */
  { id: "tickets", label: "Ticket", icon: Ticket, tabs: [] as const },
  { id: "moderation", label: "Moderazione", icon: Gavel, tabs: [] as const },
  { id: "partnership", label: "Partnership", icon: Handshake, tabs: [] as const },
  { id: "messaggi", label: "Messaggi", icon: Megaphone, tabs: [] as const },
  { id: "comandipers", label: "Comandi personalizzati", icon: TerminalSquare, tabs: [] as const },
  { id: "ruoli", label: "Ruoli automatici", icon: Tags, tabs: [] as const },
  { id: "benvenuto", label: "Annunci automatici", icon: PartyPopper, tabs: [] as const },
  { id: "risposte", label: "Risposte automatiche", icon: MessageSquareReply, tabs: [] as const },
  { id: "contatori", label: "Contatori", icon: Gauge, tabs: [] as const },
  { id: "bump", label: "Bump", icon: Rocket, tabs: [] as const },
  { id: "voti", label: "Voti", icon: Vote, tabs: [] as const },
  { id: "giveaway", label: "Giveaway", icon: Gift, tabs: [] as const },
  { id: "sondaggi", label: "Sondaggi", icon: Vote, tabs: [] as const },
] as const satisfies readonly GuildNavItem[];

/** Sezioni che non stanno nel menu laterale: si aprono dalla barra in alto. */
export const GUILD_TOPBAR_SECTIONS = [
  { id: "classifica", label: "Classifica", icon: Trophy, tabs: CLASSIFICA_SECTION_TABS },
] as const satisfies readonly GuildNavItem[];

/** Elenco piatto (URL, mobile chip, lookup). Ordine: server poi moduli. */
export const GUILD_SECTIONS = [...GUILD_SERVER_SECTIONS, ...GUILD_MODULE_SECTIONS, ...GUILD_TOPBAR_SECTIONS] as const;

export function isGuildSection(v: string): v is GuildSectionId {
  return GUILD_SECTIONS.some((s) => s.id === v);
}

export function isTicketModuleTab(v: string): v is TicketModuleTabId {
  return TICKET_MODULE_TABS.some((t) => t.id === v);
}

export function isPartnershipModuleTab(v: string): v is PartnershipModuleTabId {
  return PARTNERSHIP_MODULE_TABS.some((t) => t.id === v);
}

export function isModerationModuleTab(v: string): v is ModerationModuleTabId {
  return MODERATION_MODULE_TABS.some((t) => t.id === v);
}

export function isCommandSectionTab(v: string): v is CommandSectionTabId {
  return COMMAND_SECTION_TABS.some((t) => t.id === v);
}

export function isClassificaSectionTab(v: string): v is ClassificaSectionTabId {
  return CLASSIFICA_SECTION_TABS.some((t) => t.id === v);
}

export function isRegistroModuleTab(v: string): v is RegistroModuleTabId {
  return REGISTRO_MODULE_TABS.some((t) => t.id === v);
}

export function defaultModuleTab(section: GuildSectionId): string | null {
  if (section === "tickets") return "overview";
  if (section === "moderation") return "overview";
  if (section === "partnership") return "setup";
  if (section === "commands") return "all";
  if (section === "classifica") return "servers";
  if (section === "registro") return "all";
  if (section === "benvenuto") return "welcome";
  return null;
}

export function findGuildSection(id: GuildSectionId) {
  return GUILD_SECTIONS.find((s) => s.id === id) ?? GUILD_SECTIONS[0];
}

/** Tab di una sezione (server o moduli). */
export function sectionTabs(id: GuildSectionId): readonly GuildModuleTab[] {
  const row = GUILD_SECTIONS.find((s) => s.id === id);
  return row && "tabs" in row && Array.isArray(row.tabs) ? row.tabs : [];
}
