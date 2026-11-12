const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { isViniliProtectedGuild, normalizeGuildId } = require("../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../MultiGuild/core/viniliProtectedGuilds");
const {
  hasThankYouEmbedContent,
} = require("../../Partner/runtime/partnershipThankYouEmbed") as typeof import("../../Partner/runtime/partnershipThankYouEmbed");

const BOT_STATE_KEY = "multiGuildPartnershipConfig.v1";

let configCache = Object.freeze({});

function normalizeChannelId(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeRoleId(value?) {
  return normalizeChannelId(value);
}

function normalizePositiveInt(value?) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeLeaveAction(value?) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if (!s || s === "null" || s === "none" || s === "off") return null;
  if (s === "delete" || s === "deleter" || s === "delete_5m" || s === "delete5m" || s === "5m" || s === "delay_5m") return "delete";
  if (s === "warn" || s === "warning") return "warn";
  return null;
}

function formatLeaveAction(value?) {
  const action = normalizeLeaveAction(value);
  if (action === "delete") return "`delete`";
  if (action === "warn") return "`warn`";
  return "`null`";
}

function isThankYouEmbedPersisted(thankYouEmbed?) {
  return hasThankYouEmbedContent(thankYouEmbed);
}

function normalizeThankYouEmbed(raw?) {
  if (!raw || typeof raw !== "object") {
    return {
      enabled: false,
      color: null,
      authorIconUrl: null,
      authorName: null,
      title: null,
      thumbnailUrl: null,
      description: null,
      imageUrl: null,
      footerText: null,
      footerIconUrl: null,
      timestampEnabled: true,
      draft: null,
    };
  }
  const description = String(raw.description ?? raw.d ?? "").trim() || null;
  /* messaggio completo dalla dashboard (testo + embed o Components V2): se c'è, vince sui campi singoli */
  const draftRaw = raw.draft ?? raw.dr;
  let draft = null;
  if (draftRaw && typeof draftRaw === "object") {
    try {
      draft = (require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools")).normalizeDraft(draftRaw);
    } catch (_) {
      draft = null;
    }
  }
  const timestampRaw = raw.timestampEnabled ?? raw.ts;
  return {
    enabled: raw.enabled === true || raw.e === true,
    color: String(raw.color ?? raw.c ?? "").trim() || null,
    authorIconUrl: String(raw.authorIconUrl ?? raw.ai ?? "").trim() || null,
    authorName: String(raw.authorName ?? raw.an ?? "").trim() || null,
    title: String(raw.title ?? raw.t ?? "").trim() || null,
    thumbnailUrl: String(raw.thumbnailUrl ?? raw.th ?? "").trim() || null,
    description,
    imageUrl: String(raw.imageUrl ?? raw.im ?? "").trim() || null,
    footerText: String(raw.footerText ?? raw.ft ?? "").trim() || null,
    footerIconUrl: String(raw.footerIconUrl ?? raw.fi ?? "").trim() || null,
    timestampEnabled: timestampRaw === false || timestampRaw === 0 ? false : true,
    draft,
  };
}

function normalizePartnerDesc(raw?) {
  if (!raw || typeof raw !== "object") {
    return {
      mode: null,
      channelId: null,
      staticText: null,
      sourceMessageId: null,
      configured: false,
    };
  }
  const modeRaw = String(raw.mode ?? raw.m ?? "").trim().toLowerCase();
  const mode = modeRaw === "channel" || modeRaw === "static" ? modeRaw : null;
  const channelId = normalizeChannelId(raw.channelId ?? raw.ch);
  const staticText = String(raw.staticText ?? raw.t ?? "").trim() || null;
  const sourceMessageId = String(raw.sourceMessageId ?? raw.sm ?? "").trim() || null;
  const configured = Boolean((mode === "channel" && channelId) || (mode === "static" && staticText));
  return {
    mode: configured ? mode : null,
    channelId,
    staticText,
    sourceMessageId,
    configured,
  };
}

function normalizePings(raw?) {
  if (!raw || typeof raw !== "object") {
    return {
      hereMembers: null,
      everyoneMembers: null,
      customRoleId: null,
      customRoleMembers: null,
      hereDelayMs: null,
      everyoneDelayMs: null,
      customRoleDelayMs: null,
      lastHerePingAt: null,
      lastEveryonePingAt: null,
      lastCustomRolePingAt: null,
      configured: false,
    };
  }
  const customRoleIdRaw = normalizeRoleId(raw.customRoleId ?? raw.cr);
  let customRoleId = customRoleIdRaw;
  try {
    const { remapRoleIdForward } = require("../../Config/emergencyRoleIdRemap") as typeof import("../../Config/emergencyRoleIdRemap");
    customRoleId = remapRoleIdForward(customRoleIdRaw) || customRoleIdRaw;
  } catch (_) {}
  const customRoleMembers = normalizePositiveInt(raw.customRoleMembers ?? raw.crm);
  const hereMembers = normalizePositiveInt(raw.hereMembers ?? raw.h);
  const everyoneMembers = normalizePositiveInt(raw.everyoneMembers ?? raw.e);
  const hereDelayMs = normalizePositiveInt(raw.hereDelayMs ?? raw.hd);
  const everyoneDelayMs = normalizePositiveInt(raw.everyoneDelayMs ?? raw.ed);
  const customRoleDelayMs = normalizePositiveInt(raw.customRoleDelayMs ?? raw.crd);
  const lastHerePingAt = String(raw.lastHerePingAt ?? raw.lhpa ?? "").trim() || null;
  const lastEveryonePingAt = String(raw.lastEveryonePingAt ?? raw.lepa ?? "").trim() || null;
  const lastCustomRolePingAt = String(raw.lastCustomRolePingAt ?? raw.lcpa ?? "").trim() || null;
  const configured = Boolean(
    hereMembers !== null ||
      everyoneMembers !== null ||
      (customRoleId && customRoleMembers !== null),
  );
  return {
    hereMembers,
    everyoneMembers,
    customRoleId,
    customRoleMembers,
    hereDelayMs,
    everyoneDelayMs,
    customRoleDelayMs,
    lastHerePingAt,
    lastEveryonePingAt,
    lastCustomRolePingAt,
    configured,
  };
}

function normalizeCategoryIdList(raw?) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[\s,;]+/)
        .map((part?) => part.trim())
        .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const id = normalizeChannelId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeContentFilters(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    stripMentions: src.stripMentions === true || src.m === true,
    stripMassMentions:
      src.stripMassMentions === true ||
      src.stripEveryoneHere === true ||
      src.e === true,
    stripNonInviteLinks: src.stripNonInviteLinks === true || src.l === true,
    stripCustomEmojis: src.stripCustomEmojis === true || src.ce === true,
    stripInvisibleChars: src.stripInvisibleChars === true || src.z === true,
    stripSpoilers: src.stripSpoilers === true || src.sp === true,
    stripExtraInvites: src.stripExtraInvites === true || src.xi === true,
  };
}

