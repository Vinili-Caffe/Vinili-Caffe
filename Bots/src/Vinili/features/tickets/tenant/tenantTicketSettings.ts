const { getBotState, setBotState } = require("../../../Utils/BotState/botStateStore") as typeof import("../../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../../Utils/Database/mongoConnect") as typeof import("../../../Utils/Database/mongoConnect");
const { normalizeGuildId } = require("../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../MultiGuild/core/viniliProtectedGuilds");
const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const { TICKETS_CATEGORY_NAME } = require("../discord/ticketCategoryUtils") as typeof import("../discord/ticketCategoryUtils");

const DASHBOARD_DEFAULT_CATEGORY_NAME = "Tickets";
const DEFAULT_EMBED_COLOR = "#6f4e37";

function toDashboardCategoryName(value?) {
  const raw = String(value || "").trim();
  if (!raw) return DASHBOARD_DEFAULT_CATEGORY_NAME;
  if (raw === TICKETS_CATEGORY_NAME) return DASHBOARD_DEFAULT_CATEGORY_NAME;
  return raw;
}

const BOT_STATE_KEY = "multiGuildTicketConfig.v1";
const TICKET_TYPES = ["supporto", "partnership", "high", "perks"];
const PANEL_SWITCH_BEHAVIORS = [
  "auto_unclaim",
  "deny_switch",
  "remove_on_unclaim",
  "keep_access",
    "keep_claim",
];

let configCache = Object.freeze({});

function normalizeId(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeTicketCategoryRef(value?) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "__custom__" || raw.toLowerCase() === "custom") return "__custom__";
  return normalizeId(raw);
}

function normalizeRoleIdList(raw?) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[\s,;]+/)
        .map((part?) => part.trim())
        .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const id = normalizeId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function asBool(value?, fallback?) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function asInt(value?, fallback?, min?, max?) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asMsFromParts(parts?, fallbackMs?) {
  if (parts == null) return fallbackMs;
  if (typeof parts === "number" && Number.isFinite(parts)) {
    return Math.min(30 * 24 * 60 * 60 * 1000, Math.max(0, Math.floor(parts)));
  }
  if (typeof parts !== "object") return fallbackMs;
  const d = asInt(parts.d ?? parts.days, 0, 0, 30);
  const h = asInt(parts.h ?? parts.hours, 0, 0, 23);
  const m = asInt(parts.m ?? parts.minutes, 0, 0, 59);
  const ms = ((d * 24 + h) * 60 + m) * 60 * 1000;
  return Math.min(30 * 24 * 60 * 60 * 1000, Math.max(0, ms));
}

function msToParts(ms?) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const minutesTotal = Math.floor(total / 60000);
  const d = Math.floor(minutesTotal / (24 * 60));
  const h = Math.floor((minutesTotal % (24 * 60)) / 60);
  const m = minutesTotal % 60;
  return { d, h, m };
}

function normalizeEmbedColor(value?, fallback = DEFAULT_EMBED_COLOR) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function defaultTicketPerms() {
  return {
    addReactions: true,
    sendTtsMessages: false,
    embedLinks: true,
    attachFiles: true,
    useExternalEmojis: true,
    useExternalStickers: true,
    sendVoiceMessages: false,
  };
}

function normalizeTicketPerms(raw?) {
  const base = defaultTicketPerms();
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    addReactions: asBool(src.addReactions ?? src.ar, base.addReactions),
    sendTtsMessages: asBool(src.sendTtsMessages ?? src.tts, base.sendTtsMessages),
    embedLinks: asBool(src.embedLinks ?? src.el, base.embedLinks),
    attachFiles: asBool(src.attachFiles ?? src.af, base.attachFiles),
    useExternalEmojis: asBool(src.useExternalEmojis ?? src.uee, base.useExternalEmojis),
    useExternalStickers: asBool(src.useExternalStickers ?? src.ues, base.useExternalStickers),
    sendVoiceMessages: asBool(src.sendVoiceMessages ?? src.svm, base.sendVoiceMessages),
  };
}

