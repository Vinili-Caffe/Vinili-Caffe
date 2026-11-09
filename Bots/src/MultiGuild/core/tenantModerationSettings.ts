/**
 * Extra impostazioni moderazione per tenant (oltre a GlobalSettings.modConfig e ml in tenant settings).
 * BotState: multiGuildModeration.v1
 */
const { getBotState, setBotState } = require("../../shared/botState/botStateStore") as typeof import("../../shared/botState/botStateStore");
const { isMongoReady } = require("../../shared/db/mongoConnect") as typeof import("../../shared/db/mongoConnect");
const { normalizeGuildId } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");

const BOT_STATE_KEY = "multiGuildModeration.v1";

const DEFAULT_MESSAGES = Object.freeze({
  ban: "***{user} è stato bannato***",
  softban: "***{user} è stato sottoposto a softban***",
  mute: "***{user} è stato silenziato***",
  unban: "***Il ban di {user} è stato revocato***",
  kick: "***{user} è stato espulso***",
  unmute: "***{user} è stato riattivato***",
});

const AUTO_PUNISH_ACTIONS = Object.freeze(["mute", "kick", "ban", "add_role", "remove_role"]);

const DEFAULT_APPEALS = Object.freeze({
  formId: null,
  allowBanned: true,
  allowMuted: true,
  waitDaysBan: 0,
  waitDaysMute: 0,
  dmOnApproveBan: true,
  dmOnApproveMute: true,
  dmOnReject: true,
  inviteUrl: "",
});

const DEFAULTS = Object.freeze({
  requireReason: true,
  banDeleteDays: 7,
  logCommandUsage: true,
  replyWithReason: true,
  useDiscordTimeout: true,
  keepMessagesOnBan: false,
  deleteModCommands: false,
  moderatorRoleIds: Object.freeze([]),
  protectedRoleIds: Object.freeze([]),
  messages: DEFAULT_MESSAGES,
  autoPunishRules: Object.freeze([]),
  appeals: DEFAULT_APPEALS,
});

let cache = Object.freeze({});
let cacheAt = 0;
let refreshPromise = null;
const CACHE_TTL_MS = 15_000;

function normalizeBanDeleteDays(value?) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULTS.banDeleteDays;
  return Math.max(0, Math.min(7, Math.floor(n)));
}

function normalizeIdList(value?, max = 40) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const id = String(raw || "").trim();
    if (!/^\d{16,22}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeMessageTemplate(value?, fallback?) {
  const raw = value == null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return String(fallback || "");
  return trimmed.slice(0, 300);
}

function normalizeMessages(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    ban: normalizeMessageTemplate(src.ban, DEFAULT_MESSAGES.ban),
    softban: normalizeMessageTemplate(src.softban, DEFAULT_MESSAGES.softban),
    mute: normalizeMessageTemplate(src.mute, DEFAULT_MESSAGES.mute),
    unban: normalizeMessageTemplate(src.unban, DEFAULT_MESSAGES.unban),
    kick: normalizeMessageTemplate(src.kick, DEFAULT_MESSAGES.kick),
    unmute: normalizeMessageTemplate(src.unmute, DEFAULT_MESSAGES.unmute),
  };
}

function normalizeAutoPunishAction(value?) {
  const a = String(value || "").trim().toLowerCase();
  return AUTO_PUNISH_ACTIONS.includes(a) ? a : null;
}

function normalizeAutoPunishRule(raw?, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const action = normalizeAutoPunishAction(raw.action ?? raw.a);
  if (!action) return null;
  const warnCount = Math.max(1, Math.min(50, Math.floor(Number(raw.warnCount ?? raw.w) || 0) || 0));
  if (!warnCount) return null;
  const durationMinutes = Math.max(0, Math.min(525600, Math.floor(Number(raw.durationMinutes ?? raw.d) || 0)));
  const roleId = String(raw.roleId ?? raw.r ?? "").trim();
  const needsRole = action === "add_role" || action === "remove_role";
  if (needsRole && !/^\d{16,22}$/.test(roleId)) return null;
  const id = String(raw.id || "").trim() || `ap_${warnCount}_${action}_${index}`;
  return {
    id: id.slice(0, 64),
    warnCount,
    action,
    durationMinutes,
    roleId: needsRole ? roleId : null,
  };
}