function contentFiltersToRow(filters?) {
  const n = normalizeContentFilters(filters);
    return {
    ...(n.stripMentions ? { m: true } : {}),
    ...(n.stripMassMentions ? { e: true } : {}),
    ...(n.stripNonInviteLinks ? { l: true } : {}),
    ...(n.stripCustomEmojis ? { ce: true } : {}),
    ...(n.stripInvisibleChars ? { z: true } : {}),
    ...(n.stripSpoilers ? { sp: true } : {}),
    ...(n.stripExtraInvites ? { xi: true } : {}),
  };
}

function rowToConfig(row?) {
  if (!row || typeof row !== "object") return null;
  const partnershipsChannelId = normalizeChannelId(row.pc ?? row.partnershipsChannelId);
  const logsChannelId = normalizeChannelId(row.lc ?? row.logsChannelId);
  const partnerManagerRoleId = normalizeRoleId(row.pr ?? row.partnerManagerRoleId);
  const inviteRaw = row.inv && typeof row.inv === "object" ? row.inv : null;
  const invite = inviteRaw
    ? {
        code: String(inviteRaw.code || inviteRaw.c || "").trim() || null,
        url: String(inviteRaw.url || inviteRaw.u || "").trim() || null,
        channelId: normalizeChannelId(inviteRaw.channelId ?? inviteRaw.ch),
      }
    : { code: null, url: null, channelId: null };
  const pings = normalizePings(row.pings ?? row.p);
  const thankYouEmbed = normalizeThankYouEmbed(row.thankYouEmbed ?? row.ty);
  const partnerDesc = normalizePartnerDesc(row.partnerDesc ?? row.pd);
  const hasContentFilters =
    Object.prototype.hasOwnProperty.call(row, "cf") ||
    Object.prototype.hasOwnProperty.call(row, "contentFilters");
  const contentFilters = normalizeContentFilters(row.contentFilters ?? row.cf);
  const pmCommandsChannelId = normalizeChannelId(row.pmc ?? row.pmCommandsChannelId);
  const pmCommandsCategoryIds = normalizeCategoryIdList(
    row.pmcc ?? row.pmCommandsCategoryIds ?? row.pmCategories,
  );
  return {
    partnershipsChannelId,
    logsChannelId,
    partnerManagerRoleId,
    invite,
    pings,
    thankYouEmbed,
    partnerDesc,
    contentFilters,
    contentFiltersConfigured: hasContentFilters,
    pmCommandsChannelId,
    pmCommandsCategoryIds,
    manualPartnershipEnabled: row.manualPartnershipEnabled === true || row.mp === true,
    skipManager: row.skipManager === true || row.sk === true,
    managerBadgeRoleId: normalizeRoleId(row.managerBadgeRoleId ?? row.mbr),
    managerLeaveAction: normalizeLeaveAction(row.managerLeaveAction ?? row.mla),
    behaviorDeleteAction: normalizeLeaveAction(row.behaviorDeleteAction ?? row.bda),
        sameServerCooldownMs: (() => {
      const has =
        Object.prototype.hasOwnProperty.call(row, "sscd") ||
        Object.prototype.hasOwnProperty.call(row, "sameServerCooldownMs");
      if (!has) return undefined;
      const n = normalizePositiveInt(row.sscd ?? row.sameServerCooldownMs);
      return n && n > 0 ? n : null;
    })(),
    setupCompleted: row.setupCompleted === true || row.sc === true,
    setupCompletedAt: row.setupCompletedAt ?? row.sca ?? null,
    setupCompletedBy: row.setupCompletedBy ?? row.scb ?? null,
  };
}

