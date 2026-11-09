/**
 * Dashboard moderazione tenant: modulo on/off, canale mod logs, DM, esenzioni, casi recenti.
 */
const { GlobalSettings } = require("../../../Vinili/Community/schemas/communitySchemas") as typeof import("../../../Vinili/Community/schemas/communitySchemas");
const { normalizeModConfigFromGlobal } = require("../../../Vinili/Community/services/globalSettingsGuildStores") as typeof import("../../../Vinili/Community/services/globalSettingsGuildStores");
const {
  findActiveModerations,
  listRecentGuildCases,
  countGuildCases,
  aggregateGuildModerationOverview,
} = require("../../../Vinili/Moderation/utils/modCaseStore") as typeof import("../../../Vinili/Moderation/utils/modCaseStore");
const IDs = require("../../../Vinili/Config/ids") as typeof import("../../../Vinili/Config/ids");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { listGuildPickerData } = require("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi");
const {
  refreshTenantGuildSettingsCache,
  setTenantModLogsChannel,
  normalizeChannelId,
  normalizeRoleIdList,
} = require("../../core/tenantGuildSettings") as typeof import("../../core/tenantGuildSettings");
const {
  getTenantModerationExtras,
  patchTenantModerationExtras,
  ensureTenantModerationCacheFresh,
} = require("../../core/tenantModerationSettings") as typeof import("../../core/tenantModerationSettings");
const { resolveModLogChannelId } = require("../../utils/tenantModLogChannel") as typeof import("../../utils/tenantModLogChannel");
const { isTenantFeatureEnabled } = require("../../core/accessPolicy") as typeof import("../../core/accessPolicy");
const { setTenantGuildFeature } = require("../../core/tenantRegistryStore") as typeof import("../../core/tenantRegistryStore");
const { isViniliProtectedGuild } = require("../../core/viniliProtectedGuilds") as typeof import("../../core/viniliProtectedGuilds");
const { isViniliFullFeatureGuild } = require("../../core/guildFeatureScope") as typeof import("../../core/guildFeatureScope");

function fail(status?, error?, message?) {
  return { ok: false, status: status || 400, error: error || "bad_request", message: message || "Operazione non riuscita." };
}

function normalizeIdList(value?, max = 40) {
  const ids = normalizeRoleIdList(value);
  return ids.slice(0, max);
}

function uniqueSnowflakeList(values?, max = 80) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const id = String(raw || "").trim();
    if (!/^\d{16,22}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** Canali auto-iniettati per errore (zone AutoMod / #sanzioni): non sono esenzioni comandi. */
function getMistakenAutoCommandExemptChannelIds() {
  return uniqueSnowflakeList([
    IDs.channels?.staffChat,
    IDs.channels?.staffCmds,
    IDs.channels?.modLogs,
    IDs.channels?.activityLogs,
    IDs.channels?.midChat,
    IDs.channels?.streamerChat,
    IDs.channels?.automodExemptExtra,
    IDs.channels?.moderazioneStaff,
    IDs.channels?.warnStaff,
    IDs.channels?.sanzioniUtenti,
  ]);
}

function sanitizeCommandExemptChannelIds(channelIds?, existingChannelIds?) {
  const block = new Set(getMistakenAutoCommandExemptChannelIds());
  const existing = existingChannelIds instanceof Set ? existingChannelIds : null;
  return uniqueSnowflakeList(
    (Array.isArray(channelIds) ? channelIds : []).filter((raw?) => {
      const id = String(raw || "");
      if (!id || block.has(id)) return false;
      if (existing && !existing.has(id)) return false;
      return true;
    }),
  );
}

function sanitizeExemptRoleIds(roleIds?, existingRoleIds?) {
  const existing = existingRoleIds instanceof Set ? existingRoleIds : null;
  return uniqueSnowflakeList(
    (Array.isArray(roleIds) ? roleIds : []).filter((raw?) => {
      const id = String(raw || "");
      if (!id) return false;
      if (existing && !existing.has(id)) return false;
      return true;
    }),
  );
}

function resolveEffectiveModExemptions(modConfig?, existing?) {
  return {
    exemptRoleIds: sanitizeExemptRoleIds(modConfig?.exemptRoles, existing?.roleIds),
    exemptChannelIds: sanitizeCommandExemptChannelIds(modConfig?.exemptChannels, existing?.channelIds),
    systemExemptRoleIds: [],
    systemExemptChannelIds: [],
  };
}

async function readModConfig(guildId?) {
  const gid = String(guildId || "").trim();
  const doc = await GlobalSettings.findOneAndUpdate(
    { guildId: gid },
    { $setOnInsert: { guildId: gid } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return normalizeModConfigFromGlobal(doc);
}

async function patchModConfig(guildId?, patch: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  if (!gid) return { ok: false, reason: "invalid_guild" };
  const $set: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "logChannelId")) {
    $set["modConfig.logChannelId"] = patch.logChannelId ? String(patch.logChannelId) : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "dmOnAction")) {
    $set["modConfig.dmOnAction"] = patch.dmOnAction === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "exemptRoles")) {
    $set["modConfig.exemptRoles"] = normalizeIdList(patch.exemptRoles);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "exemptChannels")) {
    $set["modConfig.exemptChannels"] = normalizeIdList(patch.exemptChannels);
  }
  if (!Object.keys($set).length) return { ok: true, config: await readModConfig(gid) };
  const doc = await GlobalSettings.findOneAndUpdate(
    { guildId: gid },
    { $set, $setOnInsert: { guildId: gid } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!doc) return { ok: false, reason: "persist_failed" };
  return { ok: true, config: normalizeModConfigFromGlobal(doc) };
}

