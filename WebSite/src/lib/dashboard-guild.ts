// Pannello server: overview + settings + commands (ACL) + ticket.
// Vecchio: dashboard-guild-*.js
// API: /webhooks/site-dashboard/guilds/:id/{settings,commands,tickets,...}
// Resto ticket/partnership: dashboard-guild-ops.ts (re-export in fondo).

import { isGuildId, selectGuild } from "@/lib/dashboard";
import { emptyDraft, type MsgDraft } from "@/lib/dashboard-community";

const BASE = "/webhooks/site-dashboard";

export const PREFIX_MAX_LEN = 5;
export const DEFAULT_PREFIX = "+";

export type GuildSetupStatus = {
  kind: "main" | "managed" | string;
  complete: boolean;
  partnershipsChannelId: string | null;
  partnerManagerRoleId: string | null;
  legacy: boolean;
};

export type GuildOverview = {
  id: string;
  name: string;
  iconUrl: string | null;
  botPresent: boolean;
  botUsageBlacklisted?: boolean;
  isMainGuild: boolean;
  isProtectedGuild: boolean;
  inviteUrl: string | null;
  memberCount: number | null;
  onlineCount: number | null;
  /* dati generali per la testata (null = non disponibile) */
  boostCount: number | null;
  boostTier: number | null;
  roleCount: number | null;
  channelCount: number | null;
  emojiCount: number | null;
  bannerUrl: string | null;
  description: string | null;
  /** Setup partnership / first-run (null se bot assente). */
  setup: GuildSetupStatus | null;
};

export type ChannelPicker = {
  id: string;
  name: string;
  parentId?: string | null;
  kind?: string;
};
export type RolePicker = {
  id: string;
  name: string;
  managed?: boolean;
  administrator?: boolean;
  permissions?: string;
};

export type BoardFeatures = {
  quote: boolean;
  repost: boolean;
  clip: boolean;
  skull: boolean;
};

export type BoardsMode = "shared" | "split";

export type QuoteStyle = {
  bg: string;
  bgColor: string | null;
  fgColor: string | null;
  bgGradTo: string | null;
  bgGradAngle: number;
  fgGradTo: string | null;
  fgGradAngle: number;
  font: string;
  bold: boolean;
  flip: boolean;
  orientation: "horizontal" | "vertical";
  avatarMode: "static" | "dynamic";
  footer: string;
  fadeDepth: number;
  fadeOpacity: number;
};

export type BoardKindPresentation = {
  embedTitle: string;
  embedDescription: string;
  embedFooter: string;
  fieldAuthor: string;
  fieldCreator: string;
  fieldChannel: string;
  fieldMessage: string;
  buttonRepost: string;
  buttonRemove: string;
  deleteRoleIds: string[];
  ackDescription: string;
  ackDescriptionSite: string;
  ackDescriptionChannel: string;
  ackFieldName: string;
  ackFooter: string;
  rouletteTitle: string;
  rouletteDescription: string;
  rouletteFooter: string;
  drafts: BoardDrafts;
};

/** Messaggi personalizzati della bacheca (come nelle altre schede); null = quello predefinito del bot. */
export type BoardDrafts = { post: MsgDraft | null; reply: MsgDraft | null; roulette: MsgDraft | null };
export type BoardDraftSlot = keyof BoardDrafts;

export type BoardsPresentation = {
  quote: BoardKindPresentation;
  repost: BoardKindPresentation;
  clip: BoardKindPresentation;
  skull: BoardKindPresentation;
};

export type GuildBoards = {
  enabled: boolean;
  mode: BoardsMode;
  sharedChannelId: string | null;
  quoteChannelId: string | null;
  repostChannelId: string | null;
  clipChannelId: string | null;
  skullChannelId: string | null;
  features: BoardFeatures;
  clipTranscription: boolean;
  quoteStyle: QuoteStyle;
  presentation: BoardsPresentation;
};

export type GuildSettings = {
  prefix: string;
  prefixMaxLength: number;
  updatesChannelId: string | null;
  /** Lingua dei messaggi del bot (null = quella del server Discord) */
  language: string | null;
  /** Lingua Discord del server (preferred_locale → codice tenant), per l’etichetta “automatica” */
  discordLanguage: string | null;
  /** Fuso orario IANA del server (predefinito Europe/Rome) */
  timezone: string;
  /** Ruoli che possono usare la dashboard anche senza Gestisci server */
  dashboardRoleIds: string[];
  /** Utenti singoli abilitati alla dashboard */
  dashboardUserIds: string[];
  /** I ruoli dashboard sono già stati salvati almeno una volta */
  dashboardRolesConfigured: boolean;
  /** Proprietario del server (accesso sempre, mostrato come voce fissa) */
  guildOwner: { id: string; label: string } | null;
  boards: GuildBoards;
  botNickname: string | null;
  botAvatarUrl: string | null;
  /** true = avatar/banner solo per questo server (altrimenti è quello globale del bot) */
  hasGuildAvatar: boolean;
  botBannerUrl: string | null;
  hasGuildBanner: boolean;
  /** Premium scaduto: personalizzazioni salvate ma in pausa */
  identitySuspended: boolean;
  botUsername: string | null;
  /** stato del bot ora su Discord (online/idle/dnd/offline) e attività */
  botPresence: { status: string; text: string } | null;
  prefixLocked: boolean;
  rolesLocked: boolean;
  updatesLocked: boolean;
};

export type SettingsPickers = {
  textChannels: ChannelPicker[];
  voiceChannels: ChannelPicker[];
  categories: ChannelPicker[];
  roles: RolePicker[];
};

export const EMPTY_SETTINGS_PICKERS: SettingsPickers = {
  textChannels: [],
  voiceChannels: [],
  categories: [],
  roles: [],
};

export type CommandAcl = {
  enabled: boolean;
  roleMode: string | null;
  roleIds: string[];
  channelMode: string | null;
  channelIds: string[];
  boardFeatureLocked?: boolean;
};

