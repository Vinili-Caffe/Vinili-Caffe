// Fetch reali del resto C2: ticket (modulo, lista, pannelli, form, team, blacklist) e partnership.
// Route: Vinili/site/http/siteWebhookRoutes.js → siteDashboardTicket*Api.js / siteDashboardPartnershipApi.js
// Body allineati a WebSite/js/dashboard-guild-tickets.js e dashboard-guild-core.js.

const BASE = "/webhooks/site-dashboard";

type Fail = { ok: false; message: string; error?: string; status?: number };
type Ok<T> = { ok: true; data: T };

export const TICKET_TYPES = ["supporto", "partnership", "high", "perks"] as const;

export const FORM_FIELD_TYPES = [
  "text_input",
  "string_select",
  "user_select",
  "role_select",
  "mentionable_select",
  "channel_select",
  "radio_group",
  "checkbox_group",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_LIMITS = {
  maxForms: 40,
  maxFields: 5,
  maxTitle: 100,
  maxLabel: 45,
  maxDescription: 100,
  maxPlaceholder: 100,
  maxOptions: 25,
  maxOptionsGroup: 10,
};

export const TEAM_PERM_KEYS = [
  "addReactions",
  "sendMessages",
  "sendTtsMessages",
  "embedLinks",
  "attachFiles",
  "mentionEveryone",
  "useExternalEmojis",
  "useApplicationCommands",
  "useExternalStickers",
  "sendVoiceMessages",
] as const;

export const SUPPORT_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export const BLACKLIST_MAX_REASON = 200;

export type PickerChannel = { id: string; name: string; parentId: string | null; kind?: string };
export type PickerRole = { id: string; name: string };
export type PickerEmoji = { id: string; name: string; animated: boolean; url: string | null };

export type TicketOverview = {
  open: number;
  claimed: number;
  unclaimed: number;
  closed24h: number;
  total: number;
};

export type TicketListRow = {
  id: string;
  ticketNumber: number | null;
  username: string | null;
  userId: string | null;
  ticketType: string;
  panelTitle: string | null;
  open: boolean;
  claimedBy: string | null;
  claimedByUsername: string | null;
  channelUrl: string | null;
  transcriptUrl: string | null;
  anonymised: boolean;
};

export type TicketQuickReply = {
  id: string;
  title: string;
  content: string;
};

export type TicketModuleSettings = {
  enabled: boolean;
  panelChannelId: string | null;
  transcriptChannelId: string | null;
  overflowCategoryId: string | null;
  categoryName: string;
  maxOpenTicketsPerUser: number;
  hideCloseButton: boolean;
  hideCloseReasonButton: boolean;
  hideClaimButton: boolean;
  threadMode: boolean;
  storeTranscripts: boolean;
  ratingEnabled: boolean;
  allowUserClose: boolean;
  closeConfirmation: boolean;
  openCommandEnabled: boolean;
  anonymiseDashboardResponses: boolean;
  staleAlertEnabled: boolean;
  staleAlertMinutes: number;
  staleAlertChannelId: string | null;
  quickReplies: TicketQuickReply[];
};

export type TicketModule = {
  enabled: boolean;
  overview: TicketOverview;
  settings: TicketModuleSettings;
  pickers: { textChannels: PickerChannel[]; categories: PickerChannel[]; roles: PickerRole[] };
  recentOpen: TicketListRow[];
};

export type TicketListBundle = {
  tickets: TicketListRow[];
  total: number;
  nextOffset: number | null;
  statusFilter: string;
};

export type WelcomeEmbed = {
  color: string;
  title: string;
  titleUrl: string | null;
  description: string;
  authorName: string | null;
  authorIconUrl: string | null;
  authorUrl: string | null;
  largeImageUrl: string | null;
  smallImageUrl: string | null;
  footerText: string | null;
  footerIconUrl: string | null;
  footerTimestamp: boolean;
  fields: { name: string; value: string; inline: boolean }[];
};

export type SupportDay = { enabled: boolean; allDay: boolean; start: string; end: string };
export type SupportHours = { timezone: string; days: Record<string, SupportDay> };

export type AccessRule = { roleId: string; allow: boolean };

export type TicketPerms = {
  replace: boolean;
  addReactions: boolean;
  sendTtsMessages: boolean;
  embedLinks: boolean;
  attachFiles: boolean;
  useExternalEmojis: boolean;
  useExternalStickers: boolean;
  sendVoiceMessages: boolean;
};

export type TicketSingle = {
  id: string;
  title: string;
  content: string;
  color: string;
  channelId: string | null;
  channelName: string | null;
  disabled: boolean;
  buttonStyle: string;
  buttonText: string;
  buttonEmoji: string | null;
  ticketType: string;
  ticketTypeLabel: string;
  formId: string | null;
  messageId: string | null;
  largeImageUrl: string | null;
  smallImageUrl: string | null;
  mentionOnOpen: string[];
  supportTeamIds: string[];
  transcriptChannelId: string | null;
  deleteMentionsOnOpen: boolean;
  openCooldownSeconds: number;
  categoryId: string | null;
  maxOpenTicketsPerUser: number | null;
  hideCloseButton: boolean | null;
  hideCloseReasonButton: boolean | null;
  hideClaimButton: boolean | null;
  welcome: WelcomeEmbed;
  ticketPerms: TicketPerms | null;
  accessRules: AccessRule[];
  supportHours: SupportHours;
  supportHoursLabel: string;
};

export type TicketMulti = {
  id: string;
  title: string;
  titleUrl: string | null;
  description: string;
  color: string;
  channelId: string | null;
  channelName: string | null;
  panelIds: string[];
  panels: { id: string; title: string; ticketType: string; ticketTypeLabel: string }[];
  useDropdown: boolean;
  dropdownPlaceholder: string;
  optionOverrides: Record<string, { label: string | null; description: string | null }>;
  messageId: string | null;
  fields: { name: string; value: string; inline: boolean }[];
  authorName: string | null;
  footerText: string | null;
  footerTimestamp: boolean;
  largeImageUrl: string | null;
  smallImageUrl: string | null;
};

export type TicketPanelsBundle = {
  quota: { singlesUsed: number; singlesMax: number; multisUsed: number; multisMax: number };
  settings: {
    enabled: boolean;
    panelChannelId: string | null;
    maxOpenTicketsPerUser: number;
    hideCloseButton: boolean;
    hideCloseReasonButton: boolean;
    hideClaimButton: boolean;
    transcriptChannelId: string | null;
    overflowCategoryId: string | null;
  };
  singles: TicketSingle[];
  multis: TicketMulti[];
  teams: { id: string; name: string; isDefault: boolean }[];
  pickers: {
    textChannels: PickerChannel[];
    categories: PickerChannel[];
    roles: PickerRole[];
    emojis: PickerEmoji[];
  };
};

export type FormOption = { label: string; value: string; description: string | null };
export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  style: "short" | "paragraph" | null;
  minLength: number | null;
  maxLength: number | null;
  minValues: number | null;
  maxValues: number | null;
  options: FormOption[];
};
export type TicketForm = { id: string; title: string; fields: FormField[] };
export type TicketFormsBundle = {
  forms: TicketForm[];
  quotas: { forms: number; maxForms: number; maxFields: number };
};

export type TeamMemberRef = { type: "user" | "role"; id: string };
export type TicketTeam = {
  id: string;
  name: string;
  isDefault: boolean;
  members: { id: string; type: "user" | "role"; label: string }[];
  memberIds: TeamMemberRef[];
  perms: Record<string, boolean> | null;
};
export type TicketTeamsBundle = {
  teams: TicketTeam[];
  permKeys: string[];
  defaultPerms: Record<string, boolean>;
  quotas: { teams: number; maxTeams: number; maxMembers: number };
  roles: PickerRole[];
};

export type MemberHit = { id: string; username: string; label: string };

export type TicketBlacklistEntry = {
  id: string;
  type: "user" | "role";
  targetId: string;
  label: string;
  panelId: string | null;
  panelTitle: string | null;
  reason: string | null;
};
export type TicketBlacklistBundle = {
  entries: TicketBlacklistEntry[];
  panels: { id: string; title: string }[];
  roles: PickerRole[];
  quotas: { entries: number; maxEntries: number; maxReason: number };
};