function serializeCase(row?) {
  if (!row) return null;
  return {
    caseId: Number(row.caseId) || 0,
    action: String(row.action || "").toUpperCase(),
    userId: String(row.userId || ""),
    modId: String(row.modId || ""),
    reason: row.reason != null ? String(row.reason) : null,
    durationMs: row.durationMs == null ? null : Number(row.durationMs),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    active: row.active !== false,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

async function buildModerationPayload(client?, guildId?) {
  await Promise.all([
    refreshTenantGuildSettingsCache().catch(() => null),
    ensureTenantModerationCacheFresh().catch(() => null),
  ]);
  const protectedGuild = isViniliProtectedGuild(guildId) || isViniliFullFeatureGuild(guildId);
  let modConfig = await readModConfig(guildId);
  const extras = await getTenantModerationExtras(guildId);
  const enabled = protectedGuild ? true : isTenantFeatureEnabled(guildId, "moderation");
  const [recentRaw, overview, activeModsRaw, pickersRaw] = await Promise.all([
    listRecentGuildCases(guildId, 20).catch(() => []),
    aggregateGuildModerationOverview(guildId).catch(() => ({
      totalCases: 0,
      cases7d: 0,
      activeWarns: 0,
      activeTimed: 0,
      byAction: { BAN: 0, SOFTBAN: 0, KICK: 0, MUTE: 0, WARN: 0, UNBAN: 0, UNMUTE: 0, other: 0 },
    })),
    findActiveModerations(guildId, null, 40).catch(() => []),
    listGuildPickerData(client, guildId).catch(() => ({ textChannels: [], roles: [], categories: [] })),
  ]);
  const pickers = pickersRaw && typeof pickersRaw === "object" ? pickersRaw : { textChannels: [], roles: [], categories: [] };
  const existingChannelIds = new Set(
    (Array.isArray(pickers.textChannels) ? pickers.textChannels : []).map((c?) => String(c?.id || "")).filter(Boolean),
  );
  const existingRoleIds = new Set(
    (Array.isArray(pickers.roles) ? pickers.roles : []).map((r?) => String(r?.id || "")).filter(Boolean),
  );

  const cleanedChannels = sanitizeCommandExemptChannelIds(modConfig.exemptChannels, existingChannelIds);
  const cleanedRoles = sanitizeExemptRoleIds(modConfig.exemptRoles, existingRoleIds);
  const storedChannels = Array.isArray(modConfig.exemptChannels) ? modConfig.exemptChannels.map(String) : [];
  const storedRoles = Array.isArray(modConfig.exemptRoles) ? modConfig.exemptRoles.map(String) : [];
  if (cleanedChannels.length !== storedChannels.length || cleanedRoles.length !== storedRoles.length) {
    const cleaned = await patchModConfig(guildId, {
      exemptChannels: cleanedChannels,
      exemptRoles: cleanedRoles,
    }).catch(() => null);
    if (cleaned?.ok && cleaned.config) modConfig = cleaned.config;
    else modConfig = { ...modConfig, exemptChannels: cleanedChannels, exemptRoles: cleanedRoles };
  }

  const exemptions = resolveEffectiveModExemptions(modConfig, {
    channelIds: existingChannelIds,
    roleIds: existingRoleIds,
  });
  const recent = (Array.isArray(recentRaw) ? recentRaw : []).map(serializeCase).filter(Boolean);
  const activeMods = (Array.isArray(activeModsRaw) ? activeModsRaw : []).map(serializeCase).filter(Boolean);

  return {
    ok: true,
    status: 200,
    guildId: String(guildId),
    protectedGuild,
    enabled,
    settings: {
      // Stesso resolver runtime (main → IDs.modLogs, tenant → settings / override dashboard).
      modLogsChannelId: resolveModLogChannelId(guildId) || modConfig.logChannelId || null,
      dmOnAction: modConfig.dmOnAction !== false,
      exemptRoleIds: exemptions.exemptRoleIds,
      exemptChannelIds: exemptions.exemptChannelIds,
      systemExemptRoleIds: [],
      systemExemptChannelIds: [],
      requireReason: extras.requireReason !== false,
      banDeleteDays: Number(extras.banDeleteDays) || 7,
      logCommandUsage: extras.logCommandUsage !== false,
      replyWithReason: extras.replyWithReason !== false,
      useDiscordTimeout: extras.useDiscordTimeout !== false,
      keepMessagesOnBan: extras.keepMessagesOnBan === true,
      deleteModCommands: extras.deleteModCommands === true,
      moderatorRoleIds: Array.isArray(extras.moderatorRoleIds) ? extras.moderatorRoleIds.map(String) : [],
      protectedRoleIds: Array.isArray(extras.protectedRoleIds) ? extras.protectedRoleIds.map(String) : [],
      messages: {
        ban: String(extras.messages?.ban || ""),
        softban: String(extras.messages?.softban || ""),
        mute: String(extras.messages?.mute || ""),
        unban: String(extras.messages?.unban || ""),
        kick: String(extras.messages?.kick || ""),
        unmute: String(extras.messages?.unmute || ""),
      },
      autoPunishRules: Array.isArray(extras.autoPunishRules)
        ? extras.autoPunishRules.map((r?) => ({
            id: String(r.id || ""),
            warnCount: Number(r.warnCount) || 0,
            action: String(r.action || ""),
            durationMinutes: Number(r.durationMinutes) || 0,
            roleId: r.roleId ? String(r.roleId) : null,
          }))
        : [],
      appeals: {
        formId: extras.appeals?.formId ? String(extras.appeals.formId) : null,
        allowBanned: extras.appeals?.allowBanned !== false,
        allowMuted: extras.appeals?.allowMuted !== false,
        waitDaysBan: Math.max(0, Number(extras.appeals?.waitDaysBan) || 0),
        waitDaysMute: Math.max(0, Number(extras.appeals?.waitDaysMute) || 0),
        dmOnApproveBan: extras.appeals?.dmOnApproveBan !== false,
        dmOnApproveMute: extras.appeals?.dmOnApproveMute !== false,
        dmOnReject: extras.appeals?.dmOnReject !== false,
        inviteUrl: String(extras.appeals?.inviteUrl || ""),
      },
    },
    overview,
    recentCases: recent.slice(0, 20),
    activeModerations: activeMods,
    pickers: {
      textChannels: Array.isArray(pickers.textChannels) ? pickers.textChannels : [],
      roles: Array.isArray(pickers.roles) ? pickers.roles : [],
      forms: await listAppealFormOptions(guildId).catch(() => []),
    },
  };
}

async function listAppealFormOptions(guildId?) {
  try {
    const { getGuildForms, refreshTicketFormsCache } = require("../../tickets/tenant/tenantTicketForms") as typeof import("../../tickets/tenant/tenantTicketForms");
    await refreshTicketFormsCache().catch(() => null);
    const bucket: any = await getGuildForms(guildId);
    const forms = Array.isArray(bucket?.forms) ? bucket.forms : [];
    return forms
      .map((f?) => ({
        id: String(f?.id || "").trim(),
        title: String(f?.title || f?.name || "").trim() || "Form",
      }))
      .filter((f?) => f.id);
  } catch {
    return [];
  }
}

async function getDashboardModeration(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) return fail(400, "bot_missing", "Il bot non è presente in questo server.");
  return buildModerationPayload(client, access.guildId);
}

async function patchDashboardModeration(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) return fail(400, "bot_missing", "Il bot non è presente in questo server.");

  const gid = access.guildId;
  const protectedGuild = isViniliProtectedGuild(gid) || isViniliFullFeatureGuild(gid);
  const patch = body && typeof body === "object" ? body : {};

  if (!protectedGuild && Object.prototype.hasOwnProperty.call(patch, "enabled")) {
    const ok = await setTenantGuildFeature(gid, "moderation", patch.enabled === true);
    if (!ok) return fail(400, "persist_failed", "Impossibile aggiornare lo stato del modulo.");
  }

  if (Object.prototype.hasOwnProperty.call(patch, "modLogsChannelId")) {
    const raw = patch.modLogsChannelId;
    const clear = raw == null || String(raw).trim() === "";
    const id = clear ? null : normalizeChannelId(raw);
    if (!clear && !id) return fail(400, "invalid_channel", "Canale mod logs non valido.");
    const saved: any = await setTenantModLogsChannel(gid, id);
    if (!saved.ok) return fail(400, saved.reason || "persist_failed", "Salvataggio canale mod logs non riuscito.");
    await patchModConfig(gid, { logChannelId: id });
  }

  const modPatch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "dmOnAction")) modPatch.dmOnAction = patch.dmOnAction === true;
  if (Object.prototype.hasOwnProperty.call(patch, "exemptRoleIds")) {
    modPatch.exemptRoles = sanitizeExemptRoleIds(patch.exemptRoleIds);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "exemptChannelIds")) {
    // Mai re-iniettare zone AutoMod/#sanzioni: sono canali da cui SI lanciano i comandi.
    modPatch.exemptChannels = sanitizeCommandExemptChannelIds(patch.exemptChannelIds);
  }
  if (Object.keys(modPatch).length) {
    const savedCfg: any = await patchModConfig(gid, modPatch);
    if (!savedCfg.ok) return fail(400, savedCfg.reason || "persist_failed", "Salvataggio configurazione moderazione non riuscito.");
  }

  const extrasPatch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "requireReason")) extrasPatch.requireReason = patch.requireReason === true;
  if (Object.prototype.hasOwnProperty.call(patch, "banDeleteDays")) extrasPatch.banDeleteDays = patch.banDeleteDays;
  if (Object.prototype.hasOwnProperty.call(patch, "logCommandUsage")) extrasPatch.logCommandUsage = patch.logCommandUsage === true;
  if (Object.prototype.hasOwnProperty.call(patch, "replyWithReason")) extrasPatch.replyWithReason = patch.replyWithReason === true;
  if (Object.prototype.hasOwnProperty.call(patch, "useDiscordTimeout")) extrasPatch.useDiscordTimeout = patch.useDiscordTimeout === true;
  if (Object.prototype.hasOwnProperty.call(patch, "keepMessagesOnBan")) extrasPatch.keepMessagesOnBan = patch.keepMessagesOnBan === true;
  if (Object.prototype.hasOwnProperty.call(patch, "deleteModCommands")) extrasPatch.deleteModCommands = patch.deleteModCommands === true;
  if (Object.prototype.hasOwnProperty.call(patch, "moderatorRoleIds")) extrasPatch.moderatorRoleIds = patch.moderatorRoleIds;
  if (Object.prototype.hasOwnProperty.call(patch, "protectedRoleIds")) extrasPatch.protectedRoleIds = patch.protectedRoleIds;
  if (Object.prototype.hasOwnProperty.call(patch, "messages") && patch.messages && typeof patch.messages === "object") {
    extrasPatch.messages = patch.messages;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "autoPunishRules")) {
    extrasPatch.autoPunishRules = patch.autoPunishRules;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "appeals") && patch.appeals && typeof patch.appeals === "object") {
    extrasPatch.appeals = patch.appeals;
  }
  if (Object.keys(extrasPatch).length) {
    const savedEx: any = await patchTenantModerationExtras(gid, extrasPatch);
    if (!savedEx.ok) return fail(400, savedEx.reason || "persist_failed", "Salvataggio opzioni moderazione non riuscito.");
  }

  const payload = await buildModerationPayload(client, gid);
  return { ...payload, message: "Impostazioni moderazione salvate." };
}