export type CatalogCommand = {
  name: string;
  displayName: string;
  kind: "prefix" | "slash" | string;
  /** solo slash: "chat" (comando /), "user" o "message" (menu contestuale) */
  slashType?: "chat" | "user" | "message";
  description: string;
  alwaysAvailable?: boolean;
  syncsToDiscord?: boolean;
};

export type CatalogCategory = {
  id: string;
  label: string;
  order?: number;
  commands: CatalogCommand[];
};

export type CommandsPayload = {
  prefix: string;
  catalog: CatalogCategory[];
  commands: Record<string, CommandAcl>;
  protectedGuild: boolean;
  discordWarning: string;
};

export type TicketsOverview = {
  open: number;
  claimed: number;
  unclaimed: number;
  closed24h: number;
  total: number;
};

export type TicketsSummary = {
  enabled: boolean;
  overview: TicketsOverview;
};

export type GuildPanelBundle = {
  overview: GuildOverview;
  settings: GuildSettings | null;
  settingsPickers: SettingsPickers;
  settingsError: string | null;
  commands: CommandsPayload | null;
  commandsError: string | null;
  tickets: TicketsSummary | null;
  ticketsError: string | null;
  premiumActive: boolean;
  premiumUntil: number | null;
  protectedGuild: boolean;
};

type Fail = { ok: false; message: string; error?: string; status?: number };
type Ok<T> = { ok: true; data: T };

export const BOARD_FEATURES: { id: keyof BoardFeatures; title: string; hint: string }[] = [
  { id: "quote", title: "Quote", hint: "+quote e pubblicazione citazioni" },
  { id: "repost", title: "Repost", hint: "+repost e bottone Reposta" },
  { id: "clip", title: "Clip", hint: "+clip e pubblicazione clip vocali" },
  { id: "skull", title: "Skullboard", hint: "Reazione 💀 e pubblicazione in bacheca" },
];

export const BOARD_CHANNEL_KEYS = [
  "sharedChannelId",
  "quoteChannelId",
  "repostChannelId",
  "clipChannelId",
  "skullChannelId",
] as const;

export type BoardChannelKey = (typeof BOARD_CHANNEL_KEYS)[number];

function authHeaders(token: string, json = false): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function getJson(path: string, token: string) {
  const bust = `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const r = await fetch(bust, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    headers: authHeaders(token),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, data };
}

async function patchJson(path: string, token: string, body: unknown) {
  const r = await fetch(path, {
    method: "PATCH",
    cache: "no-store",
    credentials: "omit",
    headers: authHeaders(token, true),
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, data };
}

function failFrom(status: number, data: Record<string, unknown>, fallback: string): Fail {
  return {
    ok: false,
    status,
    error: typeof data.error === "string" ? data.error : undefined,
    message: typeof data.message === "string" && data.message.trim() ? data.message : fallback,
  };
}

/** Legge `?id=` dalla query corrente (o stringa search). */
export function readGuildIdFromSearch(search = ""): string {
  try {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    const id = String(new URLSearchParams(raw).get("id") || "").trim();
    return isGuildId(id) ? id : "";
  } catch {
    return "";
  }
}

export function resolveGuildIdFromLocation(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = readGuildIdFromSearch(window.location.search);
  if (fromUrl) {
    selectGuild(fromUrl);
    return fromUrl;
  }
  return "";
}

function mapChannel(row: unknown): ChannelPicker | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = String(r.id || "").trim();
  if (!id) return null;
  const parent = r.parentId != null && String(r.parentId).trim() ? String(r.parentId).trim() : null;
  const kind = r.kind != null && String(r.kind).trim() ? String(r.kind).trim() : undefined;
  return { id, name: String(r.name || id).trim() || id, parentId: parent, kind };
}

function mapChannelList(raw: unknown): ChannelPicker[] {
  return Array.isArray(raw) ? raw.map(mapChannel).filter((c): c is ChannelPicker => Boolean(c)) : [];
}

function mapOverview(data: Record<string, unknown>): GuildOverview | null {
  const g = data.guild && typeof data.guild === "object" ? (data.guild as Record<string, unknown>) : null;
  if (!g) return null;
  const id = String(g.id || "").trim();
  if (!isGuildId(id)) return null;
  const icon = String(g.iconUrl || "").trim();
  const members = Number(g.memberCount);
  const online = Number(g.onlineCount);
  const stats = data.stats && typeof data.stats === "object" ? (data.stats as Record<string, unknown>) : null;
  const memberCount = Number.isFinite(members)
    ? members
    : Number.isFinite(Number(stats?.memberCount))
      ? Number(stats?.memberCount)
      : null;
  const onlineCount = Number.isFinite(online)
    ? online
    : Number.isFinite(Number(stats?.onlineCount))
      ? Number(stats?.onlineCount)
      : null;
  const setupRaw = data.setup && typeof data.setup === "object" ? (data.setup as Record<string, unknown>) : null;
  const setup: GuildSetupStatus | null = setupRaw
    ? {
        kind: String(setupRaw.kind || "managed"),
        complete: setupRaw.complete === true,
        partnershipsChannelId:
          typeof setupRaw.partnershipsChannelId === "string" && setupRaw.partnershipsChannelId.trim()
            ? setupRaw.partnershipsChannelId.trim()
            : null,
        partnerManagerRoleId:
          typeof setupRaw.partnerManagerRoleId === "string" && setupRaw.partnerManagerRoleId.trim()
            ? setupRaw.partnerManagerRoleId.trim()
            : null,
        legacy: setupRaw.legacy === true,
      }
    : null;
  return {
    id,
    name: String(g.name || "Server").trim() || "Server",
    iconUrl: icon || null,
    botPresent: g.botPresent === true,
    botUsageBlacklisted: g.botUsageBlacklisted === true,
    isMainGuild: g.isMainGuild === true,
    isProtectedGuild: g.isProtectedGuild === true,
    inviteUrl: typeof g.inviteUrl === "string" && g.inviteUrl.trim() ? g.inviteUrl.trim() : null,
    memberCount,
    onlineCount,
    boostCount: numOrNull(g.boostCount),
    boostTier: numOrNull(g.boostTier),
    roleCount: numOrNull(g.roleCount),
    channelCount: numOrNull(g.channelCount),
    emojiCount: numOrNull(g.emojiCount),
    bannerUrl: typeof g.bannerUrl === "string" && g.bannerUrl.startsWith("https://") ? g.bannerUrl : null,
    description: typeof g.description === "string" && g.description.trim() ? g.description.trim() : null,
    setup,
  };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function channelIdOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const id = String(v).trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function clampPct(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampAngle(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return ((Math.round(n) % 360) + 360) % 360;
}

function hexOrNull(raw: unknown): string | null {
  const s = String(raw || "").trim();
  const m = s.match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1].toLowerCase()}` : null;
}