function defaultBehaviorOptions() {
  return {
    maxOpenTicketsPerUser: 1,
    language: "server",
    allowUserClose: false,
    closeConfirmation: false,
    ratingEnabled: true,
    anonymiseDashboardResponses: false,
    threadMode: false,
    transcriptChannelId: null,
    overflowCategoryId: null,
    storeTranscripts: true,
    hideCloseButton: false,
    hideCloseReasonButton: false,
    hideClaimButton: false,
    openCommandEnabled: true,
    contextMenuEnabled: false,
    claimedStaffCanView: true,
    claimedStaffCanType: false,
    panelSwitchBehavior: "auto_unclaim",
    autoCloseEnabled: true,
    autoCloseOnUserLeave: true,
    autoCloseSinceOpenMs: 24 * 60 * 60 * 1000,
    autoCloseSinceLastMessageMs: 2 * 60 * 60 * 1000,
    embedColor: DEFAULT_EMBED_COLOR,
    ticketPerms: defaultTicketPerms(),
  };
}

function normalizeBehaviorOptions(raw?) {
  const base = defaultBehaviorOptions();
  const src = raw && typeof raw === "object" ? raw : {};
  let panelSwitch = String(src.panelSwitchBehavior ?? src.psb ?? base.panelSwitchBehavior)
    .trim()
    .toLowerCase();
  if (panelSwitch === "keep_claim") panelSwitch = "keep_access";
  return {
    maxOpenTicketsPerUser: asInt(
      src.maxOpenTicketsPerUser ?? src.max,
      base.maxOpenTicketsPerUser,
      1,
      25,
    ),
    language: String(src.language ?? src.lang ?? base.language).trim() || base.language,
    allowUserClose: asBool(src.allowUserClose ?? src.auc, base.allowUserClose),
    closeConfirmation: asBool(src.closeConfirmation ?? src.cc, base.closeConfirmation),
    ratingEnabled: asBool(src.ratingEnabled ?? src.re, base.ratingEnabled),
    anonymiseDashboardResponses: asBool(
      src.anonymiseDashboardResponses ?? src.adr,
      base.anonymiseDashboardResponses,
    ),
    threadMode: asBool(src.threadMode ?? src.tm, base.threadMode),
    transcriptChannelId: normalizeId(src.transcriptChannelId ?? src.tc),
    overflowCategoryId: normalizeTicketCategoryRef(src.overflowCategoryId ?? src.ticketCategoryId ?? src.oc),
    storeTranscripts: asBool(src.storeTranscripts ?? src.st, base.storeTranscripts),
    hideCloseButton: asBool(src.hideCloseButton ?? src.hcb, base.hideCloseButton),
    hideCloseReasonButton: asBool(src.hideCloseReasonButton ?? src.hcrb, base.hideCloseReasonButton),
    hideClaimButton: asBool(src.hideClaimButton ?? src.hclb, base.hideClaimButton),
    openCommandEnabled: asBool(src.openCommandEnabled ?? src.oce, base.openCommandEnabled),
    contextMenuEnabled: asBool(src.contextMenuEnabled ?? src.cme, base.contextMenuEnabled),
    claimedStaffCanView: asBool(src.claimedStaffCanView ?? src.csv, base.claimedStaffCanView),
    claimedStaffCanType: asBool(src.claimedStaffCanType ?? src.cst, base.claimedStaffCanType),
    panelSwitchBehavior: PANEL_SWITCH_BEHAVIORS.includes(panelSwitch)
      ? panelSwitch
      : base.panelSwitchBehavior,
    autoCloseEnabled: asBool(src.autoCloseEnabled ?? src.ace, base.autoCloseEnabled),
    autoCloseOnUserLeave: asBool(src.autoCloseOnUserLeave ?? src.acol, base.autoCloseOnUserLeave),
    autoCloseSinceOpenMs: asMsFromParts(
      src.autoCloseSinceOpenMs ?? src.autoCloseSinceOpen ?? src.acso,
      base.autoCloseSinceOpenMs,
    ),
    autoCloseSinceLastMessageMs: asMsFromParts(
      src.autoCloseSinceLastMessageMs ?? src.autoCloseSinceLastMessage ?? src.acslm,
      base.autoCloseSinceLastMessageMs,
    ),
    embedColor: normalizeEmbedColor(src.embedColor ?? src.ec, base.embedColor),
    ticketPerms: normalizeTicketPerms(src.ticketPerms ?? src.tp),
  };
}

