const crypto = require("node:crypto") as typeof import("node:crypto");
const { getBotState, setBotState } = require("../../../../shared/botState/botStateStore") as typeof import("../../../../shared/botState/botStateStore");
const { isMongoReady } = require("../../../../shared/db/mongoConnect") as typeof import("../../../../shared/db/mongoConnect");
const { normalizeGuildId } = require("../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../MultiGuild/core/viniliProtectedGuilds");
const {
  normalizeMentionOnOpen,
  normalizeIdList,
  normalizeAccessRules,
  normalizeTicketPermsOverride,
  normalizeWelcome,
  isWelcomeEmpty,
  defaultWelcomeForTicketType,
  normalizeSupportHours,
  supportHoursLabel,
  panelOpenCustomId,
  asInt: optInt,
  normalizeId: optId,
} = require("../discord/ticketPanelOptions") as typeof import("../discord/ticketPanelOptions");
const {
  DEFAULT_TICKET_PANEL_TITLE,
  DEFAULT_TICKET_PANEL_COLOR,
} = require("../discord/ticketUiDefaults") as typeof import("../discord/ticketUiDefaults");

const BOT_STATE_KEY = "multiGuildTicketPanels.v1";
const TICKET_TYPES = ["supporto", "partnership", "high", "perks"];
const BUTTON_STYLES = ["Primary", "Secondary", "Success", "Danger"];
const MAX_SINGLES = 25;
const MAX_MULTIS = 10;

let panelsCache = Object.freeze({});

function normalizeId(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function asBool(value?, fallback?) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeEmbedColor(value?, fallback = DEFAULT_TICKET_PANEL_COLOR) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function normalizeUrl(value?) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw.slice(0, 512);
}

function normalizeTicketType(value?) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "highstaff") return "high";
  return TICKET_TYPES.includes(key) ? key : null;
}

function ticketTypeToCustomId(type?) {
  const t = normalizeTicketType(type);
  if (t === "supporto") return "ticket_supporto";
  if (t === "partnership") return "ticket_partnership";
  if (t === "high") return "ticket_highstaff";
  if (t === "perks") return "ticket_perks";
  return null;
}

function ticketTypeLabel(type?) {
  const t = normalizeTicketType(type);
  if (t === "supporto") return "SUPPORTO";
  if (t === "partnership") return "PARTNERSHIP";
  if (t === "high") return "HIGH STAFF";
  if (t === "perks") return "PERKS";
  return "TICKET";
}

function normalizeButtonStyle(value?) {
  const raw = String(value || "").trim();
  const hit = BUTTON_STYLES.find((s?) => s.toLowerCase() === raw.toLowerCase());
  return hit || "Primary";
}

function normalizeEmoji(raw?) {
  if (!raw || typeof raw !== "object") {
    const text = String(raw || "").trim();
    if (!text) return null;
    const custom = text.match(/^<(a?):([a-zA-Z0-9_]+):(\d{16,20})>$/);
    if (custom) {
      return { id: custom[3], name: custom[2], animated: custom[1] === "a" };
    }
    return { name: text.slice(0, 32) };
  }
  const id = normalizeId(raw.id);
  const name = String(raw.name || "").trim().slice(0, 32) || null;
  if (id) return { id, name: name || "emoji", animated: asBool(raw.animated, false) };
  if (name) return { name };
  return null;
}

function newPanelId() {
  return crypto.randomBytes(8).toString("hex");
}

function emptyGuildBucket() {
  return { singles: [], multis: [], syncedAt: null };
}

function nullableBool(value?, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  return asBool(value, fallback === null ? false : fallback);
}

function nullableInt(value?, fallback = null, min = 0, max = 100) {
  if (value === null || value === undefined || value === "") return fallback;
  return optInt(value, fallback == null ? 0 : fallback, min, max);
}