export function defaultQuoteStyle(): QuoteStyle {
  return {
    bg: "black",
    bgColor: null,
    fgColor: null,
    bgGradTo: null,
    bgGradAngle: 135,
    fgGradTo: null,
    fgGradAngle: 90,
    font: "sans",
    bold: true,
    flip: false,
    orientation: "horizontal",
    avatarMode: "dynamic",
    footer: "discord.gg/viniliecaffe",
    fadeDepth: 22,
    fadeOpacity: 100,
  };
}

function mapQuoteStyle(raw: unknown): QuoteStyle {
  const base = defaultQuoteStyle();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Record<string, unknown>;
  const bgRaw = String(s.bg || base.bg).trim().toLowerCase() || base.bg;
  const custom = hexOrNull(s.bgColor);
  const bg = bgRaw === "custom" || (custom && bgRaw === "custom") ? "custom" : bgRaw;
  const orient = String(s.orientation || "").trim().toLowerCase() === "vertical" ? "vertical" : "horizontal";
  const avatarRaw = String(s.avatarMode || "").trim().toLowerCase();
  const avatarMode =
    avatarRaw === "static" || avatarRaw === "s" || avatarRaw === "png" ? "static" : "dynamic";
  return {
    bg,
    bgColor: bg === "custom" ? custom || "#070707" : null,
    fgColor: Object.prototype.hasOwnProperty.call(s, "fgColor")
      ? s.fgColor == null || s.fgColor === "" || s.fgColor === "auto"
        ? null
        : hexOrNull(s.fgColor)
      : base.fgColor,
    bgGradTo: Object.prototype.hasOwnProperty.call(s, "bgGradTo")
      ? s.bgGradTo == null || s.bgGradTo === "" || s.bgGradTo === "none"
        ? null
        : hexOrNull(s.bgGradTo)
      : base.bgGradTo,
    bgGradAngle: clampAngle(s.bgGradAngle, base.bgGradAngle),
    fgGradTo: Object.prototype.hasOwnProperty.call(s, "fgGradTo")
      ? s.fgGradTo == null || s.fgGradTo === "" || s.fgGradTo === "none"
        ? null
        : hexOrNull(s.fgGradTo)
      : base.fgGradTo,
    fgGradAngle: clampAngle(s.fgGradAngle, base.fgGradAngle),
    font: String(s.font || base.font).trim() || base.font,
    bold: s.bold !== false,
    flip: s.flip === true,
    orientation: orient,
    avatarMode,
    footer: s.footer != null ? String(s.footer) : base.footer,
    fadeDepth: clampPct(s.fadeDepth, base.fadeDepth),
    fadeOpacity: clampPct(s.fadeOpacity, base.fadeOpacity),
  };
}

const EMPTY_EXTRA = {
  fieldChannel: "",
  fieldMessage: "",
  ackDescription: "",
  ackDescriptionSite: "",
  ackDescriptionChannel: "",
  ackFieldName: "",
  ackFooter: "",
  rouletteTitle: "",
  rouletteDescription: "",
  rouletteFooter: "",
  drafts: { post: null, reply: null, roulette: null } as BoardDrafts,
};

/** Allineati ai testi live del bot (emoji custom Vinili). */
export const DEFAULT_BOARD_PRESENTATION: BoardsPresentation = {
  quote: {
    ...EMPTY_EXTRA,
    embedTitle: "<a:VC_Sparkles:1468546911936974889> Nuova quotazione ✨",
    embedDescription:
      "<:VC_Reply:1482532158080942191> Crea un post usando il comando **{prefix}quote** rispondendo al messaggio di un utente.",
    embedFooter: "Post totali: {count}",
    fieldAuthor: "Messaggio di:",
    fieldCreator: "Creato da:",
    buttonRepost: "Reposta",
    buttonRemove: "Rimuovi questa quote",
    deleteRoleIds: [],
    ackDescription: "<a:VC_Sparkles:1468546911936974889> Quote pubblicata in questo canale.",
    ackDescriptionSite: "<a:VC_Sparkles:1468546911936974889> La quote è appesa in **Bacheca** sul sito!",
    ackDescriptionChannel: "<a:VC_Sparkles:1468546911936974889> Puoi trovare il post creato nel canale: {channel}!",
    ackFieldName: "📸 Totale immagini generate:",
  },
  repost: {
    ...EMPTY_EXTRA,
    embedTitle: "🆕 * . ˊ Nuovo repost!",
    embedDescription:
      "di {reposter} 🎀\n\n{body}\n\n• [Clicca qui per andare al messaggio]({source})\n\nɤ⌒➴ Autore del messaggio: {author}",
    embedFooter: "† · ৎ Aggiungi un messaggio alla bacheca ⭐ usando il comando {prefix}repost · Post #{count}",
    fieldAuthor: "",
    fieldCreator: "",
    buttonRepost: "Reposta",
    buttonRemove: "Rimuovi repost",
    deleteRoleIds: [],
    ackDescription: "<a:reddiamond:1443652837346377841> * . ˊ {reposter} {phrase}\n\n{link}",
    ackFooter: "✧ * . ˊ {prefix}repost",
    rouletteTitle: "<a:reddiamond:1443652837346377841> * . ˊ Roulette dei Repost Passati",
    rouletteDescription: "{body}\n\n• [Messaggio Originale]({source})",
    rouletteFooter: "† · ৎ Revival casuale dal database 🎲",
  },
  clip: {
    ...EMPTY_EXTRA,
    embedTitle: "🎙️ Clip vocale",
    embedDescription: "Ultimi **{duration}s** da **{channel}**\n\n**Trascrizione**\n{body}",
    embedFooter: "† · ৎ {prefix}clip · Post #{count}",
    fieldAuthor: "Clip di",
    fieldCreator: "",
    buttonRepost: "Reposta",
    buttonRemove: "Rimuovi clip",
    deleteRoleIds: [],
    ackDescription: "🎙️ {reposter} {phrase}\n{link}",
    ackFooter: "✧ * . ˊ {prefix}clip",
  },
  skull: {
    ...EMPTY_EXTRA,
    embedTitle: "",
    embedDescription: "<:VC_Skully:1331591939094614057> **Aggiungi la reazione 💀 a un messaggio per pubblicarlo nella SkullBoard**",
    embedFooter: "{date}",
    fieldAuthor: "<:VC_User:1482527453586002103> Autore",
    fieldCreator: "",
    fieldChannel: "<a:VC_Channel:1482534583944871996> Canale",
    fieldMessage: "<:VC_Chat:1482532573002465413> Messaggio",
    buttonRepost: "",
    buttonRemove: "Rimuovi",
    deleteRoleIds: [],
    ackDescription: "<:VC_Skully:1331591939094614057> Il messaggio è stato pubblicato nel canale {channel}.",
    ackDescriptionSite: "<:VC_Skully:1331591939094614057> Il messaggio è stato appeso in **Bacheca** sul sito.",
    ackDescriptionChannel: "<:VC_Skully:1331591939094614057> Il messaggio è stato pubblicato nel canale {channel}.",
  },
};