function behaviorToRow(behavior?) {
  const b = normalizeBehaviorOptions(behavior);
  return {
    max: b.maxOpenTicketsPerUser,
    lang: b.language,
    auc: b.allowUserClose,
    cc: b.closeConfirmation,
    re: b.ratingEnabled,
    adr: b.anonymiseDashboardResponses,
    tm: b.threadMode,
    tc: b.transcriptChannelId,
    oc: b.overflowCategoryId,
    st: b.storeTranscripts,
    hcb: b.hideCloseButton,
    hcrb: b.hideCloseReasonButton,
    hclb: b.hideClaimButton,
    oce: b.openCommandEnabled,
    cme: b.contextMenuEnabled,
    csv: b.claimedStaffCanView,
    cst: b.claimedStaffCanType,
    psb: b.panelSwitchBehavior,
    ace: b.autoCloseEnabled,
    acol: b.autoCloseOnUserLeave,
    acso: b.autoCloseSinceOpenMs,
    acslm: b.autoCloseSinceLastMessageMs,
    ec: b.embedColor,
    tp: {
      ar: b.ticketPerms.addReactions,
      tts: b.ticketPerms.sendTtsMessages,
      el: b.ticketPerms.embedLinks,
      af: b.ticketPerms.attachFiles,
      uee: b.ticketPerms.useExternalEmojis,
      ues: b.ticketPerms.useExternalStickers,
      svm: b.ticketPerms.sendVoiceMessages,
    },
  };
}

function defaultTypeConfig(type?) {
  if (type === "supporto") {
    return {
      enabled: true,
      staffRoleIds: [IDs.roles?.Staff, IDs.roles?.HighStaff].filter(Boolean).map(String),
      label: "Supporto",
    };
  }
  if (type === "partnership") {
    return {
      enabled: true,
      staffRoleIds: [IDs.roles?.PartnerManager, IDs.roles?.HighStaff].filter(Boolean).map(String),
      label: "Partnership",
    };
  }
  if (type === "high") {
    return {
      enabled: true,
      staffRoleIds: [IDs.roles?.HighStaff].filter(Boolean).map(String),
      label: "High Staff",
    };
  }
  return {
    enabled: true,
    staffRoleIds: [IDs.roles?.SeniorModerator, IDs.roles?.Director, IDs.roles?.HighStaff]
      .filter(Boolean)
      .map(String),
    label: "Perks",
  };
}

function normalizeTypeEntry(type?, raw?) {
  const base = defaultTypeConfig(type);
  if (!raw || typeof raw !== "object") return { ...base };
  const staffRoleIds = Object.prototype.hasOwnProperty.call(raw, "staffRoleIds")
    || Object.prototype.hasOwnProperty.call(raw, "r")
    ? normalizeRoleIdList(raw.staffRoleIds ?? raw.r)
    : base.staffRoleIds;
  const label = String(raw.label ?? raw.l ?? base.label ?? "").trim() || base.label;
  const enabled =
    raw.enabled === false || raw.e === false || raw.enabled === 0 || raw.e === 0
      ? false
      : raw.enabled === true || raw.e === true || raw.enabled == null
        ? true
        : Boolean(raw.enabled ?? raw.e ?? true);
  return {
    enabled,
    staffRoleIds: staffRoleIds.length ? staffRoleIds : base.staffRoleIds,
    label,
  };
}