function normalizeAutoPunishRules(raw?) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seenWarn = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const rule = normalizeAutoPunishRule(list[i], i);
    if (!rule) continue;
    // Una sola regola per soglia warn (come Dyno tipicamente).
    if (seenWarn.has(rule.warnCount)) continue;
    seenWarn.add(rule.warnCount);
    out.push(rule);
    if (out.length >= 20) break;
  }
  out.sort((a?, b?) => a.warnCount - b.warnCount);
  return out;
}

function normalizeWaitDays(value?) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(365, Math.floor(n)));
}

function normalizeInviteUrl(value?) {
  const raw = String(value || "").trim().slice(0, 300);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(discord\.gg\/|discord\.com\/invite\/)/i.test(raw)) return `https://${raw.replace(/^\/+/, "")}`;
  if (/^[A-Za-z0-9-]{2,64}$/.test(raw)) return `https://discord.gg/${raw}`;
  return raw;
}

function normalizeAppeals(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const formId = String(src.formId ?? src.f ?? "").trim().slice(0, 64);
  return {
    formId: formId || null,
    allowBanned: src.allowBanned !== false && src.ab !== false,
    allowMuted: src.allowMuted !== false && src.am !== false,
    waitDaysBan: normalizeWaitDays(src.waitDaysBan ?? src.wb ?? DEFAULT_APPEALS.waitDaysBan),
    waitDaysMute: normalizeWaitDays(src.waitDaysMute ?? src.wm ?? DEFAULT_APPEALS.waitDaysMute),
    dmOnApproveBan: src.dmOnApproveBan !== false && src.dab !== false,
    dmOnApproveMute: src.dmOnApproveMute !== false && src.dam !== false,
    dmOnReject: src.dmOnReject !== false && src.dr !== false,
    inviteUrl: normalizeInviteUrl(src.inviteUrl ?? src.inv ?? DEFAULT_APPEALS.inviteUrl),
  };
}

function normalizeRow(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const keepMessagesOnBan =
    src.keepMessagesOnBan === true ||
    src.kmb === true ||
    (src.keepMessagesOnBan == null && src.kmb == null && normalizeBanDeleteDays(src.banDeleteDays ?? src.bdd) === 0 && (src.bdd === 0 || src.banDeleteDays === 0));
  const banDeleteDays = keepMessagesOnBan
    ? 0
    : normalizeBanDeleteDays(src.banDeleteDays ?? src.bdd ?? DEFAULTS.banDeleteDays) || DEFAULTS.banDeleteDays;
  return {
    requireReason: src.requireReason !== false && src.rr !== false,
    banDeleteDays,
    logCommandUsage: src.logCommandUsage !== false && src.lcu !== false,
    replyWithReason: src.replyWithReason !== false && src.rwr !== false,
    useDiscordTimeout: src.useDiscordTimeout !== false && src.udt !== false,
    keepMessagesOnBan: keepMessagesOnBan === true,
    deleteModCommands: src.deleteModCommands === true || src.dmc === true,
    moderatorRoleIds: normalizeIdList(src.moderatorRoleIds ?? src.mr),
    protectedRoleIds: normalizeIdList(src.protectedRoleIds ?? src.pr),
    messages: normalizeMessages(src.messages ?? src.msg),
    autoPunishRules: normalizeAutoPunishRules(src.autoPunishRules ?? src.ap),
    appeals: normalizeAppeals(src.appeals ?? src.apls),
  };
}

function encodeRow(config?) {
  const appeals = normalizeAppeals(config.appeals);
  return {
    rr: config.requireReason !== false,
    bdd: normalizeBanDeleteDays(config.banDeleteDays),
    lcu: config.logCommandUsage !== false,
    rwr: config.replyWithReason !== false,
    udt: config.useDiscordTimeout !== false,
    kmb: config.keepMessagesOnBan === true,
    dmc: config.deleteModCommands === true,
    mr: normalizeIdList(config.moderatorRoleIds),
    pr: normalizeIdList(config.protectedRoleIds),
    msg: normalizeMessages(config.messages),
    ap: normalizeAutoPunishRules(config.autoPunishRules).map((rule?) => ({
      id: rule.id,
      w: rule.warnCount,
      a: rule.action,
      d: rule.durationMinutes,
      r: rule.roleId,
    })),
    apls: {
      f: appeals.formId,
      ab: appeals.allowBanned !== false,
      am: appeals.allowMuted !== false,
      wb: appeals.waitDaysBan,
      wm: appeals.waitDaysMute,
      dab: appeals.dmOnApproveBan !== false,
      dam: appeals.dmOnApproveMute !== false,
      dr: appeals.dmOnReject !== false,
      inv: appeals.inviteUrl || "",
    },
  };
}