export type ContentFilters = {
  stripMentions: boolean;
  stripMassMentions: boolean;
  stripNonInviteLinks: boolean;
  stripCustomEmojis: boolean;
  stripInvisibleChars: boolean;
  stripSpoilers: boolean;
  stripExtraInvites: boolean;
};

export type PartnershipConfig = {
  partnershipsChannelId: string | null;
  logsChannelId: string | null;
  pmCommandsChannelId: string | null;
  pmCommandsCategoryIds: string[];
  partnerManagerRoleId: string | null;
  managerBadgeRoleId: string | null;
  skipManager: boolean;
  manualPartnershipEnabled: boolean;
  managerLeaveAction: "warn" | "delete" | null;
  sameServerCooldownInput: string;
  setupCompleted: boolean;
  inviteUrl: string | null;
  pings: {
    hereMembers: number | null;
    everyoneMembers: number | null;
    customRoleId: string | null;
    customRoleMembers: number | null;
    hereDelayInput: string;
    everyoneDelayInput: string;
    customRoleDelayInput: string;
  };
  partnerDesc: { mode: string | null; channelId: string | null; staticText: string | null };
  contentFilters: ContentFilters;
  thankYouEmbed: {
    enabled: boolean;
    color: string | null;
    title: string | null;
    description: string | null;
    authorName: string | null;
    footerText: string | null;
    timestampEnabled: boolean;
    /** messaggio completo (testo + embed o Components V2): se c'è, il bot usa questo */
    draft?: import("./dashboard-community").MsgDraft | null;
  };
};

/** testi del ringraziamento predefinito del bot (si vedono nell'editor finché non lo cambi) */
export type ThankYouDefaults = {
  color: string;
  title: string;
  description: string;
  authorName: string;
  footerText: string;
  timestampEnabled: boolean;
};

export type PartnershipBundle = {
  config: PartnershipConfig;
  thankYouDefaults: ThankYouDefaults;
  premiumActive: boolean;
  pickers: { textChannels: PickerChannel[]; categories: PickerChannel[]; roles: PickerRole[] };
};

export type PartnershipBlacklistEntry = {
  guildId: string;
  guildName: string | null;
  iconUrl: string | null;
  invite: string | null;
  note: string;
};

export type PartnershipManager = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
  total: number;
  daily: number;
  weekly: number;
};

export type PartnershipHistory = {
  days: number | null;
  uniqueServers: number;
  totalPartnerships: number;
  page: number;
  totalPages: number;
  entries: {
    guildId: string | null;
    guildName: string | null;
    iconUrl: string | null;
    count: number;
    lastAt: string | null;
    invite: string | null;
  }[];
};

export type PartnershipMigration = {
  job: {
    id: string;
    status: string;
    mode: string | null;
    queuePosition: number | null;
    canUndo: boolean;
    error: string | null;
    imported: number;
  } | null;
};

export type MutationNote = { message: string; warning: string | null };