function configToRow(config?) {
  if (!config) return null;
  return {
    pc: config.partnershipsChannelId || null,
    lc: config.logsChannelId || null,
    pr: config.partnerManagerRoleId || null,
    inv: config.invite?.code
      ? {
          c: config.invite.code,
          u: config.invite.url || null,
          ch: config.invite.channelId || config.partnershipsChannelId || null,
        }
      : null,
    p: config.pings?.configured
      ? {
          h: config.pings.hereMembers,
          e: config.pings.everyoneMembers,
          cr: config.pings.customRoleId,
          crm: config.pings.customRoleMembers,
          hd: config.pings.hereDelayMs,
          ed: config.pings.everyoneDelayMs,
          crd: config.pings.customRoleDelayMs,
          lhpa: config.pings.lastHerePingAt,
          lepa: config.pings.lastEveryonePingAt,
          lcpa: config.pings.lastCustomRolePingAt,
        }
      : null,
    ty: isThankYouEmbedPersisted(config.thankYouEmbed)
      ? {
          e: config.thankYouEmbed.enabled === true,
          c: config.thankYouEmbed.color || null,
          ai: config.thankYouEmbed.authorIconUrl || null,
          an: config.thankYouEmbed.authorName || null,
          t: config.thankYouEmbed.title || null,
          th: config.thankYouEmbed.thumbnailUrl || null,
          d: config.thankYouEmbed.description || null,
          im: config.thankYouEmbed.imageUrl || null,
          ft: config.thankYouEmbed.footerText || null,
          fi: config.thankYouEmbed.footerIconUrl || null,
          ts: config.thankYouEmbed.timestampEnabled !== false,
          dr: config.thankYouEmbed.draft || null,
        }
      : null,
    pd: config.partnerDesc?.configured
      ? {
          m: config.partnerDesc.mode,
          ch: config.partnerDesc.channelId,
          t: config.partnerDesc.staticText,
          sm: config.partnerDesc.sourceMessageId,
        }
      : null,
    ...(config.contentFiltersConfigured
      ? { cf: contentFiltersToRow(config.contentFilters) }
      : {}),
    pmc: config.pmCommandsChannelId || null,
    pmcc: config.pmCommandsCategoryIds?.length ? config.pmCommandsCategoryIds : null,
    mp: config.manualPartnershipEnabled === true,
    sc: config.setupCompleted === true,
    sca: config.setupCompletedAt || null,
    scb: config.setupCompletedBy || null,
    sk: config.skipManager === true,
    mbr: config.managerBadgeRoleId || null,
    mla: config.managerLeaveAction || null,
    bda: config.behaviorDeleteAction || null,
    ...(config.sameServerCooldownMs !== undefined
      ? { sscd: config.sameServerCooldownMs && config.sameServerCooldownMs > 0 ? config.sameServerCooldownMs : null }
      : {}),
  };
}