async function loadMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function refreshTenantModerationCache() {
  cache = Object.freeze(await loadMap());
  cacheAt = Date.now();
  return cache;
}

async function ensureTenantModerationCacheFresh(opts: Record<string, any> = {}) {
  if (!opts.force && cacheAt > 0 && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshTenantModerationCache()
    .catch(() => cache)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function getTenantModerationExtrasSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) {
    return {
      ...DEFAULTS,
      messages: { ...DEFAULT_MESSAGES },
      moderatorRoleIds: [],
      protectedRoleIds: [],
      autoPunishRules: [],
      appeals: { ...DEFAULT_APPEALS },
    };
  }
  return normalizeRow(cache[gid]);
}

async function getTenantModerationExtras(guildId?) {
  await ensureTenantModerationCacheFresh().catch(() => null);
  return getTenantModerationExtrasSync(guildId);
}

async function patchTenantModerationExtras(guildId?, patch: Record<string, any> = {}) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return { ok: false, reason: "invalid_guild" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };
  const map = await loadMap();
  const prev = normalizeRow(map[gid]);
  const nextMessages = Object.prototype.hasOwnProperty.call(patch, "messages")
    ? normalizeMessages({ ...prev.messages, ...(patch.messages && typeof patch.messages === "object" ? patch.messages : {}) })
    : prev.messages;

  let keepMessagesOnBan = prev.keepMessagesOnBan;
  let banDeleteDays = prev.banDeleteDays;
  if (Object.prototype.hasOwnProperty.call(patch, "keepMessagesOnBan")) {
    keepMessagesOnBan = patch.keepMessagesOnBan === true;
    if (keepMessagesOnBan) banDeleteDays = 0;
    else if (banDeleteDays === 0) banDeleteDays = DEFAULTS.banDeleteDays;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "banDeleteDays")) {
    banDeleteDays = normalizeBanDeleteDays(patch.banDeleteDays);
    keepMessagesOnBan = banDeleteDays === 0;
  }

  const next = {
    requireReason: Object.prototype.hasOwnProperty.call(patch, "requireReason")
      ? patch.requireReason === true
      : prev.requireReason,
    banDeleteDays,
    logCommandUsage: Object.prototype.hasOwnProperty.call(patch, "logCommandUsage")
      ? patch.logCommandUsage === true
      : prev.logCommandUsage,
    replyWithReason: Object.prototype.hasOwnProperty.call(patch, "replyWithReason")
      ? patch.replyWithReason === true
      : prev.replyWithReason,
    useDiscordTimeout: Object.prototype.hasOwnProperty.call(patch, "useDiscordTimeout")
      ? patch.useDiscordTimeout === true
      : prev.useDiscordTimeout,
    keepMessagesOnBan,
    deleteModCommands: Object.prototype.hasOwnProperty.call(patch, "deleteModCommands")
      ? patch.deleteModCommands === true
      : prev.deleteModCommands,
    moderatorRoleIds: Object.prototype.hasOwnProperty.call(patch, "moderatorRoleIds")
      ? normalizeIdList(patch.moderatorRoleIds)
      : prev.moderatorRoleIds,
    protectedRoleIds: Object.prototype.hasOwnProperty.call(patch, "protectedRoleIds")
      ? normalizeIdList(patch.protectedRoleIds)
      : prev.protectedRoleIds,
    messages: nextMessages,
    autoPunishRules: Object.prototype.hasOwnProperty.call(patch, "autoPunishRules")
      ? normalizeAutoPunishRules(patch.autoPunishRules)
      : prev.autoPunishRules,
    appeals: Object.prototype.hasOwnProperty.call(patch, "appeals")
      ? normalizeAppeals({ ...prev.appeals, ...(patch.appeals && typeof patch.appeals === "object" ? patch.appeals : {}) })
      : prev.appeals,
  };
  map[gid] = encodeRow(next);
  await setBotState(BOT_STATE_KEY, map);
  await refreshTenantModerationCache().catch(() => null);
  return { ok: true, settings: next };
}

export = {
  BOT_STATE_KEY,
  DEFAULTS,
  DEFAULT_MESSAGES,
  DEFAULT_APPEALS,
  AUTO_PUNISH_ACTIONS,
  normalizeAutoPunishRules,
  normalizeAutoPunishRule,
  normalizeAppeals,
  getTenantModerationExtrasSync,
  getTenantModerationExtras,
  patchTenantModerationExtras,
  ensureTenantModerationCacheFresh,
  refreshTenantModerationCache,
};