function authHeaders(token: string, json = false): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request(method: string, path: string, token: string, body?: unknown) {
  const bust = method === "GET" ? `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}` : path;
  const r = await fetch(bust, {
    method,
    cache: "no-store",
    credentials: "omit",
    headers: authHeaders(token, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

function gate(status: number, data: Record<string, unknown>, fallback: string): Fail | null {
  if (status === 401) return failFrom(status, data, "Sessione scaduta: accedi di nuovo.");
  if (!data || data.ok === false) return failFrom(status, data, fallback);
  return null;
}

function note(data: Record<string, unknown>, fallback: string): Ok<MutationNote> {
  const warning = typeof data.publishWarning === "string" && data.publishWarning.trim() ? data.publishWarning.trim() : null;
  const message = typeof data.message === "string" && data.message.trim() ? data.message.trim() : fallback;
  return { ok: true, data: { message, warning } };
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

function strOrNull(v: unknown): string | null {
  const s = str(v).trim();
  return s ? s : null;
}

function n0(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function idList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : [];
}

function mapChannel(row: unknown): PickerChannel | null {
  const r = rec(row);
  if (!r) return null;
  const id = str(r.id).trim();
  if (!id) return null;
  return {
    id,
    name: str(r.name, id).trim() || id,
    parentId: strOrNull(r.parentId),
    kind: strOrNull(r.kind) || undefined,
  };
}

function mapChannels(raw: unknown): PickerChannel[] {
  return Array.isArray(raw) ? raw.map(mapChannel).filter((c): c is PickerChannel => Boolean(c)) : [];
}

function mapRoles(raw: unknown): PickerRole[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    const r = rec(row);
    if (!r) return [];
    const id = str(r.id).trim();
    if (!id) return [];
    return [{ id, name: str(r.name, id).trim() || id }];
  });
}

function mapEmojis(raw: unknown): PickerEmoji[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    const r = rec(row);
    if (!r) return [];
    const id = str(r.id).trim();
    const name = str(r.name).trim();
    if (!id || !name) return [];
    return [{ id, name, animated: r.animated === true, url: strOrNull(r.url) }];
  });
}

function emojiText(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() || null;
  const r = rec(raw);
  if (!r) return null;
  const id = str(r.id).trim();
  const name = str(r.name).trim();
  if (id && name) return `${r.animated === true ? "<a:" : "<:"}${name}:${id}>`;
  return name || null;
}

function mapWelcome(raw: unknown): WelcomeEmbed {
  const w = rec(raw) || {};
  const fields = Array.isArray(w.fields)
    ? w.fields.flatMap((row) => {
        const f = rec(row);
        if (!f) return [];
        const name = str(f.name).trim();
        const value = str(f.value).trim();
        if (!name || !value) return [];
        return [{ name, value, inline: f.inline === true }];
      })
    : [];
  return {
    color: str(w.color, "#6f4e37") || "#6f4e37",
    title: str(w.title),
    titleUrl: strOrNull(w.titleUrl),
    description: str(w.description),
    authorName: strOrNull(w.authorName),
    authorIconUrl: strOrNull(w.authorIconUrl),
    authorUrl: strOrNull(w.authorUrl),
    largeImageUrl: strOrNull(w.largeImageUrl),
    smallImageUrl: strOrNull(w.smallImageUrl),
    footerText: strOrNull(w.footerText),
    footerIconUrl: strOrNull(w.footerIconUrl),
    footerTimestamp: w.footerTimestamp === true,
    fields,
  };
}

function emptyDay(): SupportDay {
  return { enabled: false, allDay: true, start: "09:00", end: "17:00" };
}

function mapSupportHours(raw: unknown): SupportHours {
  const h = rec(raw) || {};
  const daysRaw = rec(h.days) || {};
  const days: Record<string, SupportDay> = {};
  for (const day of SUPPORT_DAYS) {
    const d = rec(daysRaw[day]);
    days[day] = d
      ? {
          enabled: d.enabled === true,
          allDay: d.allDay !== false,
          start: str(d.start, "09:00").slice(0, 5) || "09:00",
          end: str(d.end, "17:00").slice(0, 5) || "17:00",
        }
      : emptyDay();
  }
  return { timezone: str(h.timezone, "Europe/Rome") || "Europe/Rome", days };
}

function mapAccess(raw: unknown): AccessRule[] {
  if (!Array.isArray(raw)) return [{ roleId: "everyone", allow: true }];
  const out: AccessRule[] = [];
  for (const row of raw) {
    const r = rec(row);
    if (!r) continue;
    const roleId = str(r.roleId).trim();
    if (!roleId) continue;
    out.push({ roleId, allow: r.allow !== false });
  }
  return out.length ? out : [{ roleId: "everyone", allow: true }];
}

function mapPerms(raw: unknown): TicketPerms | null {
  const p = rec(raw);
  if (!p) return null;
  return {
    replace: p.replace === true,
    addReactions: p.addReactions === true,
    sendTtsMessages: p.sendTtsMessages === true,
    embedLinks: p.embedLinks === true,
    attachFiles: p.attachFiles === true,
    useExternalEmojis: p.useExternalEmojis === true,
    useExternalStickers: p.useExternalStickers === true,
    sendVoiceMessages: p.sendVoiceMessages === true,
  };
}

function tri(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function mapTicketRow(row: unknown): TicketListRow | null {
  const r = rec(row);
  if (!r) return null;
  const id = str(r.id).trim();
  if (!id) return null;
  const num = Number(r.ticketNumber);
  return {
    id,
    ticketNumber: Number.isFinite(num) ? num : null,
    username: strOrNull(r.username),
    userId: strOrNull(r.userId),
    ticketType: str(r.ticketType, "supporto") || "supporto",
    panelTitle: strOrNull(r.panelTitle),
    open: r.open === true,
    claimedBy: strOrNull(r.claimedBy),
    claimedByUsername: strOrNull(r.claimedByUsername),
    channelUrl: strOrNull(r.channelUrl),
    transcriptUrl: strOrNull(r.transcriptUrl),
    anonymised: r.anonymised === true,
  };
}

function mapOverview(raw: unknown): TicketOverview {
  const ov = rec(raw) || {};
  return {
    open: n0(ov.open),
    claimed: n0(ov.claimed),
    unclaimed: n0(ov.unclaimed),
    closed24h: n0(ov.closed24h),
    total: n0(ov.total),
  };
}

function mapQuickReplies(raw: unknown): TicketQuickReply[] {
  if (!Array.isArray(raw)) return [];
  const out: TicketQuickReply[] = [];
  for (const row of raw) {
    const r = rec(row);
    if (!r) continue;
    const id = str(r.id).trim();
    const title = str(r.title ?? r.t).trim();
    const content = str(r.content ?? r.c).trim();
    if (!id || !title || !content) continue;
    out.push({ id, title, content });
    if (out.length >= 25) break;
  }
  return out;
}

function mapModuleSettings(raw: unknown): TicketModuleSettings {
  const s = rec(raw) || {};
  const maxOpen = Number(s.maxOpenTicketsPerUser);
  const staleMinutes = Number(s.staleAlertMinutes);
  return {
    enabled: s.enabled === true,
    panelChannelId: strOrNull(s.panelChannelId),
    transcriptChannelId: strOrNull(s.transcriptChannelId),
    overflowCategoryId: strOrNull(s.overflowCategoryId),
    categoryName: str(s.categoryName, "Tickets") || "Tickets",
    maxOpenTicketsPerUser: Number.isFinite(maxOpen) && maxOpen > 0 ? maxOpen : 1,
    hideCloseButton: s.hideCloseButton === true,
    hideCloseReasonButton: s.hideCloseReasonButton === true,
    hideClaimButton: s.hideClaimButton === true,
    threadMode: s.threadMode === true,
    storeTranscripts: s.storeTranscripts !== false,
    ratingEnabled: s.ratingEnabled !== false,
    allowUserClose: s.allowUserClose === true,
    closeConfirmation: s.closeConfirmation === true,
    openCommandEnabled: s.openCommandEnabled !== false,
    anonymiseDashboardResponses: s.anonymiseDashboardResponses === true,
    staleAlertEnabled: s.staleAlertEnabled === true,
    staleAlertMinutes: Number.isFinite(staleMinutes) && staleMinutes >= 15 ? Math.min(1440, Math.floor(staleMinutes)) : 120,
    staleAlertChannelId: strOrNull(s.staleAlertChannelId),
    quickReplies: mapQuickReplies(s.quickReplies),
  };
}

function mapModule(data: Record<string, unknown>): TicketModule {
  const settings = mapModuleSettings(data.settings);
  const pickers = rec(data.pickers) || {};
  const ov = rec(data.overview) || {};
  const recent = Array.isArray(ov.recentOpen) ? ov.recentOpen.map(mapTicketRow).filter((r): r is TicketListRow => Boolean(r)) : [];
  return {
    enabled: settings.enabled,
    overview: mapOverview(ov),
    settings,
    pickers: {
      textChannels: mapChannels(pickers.textChannels),
      categories: mapChannels(pickers.categories),
      roles: mapRoles(pickers.roles),
    },
    recentOpen: recent,
  };
}

function mapSingle(row: unknown): TicketSingle | null {
  const p = rec(row);
  if (!p) return null;
  const id = str(p.id).trim();
  if (!id) return null;
  const maxOpen = p.maxOpenTicketsPerUser;
  return {
    id,
    title: str(p.title),
    content: str(p.content),
    color: str(p.color, "#6f4e37") || "#6f4e37",
    channelId: strOrNull(p.channelId),
    channelName: strOrNull(p.channelName),
    disabled: p.disabled === true,
    buttonStyle: str(p.buttonStyle, "Primary") || "Primary",
    buttonText: str(p.buttonText),
    buttonEmoji: emojiText(p.buttonEmoji),
    ticketType: str(p.ticketType, "supporto") || "supporto",
    ticketTypeLabel: str(p.ticketTypeLabel),
    formId: strOrNull(p.formId),
    messageId: strOrNull(p.messageId),
    largeImageUrl: strOrNull(p.largeImageUrl),
    smallImageUrl: strOrNull(p.smallImageUrl),
    mentionOnOpen: idList(p.mentionOnOpen),
    supportTeamIds: idList(p.supportTeamIds),
    transcriptChannelId: strOrNull(p.transcriptChannelId),
    deleteMentionsOnOpen: p.deleteMentionsOnOpen === true,
    openCooldownSeconds: Math.max(0, n0(p.openCooldownSeconds)),
    categoryId: strOrNull(p.categoryId),
    maxOpenTicketsPerUser: maxOpen == null || maxOpen === "" ? null : nOrNull(maxOpen),
    hideCloseButton: tri(p.hideCloseButton),
    hideCloseReasonButton: tri(p.hideCloseReasonButton),
    hideClaimButton: tri(p.hideClaimButton),
    welcome: mapWelcome(p.welcome),
    ticketPerms: mapPerms(p.ticketPerms),
    accessRules: mapAccess(p.accessRules),
    supportHours: mapSupportHours(p.supportHours),
    supportHoursLabel: str(p.supportHoursLabel, "24/7") || "24/7",
  };
}

function mapMulti(row: unknown): TicketMulti | null {
  const m = rec(row);
  if (!m) return null;
  const id = str(m.id).trim();
  if (!id) return null;
  const panels = Array.isArray(m.panels)
    ? m.panels.flatMap((row) => {
        const p = rec(row);
        if (!p) return [];
        const pid = str(p.id).trim();
        if (!pid) return [];
        return [
          {
            id: pid,
            title: str(p.title, pid),
            ticketType: str(p.ticketType),
            ticketTypeLabel: str(p.ticketTypeLabel),
          },
        ];
      })
    : [];
  const ovRaw = rec(m.optionOverrides) || {};
  const optionOverrides: TicketMulti["optionOverrides"] = {};
  for (const [key, value] of Object.entries(ovRaw)) {
    const o = rec(value);
    if (!o) continue;
    optionOverrides[key] = { label: strOrNull(o.label), description: strOrNull(o.description) };
  }
  const fields = Array.isArray(m.fields)
    ? m.fields.flatMap((row) => {
        const f = rec(row);
        if (!f) return [];
        const name = str(f.name).trim();
        const value = str(f.value).trim();
        if (!name || !value) return [];
        return [{ name, value, inline: f.inline === true }];
      })
    : [];
  return {
    id,
    title: str(m.title),
    titleUrl: strOrNull(m.titleUrl),
    description: str(m.description),
    color: str(m.color, "#6f4e37") || "#6f4e37",
    channelId: strOrNull(m.channelId),
    channelName: strOrNull(m.channelName),
    panelIds: idList(m.panelIds),
    panels,
    useDropdown: m.useDropdown !== false,
    dropdownPlaceholder: str(m.dropdownPlaceholder, "Seleziona un argomento...") || "Seleziona un argomento...",
    optionOverrides,
    messageId: strOrNull(m.messageId),
    fields,
    authorName: strOrNull(m.authorName),
    footerText: strOrNull(m.footerText),
    footerTimestamp: m.footerTimestamp === true,
    largeImageUrl: strOrNull(m.largeImageUrl),
    smallImageUrl: strOrNull(m.smallImageUrl),
  };
}

function mapPanels(data: Record<string, unknown>): TicketPanelsBundle {
  const quota = rec(data.quota) || {};
  const settings = rec(data.settings) || {};
  const pickers = rec(data.pickers) || {};
  const maxOpen = Number(settings.maxOpenTicketsPerUser);
  return {
    quota: {
      singlesUsed: n0(quota.singlesUsed),
      singlesMax: n0(quota.singlesMax) || 25,
      multisUsed: n0(quota.multisUsed),
      multisMax: n0(quota.multisMax) || 10,
    },
    settings: {
      enabled: settings.enabled === true,
      panelChannelId: strOrNull(settings.panelChannelId),
      maxOpenTicketsPerUser: Number.isFinite(maxOpen) && maxOpen > 0 ? maxOpen : 1,
      hideCloseButton: settings.hideCloseButton === true,
      hideCloseReasonButton: settings.hideCloseReasonButton === true,
      hideClaimButton: settings.hideClaimButton === true,
      transcriptChannelId: strOrNull(settings.transcriptChannelId),
      overflowCategoryId: strOrNull(settings.overflowCategoryId),
    },
    singles: Array.isArray(data.singles) ? data.singles.map(mapSingle).filter((p): p is TicketSingle => Boolean(p)) : [],
    multis: Array.isArray(data.multis) ? data.multis.map(mapMulti).filter((p): p is TicketMulti => Boolean(p)) : [],
    teams: Array.isArray(data.teams)
      ? data.teams.flatMap((row) => {
          const t = rec(row);
          if (!t) return [];
          const id = str(t.id).trim();
          if (!id) return [];
          return [{ id, name: str(t.name, id), isDefault: t.isDefault === true }];
        })
      : [],
    pickers: {
      textChannels: mapChannels(pickers.textChannels),
      categories: mapChannels(pickers.categories),
      roles: mapRoles(pickers.roles),
      emojis: mapEmojis(pickers.emojis),
    },
  };
}

function mapField(row: unknown): FormField | null {
  const f = rec(row);
  if (!f) return null;
  const id = str(f.id).trim();
  const label = str(f.label).trim();
  if (!id || !label) return null;
  const typeRaw = str(f.type, "text_input");
  const type = (FORM_FIELD_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as FormFieldType) : "text_input";
  const options = Array.isArray(f.options)
    ? f.options.flatMap((opt) => {
        const o = rec(opt);
        if (!o) return [];
        const ol = str(o.label).trim();
        const ov = str(o.value, ol).trim();
        if (!ol || !ov) return [];
        return [{ label: ol, value: ov, description: strOrNull(o.description) }];
      })
    : [];
  return {
    id,
    type,
    label,
    description: strOrNull(f.description),
    placeholder: strOrNull(f.placeholder),
    required: f.required !== false,
    style: f.style === "paragraph" ? "paragraph" : type === "text_input" ? "short" : null,
    minLength: nOrNull(f.minLength),
    maxLength: nOrNull(f.maxLength),
    minValues: nOrNull(f.minValues),
    maxValues: nOrNull(f.maxValues),
    options,
  };
}

function mapForms(data: Record<string, unknown>): TicketFormsBundle {
  const forms = Array.isArray(data.forms)
    ? data.forms.flatMap((row) => {
        const f = rec(row);
        if (!f) return [];
        const id = str(f.id).trim();
        const title = str(f.title).trim();
        if (!id || !title) return [];
        const fields = Array.isArray(f.fields) ? f.fields.map(mapField).filter((x): x is FormField => Boolean(x)) : [];
        return [{ id, title, fields }];
      })
    : [];
  const quotas = rec(data.quotas) || {};
  return {
    forms,
    quotas: {
      forms: n0(quotas.forms) || forms.length,
      maxForms: n0(quotas.maxForms) || FORM_LIMITS.maxForms,
      maxFields: n0(quotas.maxFields) || FORM_LIMITS.maxFields,
    },
  };
}

function mapTeams(data: Record<string, unknown>): TicketTeamsBundle {
  const teams = Array.isArray(data.teams)
    ? data.teams.flatMap((row) => {
        const t = rec(row);
        if (!t) return [];
        const id = str(t.id).trim();
        if (!id) return [];
        const members = Array.isArray(t.members)
          ? t.members.flatMap((m) => {
              const x = rec(m);
              if (!x) return [];
              const mid = str(x.id).trim();
              if (!mid) return [];
              return [
                {
                  id: mid,
                  type: x.type === "user" ? ("user" as const) : ("role" as const),
                  label: str(x.label, mid),
                },
              ];
            })
          : [];
        const memberIds = Array.isArray(t.memberIds)
          ? t.memberIds.flatMap((m) => {
              const x = rec(m);
              if (!x) return [];
              const mid = str(x.id).trim();
              if (!/^\d{16,22}$/.test(mid)) return [];
              return [{ type: x.type === "user" ? ("user" as const) : ("role" as const), id: mid }];
            })
          : members.map((m) => ({ type: m.type, id: m.id }));
        const permsRaw = rec(t.perms);
        const perms = t.isDefault === true || !permsRaw ? null : Object.fromEntries(TEAM_PERM_KEYS.map((k) => [k, permsRaw[k] !== false && (k === "mentionEveryone" ? permsRaw[k] === true : true)]));
        if (perms && permsRaw) {
          for (const k of TEAM_PERM_KEYS) {
            const fallback = k === "mentionEveryone" ? false : true;
            perms[k] = typeof permsRaw[k] === "boolean" ? permsRaw[k] === true : fallback;
          }
        }
        return [
          {
            id,
            name: str(t.name, id),
            isDefault: t.isDefault === true,
            members,
            memberIds,
            perms,
          },
        ];
      })
    : [];
  const quotas = rec(data.quotas) || {};
  const pickers = rec(data.pickers) || {};
  const defaultPermsRaw = rec(data.defaultPerms) || {};
  const defaultPerms: Record<string, boolean> = {};
  for (const k of TEAM_PERM_KEYS) {
    defaultPerms[k] = typeof defaultPermsRaw[k] === "boolean" ? defaultPermsRaw[k] === true : k !== "mentionEveryone";
  }
  return {
    teams,
    permKeys: Array.isArray(data.permKeys) ? data.permKeys.map((k) => str(k)).filter(Boolean) : [...TEAM_PERM_KEYS],
    defaultPerms,
    quotas: {
      teams: n0(quotas.teams) || teams.length,
      maxTeams: n0(quotas.maxTeams) || 25,
      maxMembers: n0(quotas.maxMembers) || 40,
    },
    roles: mapRoles(pickers.roles),
  };
}

function mapBlacklist(data: Record<string, unknown>): TicketBlacklistBundle {
  const entries = Array.isArray(data.entries)
    ? data.entries.flatMap((row) => {
        const e = rec(row);
        if (!e) return [];
        const id = str(e.id).trim();
        if (!id) return [];
        return [
          {
            id,
            type: e.type === "role" ? ("role" as const) : ("user" as const),
            targetId: str(e.targetId),
            label: str(e.label, id),
            panelId: strOrNull(e.panelId),
            panelTitle: strOrNull(e.panelTitle),
            reason: strOrNull(e.reason),
          },
        ];
      })
    : [];
  const quotas = rec(data.quotas) || {};
  const pickers = rec(data.pickers) || {};
  const panels = Array.isArray(data.panels)
    ? data.panels.flatMap((row) => {
        const p = rec(row);
        if (!p) return [];
        const id = str(p.id).trim();
        if (!id) return [];
        return [{ id, title: str(p.title, id) }];
      })
    : [];
  return {
    entries,
    panels,
    roles: mapRoles(pickers.roles),
    quotas: {
      entries: n0(quotas.entries) || entries.length,
      maxEntries: n0(quotas.maxEntries) || 200,
      maxReason: n0(quotas.maxReason) || BLACKLIST_MAX_REASON,
    },
  };
}

function emptyFilters(): ContentFilters {
  return {
    stripMentions: false,
    stripMassMentions: false,
    stripNonInviteLinks: false,
    stripCustomEmojis: false,
    stripInvisibleChars: false,
    stripSpoilers: false,
    stripExtraInvites: false,
  };
}

function mapPartnership(data: Record<string, unknown>): PartnershipBundle {
  const p = rec(data.partnership) || {};
  const pings = rec(p.pings) || {};
  const desc = rec(p.partnerDesc) || {};
  const filters = rec(p.contentFilters) || {};
  const embed = rec(p.thankYouEmbed) || {};
  const tyd = rec(p.thankYouEmbedDefaults) || rec(data.thankYouEmbedDefaults) || {};
  const invite = rec(p.invite);
  const premium = rec(data.premium);
  const pickers = rec(data.pickers) || {};
  const baseFilters = emptyFilters();
  for (const key of Object.keys(baseFilters) as (keyof ContentFilters)[]) {
    baseFilters[key] = filters[key] === true;
  }
  const leave = str(p.managerLeaveAction);
  return {
    premiumActive: premium?.active === true,
    config: {
      partnershipsChannelId: strOrNull(p.partnershipsChannelId),
      logsChannelId: strOrNull(p.logsChannelId),
      pmCommandsChannelId: strOrNull(p.pmCommandsChannelId),
      pmCommandsCategoryIds: idList(p.pmCommandsCategoryIds),
      partnerManagerRoleId: strOrNull(p.partnerManagerRoleId),
      managerBadgeRoleId: strOrNull(p.managerBadgeRoleId),
      skipManager: p.skipManager === true,
      manualPartnershipEnabled: p.manualPartnershipEnabled === true,
      managerLeaveAction: leave === "warn" || leave === "delete" ? leave : null,
      sameServerCooldownInput: str(p.sameServerCooldownInput),
      setupCompleted: p.setupCompleted === true,
      inviteUrl: invite ? strOrNull(invite.url) : null,
      pings: {
        hereMembers: nOrNull(pings.hereMembers),
        everyoneMembers: nOrNull(pings.everyoneMembers),
        customRoleId: strOrNull(pings.customRoleId),
        customRoleMembers: nOrNull(pings.customRoleMembers),
        hereDelayInput: str(pings.hereDelayInput),
        everyoneDelayInput: str(pings.everyoneDelayInput),
        customRoleDelayInput: str(pings.customRoleDelayInput),
      },
      partnerDesc: {
        mode: strOrNull(desc.mode),
        channelId: strOrNull(desc.channelId),
        staticText: strOrNull(desc.staticText),
      },
      contentFilters: baseFilters,
      thankYouEmbed: {
        enabled: embed.enabled === true,
        color: strOrNull(embed.color),
        title: strOrNull(embed.title),
        description: strOrNull(embed.description),
        authorName: strOrNull(embed.authorName),
        footerText: strOrNull(embed.footerText),
        timestampEnabled: embed.timestampEnabled !== false,
        draft: embed.draft && typeof embed.draft === "object" ? (embed.draft as import("./dashboard-community").MsgDraft) : null,
      },
    },
    thankYouDefaults: {
      color: str(tyd.color) || "",
      title: str(tyd.title) || "**PARTNER EFFETTUATA**",
      description:
        str(tyd.description) ||
        "Grazie per aver _effettuato_ una **partner** con `{guild}`\nOra sei a **`{user.points}`** partner!\nContinua ad __effettuare__ partner per riscattare i **premi**.",
      authorName: str(tyd.authorName) || "{user.username}",
      footerText: str(tyd.footerText) || "{partner}",
      timestampEnabled: tyd.timestampEnabled !== false,
    },
    pickers: {
      textChannels: mapChannels(pickers.textChannels),
      categories: mapChannels(pickers.categories),
      roles: mapRoles(pickers.roles),
    },
  };
}

function gpath(guildId: string, suffix: string) {
  return `${BASE}/guilds/${encodeURIComponent(guildId)}${suffix}`;
}

export async function loadTicketModule(token: string, guildId: string): Promise<Ok<TicketModule> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/tickets"), token);
    const blocked = gate(status, data, "Impossibile caricare i ticket.");
    if (blocked) return blocked;
    return { ok: true, data: mapModule(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento ticket." };
  }
}

export async function patchGuildTickets(
  token: string,
  guildId: string,
  body: Record<string, unknown>,
): Promise<Ok<TicketModule> | Fail> {
  try {
    const { status, data } = await request("PATCH", gpath(guildId, "/tickets"), token, body);
    const blocked = gate(status, data, "Salvataggio ticket non riuscito.");
    if (blocked) return blocked;
    return { ok: true, data: mapModule(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il salvataggio ticket." };
  }
}

export async function listTicketList(
  token: string,
  guildId: string,
  query: { status?: string; type?: string; limit?: number; offset?: number } = {},
): Promise<Ok<TicketListBundle> | Fail> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const q = params.toString();
  try {
    const { status, data } = await request("GET", gpath(guildId, `/tickets/list${q ? `?${q}` : ""}`), token);
    const blocked = gate(status, data, "Impossibile caricare l'elenco ticket.");
    if (blocked) return blocked;
    const tickets = Array.isArray(data.tickets) ? data.tickets.map(mapTicketRow).filter((t): t is TicketListRow => Boolean(t)) : [];
    return {
      ok: true,
      data: {
        tickets,
        total: n0(data.total),
        nextOffset: data.nextOffset == null ? null : n0(data.nextOffset),
        statusFilter: str(data.statusFilter, "open") || "open",
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento elenco ticket." };
  }
}

/** Chiude il ticket nel database e elimina il canale Discord se esiste ancora. */
export async function forceCloseTicket(token: string, guildId: string, ticketId: string): Promise<Ok<TicketOverview> | Fail> {
  try {
    const { status, data } = await request("POST", gpath(guildId, `/tickets/${encodeURIComponent(ticketId)}/force-close`), token, {});
    const blocked = gate(status, data, "Impossibile chiudere il ticket.");
    if (blocked) return blocked;
    return { ok: true, data: mapOverview(data.overview) };
  } catch {
    return { ok: false, message: "Errore di rete durante la chiusura del ticket." };
  }
}

export async function loadTicketPanels(token: string, guildId: string): Promise<Ok<TicketPanelsBundle> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/tickets/panels"), token);
    const blocked = gate(status, data, "Impossibile caricare i pannelli.");
    if (blocked) return blocked;
    return { ok: true, data: mapPanels(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento pannelli." };
  }
}

async function mutate(method: string, path: string, token: string, body: unknown, fallback: string): Promise<Ok<MutationNote> | Fail> {
  try {
    const { status, data } = await request(method, path, token, body);
    const blocked = gate(status, data, fallback);
    if (blocked) return blocked;
    return note(data, fallback.replace("non riuscito", "salvato").replace("Impossibile", "Fatto"));
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}

export function createTicketPanel(token: string, guildId: string, body: Record<string, unknown>) {
  return mutate("POST", gpath(guildId, "/tickets/panels"), token, body, "Creazione pannello non riuscita.");
}
export function updateTicketPanel(token: string, guildId: string, panelId: string, body: Record<string, unknown>) {
  return mutate("PATCH", gpath(guildId, `/tickets/panels/${encodeURIComponent(panelId)}`), token, body, "Salvataggio pannello non riuscito.");
}
export function deleteTicketPanel(token: string, guildId: string, panelId: string) {
  return mutate("DELETE", gpath(guildId, `/tickets/panels/${encodeURIComponent(panelId)}`), token, undefined, "Eliminazione pannello non riuscita.");
}
export function publishTicketPanel(token: string, guildId: string, panelId: string, forceNew = false) {
  return mutate(
    "POST",
    gpath(guildId, `/tickets/panels/${encodeURIComponent(panelId)}/publish`),
    token,
    { forceNew },
    "Pubblicazione non riuscita.",
  );
}
export function syncTicketPanels(token: string, guildId: string) {
  return mutate("POST", gpath(guildId, "/tickets/panels/sync"), token, {}, "Sincronizzazione non riuscita.");
}
export function createTicketMulti(token: string, guildId: string, body: Record<string, unknown>) {
  return mutate("POST", gpath(guildId, "/tickets/multipanels"), token, body, "Creazione multi-panel non riuscita.");
}
export function updateTicketMulti(token: string, guildId: string, multiId: string, body: Record<string, unknown>) {
  return mutate("PATCH", gpath(guildId, `/tickets/multipanels/${encodeURIComponent(multiId)}`), token, body, "Salvataggio multi-panel non riuscito.");
}
export function deleteTicketMulti(token: string, guildId: string, multiId: string) {
  return mutate("DELETE", gpath(guildId, `/tickets/multipanels/${encodeURIComponent(multiId)}`), token, undefined, "Eliminazione multi-panel non riuscita.");
}
export function publishTicketMulti(token: string, guildId: string, multiId: string, forceNew = false) {
  return mutate(
    "POST",
    gpath(guildId, `/tickets/multipanels/${encodeURIComponent(multiId)}/publish`),
    token,
    { forceNew },
    "Pubblicazione multi-panel non riuscita.",
  );
}

export async function loadTicketForms(token: string, guildId: string): Promise<Ok<TicketFormsBundle> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/tickets/forms"), token);
    const blocked = gate(status, data, "Impossibile caricare i form.");
    if (blocked) return blocked;
    return { ok: true, data: mapForms(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento form." };
  }
}

async function formsAfter(token: string, guildId: string, status: number, data: Record<string, unknown>, fallback: string) {
  const blocked = gate(status, data, fallback);
  if (blocked) return blocked;
  if (Array.isArray(data.forms)) return { ok: true as const, data: mapForms(data) };
  return loadTicketForms(token, guildId);
}

export async function createTicketForm(token: string, guildId: string, title: string) {
  try {
    const { status, data } = await request("POST", gpath(guildId, "/tickets/forms"), token, { title });
    return formsAfter(token, guildId, status, data, "Creazione form non riuscita.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante la creazione del form." };
  }
}

export async function saveTicketForm(token: string, guildId: string, formId: string, body: { title?: string; fields?: FormField[] }) {
  try {
    const { status, data } = await request("PATCH", gpath(guildId, `/tickets/forms/${encodeURIComponent(formId)}`), token, body);
    return formsAfter(token, guildId, status, data, "Salvataggio non riuscito.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante il salvataggio del form." };
  }
}

export async function deleteTicketForm(token: string, guildId: string, formId: string) {
  try {
    const { status, data } = await request("DELETE", gpath(guildId, `/tickets/forms/${encodeURIComponent(formId)}`), token);
    return formsAfter(token, guildId, status, data, "Eliminazione non riuscita.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante l'eliminazione del form." };
  }
}

export async function loadTicketTeams(token: string, guildId: string): Promise<Ok<TicketTeamsBundle> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/tickets/teams"), token);
    const blocked = gate(status, data, "Impossibile caricare i team.");
    if (blocked) return blocked;
    return { ok: true, data: mapTeams(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento team." };
  }
}

async function teamsAfter(token: string, guildId: string, status: number, data: Record<string, unknown>, fallback: string) {
  const blocked = gate(status, data, fallback);
  if (blocked) return blocked;
  if (Array.isArray(data.teams)) {
    const listed = await loadTicketTeams(token, guildId);
    if (listed.ok) return listed;
  }
  return loadTicketTeams(token, guildId);
}

export async function createTicketTeam(token: string, guildId: string, name: string) {
  try {
    const { status, data } = await request("POST", gpath(guildId, "/tickets/teams"), token, { name });
    return teamsAfter(token, guildId, status, data, "Creazione team non riuscita.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante la creazione del team." };
  }
}

export async function updateTicketTeam(
  token: string,
  guildId: string,
  teamId: string,
  body: { name?: string; members?: TeamMemberRef[]; perms?: Record<string, boolean> | null },
) {
  try {
    const { status, data } = await request("PATCH", gpath(guildId, `/tickets/teams/${encodeURIComponent(teamId)}`), token, body);
    return teamsAfter(token, guildId, status, data, "Salvataggio team non riuscito.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante il salvataggio del team." };
  }
}

export async function deleteTicketTeam(token: string, guildId: string, teamId: string) {
  try {
    const { status, data } = await request("DELETE", gpath(guildId, `/tickets/teams/${encodeURIComponent(teamId)}`), token);
    return teamsAfter(token, guildId, status, data, "Eliminazione team non riuscita.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante l'eliminazione del team." };
  }
}

export async function searchTicketMembers(token: string, guildId: string, q: string): Promise<Ok<MemberHit[]> | Fail> {
  const query = str(q).trim();
  try {
    const { status, data } = await request(
      "GET",
      gpath(guildId, `/tickets/teams/members/search?q=${encodeURIComponent(query)}`),
      token,
    );
    const blocked = gate(status, data, "Ricerca membri non riuscita.");
    if (blocked) return blocked;
    const members = Array.isArray(data.members)
      ? data.members.flatMap((row) => {
          const m = rec(row);
          if (!m) return [];
          const id = str(m.id).trim();
          if (!/^\d{16,22}$/.test(id)) return [];
          const username = str(m.username || m.label).trim();
          if (!username) return [];
          return [{ id, username, label: str(m.label, username) }];
        })
      : [];
    return { ok: true, data: members };
  } catch {
    return { ok: false, message: "Errore di rete durante la ricerca membri." };
  }
}

export async function loadTicketBlacklist(token: string, guildId: string): Promise<Ok<TicketBlacklistBundle> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/tickets/blacklist"), token);
    const blocked = gate(status, data, "Impossibile caricare la blacklist.");
    if (blocked) return blocked;
    return { ok: true, data: mapBlacklist(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento blacklist." };
  }
}

export async function addTicketBlacklist(
  token: string,
  guildId: string,
  body: { type: "user" | "role"; targetId: string; panelId: string | null; reason: string | null },
) {
  try {
    const { status, data } = await request("POST", gpath(guildId, "/tickets/blacklist"), token, body);
    const blocked = gate(status, data, "Aggiunta non riuscita.");
    if (blocked) return blocked;
    const listed = await loadTicketBlacklist(token, guildId);
    if (!listed.ok) return listed;
    const message = str(data.message, "Entry aggiunta alla blacklist.");
    return { ok: true as const, data: { ...listed.data, message } };
  } catch {
    return { ok: false as const, message: "Errore di rete durante l'aggiunta in blacklist." };
  }
}

export async function deleteTicketBlacklist(token: string, guildId: string, entryId: string) {
  try {
    const { status, data } = await request(
      "DELETE",
      gpath(guildId, `/tickets/blacklist/${encodeURIComponent(entryId)}`),
      token,
    );
    const blocked = gate(status, data, "Rimozione non riuscita.");
    if (blocked) return blocked;
    return loadTicketBlacklist(token, guildId);
  } catch {
    return { ok: false as const, message: "Errore di rete durante la rimozione dalla blacklist." };
  }
}

export async function loadPartnership(token: string, guildId: string): Promise<Ok<PartnershipBundle> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/partnership"), token);
    const blocked = gate(status, data, "Impossibile caricare la partnership.");
    if (blocked) return blocked;
    return { ok: true, data: mapPartnership(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento partnership." };
  }
}

export async function patchPartnership(token: string, guildId: string, body: Record<string, unknown>) {
  try {
    const { status, data } = await request("PATCH", gpath(guildId, "/partnership"), token, body);
    const blocked = gate(status, data, "Salvataggio partnership non riuscito.");
    if (blocked) return blocked;
    return { ok: true as const, data: mapPartnership(data) };
  } catch {
    return { ok: false as const, message: "Errore di rete durante il salvataggio partnership." };
  }
}

export async function deletePartnership(token: string, guildId: string) {
  try {
    const { status, data } = await request("DELETE", gpath(guildId, "/partnership"), token);
    const blocked = gate(status, data, "Reset partnership non riuscito.");
    if (blocked) return blocked;
    return note(data, "Configurazione partnership azzerata.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante il reset partnership." };
  }
}

function mapPsBlacklist(data: Record<string, unknown>): PartnershipBlacklistEntry[] {
  return Array.isArray(data.entries)
    ? data.entries.flatMap((row) => {
        const e = rec(row);
        if (!e) return [];
        const guildId = str(e.guildId).trim();
        if (!guildId) return [];
        return [
          {
            guildId,
            guildName: strOrNull(e.guildName),
            iconUrl: strOrNull(e.iconUrl),
            invite: strOrNull(e.invite),
            note: str(e.note),
          },
        ];
      })
    : [];
}

export async function loadPartnershipBlacklist(token: string, guildId: string): Promise<Ok<PartnershipBlacklistEntry[]> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/partnership/blacklist"), token);
    const blocked = gate(status, data, "Impossibile caricare la blacklist partnership.");
    if (blocked) return blocked;
    return { ok: true, data: mapPsBlacklist(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento blacklist partnership." };
  }
}

export async function addPartnershipBlacklist(token: string, guildId: string, target: string, noteText: string) {
  try {
    const { status, data } = await request("POST", gpath(guildId, "/partnership/blacklist"), token, {
      target,
      note: noteText,
    });
    const blocked = gate(status, data, "Aggiunta blacklist non riuscita.");
    if (blocked) return blocked;
    return loadPartnershipBlacklist(token, guildId);
  } catch {
    return { ok: false as const, message: "Errore di rete durante l'aggiunta in blacklist." };
  }
}

export async function deletePartnershipBlacklistEntry(token: string, guildId: string, targetGuildId: string) {
  try {
    const { status, data } = await request(
      "DELETE",
      gpath(guildId, `/partnership/blacklist/${encodeURIComponent(targetGuildId)}`),
      token,
    );
    const blocked = gate(status, data, "Rimozione blacklist non riuscita.");
    if (blocked) return blocked;
    return loadPartnershipBlacklist(token, guildId);
  } catch {
    return { ok: false as const, message: "Errore di rete durante la rimozione dalla blacklist." };
  }
}

export async function loadPartnershipManagers(token: string, guildId: string): Promise<Ok<{ canManagePoints: boolean; managers: PartnershipManager[] }> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/partnership/managers"), token);
    const blocked = gate(status, data, "Impossibile caricare i manager.");
    if (blocked) return blocked;
    const managers = Array.isArray(data.managers)
      ? data.managers.flatMap((row) => {
          const m = rec(row);
          if (!m) return [];
          const userId = str(m.userId).trim();
          if (!userId) return [];
          return [
            {
              userId,
              username: str(m.username, userId),
              displayName: str(m.displayName, str(m.username, userId)),
              avatarUrl: strOrNull(m.avatarUrl),
              points: n0(m.points),
              total: n0(m.total),
              daily: n0(m.daily),
              weekly: n0(m.weekly),
            },
          ];
        })
      : [];
    return { ok: true, data: { canManagePoints: data.canManagePoints === true, managers } };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento manager." };
  }
}

export async function adjustPartnershipManagerPoints(
  token: string,
  guildId: string,
  userId: string,
  action: "add" | "remove",
  amount: number,
) {
  try {
    const { status, data } = await request(
      "POST",
      gpath(guildId, `/partnership/managers/${encodeURIComponent(userId)}/points`),
      token,
      { action, amount },
    );
    const blocked = gate(status, data, "Aggiornamento punti non riuscito.");
    if (blocked) return blocked;
    return note(data, "Punti aggiornati.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante l'aggiornamento punti." };
  }
}

export async function listPartnershipHistory(
  token: string,
  guildId: string,
  query: { days?: number; page?: number; pageSize?: number } = {},
): Promise<Ok<PartnershipHistory> | Fail> {
  const params = new URLSearchParams();
  if (query.days) params.set("days", String(query.days));
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const q = params.toString();
  try {
    const { status, data } = await request("GET", gpath(guildId, `/partnership/history${q ? `?${q}` : ""}`), token);
    const blocked = gate(status, data, "Impossibile caricare la cronologia.");
    if (blocked) return blocked;
    const entries = Array.isArray(data.entries)
      ? data.entries.flatMap((row) => {
          const e = rec(row);
          if (!e) return [];
          return [
            {
              guildId: strOrNull(e.guildId),
              guildName: strOrNull(e.guildName),
              iconUrl: strOrNull(e.iconUrl),
              count: n0(e.count),
              lastAt: strOrNull(e.lastAt),
              invite: strOrNull(e.invite),
            },
          ];
        })
      : [];
    return {
      ok: true,
      data: {
        days: data.days == null ? null : n0(data.days),
        uniqueServers: n0(data.uniqueServers),
        totalPartnerships: n0(data.totalPartnerships),
        page: n0(data.page) || 1,
        totalPages: n0(data.totalPages) || 1,
        entries,
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento cronologia." };
  }
}

function mapMigration(data: Record<string, unknown>): PartnershipMigration {
  const job = rec(data.job);
  if (!job) return { job: null };
  const result = rec(job.result);
  const err = job.error;
  const error =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? str((err as Record<string, unknown>).message)
        : null;
  return {
    job: {
      id: str(job.id),
      status: str(job.status),
      mode: strOrNull(job.mode),
      queuePosition: job.queuePosition == null ? null : n0(job.queuePosition),
      canUndo: job.canUndo === true,
      error: error || null,
      imported: n0(result?.imported),
    },
  };
}

export async function loadPartnershipMigration(token: string, guildId: string): Promise<Ok<PartnershipMigration> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/partnership/migration"), token);
    const blocked = gate(status, data, "Impossibile leggere lo stato migrazione.");
    if (blocked) return blocked;
    return { ok: true, data: mapMigration(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante la lettura migrazione." };
  }
}

export async function startPartnershipMigration(
  token: string,
  guildId: string,
  body: { mode: "configured" | "custom"; channelId?: string | null; logsChannelId?: string | null; roleId?: string | null },
) {
  try {
    const { status, data } = await request("POST", gpath(guildId, "/partnership/migration"), token, body);
    const blocked = gate(status, data, "Avvio migrazione non riuscito.");
    if (blocked) return blocked;
    return note(data, "Migrazione in coda.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante l'avvio migrazione." };
  }
}

export async function undoPartnershipMigration(token: string, guildId: string) {
  try {
    const { status, data } = await request("POST", gpath(guildId, "/partnership/migration/undo"), token, {});
    const blocked = gate(status, data, "Annullamento migrazione non riuscito.");
    if (blocked) return blocked;
    return note(data, "Migrazione annullata.");
  } catch {
    return { ok: false as const, message: "Errore di rete durante l'annullamento migrazione." };
  }
}

/* -- Moderazione ----------------------------------------------- */

export type ModerationMessages = {
  ban: string;
  softban: string;
  mute: string;
  unban: string;
  kick: string;
  unmute: string;
};

export type AutoPunishAction = "mute" | "kick" | "ban" | "add_role" | "remove_role";

export type AutoPunishRule = {
  id: string;
  warnCount: number;
  action: AutoPunishAction;
  durationMinutes: number;
  roleId: string | null;
};

export type ModerationAppeals = {
  formId: string | null;
  allowBanned: boolean;
  allowMuted: boolean;
  waitDaysBan: number;
  waitDaysMute: number;
  dmOnApproveBan: boolean;
  dmOnApproveMute: boolean;
  dmOnReject: boolean;
  inviteUrl: string;
};

export type ModerationSettings = {
  modLogsChannelId: string | null;
  dmOnAction: boolean;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  systemExemptRoleIds: string[];
  systemExemptChannelIds: string[];
  requireReason: boolean;
  banDeleteDays: number;
  logCommandUsage: boolean;
  replyWithReason: boolean;
  useDiscordTimeout: boolean;
  keepMessagesOnBan: boolean;
  deleteModCommands: boolean;
  moderatorRoleIds: string[];
  protectedRoleIds: string[];
  messages: ModerationMessages;
  autoPunishRules: AutoPunishRule[];
  appeals: ModerationAppeals;
};

export type ModerationCase = {
  caseId: number;
  action: string;
  userId: string;
  modId: string;
  reason: string | null;
  durationMs: number | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string | null;
};

export type ModerationOverview = {
  totalCases: number;
  cases7d: number;
  activeWarns: number;
  activeTimed: number;
  byAction: Record<string, number>;
};

export type ModerationBundle = {
  enabled: boolean;
  protectedGuild: boolean;
  settings: ModerationSettings;
  overview: ModerationOverview;
  recentCases: ModerationCase[];
  activeModerations: ModerationCase[];
  pickers: {
    textChannels: { id: string; name: string }[];
    roles: { id: string; name: string; managed?: boolean }[];
    forms: { id: string; title: string }[];
  };
};

export type ModerationCasesPage = {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  recentCases: ModerationCase[];
};

function mapModeration(data: Record<string, unknown>): ModerationBundle {
  const s = rec(data.settings) || {};
  const o = rec(data.overview) || {};
  const pickers = rec(data.pickers) || {};
  const byActionRaw = rec(o.byAction) || {};
  const byAction: Record<string, number> = {};
  for (const [k, v] of Object.entries(byActionRaw)) byAction[k] = n0(v);
  const mapCase = (row: unknown): ModerationCase | null => {
    const c = rec(row);
    if (!c) return null;
    return {
      caseId: n0(c.caseId),
      action: str(c.action).toUpperCase() || "UNKNOWN",
      userId: str(c.userId),
      modId: str(c.modId),
      reason: strOrNull(c.reason),
      durationMs: c.durationMs == null ? null : n0(c.durationMs),
      expiresAt: strOrNull(c.expiresAt),
      active: c.active !== false,
      createdAt: strOrNull(c.createdAt),
    };
  };
  return {
    enabled: data.enabled === true,
    protectedGuild: data.protectedGuild === true,
    settings: {
      modLogsChannelId: strOrNull(s.modLogsChannelId),
      dmOnAction: s.dmOnAction !== false,
      exemptRoleIds: Array.isArray(s.exemptRoleIds) ? s.exemptRoleIds.map(String) : [],
      exemptChannelIds: Array.isArray(s.exemptChannelIds) ? s.exemptChannelIds.map(String) : [],
      systemExemptRoleIds: Array.isArray(s.systemExemptRoleIds) ? s.systemExemptRoleIds.map(String) : [],
      systemExemptChannelIds: Array.isArray(s.systemExemptChannelIds) ? s.systemExemptChannelIds.map(String) : [],
      requireReason: s.requireReason !== false,
      banDeleteDays: Math.max(0, Math.min(7, n0(s.banDeleteDays) || 7)),
      logCommandUsage: s.logCommandUsage !== false,
      replyWithReason: s.replyWithReason !== false,
      useDiscordTimeout: s.useDiscordTimeout !== false,
      keepMessagesOnBan: s.keepMessagesOnBan === true,
      deleteModCommands: s.deleteModCommands === true,
      moderatorRoleIds: Array.isArray(s.moderatorRoleIds) ? s.moderatorRoleIds.map(String) : [],
      protectedRoleIds: Array.isArray(s.protectedRoleIds) ? s.protectedRoleIds.map(String) : [],
      messages: (() => {
        const m = rec(s.messages) || {};
        return {
          ban: str(m.ban) || "***{user} è stato bannato***",
          softban: str(m.softban) || "***{user} è stato sottoposto a softban***",
          mute: str(m.mute) || "***{user} è stato silenziato***",
          unban: str(m.unban) || "***Il ban di {user} è stato revocato***",
          kick: str(m.kick) || "***{user} è stato espulso***",
          unmute: str(m.unmute) || "***{user} è stato riattivato***",
        };
      })(),
      autoPunishRules: Array.isArray(s.autoPunishRules)
        ? s.autoPunishRules.flatMap((row) => {
            const r = rec(row);
            if (!r) return [];
            const action = str(r.action) as AutoPunishAction;
            if (!["mute", "kick", "ban", "add_role", "remove_role"].includes(action)) return [];
            return [
              {
                id: str(r.id) || `ap_${n0(r.warnCount)}_${action}`,
                warnCount: Math.max(1, n0(r.warnCount)),
                action,
                durationMinutes: Math.max(0, n0(r.durationMinutes)),
                roleId: strOrNull(r.roleId),
              },
            ];
          })
        : [],
      appeals: (() => {
        const a = rec(s.appeals) || {};
        return {
          formId: strOrNull(a.formId),
          allowBanned: a.allowBanned !== false,
          allowMuted: a.allowMuted !== false,
          waitDaysBan: Math.max(0, Math.min(365, n0(a.waitDaysBan))),
          waitDaysMute: Math.max(0, Math.min(365, n0(a.waitDaysMute))),
          dmOnApproveBan: a.dmOnApproveBan !== false,
          dmOnApproveMute: a.dmOnApproveMute !== false,
          dmOnReject: a.dmOnReject !== false,
          inviteUrl: str(a.inviteUrl),
        };
      })(),
    },
    overview: {
      totalCases: n0(o.totalCases),
      cases7d: n0(o.cases7d),
      activeWarns: n0(o.activeWarns),
      activeTimed: n0(o.activeTimed),
      byAction,
    },
    recentCases: Array.isArray(data.recentCases) ? (data.recentCases.map(mapCase).filter(Boolean) as ModerationCase[]) : [],
    activeModerations: Array.isArray(data.activeModerations)
      ? (data.activeModerations.map(mapCase).filter(Boolean) as ModerationCase[])
      : [],
    pickers: {
      textChannels: Array.isArray(pickers.textChannels)
        ? pickers.textChannels.flatMap((row) => {
            const c = rec(row);
            if (!c) return [];
            const id = str(c.id).trim();
            if (!id) return [];
            return [{ id, name: str(c.name) || id }];
          })
        : [],
      roles: Array.isArray(pickers.roles)
        ? pickers.roles.flatMap((row) => {
            const r = rec(row);
            if (!r) return [];
            const id = str(r.id).trim();
            if (!id) return [];
            return [{ id, name: str(r.name) || id, managed: r.managed === true }];
          })
        : [],
      forms: Array.isArray(pickers.forms)
        ? pickers.forms.flatMap((row) => {
            const f = rec(row);
            if (!f) return [];
            const id = str(f.id).trim();
            if (!id) return [];
            return [{ id, title: str(f.title) || id }];
          })
        : [],
    },
  };
}

export async function loadModeration(token: string, guildId: string): Promise<Ok<ModerationBundle> | Fail> {
  try {
    const { status, data } = await request("GET", gpath(guildId, "/moderation"), token);
    const blocked = gate(status, data, "Impossibile caricare la moderazione.");
    if (blocked) return blocked;
    return { ok: true, data: mapModeration(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento moderazione." };
  }
}

export async function patchModeration(token: string, guildId: string, body: Record<string, unknown>): Promise<Ok<ModerationBundle> | Fail> {
  try {
    const { status, data } = await request("PATCH", gpath(guildId, "/moderation"), token, body);
    const blocked = gate(status, data, "Salvataggio moderazione non riuscito.");
    if (blocked) return blocked;
    return { ok: true, data: mapModeration(data) };
  } catch {
    return { ok: false, message: "Errore di rete durante il salvataggio moderazione." };
  }
}

export async function loadModerationCases(
  token: string,
  guildId: string,
  opts: { page?: number; pageSize?: number; userId?: string; action?: string; from?: string | number; to?: string | number } = {},
): Promise<Ok<ModerationCasesPage> | Fail> {
  try {
    const qs = new URLSearchParams();
    const reqPage = Math.max(1, Math.floor(Number(opts.page) || 1));
    const reqPageSize = Math.max(1, Math.min(50, Math.floor(Number(opts.pageSize) || 20)));
    qs.set("page", String(reqPage));
    qs.set("pageSize", String(reqPageSize));
    if (opts.userId) qs.set("userId", String(opts.userId).trim());
    if (opts.action && opts.action !== "ALL") qs.set("action", String(opts.action).trim().toUpperCase());
    if (opts.from != null && String(opts.from)) qs.set("from", String(opts.from));
    if (opts.to != null && String(opts.to)) qs.set("to", String(opts.to));
    const { status, data } = await request("GET", gpath(guildId, `/moderation/cases?${qs}`), token);
    const blocked = gate(status, data, "Impossibile caricare i casi di moderazione.");
    if (blocked) return blocked;
    const mapCase = (row: unknown): ModerationCase | null => {
      const c = rec(row);
      if (!c) return null;
      return {
        caseId: n0(c.caseId),
        action: str(c.action).toUpperCase() || "UNKNOWN",
        userId: str(c.userId),
        modId: str(c.modId),
        reason: strOrNull(c.reason),
        durationMs: c.durationMs == null ? null : n0(c.durationMs),
        expiresAt: strOrNull(c.expiresAt),
        active: c.active !== false,
        createdAt: strOrNull(c.createdAt),
      };
    };
    const pageSize = Math.max(1, n0(data.pageSize) || reqPageSize);
    const total = Math.max(0, n0(data.total));
    const pages = Math.max(1, n0(data.pages) || Math.ceil(total / pageSize) || 1);
    return {
      ok: true,
      data: {
        page: Math.min(pages, Math.max(1, n0(data.page) || reqPage)),
        pages,
        pageSize,
        total,
        recentCases: Array.isArray(data.recentCases)
          ? (data.recentCases.map(mapCase).filter(Boolean) as ModerationCase[])
          : [],
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete durante il caricamento casi." };
  }
}