function normalizeSupportTeamIds(raw?, max = 10) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src) {
    const id = String(item || "").trim();
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeSingle(raw?, fallback: Record<string, any> = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const ticketType = normalizeTicketType(src.ticketType ?? base.ticketType) || "supporto";
  const id = String(src.id || base.id || newPanelId()).trim() || newPanelId();
  const supportHours = normalizeSupportHours(src.supportHours ?? base.supportHours);
  return {
    id,
    title: String(src.title ?? base.title ?? DEFAULT_TICKET_PANEL_TITLE).trim().slice(0, 256) || DEFAULT_TICKET_PANEL_TITLE,
    content: String(src.content ?? base.content ?? "").trim().slice(0, 4096),
    color: normalizeEmbedColor(src.color ?? base.color, DEFAULT_TICKET_PANEL_COLOR),
    channelId: normalizeId(src.channelId ?? base.channelId),
    disabled: asBool(src.disabled ?? base.disabled, false),
    buttonStyle: normalizeButtonStyle(src.buttonStyle ?? src.buttonColour ?? src.buttonColor ?? base.buttonStyle),
    buttonText: String(src.buttonText ?? base.buttonText ?? DEFAULT_TICKET_PANEL_TITLE).trim().slice(0, 80) || DEFAULT_TICKET_PANEL_TITLE,
    buttonEmoji: normalizeEmoji(src.buttonEmoji ?? base.buttonEmoji),
    ticketType,
        openCustomId: panelOpenCustomId(id) || ticketTypeToCustomId(ticketType),
    largeImageUrl: normalizeUrl(src.largeImageUrl ?? base.largeImageUrl),
    smallImageUrl: normalizeUrl(src.smallImageUrl ?? base.smallImageUrl),
    mentionOnOpen: normalizeMentionOnOpen(src.mentionOnOpen ?? base.mentionOnOpen),
    supportRoleIds: normalizeIdList(src.supportRoleIds ?? base.supportRoleIds, 15),
    supportTeamIds: normalizeSupportTeamIds(src.supportTeamIds ?? base.supportTeamIds),
    transcriptChannelId: optId(src.transcriptChannelId ?? base.transcriptChannelId),
    deleteMentionsOnOpen: asBool(src.deleteMentionsOnOpen ?? base.deleteMentionsOnOpen, false),
    threadMode: asBool(src.threadMode ?? base.threadMode, false),
    threadNotificationChannelId: optId(src.threadNotificationChannelId ?? base.threadNotificationChannelId),
    openCooldownSeconds: optInt(src.openCooldownSeconds ?? base.openCooldownSeconds, 0, 0, 86400),
    categoryId: optId(src.categoryId ?? base.categoryId),
    maxOpenTicketsPerUser: nullableInt(src.maxOpenTicketsPerUser ?? base.maxOpenTicketsPerUser, null, 0, 25),
    hideCloseButton: nullableBool(src.hideCloseButton ?? base.hideCloseButton, null),
    hideCloseReasonButton: nullableBool(src.hideCloseReasonButton ?? base.hideCloseReasonButton, null),
    hideClaimButton: nullableBool(src.hideClaimButton ?? base.hideClaimButton, null),
    formId: String(src.formId ?? base.formId ?? "").trim().slice(0, 64) || null,
    welcome: (() => {
      const welcome = normalizeWelcome(src.welcome ?? base.welcome);
      return isWelcomeEmpty(welcome) ? defaultWelcomeForTicketType(ticketType) : welcome;
    })(),
    ticketPerms: normalizeTicketPermsOverride(src.ticketPerms ?? base.ticketPerms),
    accessRules: normalizeAccessRules(src.accessRules ?? base.accessRules),
    supportHours,
    supportHoursLabel: supportHoursLabel(supportHours),
    messageId: normalizeId(src.messageId ?? base.messageId),
    seedKey: String(src.seedKey ?? base.seedKey ?? "").trim() || null,
    publishedAt: src.publishedAt || base.publishedAt || null,
    createdAt: src.createdAt || base.createdAt || new Date().toISOString(),
    updatedAt: src.updatedAt || base.updatedAt || new Date().toISOString(),
  };
}

function normalizeMulti(raw?, fallback: Record<string, any> = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const id = String(src.id || base.id || newPanelId()).trim() || newPanelId();
  const panelIds = Array.isArray(src.panelIds)
    ? src.panelIds.map((x?) => String(x || "").trim()).filter(Boolean)
    : Array.isArray(base.panelIds)
      ? base.panelIds.map((x?) => String(x || "").trim()).filter(Boolean)
      : [];
  const fieldsSrc = Array.isArray(src.fields) ? src.fields : Array.isArray(base.fields) ? base.fields : [];
  const fields = fieldsSrc
    .map((raw?) => {
      if (!raw || typeof raw !== "object") return null;
      const name = String(raw.name || "").trim().slice(0, 256);
      const value = String(raw.value || "").trim().slice(0, 1024);
      if (!name || !value) return null;
      return { name, value, inline: asBool(raw.inline, false) };
    })
    .filter(Boolean)
    .slice(0, 25);
  const overridesSrc =
    src.optionOverrides && typeof src.optionOverrides === "object" && !Array.isArray(src.optionOverrides)
      ? src.optionOverrides
      : base.optionOverrides && typeof base.optionOverrides === "object" && !Array.isArray(base.optionOverrides)
        ? base.optionOverrides
        : {};
  const optionOverrides: Record<string, any> = {};
  for (const panelId of panelIds) {
    const raw = overridesSrc[panelId] || overridesSrc[String(panelId)];
    if (!raw || typeof raw !== "object") continue;
    const label = String(raw.label || "").trim().slice(0, 100);
    const description = String(raw.description || "").trim().slice(0, 100);
    const useCustomEmoji = asBool(raw.useCustomEmoji, false);
    const emoji = useCustomEmoji ? normalizeEmoji(raw.emoji) : null;
        if (!label && !description && !useCustomEmoji) continue;
    optionOverrides[String(panelId)] = {
      label: label || null,
      description: description || null,
      useCustomEmoji,
      emoji,
    };
  }
  return {
    id,
    title: String(src.title ?? base.title ?? "").trim().slice(0, 256),
    titleUrl: normalizeUrl(src.titleUrl ?? base.titleUrl),
    description: String(src.description ?? base.description ?? "").trim().slice(0, 4096),
    color: normalizeEmbedColor(src.color ?? base.color, DEFAULT_TICKET_PANEL_COLOR),
    channelId: normalizeId(src.channelId ?? base.channelId),
    panelIds: panelIds.slice(0, 25),
    useDropdown: asBool(src.useDropdown ?? base.useDropdown, true),
    dropdownPlaceholder: String(
      src.dropdownPlaceholder ?? base.dropdownPlaceholder ?? "Seleziona un argomento...",
    )
      .trim()
      .slice(0, 150) || "Seleziona un argomento...",
    optionOverrides,
    authorName: String(src.authorName ?? base.authorName ?? "").trim().slice(0, 256) || null,
    authorIconUrl: normalizeUrl(src.authorIconUrl ?? base.authorIconUrl),
    authorUrl: normalizeUrl(src.authorUrl ?? base.authorUrl),
    largeImageUrl: normalizeUrl(src.largeImageUrl ?? base.largeImageUrl),
    smallImageUrl: normalizeUrl(src.smallImageUrl ?? base.smallImageUrl),
    footerText: String(src.footerText ?? base.footerText ?? "").trim().slice(0, 2048) || null,
    footerIconUrl: normalizeUrl(src.footerIconUrl ?? base.footerIconUrl),
    footerTimestamp: asBool(src.footerTimestamp ?? base.footerTimestamp, false),
    fields,
    messageId: normalizeId(src.messageId ?? base.messageId),
    seedKey: String(src.seedKey ?? base.seedKey ?? "").trim() || null,
    publishedAt: src.publishedAt || base.publishedAt || null,
    createdAt: src.createdAt || base.createdAt || new Date().toISOString(),
    updatedAt: src.updatedAt || base.updatedAt || new Date().toISOString(),
  };
}

function normalizeGuildBucket(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const singles = Array.isArray(src.singles) ? src.singles.map((row?) => normalizeSingle(row)) : [];
  const multis = Array.isArray(src.multis) ? src.multis.map((row?) => normalizeMulti(row)) : [];
  return {
    singles,
    multis,
    syncedAt: src.syncedAt || null,
  };
}

function readRootFromCache() {
  return panelsCache && typeof panelsCache === "object" ? panelsCache : {};
}

async function loadPanelsRoot() {
  if (!isMongoReady()) return readRootFromCache();
  const raw = await getBotState(BOT_STATE_KEY, {});
  const root = raw && typeof raw === "object" ? raw : {};
  const next: Record<string, any> = {};
  for (const [gid, bucket] of Object.entries(root)) {
    const id = normalizeGuildId(gid) || String(gid || "").trim();
    if (!id) continue;
    next[id] = normalizeGuildBucket(bucket);
  }
  panelsCache = Object.freeze(next);
  return panelsCache;
}

async function savePanelsRoot(root?) {
  const src = root && typeof root === "object" ? root : {};
  const next: Record<string, any> = {};
  for (const [gid, bucket] of Object.entries(src)) {
    const id = normalizeGuildId(gid) || String(gid || "").trim();
    if (!id) continue;
    next[id] = normalizeGuildBucket(bucket);
  }
  const ok = await setBotState(BOT_STATE_KEY, next);
  if (ok) panelsCache = Object.freeze(next);
  return ok;
}

function getGuildPanelsSync(guildId?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return emptyGuildBucket();
  const hit = readRootFromCache()[gid];
  return hit ? normalizeGuildBucket(hit) : emptyGuildBucket();
}

function findGuildPanelById(guildId?, panelId?) {
  const id = String(panelId || "").trim();
  if (!id) return null;
  const bucket = getGuildPanelsSync(guildId);
  return (bucket.singles || []).find((p?) => String(p.id) === id) || null;
}

async function getGuildPanels(guildId?) {
  await loadPanelsRoot();
  return getGuildPanelsSync(guildId);
}

async function mutateGuildPanels(guildId?, mutator?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return { ok: false, reason: "invalid_guild" };
  const root = { ...(await loadPanelsRoot()) };
  const prev = normalizeGuildBucket(root[gid]);
  const nextBucket = normalizeGuildBucket(mutator(prev) || prev);
  root[gid] = nextBucket;
  const saved = await savePanelsRoot(root);
  if (!saved) return { ok: false, reason: "persist_failed", bucket: prev };
  return { ok: true, bucket: nextBucket };
}

async function refreshTicketPanelsCache() {
  return loadPanelsRoot();
}

export = {
  BOT_STATE_KEY,
  TICKET_TYPES,
  MAX_SINGLES,
  MAX_MULTIS,
  ticketTypeToCustomId,
  ticketTypeLabel,
  normalizeSingle,
  normalizeMulti,
  newPanelId,
  getGuildPanels,
  getGuildPanelsSync,
  findGuildPanelById,
  mutateGuildPanels,
  refreshTicketPanelsCache,
};