async function getDashboardModerationCases(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) return fail(400, "bot_missing", "Il bot non è presente in questo server.");
  const pageSize = Math.max(1, Math.min(50, Math.floor(Number(query.pageSize || query.limit) || 20)));
  const requestedPage = Math.max(1, Math.floor(Number(query.page) || 1));
  const filters = {
    userId: String(query.userId || "").trim(),
    action: String(query.action || "").trim().toUpperCase(),
    from: query.from,
    to: query.to,
  };
  const overview = await aggregateGuildModerationOverview(access.guildId).catch(() => ({
    totalCases: 0,
    cases7d: 0,
    activeWarns: 0,
    activeTimed: 0,
    byAction: { BAN: 0, SOFTBAN: 0, KICK: 0, MUTE: 0, WARN: 0, UNBAN: 0, UNMUTE: 0, other: 0 },
  }));
  const total = Math.max(0, Number(await countGuildCases(access.guildId, filters).catch(() => overview.totalCases)) || 0);
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(pages, requestedPage);
  const skip = (page - 1) * pageSize;
  const recentRaw = await listRecentGuildCases(access.guildId, pageSize, skip, filters).catch(() => []);
  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    page,
    pages,
    pageSize,
    total,
    filters,
    recentCases: (Array.isArray(recentRaw) ? recentRaw : []).map(serializeCase).filter(Boolean),
    overview,
  };
}

export = {
  getDashboardModeration,
  patchDashboardModeration,
  getDashboardModerationCases,
};