function mapKindPresentation(kind: keyof BoardsPresentation, raw: unknown): BoardKindPresentation {
  const base = DEFAULT_BOARD_PRESENTATION[kind];
  if (!raw || typeof raw !== "object") return { ...base, deleteRoleIds: [] };
  const r = raw as Record<string, unknown>;
  const roles = Array.isArray(r.deleteRoleIds)
    ? r.deleteRoleIds.map((id) => String(id || "").trim()).filter((id) => /^\d{16,20}$/.test(id)).slice(0, 25)
    : [];
  const str = (key: keyof BoardKindPresentation, max: number, fallback: string) => {
    const v = String(r[key] ?? fallback).trim().slice(0, max);
    return v || fallback;
  };
  return {
    embedTitle: str("embedTitle", 256, base.embedTitle),
    embedDescription: str("embedDescription", 4000, base.embedDescription),
    embedFooter: str("embedFooter", 2048, base.embedFooter),
    fieldAuthor: String(r.fieldAuthor ?? base.fieldAuthor).trim().slice(0, 256),
    fieldCreator: String(r.fieldCreator ?? base.fieldCreator).trim().slice(0, 256),
    fieldChannel: String(r.fieldChannel ?? base.fieldChannel).trim().slice(0, 256),
    fieldMessage: String(r.fieldMessage ?? base.fieldMessage).trim().slice(0, 256),
    buttonRepost: str("buttonRepost", 80, base.buttonRepost),
    buttonRemove: str("buttonRemove", 80, base.buttonRemove),
    deleteRoleIds: roles,
    ackDescription: str("ackDescription", 4000, base.ackDescription),
    ackDescriptionSite: str("ackDescriptionSite", 4000, base.ackDescriptionSite),
    ackDescriptionChannel: str("ackDescriptionChannel", 4000, base.ackDescriptionChannel),
    ackFieldName: str("ackFieldName", 256, base.ackFieldName),
    ackFooter: str("ackFooter", 2048, base.ackFooter),
    rouletteTitle: str("rouletteTitle", 256, base.rouletteTitle),
    rouletteDescription: str("rouletteDescription", 4000, base.rouletteDescription),
    rouletteFooter: str("rouletteFooter", 2048, base.rouletteFooter),
    drafts: mapBoardDrafts(r.drafts),
  };
}

/** Messaggi personalizzati arrivati dal bot: completati coi campi mancanti, così l'editor non si rompe. */
function mapBoardDrafts(raw: unknown): BoardDrafts {
  const out: BoardDrafts = { post: null, reply: null, roulette: null };
  if (!raw || typeof raw !== "object") return out;
  for (const slot of ["post", "reply", "roulette"] as const) {
    const d = (raw as Record<string, unknown>)[slot];
    if (!d || typeof d !== "object") continue;
    const base = emptyDraft();
    const src = d as Partial<MsgDraft>;
    out[slot] = {
      ...base,
      ...src,
      embed: { ...base.embed, ...(src.embed || {}) },
      v2: { ...base.v2, ...((src.v2 || {}) as Partial<MsgDraft["v2"]>) } as MsgDraft["v2"],
      buttons: Array.isArray(src.buttons) ? src.buttons : [],
    };
  }
  return out;
}

function mapBoardsPresentation(raw: unknown): BoardsPresentation {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    quote: mapKindPresentation("quote", src.quote),
    repost: mapKindPresentation("repost", src.repost),
    clip: mapKindPresentation("clip", src.clip),
    skull: mapKindPresentation("skull", src.skull),
  };
}

function defaultBoards(): GuildBoards {
  return {
    enabled: false,
    mode: "shared",
    sharedChannelId: null,
    quoteChannelId: null,
    repostChannelId: null,
    clipChannelId: null,
    skullChannelId: null,
    features: { quote: true, repost: true, clip: true, skull: true },
    clipTranscription: true,
    quoteStyle: defaultQuoteStyle(),
    presentation: mapBoardsPresentation(null),
  };
}