async function loadConfigMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function refreshPartnershipConfigCache() {
  if (!isMongoReady()) return configCache;
  configCache = Object.freeze(await loadConfigMap());
  return configCache;
}

function getPartnershipConfigSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return null;
  const row = configCache[gid];
  return rowToConfig(row);
}

async function getPartnershipConfig(guildId?) {
  await refreshPartnershipConfigCache().catch(() => null);
  return getPartnershipConfigSync(guildId);
}

async function savePartnershipConfig(guildId?, patch?) {
  const gid = normalizeGuildId(guildId);
  const { isMainPartnershipSettingsGuild, buildMainPartnershipMongoSeed } = require("../../Partner/core/partnershipConfigResolver") as typeof import("../../Partner/core/partnershipConfigResolver");
  const allowProtectedSettings = isMainPartnershipSettingsGuild(gid);
  if (!gid || (isViniliProtectedGuild(gid) && !allowProtectedSettings)) {
    return { ok: false, reason: "protected_guild" };
  }
  if (!isMongoReady()) {
    return { ok: false, reason: "mongo_not_ready" };
  }
  const map = await loadConfigMap();
  const prev: any = rowToConfig(map[gid]) || (allowProtectedSettings ? buildMainPartnershipMongoSeed(gid) : null) || {
    partnershipsChannelId: null,
    logsChannelId: null,
    partnerManagerRoleId: null,
    invite: { code: null, url: null, channelId: null },
    pings: normalizePings(null),
    thankYouEmbed: normalizeThankYouEmbed(null),
    partnerDesc: normalizePartnerDesc(null),
    contentFilters: normalizeContentFilters(null),
    manualPartnershipEnabled: false,
    skipManager: true,
    managerBadgeRoleId: null,
    managerLeaveAction: null,
    behaviorDeleteAction: null,
    setupCompleted: false,
    setupCompletedAt: null,
    setupCompletedBy: null,
  };
  const next = {
    ...prev,
    ...patch,
    invite: patch.invite ? { ...prev.invite, ...patch.invite } : prev.invite,
    pings: patch.pings ? normalizePings({ ...prev.pings, ...patch.pings }) : prev.pings,
    thankYouEmbed: patch.thankYouEmbed
      ? normalizeThankYouEmbed({ ...prev.thankYouEmbed, ...patch.thankYouEmbed })
      : prev.thankYouEmbed,
    partnerDesc: patch.partnerDesc
      ? normalizePartnerDesc({ ...prev.partnerDesc, ...patch.partnerDesc })
      : prev.partnerDesc,
    contentFilters: Object.prototype.hasOwnProperty.call(patch, "contentFilters")
      ? normalizeContentFilters({ ...prev.contentFilters, ...patch.contentFilters })
      : prev.contentFilters,
    contentFiltersConfigured:
      Object.prototype.hasOwnProperty.call(patch, "contentFilters") ||
      prev.contentFiltersConfigured === true,
  };
  /* setupCompleted solo via completePartnershipSetup / completeSetup (wizard o +setup),
     non appena ci sono canale+ruolo: altrimenti il wizard dashboard sparisce a metà. */
  map[gid] = configToRow(next);
  const saved = await setBotState(BOT_STATE_KEY, map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  await refreshPartnershipConfigCache();
  return { ok: true, config: next };
}

async function setPartnershipChannel(guildId?, channelId?) {
  const id = channelId ? normalizeChannelId(channelId) : null;
  if (channelId && !id) return { ok: false, reason: "invalid_channel" };
  const patch: Record<string, any> = { partnershipsChannelId: id };
  if (!id) {
    patch.invite = { code: null, url: null, channelId: null };
  }
  return savePartnershipConfig(guildId, patch);
}

async function setPartnershipLogsChannel(guildId?, channelId?) {
  const id = channelId ? normalizeChannelId(channelId) : null;
  if (channelId && !id) return { ok: false, reason: "invalid_channel" };
  return savePartnershipConfig(guildId, { logsChannelId: id });
}

async function setPmCommandsChannel(guildId?, channelId?) {
  const id = channelId ? normalizeChannelId(channelId) : null;
  if (channelId && !id) return { ok: false, reason: "invalid_channel" };
  return savePartnershipConfig(guildId, { pmCommandsChannelId: id });
}

async function setPmCommandsCategories(guildId?, categoryIds?) {
  if (categoryIds === null || categoryIds === undefined) {
    return savePartnershipConfig(guildId, { pmCommandsCategoryIds: [] });
  }
  const normalized = normalizeCategoryIdList(categoryIds);
  if (Array.isArray(categoryIds) && categoryIds.length && !normalized.length) {
    return { ok: false, reason: "invalid_category" };
  }
  return savePartnershipConfig(guildId, { pmCommandsCategoryIds: normalized });
}

async function setPartnerManagerRole(guildId?, roleId?) {
  let id = roleId ? normalizeRoleId(roleId) : null;
  if (roleId && !id) return { ok: false, reason: "invalid_role" };
  try {
    const { remapRoleIdForward } = require("../../Config/emergencyRoleIdRemap") as typeof import("../../Config/emergencyRoleIdRemap");
    if (id) id = remapRoleIdForward(id) || id;
  } catch (_) {}
  const prev = getPartnershipConfigSync(guildId);
  if (id && prev?.managerBadgeRoleId && prev.managerBadgeRoleId === id) {
    return { ok: false, reason: "same_as_badge_role" };
  }
  return savePartnershipConfig(guildId, { partnerManagerRoleId: id });
}

async function setPartnershipPings(guildId?, pings?) {
  const prev = getPartnershipConfigSync(guildId);
  return savePartnershipConfig(guildId, {
    pings: normalizePings({ ...(prev?.pings || {}), ...(pings || {}) }),
  });
}

async function setPartnerDescChannel(guildId?, channelId?) {
  const id = channelId ? normalizeChannelId(channelId) : null;
  if (channelId && !id) return { ok: false, reason: "invalid_channel" };
  if (!id) return clearPartnerDesc(guildId);
  const { clearTenantDescriptionCache } = require("../services/tenantPartnerDescriptionService") as typeof import("../services/tenantPartnerDescriptionService");
  clearTenantDescriptionCache(guildId);
  return savePartnershipConfig(guildId, {
    partnerDesc: normalizePartnerDesc({
      mode: "channel",
      channelId: id,
      staticText: null,
      sourceMessageId: null,
    }),
  });
}

async function setPartnerDescStatic(guildId?, staticText?) {
  const text = String(staticText || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, reason: "empty_text" };
  if (text.length > 4000) return { ok: false, reason: "too_long" };
  const { clearTenantDescriptionCache } = require("../services/tenantPartnerDescriptionService") as typeof import("../services/tenantPartnerDescriptionService");
  clearTenantDescriptionCache(guildId);
  return savePartnershipConfig(guildId, {
    partnerDesc: normalizePartnerDesc({
      mode: "static",
      channelId: null,
      staticText: text,
      sourceMessageId: null,
    }),
  });
}

async function clearPartnerDesc(guildId?) {
  const { clearTenantDescriptionCache } = require("../services/tenantPartnerDescriptionService") as typeof import("../services/tenantPartnerDescriptionService");
  clearTenantDescriptionCache(guildId);
  return savePartnershipConfig(guildId, { partnerDesc: normalizePartnerDesc(null) });
}

async function touchPartnershipPublishPings(guildId?, pingPlan: Record<string, any> = {}) {
  const prev = getPartnershipConfigSync(guildId);
  if (!prev?.pings) return { ok: false, reason: "no_pings" };

  const pingHere = Boolean(pingPlan?.pingHere);
  const pingEveryone = Boolean(pingPlan?.pingEveryone);
  const customRoleId = String(pingPlan?.customRoleId || "").trim();
  if (!pingHere && !pingEveryone && !customRoleId) {
    return { ok: false, reason: "no_pings_applied" };
  }

  const now = new Date().toISOString();
  const pings = { ...prev.pings };
  if (pingHere) pings.lastHerePingAt = now;
  if (pingEveryone) pings.lastEveryonePingAt = now;
  if (customRoleId) pings.lastCustomRolePingAt = now;
  return savePartnershipConfig(guildId, { pings });
}

async function setPartnershipInvite(guildId?, inviteRow?) {
  return savePartnershipConfig(guildId, {
    invite: {
      code: inviteRow?.code || null,
      url: inviteRow?.url || null,
      channelId: inviteRow?.channelId || null,
    },
  });
}

async function setPartnershipSkipManager(guildId?, skipManager?) {
  return savePartnershipConfig(guildId, { skipManager: Boolean(skipManager) });
}

async function setManagerBadgeRole(guildId?, roleId?) {
  let id = roleId ? normalizeRoleId(roleId) : null;
  if (roleId && !id) return { ok: false, reason: "invalid_role" };
  try {
    const { remapRoleIdForward } = require("../../Config/emergencyRoleIdRemap") as typeof import("../../Config/emergencyRoleIdRemap");
    if (id) id = remapRoleIdForward(id) || id;
  } catch (_) {}
  const prev = getPartnershipConfigSync(guildId);
  if (id && prev?.partnerManagerRoleId && prev.partnerManagerRoleId === id) {
    return { ok: false, reason: "same_as_manager_role" };
  }
  return savePartnershipConfig(guildId, { managerBadgeRoleId: id });
}

async function setManualPartnershipEnabled(guildId?, enabled?) {
  return savePartnershipConfig(guildId, { manualPartnershipEnabled: Boolean(enabled) });
}

async function setThankYouEmbed(guildId?, thankYouEmbed?) {
  const prev = getPartnershipConfigSync(guildId);
  const merged = normalizeThankYouEmbed({
    ...(prev?.thankYouEmbed || {}),
    ...(thankYouEmbed || {}),
    enabled: true,
  });
  return savePartnershipConfig(guildId, { thankYouEmbed: merged });
}

async function setManagerLeaveAction(guildId?, action?) {
  return savePartnershipConfig(guildId, { managerLeaveAction: normalizeLeaveAction(action) });
}

async function completePartnershipSetup(guildId?, userId?) {
  const prev = getPartnershipConfigSync(guildId);
  const patch: Record<string, any> = {
    setupCompleted: true,
    setupCompletedAt: Date.now(),
    setupCompletedBy: String(userId || "").trim() || null,
  };
  if (!prev?.thankYouEmbed?.description || !prev?.thankYouEmbed?.title) {
    const { defaultThankYouEmbedFieldsForGuild } = require("../../Partner/runtime/partnershipThankYouEmbed") as typeof import("../../Partner/runtime/partnershipThankYouEmbed");
    patch.thankYouEmbed = normalizeThankYouEmbed({
      ...defaultThankYouEmbedFieldsForGuild(guildId),
      enabled: false,
    });
  }
  return savePartnershipConfig(guildId, patch);
}

function isPartnershipSetupComplete(config?) {
  if (!config) return false;
      return Boolean(config.partnershipsChannelId && config.partnerManagerRoleId);
}

function listConfiguredPartnershipGuildIds() {
  return Object.keys(configCache).filter((gid?) => {
    const cfg = rowToConfig(configCache[gid]);
    return isPartnershipSetupComplete(cfg);
  });
}

function getAllPartnershipConfigCacheRows() {
  return Object.keys(configCache)
    .map((gid?) => rowToConfig(configCache[gid]))
    .filter(Boolean);
}

async function removePartnershipConfig(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid || isViniliProtectedGuild(gid)) {
    return { ok: false, reason: "protected_guild" };
  }
  if (!isMongoReady()) {
    return { ok: false, reason: "mongo_not_ready" };
  }
  const map = await loadConfigMap();
  if (!Object.prototype.hasOwnProperty.call(map, gid)) {
    return { ok: false, reason: "not_configured" };
  }
  delete map[gid];
  const saved = await setBotState(BOT_STATE_KEY, map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  await refreshPartnershipConfigCache();
  try {
    const { clearTenantDescriptionCache } = require("../services/tenantPartnerDescriptionService") as typeof import("../services/tenantPartnerDescriptionService");
    clearTenantDescriptionCache(gid);
  } catch (_) {}
  return { ok: true };
}

export = {
  BOT_STATE_KEY,
  getPartnershipConfigSync,
  getPartnershipConfig,
  refreshPartnershipConfigCache,
  savePartnershipConfig,
  setPartnershipChannel,
  setPartnershipLogsChannel,
  setPmCommandsChannel,
  setPmCommandsCategories,
  setPartnerManagerRole,
  setPartnershipPings,
  setPartnerDescChannel,
  setPartnerDescStatic,
  clearPartnerDesc,
  touchPartnershipPublishPings,
  setPartnershipInvite,
  setPartnershipSkipManager,
  setManualPartnershipEnabled,
  setThankYouEmbed,
  setManagerBadgeRole,
  setManagerLeaveAction,
  completePartnershipSetup,
  isPartnershipSetupComplete,
  normalizeLeaveAction,
  formatLeaveAction,
  listConfiguredPartnershipGuildIds,
  getAllPartnershipConfigCacheRows,
  removePartnershipConfig,
  normalizePings,
  normalizeThankYouEmbed,
  normalizeContentFilters,
};