function normalizeTypes(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out: Record<string, any> = {};
  for (const type of TICKET_TYPES) {
    out[type] = normalizeTypeEntry(type, src[type]);
  }
  return out;
}

function idsFallbackConfig(guildId?) {
  const isMain = String(IDs.guilds?.main || "").trim() === String(guildId || "").trim();
  return {
    enabled: isMain,
    panelChannelId: normalizeId(IDs.channels?.ticket),
    logChannelId: normalizeId(IDs.channels?.ticketLogs),
    memberRoleId: normalizeId(IDs.roles?.Member),
    staffRoleId: normalizeId(IDs.roles?.Staff),
    highStaffRoleId: normalizeId(IDs.roles?.HighStaff),
    blacklistRoleId: normalizeId(IDs.roles?.blacklistTicket),
    categoryName: DASHBOARD_DEFAULT_CATEGORY_NAME,
    types: normalizeTypes(null),
    ...defaultBehaviorOptions(),
    fromIdsFallback: true,
    hasStoredRow: false,
  };
}

function rowToConfig(row?) {
  if (!row || typeof row !== "object") return null;
  const behavior = normalizeBehaviorOptions(row.behavior || row.b || {});
  return {
    enabled: row.enabled === true || row.e === true,
    panelChannelId: normalizeId(row.panelChannelId ?? row.pc),
    logChannelId: normalizeId(row.logChannelId ?? row.lc),
    memberRoleId: normalizeId(row.memberRoleId ?? row.mr),
    staffRoleId: normalizeId(row.staffRoleId ?? row.sr),
    highStaffRoleId: normalizeId(row.highStaffRoleId ?? row.hs),
    blacklistRoleId: normalizeId(row.blacklistRoleId ?? row.br),
    categoryName: (() => {
      const raw = String(row.categoryName ?? row.cn ?? "").trim();
      if (behavior.overflowCategoryId === "__custom__") {
        return raw.slice(0, 100) || DASHBOARD_DEFAULT_CATEGORY_NAME;
      }
      return toDashboardCategoryName(raw);
    })(),
    types: normalizeTypes(row.types ?? row.t),
    ...behavior,
    fromIdsFallback: false,
    hasStoredRow: true,
  };
}

function configToRow(config?) {
  if (!config) return null;
  const types: Record<string, any> = {};
  for (const type of TICKET_TYPES) {
    const entry = config.types?.[type] || defaultTypeConfig(type);
    types[type] = {
      e: entry.enabled !== false,
      r: Array.isArray(entry.staffRoleIds) ? entry.staffRoleIds : [],
      l: entry.label || defaultTypeConfig(type).label,
    };
  }
  return {
    e: config.enabled === true,
    pc: config.panelChannelId || null,
    lc: config.logChannelId || null,
    mr: config.memberRoleId || null,
    sr: config.staffRoleId || null,
    hs: config.highStaffRoleId || null,
    br: config.blacklistRoleId || null,
    cn:
      config.overflowCategoryId === "__custom__"
        ? String(config.categoryName || DASHBOARD_DEFAULT_CATEGORY_NAME).trim().slice(0, 100) ||
          DASHBOARD_DEFAULT_CATEGORY_NAME
        : toDashboardCategoryName(config.categoryName),
    t: types,
    b: behaviorToRow(config),
  };
}