function mapBoards(raw: unknown): GuildBoards {
  const base = defaultBoards();
  if (!raw || typeof raw !== "object") return base;
  const b = raw as Record<string, unknown>;
  const feats = b.features && typeof b.features === "object" ? (b.features as Record<string, unknown>) : {};
  return {
    enabled: b.enabled === true,
    mode: String(b.mode || "").trim().toLowerCase() === "split" ? "split" : "shared",
    sharedChannelId: channelIdOrNull(b.sharedChannelId),
    quoteChannelId: channelIdOrNull(b.quoteChannelId),
    repostChannelId: channelIdOrNull(b.repostChannelId),
    clipChannelId: channelIdOrNull(b.clipChannelId),
    skullChannelId: channelIdOrNull(b.skullChannelId),
    features: {
      quote: feats.quote !== false,
      repost: feats.repost !== false,
      clip: feats.clip !== false,
      skull: feats.skull !== false,
    },
    clipTranscription: b.clipTranscription !== false,
    quoteStyle: mapQuoteStyle(b.quoteStyle),
    presentation: mapBoardsPresentation(b.presentation),
  };
}

function mapSettings(data: Record<string, unknown>): {
  settings: GuildSettings;
  pickers: SettingsPickers;
  premiumActive: boolean;
  premiumUntil: number | null;
  premiumPlan: string | null;
  protectedGuild: boolean;
} {
  const s = (data.settings && typeof data.settings === "object" ? data.settings : {}) as Record<string, unknown>;
  const pickersRaw = (data.pickers && typeof data.pickers === "object" ? data.pickers : {}) as Record<string, unknown>;
  const channels = mapChannelList(pickersRaw.textChannels);
  const roles: RolePicker[] = Array.isArray(pickersRaw.roles)
    ? pickersRaw.roles.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const r = row as Record<string, unknown>;
        const id = String(r.id || "").trim();
        if (!id) return [];
        return [
          {
            id,
            name: String(r.name || id).trim() || id,
            managed: r.managed === true,
            administrator: r.administrator === true,
            permissions: r.permissions != null ? String(r.permissions) : undefined,
          },
        ];
      })
    : [];
  const premium = data.premium && typeof data.premium === "object" ? (data.premium as Record<string, unknown>) : null;
  const protectedGuild = data.protectedGuild === true;
  const maxLen = Number(s.prefixMaxLength);
  return {
    settings: {
      prefix: String(s.prefix || DEFAULT_PREFIX) || DEFAULT_PREFIX,
      prefixMaxLength: Number.isFinite(maxLen) && maxLen > 0 ? maxLen : PREFIX_MAX_LEN,
      updatesChannelId: s.updatesChannelId ? String(s.updatesChannelId) : null,
      language: typeof s.language === "string" && /^[a-z]{2}$/.test(s.language) ? s.language : null,
      discordLanguage:
        typeof s.discordLanguage === "string" && /^[a-z]{2}$/.test(s.discordLanguage) ? s.discordLanguage : null,
      timezone: typeof s.timezone === "string" && s.timezone.trim() ? s.timezone.trim() : "Europe/Rome",
      dashboardRoleIds: Array.isArray(s.dashboardRoleIds)
        ? s.dashboardRoleIds.map((id) => String(id || "").trim()).filter(Boolean)
        : s.dashboardRoleId
          ? [String(s.dashboardRoleId).trim()].filter(Boolean)
          : [],
      dashboardUserIds: Array.isArray(s.dashboardUserIds)
        ? s.dashboardUserIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
      dashboardRolesConfigured: s.dashboardRolesConfigured === true,
      guildOwner: (() => {
        const o = s.guildOwner as { id?: unknown; label?: unknown } | null | undefined;
        const id = o && typeof o === "object" ? String(o.id || "").trim() : "";
        return /^\d{16,22}$/.test(id) ? { id, label: String(o?.label || id) } : null;
      })(),
      boards: mapBoards(s.boards),
      botNickname: s.botNickname != null ? String(s.botNickname) : null,
      botAvatarUrl: s.botAvatarUrl ? String(s.botAvatarUrl) : null,
      hasGuildAvatar: s.hasGuildAvatar === true,
      botBannerUrl: s.botBannerUrl ? String(s.botBannerUrl) : null,
      hasGuildBanner: s.hasGuildBanner === true,
      identitySuspended: s.identitySuspended === true,
      botUsername: s.botUsername ? String(s.botUsername) : null,
      botPresence:
        s.botPresence && typeof s.botPresence === "object"
          ? {
              status: String((s.botPresence as Record<string, unknown>).status || "online"),
              text: String((s.botPresence as Record<string, unknown>).text || ""),
            }
          : null,
      prefixLocked: protectedGuild || s.prefixLocked === true,
      rolesLocked: s.rolesLocked === true,
      updatesLocked: protectedGuild || s.updatesLocked === true,
    },
    pickers: {
      textChannels: channels,
      voiceChannels: mapChannelList(pickersRaw.voiceChannels),
      categories: mapChannelList(pickersRaw.categories),
      roles,
    },
    premiumActive: premium?.active === true || protectedGuild,
    premiumUntil: premium?.until != null ? Number(premium.until) || null : null,
    premiumPlan: premium?.plan ? String(premium.plan) : null,
    protectedGuild,
  };
}

function emptyAcl(): CommandAcl {
  return { enabled: true, roleMode: null, roleIds: [], channelMode: null, channelIds: [] };
}

function mapAcl(raw: unknown): CommandAcl {
  if (!raw || typeof raw !== "object") return emptyAcl();
  const a = raw as Record<string, unknown>;
  return {
    enabled: a.enabled !== false,
    roleMode: a.roleMode ? String(a.roleMode) : null,
    roleIds: Array.isArray(a.roleIds) ? a.roleIds.map(String) : [],
    channelMode: a.channelMode ? String(a.channelMode) : null,
    channelIds: Array.isArray(a.channelIds) ? a.channelIds.map(String) : [],
    boardFeatureLocked: a.boardFeatureLocked === true,
  };
}

