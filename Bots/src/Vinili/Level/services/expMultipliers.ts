/** EXP: moltiplicatori (ruoli, eventi, settimana). */
const { GlobalSettings } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const botConfig = require("../../config.json") as typeof import("../../config.json");
const { isDiscordSnowflake } = require("./expLevels") as typeof import("./expLevels");
const { parseScheduleMs, parseScheduleEndMs } = require("../../Community/utils/eventDates") as typeof import("../../Community/utils/eventDates");

const DEFAULT_MULTIPLIER = 1;
const MAX_COMBINED_MULTIPLIER = 8;
const MULTIPLIER_CACHE_TTL_MS = 60 * 1000;
const settingsCache = new Map();
const ROLE_MULTIPLIER_DEFS = [
  ["ServerBooster", 2],
  ["MVP", 2],
  ["DoubleBooster", 3],
  ["Donator", 4],
  ["VIP", 5],
  ["VIPplus", 6],
  /** Compleanno: ruolo flair solo quel giorno → ×2 EXP (si toglie a mezzanotte). */
  ["birthdayFlair", 2],
  ["Level100", 1.15],
  ["Level120", 1.2],
  ["Level150", 1.25],
  ["Level200", 1.3],
  ["Level250", 1.35],
  ["Level300", 1.4],
  ["Level350", 1.45],
  ["Level400", 1.5],
  ["Level450", 1.55],
  ["Level500", 1.6],
  ["Level550", 1.65],
  ["Level600", 1.7],
  ["Level650", 1.75],
  ["Level700", 1.8],
  ["Level750", 1.85],
  ["Level800", 1.9],
  ["Level850", 1.95],
  ["Level900", 2],
  ["Level950", 2.05],
  ["Level1000", 2.1],
];

function buildRoleMultipliersFromIds() {
  const out = new Map();
  for (const [roleKey, mult] of ROLE_MULTIPLIER_DEFS) {
    const id = String(IDs.roles?.[roleKey] || "").trim();
    if (!isDiscordSnowflake(id)) continue;
    out.set(id, mult);
  }
  return out;
}

const ROLE_MULTIPLIERS = buildRoleMultipliersFromIds();