function mergeWithFallback(guildId?, stored?) {
  const fallback = idsFallbackConfig(guildId);
  if (!stored) return fallback;
  const behavior = normalizeBehaviorOptions({ ...fallback, ...stored });
  return {
    enabled: stored.enabled === true,
    panelChannelId: stored.panelChannelId || fallback.panelChannelId,
    logChannelId: stored.logChannelId || fallback.logChannelId,
    memberRoleId: stored.memberRoleId || fallback.memberRoleId,
    staffRoleId: stored.staffRoleId || fallback.staffRoleId,
    highStaffRoleId: stored.highStaffRoleId || fallback.highStaffRoleId,
    blacklistRoleId: stored.blacklistRoleId || fallback.blacklistRoleId,
    categoryName: toDashboardCategoryName(stored.categoryName || fallback.categoryName),
    types: (() => {
      const out: Record<string, any> = {};
      for (const type of TICKET_TYPES) {
        const s = stored.types?.[type];
        const f = fallback.types[type];
        out[type] = {
          enabled: s ? s.enabled !== false : f.enabled !== false,
          staffRoleIds: s?.staffRoleIds?.length ? s.staffRoleIds : f.staffRoleIds,
          label: (s?.label || f.label || type).trim(),
        };
      }
      return out;
    })(),
    ...behavior,
    transcriptChannelId: behavior.transcriptChannelId || stored.logChannelId || fallback.logChannelId,
    fromIdsFallback: false,
    hasStoredRow: true,
  };
}

async function loadConfigMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function refreshTicketConfigCache() {
  if (!isMongoReady()) return configCache;
  configCache = Object.freeze(await loadConfigMap());
  return configCache;
}

function getTicketSettingsSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return idsFallbackConfig("");
  const stored = rowToConfig(configCache[gid]);
  return mergeWithFallback(gid, stored);
}

async function getTicketSettingsForGuild(guildId?) {
  await refreshTicketConfigCache().catch(() => null);
  return getTicketSettingsSync(guildId);
}

function pickBehaviorPatch(patch?) {
  const keys = [
    "maxOpenTicketsPerUser",
    "language",
    "allowUserClose",
    "closeConfirmation",
    "ratingEnabled",
    "anonymiseDashboardResponses",
    "threadMode",
    "transcriptChannelId",
    "overflowCategoryId",
    "storeTranscripts",
    "hideCloseButton",
    "hideCloseReasonButton",
    "hideClaimButton",
    "openCommandEnabled",
    "contextMenuEnabled",
    "claimedStaffCanView",
    "claimedStaffCanType",
    "panelSwitchBehavior",
    "autoCloseEnabled",
    "autoCloseOnUserLeave",
    "autoCloseSinceOpenMs",
    "autoCloseSinceLastMessageMs",
    "autoCloseSinceOpen",
    "autoCloseSinceLastMessage",
    "ticketPerms",
  ];
  const out: Record<string, any> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
  }
  return out;
}