function mapCommands(data: Record<string, unknown>): CommandsPayload {
  const catalogRaw = Array.isArray(data.catalog) ? data.catalog : [];
  const catalog: CatalogCategory[] = catalogRaw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const c = row as Record<string, unknown>;
    const id = String(c.id || "").trim();
    if (!id) return [];
    const cmds = Array.isArray(c.commands) ? c.commands : [];
    const commands: CatalogCommand[] = cmds.flatMap((cmd) => {
      if (!cmd || typeof cmd !== "object") return [];
      const x = cmd as Record<string, unknown>;
      const name = String(x.name || "").trim();
      if (!name) return [];
      return [
        {
          name,
          displayName: String(x.displayName || name).trim() || name,
          kind: String(x.kind || "prefix"),
          slashType: x.type === "user" || x.type === "message" ? x.type : x.kind === "slash" ? "chat" : undefined,
          description: String(x.description || "").trim(),
          alwaysAvailable: x.alwaysAvailable === true,
          syncsToDiscord: x.syncsToDiscord === true,
        },
      ];
    });
    return [
      {
        id,
        label: String(c.label || id).trim() || id,
        order: typeof c.order === "number" ? c.order : undefined,
        commands,
      },
    ];
  });

  const commandsRaw = data.commands && typeof data.commands === "object" ? (data.commands as Record<string, unknown>) : {};
  const commands: Record<string, CommandAcl> = {};
  for (const [k, v] of Object.entries(commandsRaw)) {
    commands[k] = mapAcl(v);
  }

  const discordSync =
    data.discordSync && typeof data.discordSync === "object"
      ? (data.discordSync as Record<string, unknown>)
      : null;
  const warning =
    typeof discordSync?.warning === "string" && discordSync.warning.trim()
      ? discordSync.warning.trim()
      : "";

  return {
    prefix: String(data.prefix || DEFAULT_PREFIX) || DEFAULT_PREFIX,
    catalog,
    commands,
    protectedGuild: data.protectedGuild === true,
    discordWarning: warning,
  };
}

function mapTickets(data: Record<string, unknown>): TicketsSummary {
  const settings = data.settings && typeof data.settings === "object" ? (data.settings as Record<string, unknown>) : {};
  const ov = data.overview && typeof data.overview === "object" ? (data.overview as Record<string, unknown>) : {};
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    enabled: settings.enabled === true,
    overview: {
      open: n(ov.open),
      claimed: n(ov.claimed),
      unclaimed: n(ov.unclaimed),
      closed24h: n(ov.closed24h),
      total: n(ov.total),
    },
  };
}

export async function loadGuildOverview(token: string, guildId: string): Promise<Ok<GuildOverview> | Fail> {
  if (!isGuildId(guildId)) return { ok: false, message: "Server non valido." };
  try {
    const { status, data } = await getJson(`${BASE}/guilds/${encodeURIComponent(guildId)}`, token);
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (status === 403) return failFrom(status, data, "Non hai i permessi per questo server.");
    if (status === 404) return failFrom(status, data, "Server non trovato.");
    if (!data || data.ok === false) return failFrom(status, data, "Impossibile caricare il server.");
    const overview = mapOverview(data);
    if (!overview) return { ok: false, message: "Risposta server non valida." };
    return { ok: true, data: overview };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento del server." };
  }
}