function buildRoleMultipliersMerged(doc?) {
  const dbObj =
    doc?.expRoleMultipliers && typeof doc.expRoleMultipliers === "object" && !Array.isArray(doc.expRoleMultipliers)
      ? doc.expRoleMultipliers
      : {};
  const merged = new Map();
  for (const [roleId, value] of ROLE_MULTIPLIERS.entries()) {
    const id = String(roleId || "").trim();
    if (!isDiscordSnowflake(id)) continue;
    if (Object.prototype.hasOwnProperty.call(dbObj, id)) {
      const n = Number(dbObj[id]);
      merged.set(id, Number.isFinite(n) && n > 0 ? n : Number(value));
    } else {
      merged.set(id, Number(value));
    }
  }
  for (const [k, v] of Object.entries(dbObj)) {
    const id = String(k).trim();
    if (!/^\d{16,20}$/.test(id) || merged.has(id)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    merged.set(id, n);
  }
  return merged;
}

function parseExpEventStartMs(value?) {
  return parseScheduleMs(value, "12:00:00");
}

function parseExpEventEndMs(value?) {
  const explicit = parseScheduleMs(value, "12:00:00");
  if (explicit != null && /T\d{2}:\d{2}/.test(String(value || ""))) return explicit;
  return parseScheduleEndMs(value, { endHour: 12 }) ?? parseScheduleMs(value, "23:59:59.999");
}

function getScheduledExpEvent(nowMs = Date.now()) {
  const events = Array.isArray(botConfig?.globalExpEvents) ? botConfig.globalExpEvents : [];
  let best = null;
  for (const event of events) {
    if (!event || event.enabled === false) continue;
    const multiplier = Number(event.multiplier || 1);
    if (!Number.isFinite(multiplier) || multiplier <= 1) continue;
    const startMs = parseExpEventStartMs(event.startDate);
    const endMs = parseExpEventEndMs(event.endDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (nowMs < startMs || nowMs > endMs) continue;
    if (!best || multiplier > best.multiplier) {
      best = { multiplier, expiresAt: new Date(endMs), key: String(event.key || "").trim() || null };
    }
  }
  return best;
}

function normalizeSettingsDoc(doc?) {
  const now = Date.now();
  const expiresAtValue = doc?.expEventMultiplierExpiresAt ? new Date(doc.expEventMultiplierExpiresAt).getTime() : null;
  const tempBoostActive = Number.isFinite(expiresAtValue) && expiresAtValue > now;
  const baseMultiplier = Number(doc?.expMultiplier || DEFAULT_MULTIPLIER);
  const tempEventMultiplier = tempBoostActive ? Number(doc?.expEventMultiplier || 1) : 1;
  const scheduledEvent = getScheduledExpEvent(now);
  const scheduledEventMultiplier = Number(scheduledEvent?.multiplier || 1);
  const eventMultiplier = Math.max(tempEventMultiplier, scheduledEventMultiplier);
  const eventExpiresAt = scheduledEventMultiplier >= tempEventMultiplier
    ? scheduledEvent?.expiresAt || null
    : new Date(expiresAtValue);
  return {
    baseMultiplier:
      Number.isFinite(baseMultiplier) && baseMultiplier > 0
        ? baseMultiplier
        : DEFAULT_MULTIPLIER,
    eventMultiplier:
      Number.isFinite(eventMultiplier) && eventMultiplier > 0
        ? eventMultiplier
        : 1,
    eventExpiresAt: eventMultiplier > 1 ? eventExpiresAt : null,
    lockedChannelIds: Array.isArray(doc?.expLockedChannelIds)
      ? doc.expLockedChannelIds.filter(Boolean)
      : [],
    ignoredRoleIds: Array.isArray(doc?.expIgnoredRoleIds)
      ? doc.expIgnoredRoleIds.filter(Boolean)
      : [],
    roleMultipliersMerged: buildRoleMultipliersMerged(doc),
  };
}

async function getGuildExpSettings(guildId?) {
  if (!guildId) {
    return {
      baseMultiplier: DEFAULT_MULTIPLIER,
      eventMultiplier: 1,
      effectiveMultiplier: DEFAULT_MULTIPLIER,
      eventExpiresAt: null,
      lockedChannelIds: [],
      ignoredRoleIds: [],
      roleMultipliersMerged: buildRoleMultipliersMerged(null),
    };
  }
  const cached = settingsCache.get(guildId);
  const now = Date.now();
  if (cached && now - cached.at < MULTIPLIER_CACHE_TTL_MS) {
    return cached.value;
  }
  const targetGuildId = IDs.guilds.main;
  let doc = null;
  try {
    doc = await GlobalSettings.findOneAndUpdate(
      { guildId: targetGuildId },
      {
        $setOnInsert: {
          expMultiplier: DEFAULT_MULTIPLIER,
          expEventMultiplier: 1,
          expEventMultiplierExpiresAt: null,
          expLockedChannelIds: [],
          expIgnoredRoleIds: [],
          expRoleMultipliers: {},
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[expService] update:", err?.message || err);
  }

  if (
    doc?.expEventMultiplierExpiresAt &&
    new Date(doc.expEventMultiplierExpiresAt).getTime() <= now
  ) {
    try {
      doc = await GlobalSettings.findOneAndUpdate(
        { guildId: targetGuildId },
        {
          $set: {
            expEventMultiplier: 1,
            expEventMultiplierExpiresAt: null,
          },
          $unset: {
            expEventRoleOverrides: 1,
            expEventExtraMultiplierRoleIds: 1,
            expEventStartedAt: 1,
            expEventEndAnnouncementSentForExpiresAt: 1,
          },
        },
        { new: true },
      );
    } catch (err) {
      global.logger?.warn?.("[expService] multiplier reset:", err?.message || err);
    }
  }

  const normalized = normalizeSettingsDoc(doc);
  const value = { ...normalized, effectiveMultiplier: normalized.baseMultiplier * normalized.eventMultiplier, };
  settingsCache.set(guildId, { value, at: now });
  return value;
}

function getRoleMultiplier(member?, settings = null) {
  if (!member?.roles?.cache) return 1;
  const veteranoRoleId = String(IDs.roles?.Veterano || "").trim();
  let multi = 1;
  let hasSpecificRoleMulti = false;
  let veteranoMulti = 1;
  const map = settings?.roleMultipliersMerged instanceof Map ? settings.roleMultipliersMerged : buildRoleMultipliersMerged(null);
  for (const [roleId, value] of map.entries()) {
    if (!member.roles.cache.has(roleId)) continue;
    const parsed = Math.max(1, Number(value) || 1);
    if (veteranoRoleId && String(roleId) === veteranoRoleId) {
      veteranoMulti = Math.max(veteranoMulti, parsed);
      continue;
    }
    hasSpecificRoleMulti = true;
    multi = Math.max(multi, parsed);
  }
  if (!hasSpecificRoleMulti && veteranoRoleId && member.roles.cache.has(veteranoRoleId)) {
    multi = Math.max(multi, veteranoMulti);
  }
  return multi;
}

function combineWeeklyExpMultiplier(globalExpMultiplier?, roleMultiplier?) {
  const globalMulti = Number(globalExpMultiplier);
  const roleMulti = Number(roleMultiplier);
  const safeGlobal = Number.isFinite(globalMulti) && globalMulti > 0 ? globalMulti : 1;
  const safeRole = Number.isFinite(roleMulti) && roleMulti > 0 ? roleMulti : 1;
  const roleBonus = Math.max(0, safeRole - 1);
  return Math.min(MAX_COMBINED_MULTIPLIER, Math.max(1, safeGlobal + roleBonus));
}

async function getResolvedWeeklyExpMultiplier(guild?, userId?, guildSettings = null, memberHint = null) {
  if (!userId) return 1;
  const settings =
    guildSettings && typeof guildSettings === "object"
      ? guildSettings
      : guild
        ? await getGuildExpSettings(guild.id).catch(() => null)
        : null;
  const globalMulti =
    settings && Number(settings.effectiveMultiplier) > 0
      ? Number(settings.effectiveMultiplier)
      : guild
        ? Number(await getGlobalMultiplier(guild.id).catch(() => 1)) || 1
        : 1;
  if (!guild) return combineWeeklyExpMultiplier(globalMulti, 1);
    let member =
    memberHint ||
    guild.members?.cache?.get?.(String(userId)) ||
    null;
  if (!member && guild.members?.fetch) {
    member = await guild.members.fetch({ user: String(userId), force: false }).catch(() => null);
  }
  if (!member) return combineWeeklyExpMultiplier(globalMulti, 1);
  return combineWeeklyExpMultiplier(globalMulti, getRoleMultiplier(member, settings));
}

async function getGlobalMultiplier(guildId?) {
  const settings = await getGuildExpSettings(guildId);
  return settings.effectiveMultiplier;
}

export = { DEFAULT_MULTIPLIER, settingsCache, normalizeSettingsDoc, getGuildExpSettings, getRoleMultiplier, combineWeeklyExpMultiplier, getResolvedWeeklyExpMultiplier, getGlobalMultiplier };