async function saveTicketSettings(guildId?, patch?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return { ok: false, reason: "invalid_guild" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };

  const map = await loadConfigMap();
  const prev = mergeWithFallback(gid, rowToConfig(map[gid]));
  const nextTypes = { ...prev.types };
  if (patch.types && typeof patch.types === "object") {
    for (const type of TICKET_TYPES) {
      if (!Object.prototype.hasOwnProperty.call(patch.types, type)) continue;
      nextTypes[type] = normalizeTypeEntry(type, {
        ...prev.types[type],
        ...patch.types[type],
      });
    }
  }

  const behaviorPatch = pickBehaviorPatch(patch);
  const nextBehavior = normalizeBehaviorOptions({ ...prev, ...behaviorPatch });

  const next = {
    enabled: Object.prototype.hasOwnProperty.call(patch, "enabled")
      ? patch.enabled === true
      : prev.enabled === true,
    panelChannelId: Object.prototype.hasOwnProperty.call(patch, "panelChannelId")
      ? normalizeId(patch.panelChannelId)
      : prev.panelChannelId,
    logChannelId: Object.prototype.hasOwnProperty.call(patch, "logChannelId")
      ? normalizeId(patch.logChannelId)
      : prev.logChannelId,
    memberRoleId: Object.prototype.hasOwnProperty.call(patch, "memberRoleId")
      ? normalizeId(patch.memberRoleId)
      : prev.memberRoleId,
    staffRoleId: Object.prototype.hasOwnProperty.call(patch, "staffRoleId")
      ? normalizeId(patch.staffRoleId)
      : prev.staffRoleId,
    highStaffRoleId: Object.prototype.hasOwnProperty.call(patch, "highStaffRoleId")
      ? normalizeId(patch.highStaffRoleId)
      : prev.highStaffRoleId,
    blacklistRoleId: Object.prototype.hasOwnProperty.call(patch, "blacklistRoleId")
      ? normalizeId(patch.blacklistRoleId)
      : prev.blacklistRoleId,
    categoryName: (() => {
      const custom = nextBehavior.overflowCategoryId === "__custom__";
      if (Object.prototype.hasOwnProperty.call(patch, "categoryName")) {
        const raw = String(patch.categoryName || "").trim().slice(0, 100);
        if (custom) return raw || DASHBOARD_DEFAULT_CATEGORY_NAME;
        return toDashboardCategoryName(raw);
      }
      if (custom) {
        return (
          String(prev.categoryName || DASHBOARD_DEFAULT_CATEGORY_NAME).trim().slice(0, 100) ||
          DASHBOARD_DEFAULT_CATEGORY_NAME
        );
      }
      return toDashboardCategoryName(prev.categoryName);
    })(),
    types: nextTypes,
    ...nextBehavior,
  };

  if (patch.panelChannelId && !next.panelChannelId) {
    return { ok: false, reason: "invalid_channel" };
  }
  if (patch.logChannelId && !next.logChannelId && String(patch.logChannelId).trim()) {
    return { ok: false, reason: "invalid_channel" };
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "transcriptChannelId")
    && patch.transcriptChannelId
    && !next.transcriptChannelId
  ) {
    return { ok: false, reason: "invalid_channel" };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "overflowCategoryId")) {
    const raw = String(patch.overflowCategoryId || "").trim();
    if (raw && raw !== "__custom__" && raw.toLowerCase() !== "custom" && !next.overflowCategoryId) {
      return { ok: false, reason: "invalid_channel" };
    }
  }
  for (const key of ["memberRoleId", "staffRoleId", "highStaffRoleId", "blacklistRoleId"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] && !next[key]) {
      return { ok: false, reason: "invalid_role" };
    }
  }

  map[gid] = configToRow(next);
  const saved = await setBotState(BOT_STATE_KEY, map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  await refreshTicketConfigCache();

  try {
    const { setTenantGuildFeature } = require("../../../MultiGuild/core/tenantRegistryStore") as typeof import("../../../MultiGuild/core/tenantRegistryStore");
    await setTenantGuildFeature(gid, "ticket", next.enabled === true);
  } catch (_) {}

  return { ok: true, config: mergeWithFallback(gid, next) };
}

function isTicketTypeEnabled(guildId?, type?) {
  const settings = getTicketSettingsSync(guildId);
  const key = String(type || "").toLowerCase() === "highstaff" ? "high" : String(type || "").toLowerCase();
  return settings.types?.[key]?.enabled !== false;
}

function getTicketTypeStaffRoleIds(guildId?, type?) {
  const settings = getTicketSettingsSync(guildId);
  const key = String(type || "").toLowerCase() === "highstaff" ? "high" : String(type || "").toLowerCase();
  const ids = settings.types?.[key]?.staffRoleIds;
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function getTicketPrimaryStaffRoleId(guildId?, type?) {
  const ids = getTicketTypeStaffRoleIds(guildId, type);
  return ids[0] || null;
}

export = {
  BOT_STATE_KEY,
  TICKET_TYPES,
  PANEL_SWITCH_BEHAVIORS,
  DEFAULT_EMBED_COLOR,
  refreshTicketConfigCache,
  getTicketSettingsSync,
  getTicketSettingsForGuild,
  saveTicketSettings,
  isTicketTypeEnabled,
  getTicketTypeStaffRoleIds,
  getTicketPrimaryStaffRoleId,
  idsFallbackConfig,
  normalizeTypes,
  normalizeBehaviorOptions,
  defaultBehaviorOptions,
  msToParts,
  DASHBOARD_DEFAULT_CATEGORY_NAME,
  toDashboardCategoryName,
};