export async function loadGuildSettings(token: string, guildId: string): Promise<Ok<ReturnType<typeof mapSettings>> | Fail> {
  try {
    const { status, data } = await getJson(`${BASE}/guilds/${encodeURIComponent(guildId)}/settings`, token);
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (status === 403) return failFrom(status, data, "Impostazioni non disponibili per il tuo account.");
    if (data?.error === "bot_missing" || data?.error === "main_guild") {
      return failFrom(status, data, typeof data.message === "string" ? data.message : "Impostazioni non disponibili.");
    }
    if (!data || data.ok === false) return failFrom(status, data, "Impossibile caricare le impostazioni.");
    return { ok: true, data: mapSettings(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento impostazioni." };
  }
}

export async function patchGuildSettings(
  token: string,
  guildId: string,
  body: Record<string, unknown>,
): Promise<Ok<ReturnType<typeof mapSettings>> | Fail> {
  try {
    const { status, data } = await patchJson(`${BASE}/guilds/${encodeURIComponent(guildId)}/settings`, token, body);
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (!data || data.ok === false) return failFrom(status, data, "Salvataggio impostazioni non riuscito.");
    return { ok: true, data: mapSettings(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il salvataggio impostazioni." };
  }
}

/** Scarica il JSON di backup della configurazione del server. */
export async function exportGuildConfig(
  token: string,
  guildId: string,
): Promise<{ ok: true; filename: string } | Fail> {
  try {
    const res = await fetch(`${BASE}/guilds/${encodeURIComponent(guildId)}/config/export`, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      credentials: "omit",
    });
    const disp = String(res.headers.get("content-disposition") || "");
    if (!res.ok || !/attachment/i.test(disp)) {
      const data = await res.json().catch(() => null);
      return failFrom(res.status, data, data?.message || "Export configurazione non riuscito.");
    }
    const blob = await res.blob();
    const match = /filename="?([^";]+)"?/i.exec(disp);
    const filename = (match && match[1]) || `vinili-config-${guildId}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, filename };
  } catch {
    return { ok: false, message: "Errore di rete durante l'export configurazione." };
  }
}

/** Ripristina un backup JSON (oggetto config o file già parsato). */
export async function importGuildConfig(
  token: string,
  guildId: string,
  config: Record<string, unknown>,
): Promise<Ok<{ message: string; warnings: string[] }> | Fail> {
  try {
    const res = await fetch(`${BASE}/guilds/${encodeURIComponent(guildId)}/config/import`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ config }),
      credentials: "omit",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) return failFrom(res.status, data, "Sessione scaduta: accedi di nuovo.");
    if (!data || data.ok === false) return failFrom(res.status, data, "Ripristino configurazione non riuscito.");
    const warnings = Array.isArray(data.warnings)
      ? data.warnings.map((w: unknown) => String(w || "").trim()).filter(Boolean)
      : [];
    return {
      ok: true,
      data: {
        message:
          typeof data.message === "string" && data.message.trim()
            ? data.message.trim()
            : "Configurazione ripristinata.",
        warnings,
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete durante il ripristino configurazione." };
  }
}

/** Anteprima canvas quote reale (object URL da revocare). */
/** Immagine d'esempio della skullboard (anteprime della Bacheca), come URL locale. */
export async function previewGuildSkull(token: string, guildId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/guilds/${encodeURIComponent(guildId)}/boards/skull-preview`, {
      headers: authHeaders(token),
      credentials: "omit",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob?.size ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export async function previewGuildQuoteStyle(
  token: string,
  guildId: string,
  quoteStyle: QuoteStyle,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/guilds/${encodeURIComponent(guildId)}/boards/quote-preview`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ quoteStyle }),
      credentials: "omit",
      signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob?.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function loadGuildCommands(token: string, guildId: string): Promise<Ok<CommandsPayload> | Fail> {
  try {
    const { status, data } = await getJson(`${BASE}/guilds/${encodeURIComponent(guildId)}/commands`, token);
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (status === 403) return failFrom(status, data, "Comandi non disponibili per il tuo account.");
    if (data?.error === "bot_missing" || data?.error === "main_guild") {
      return failFrom(status, data, typeof data.message === "string" ? data.message : "Comandi non disponibili.");
    }
    if (!data || data.ok === false) return failFrom(status, data, "Impossibile caricare i comandi.");
    return { ok: true, data: mapCommands(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento comandi." };
  }
}

export async function patchGuildCommandEnabled(
  token: string,
  guildId: string,
  cmdName: string,
  enabled: boolean,
  prev?: CommandAcl | null,
): Promise<Ok<CommandsPayload> | Fail> {
  const name = String(cmdName || "").trim();
  if (!name) return { ok: false, message: "Comando non valido." };
  const base = prev ? { ...prev } : emptyAcl();
  const payload: CommandAcl | null = enabled
    ? base.roleMode || base.channelMode
      ? {
          enabled: true,
          roleMode: base.roleMode,
          roleIds: base.roleMode ? base.roleIds : [],
          channelMode: base.channelMode,
          channelIds: base.channelMode ? base.channelIds : [],
        }
      : null
    : {
        enabled: false,
        roleMode: null,
        roleIds: [],
        channelMode: null,
        channelIds: [],
      };

  try {
    const { status, data } = await patchJson(`${BASE}/guilds/${encodeURIComponent(guildId)}/commands`, token, {
      commands: { [name]: payload },
    });
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (!data || data.ok === false) return failFrom(status, data, "Salvataggio comando non riuscito.");
    return { ok: true, data: mapCommands(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il salvataggio comando." };
  }
}

export async function loadGuildTickets(token: string, guildId: string): Promise<Ok<TicketsSummary> | Fail> {
  try {
    const { status, data } = await getJson(`${BASE}/guilds/${encodeURIComponent(guildId)}/tickets`, token);
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (status === 403) return failFrom(status, data, "Ticket non disponibili per il tuo account.");
    if (!data || data.ok === false) return failFrom(status, data, "Impossibile caricare i ticket.");
    return { ok: true, data: mapTickets(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento ticket." };
  }
}

/** Carica overview + (in parallelo) settings, commands, tickets. */
/*
 * Memoria breve del pannello server (per scheda del browser, 15 minuti): riaprendo un server la pagina
 * compare subito con gli ultimi dati e si aggiorna in silenzio. Prima aspettava sempre il bot (4–10 s nel log).
 */
const PANEL_CACHE_TTL_MS = 15 * 60_000;
const panelCacheKey = (userId: string, guildId: string) => `vc-guild-panel:${userId}:${guildId}`;

export function readGuildPanelCache(userId: string | null | undefined, guildId: string): GuildPanelBundle | null {
  if (!userId || !guildId) return null;
  try {
    const raw = sessionStorage.getItem(panelCacheKey(userId, guildId));
    if (!raw) return null;
    const row = JSON.parse(raw) as { at: number; data: GuildPanelBundle };
    if (!row?.data?.overview || Date.now() - Number(row.at || 0) > PANEL_CACHE_TTL_MS) return null;
    return row.data;
  } catch {
    return null;
  }
}

export function writeGuildPanelCache(userId: string | null | undefined, guildId: string, data: GuildPanelBundle | null) {
  if (!userId || !guildId) return;
  try {
    if (data) sessionStorage.setItem(panelCacheKey(userId, guildId), JSON.stringify({ at: Date.now(), data }));
    else sessionStorage.removeItem(panelCacheKey(userId, guildId));
  } catch {
    /* memoria piena o bloccata: si carica come prima */
  }
}

export async function loadGuildPanel(token: string, guildId: string): Promise<Ok<GuildPanelBundle> | Fail> {
  /* tutte e quattro insieme: prima si aspettava la panoramica e solo dopo partivano le altre tre */
  const restPromise = Promise.all([
    loadGuildSettings(token, guildId),
    loadGuildCommands(token, guildId),
    loadGuildTickets(token, guildId),
  ]);
  restPromise.catch(() => null);
  const overviewRes = await loadGuildOverview(token, guildId);
  if (!overviewRes.ok) return overviewRes;

  const overview = overviewRes.data;
  if (!overview.botPresent) {
    return {
      ok: true,
      data: {
        overview,
        settings: null,
        settingsPickers: EMPTY_SETTINGS_PICKERS,
        settingsError: overview.botUsageBlacklisted
          ? "Questo server non può usare il bot."
          : "Il bot non è presente in questo server.",
        commands: null,
        commandsError: null,
        tickets: null,
        ticketsError: null,
        premiumActive: false,
        premiumUntil: null,
        protectedGuild: overview.isProtectedGuild,
      },
    };
  }

  const [settingsRes, commandsRes, ticketsRes] = await restPromise;

  return {
    ok: true,
    data: {
      overview,
      settings: settingsRes.ok ? settingsRes.data.settings : null,
      settingsPickers: settingsRes.ok ? settingsRes.data.pickers : EMPTY_SETTINGS_PICKERS,
      settingsError: settingsRes.ok ? null : settingsRes.message,
      commands: commandsRes.ok ? commandsRes.data : null,
      commandsError: commandsRes.ok ? null : commandsRes.message,
      tickets: ticketsRes.ok ? ticketsRes.data : null,
      ticketsError: ticketsRes.ok ? null : ticketsRes.message,
      premiumActive: settingsRes.ok ? settingsRes.data.premiumActive : overview.isProtectedGuild,
      premiumUntil: settingsRes.ok ? settingsRes.data.premiumUntil : null,
      protectedGuild: settingsRes.ok
        ? settingsRes.data.protectedGuild
        : overview.isProtectedGuild || (commandsRes.ok && commandsRes.data.protectedGuild),
    },
  };
}

/** ACL vuota e comando acceso → `null` (nessun filtro). Comando spento resta `enabled: false`. */
export function buildCommandAclBody(acl: CommandAcl): CommandAcl | null {
  const enabled = acl.enabled !== false;
  const roleMode = acl.roleMode === "include" || acl.roleMode === "exclude" ? acl.roleMode : null;
  const channelMode = acl.channelMode === "include" || acl.channelMode === "exclude" ? acl.channelMode : null;
  const roleIds = roleMode ? acl.roleIds.map(String).filter((id) => /^\d{16,22}$/.test(id)) : [];
  const channelIds = channelMode ? acl.channelIds.map(String).filter((id) => /^\d{16,22}$/.test(id)) : [];
  const hasRoles = Boolean(roleMode && roleIds.length);
  const hasChannels = Boolean(channelMode && channelIds.length);
  if (enabled && !hasRoles && !hasChannels) return null;
  return {
    enabled,
    roleMode: hasRoles ? roleMode : null,
    roleIds: hasRoles ? roleIds : [],
    channelMode: hasChannels ? channelMode : null,
    channelIds: hasChannels ? channelIds : [],
  };
}

export async function patchGuildCommands(
  token: string,
  guildId: string,
  commands: Record<string, CommandAcl | null>,
): Promise<Ok<CommandsPayload> | Fail> {
  const names = Object.keys(commands);
  if (!names.length) return { ok: false, message: "Nessun comando da salvare." };
  try {
    const { status, data } = await patchJson(`${BASE}/guilds/${encodeURIComponent(guildId)}/commands`, token, {
      commands,
    });
    if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
    if (!data || data.ok === false) return failFrom(status, data, "Salvataggio comandi non riuscito.");
    return { ok: true, data: mapCommands(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il salvataggio comandi." };
  }
}

export async function patchGuildCommandAcl(
  token: string,
  guildId: string,
  cmdName: string,
  acl: CommandAcl,
): Promise<Ok<CommandsPayload> | Fail> {
  const name = String(cmdName || "").trim();
  if (!name) return { ok: false, message: "Comando non valido." };
  return patchGuildCommands(token, guildId, { [name]: buildCommandAclBody(acl) });
}

export function isCommandEnabled(map: Record<string, CommandAcl>, name: string): boolean {
  const acl = map[name];
  return !acl || acl.enabled !== false;
}

export {
  BLACKLIST_MAX_REASON,
  FORM_FIELD_TYPES,
  FORM_LIMITS,
  SUPPORT_DAYS,
  TEAM_PERM_KEYS,
  TICKET_TYPES,
  addTicketBlacklist,
  adjustPartnershipManagerPoints,
  createTicketForm,
  createTicketMulti,
  createTicketPanel,
  createTicketTeam,
  deletePartnership,
  deleteTicketBlacklist,
  deleteTicketForm,
  deleteTicketMulti,
  deleteTicketPanel,
  deleteTicketTeam,
  listPartnershipHistory,
  listTicketList,
  loadPartnership,
  loadPartnershipBlacklist,
  loadPartnershipManagers,
  loadModeration,
  loadModerationCases,
  loadPartnershipMigration,
  loadTicketBlacklist,
  loadTicketForms,
  loadTicketModule,
  loadTicketPanels,
  loadTicketTeams,
  patchGuildTickets,
  patchModeration,
  patchPartnership,
  publishTicketMulti,
  publishTicketPanel,
  addPartnershipBlacklist,
  deletePartnershipBlacklistEntry,
  saveTicketForm,
  searchTicketMembers,
  startPartnershipMigration,
  syncTicketPanels,
  forceCloseTicket,
  undoPartnershipMigration,
  updateTicketMulti,
  updateTicketPanel,
  updateTicketTeam,
} from "@/lib/dashboard-guild-ops";
export type {
  AccessRule,
  ContentFilters,
  FormField,
  FormFieldType,
  MemberHit,
  AutoPunishAction,
  AutoPunishRule,
  ModerationAppeals,
  ModerationBundle,
  ModerationCase,
  ModerationCasesPage,
  ModerationMessages,
  ModerationOverview,
  ModerationSettings,
  PartnershipBundle,
  PartnershipBlacklistEntry,
  PartnershipConfig,
  PartnershipHistory,
  PartnershipManager,
  PartnershipMigration,
  SupportHours,
  TicketBlacklistBundle,
  TicketBlacklistEntry,
  TicketForm,
  TicketFormsBundle,
  TicketListBundle,
  TicketListRow,
  TicketModule,
  TicketQuickReply,
  TicketMulti,
  TicketPanelsBundle,
  TicketPerms,
  TicketSingle,
  TicketTeam,
  TicketTeamsBundle,
  WelcomeEmbed,
} from "@/lib/dashboard-guild-ops";

export function normalizePrefixInput(raw: string, maxLen = PREFIX_MAX_LEN): { ok: true; prefix: string } | { ok: false; message: string } {
  const prefix = String(raw || "").trim();
  if (!prefix || prefix.length > maxLen || /\s/.test(prefix)) {
    return { ok: false, message: `Prefix non valido (1–${maxLen} caratteri, senza spazi).` };
  }
  return { ok: true, prefix };
}
