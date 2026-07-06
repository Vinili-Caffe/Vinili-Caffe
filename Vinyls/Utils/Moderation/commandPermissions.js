const fs = require("fs");
const path = require("path");
const { EmbedBuilder, PermissionsBitField, PermissionFlagsBits, } = require("discord.js");
const IDs = require("../Config/ids");
const { hasAdminsProfileCapability } = require("../../Services/Moderation/securityProfilesService");
const { isPartnerPmDailyCommandsThread } = require("../Partner/partnersChatChannelUtils");
const { getStaffCmdsThreadIdsCache, ensureStaffCmdsThreadIdsHydrated, isHighStaffCommandsThread, isStaffCmdsPmCommandsThreadSync } = require("../Staff/staffCmdsChannelUtils");
const { isChannelInTicketCategory } = require("../Ticket/ticketCategoryUtils");
const { buildPrefixLookupKeys, buildSlashLookupKeys } = require("./temporaryCommandPermissions");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService");
const { parseProfilePanelOwnerIdFromCustomId, resolveProfilePanelControl } = require("../Community/profilePanelControl");
const {
  interactionHasResocontoButtonAccess,
  hasCandidatureReviewAccess,
  isResocontoInteraction,
  isCandidatureStaffReviewInteraction,
} = require("../Staff/resocontoAccess");
const PERMISSIONS_CANDIDATES = [path.resolve(__dirname, "../../permissions.json"), path.join(process.cwd(), "permissions.json"),];
const EMPTY_PERMISSIONS = { slash: {}, prefix: {}, channels: {}, buttons: {}, selectMenus: {}, modals: {}, };
const PERMISSIONS_CACHE_TTL_MS = 3000;
let cache = { filePath: null, mtimeMs: 0, data: EMPTY_PERMISSIONS, expiresAt: 0 };
let idsFallbackCache = null;
const LIVE_MEMBER_CACHE_TTL_MS = 15_000;
const liveMemberCache = new Map();
const PM_THREAD_PREFIX_CHANNEL_BYPASS_COMMANDS = new Set(["help", "profile"]);
const TICKET_PREFIX_CHANNEL_BYPASS_COMMANDS = new Set(["sezioneproibita", "libriproibiti", "forbiddenbooks"]);
const HIGH_STAFF_COMMANDS_ZONE_TOKEN = "__zone:highStaffCommands";
const PM_COMMANDS_THREAD_ZONE_TOKEN = "__zone:pmCommandsThread";
const STAFF_GUIDE_BUTTON_IDS = new Set([
  "regolamento",
  "limiti",
  "pause",
  "valutazioni",
  "moderazione_staff",
  "warnstaff",
  "pex",
  "lineeguida",
  "comandi",
  "generalimoderazione",
  "testualimoderazione",
  "vocalimoderazione",
  "sanzioni",
]);

function getStaffGuideAccessRoleIds() {
  return [
    IDs.roles?.Staff,
    IDs.roles?.Helper,
    IDs.roles?.Mod,
    IDs.roles?.SeniorModerator,
    IDs.roles?.Director,
    IDs.roles?.HighStaff,
    IDs.roles?.Manager,
    IDs.roles?.Admin,
    IDs.roles?.Founder,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
}

function isPartnerManagerOnlyMember(member) {
  const pmId = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmId || !member?.roles?.cache?.has(pmId)) return false;
  const access = getStaffGuideAccessRoleIds();
  return !access.some((id) => member.roles.cache.has(id));
}

async function checkStaffGuideButtonGate(interaction, customId) {
  if (!STAFF_GUIDE_BUTTON_IDS.has(String(customId || ""))) return null;
  const requiredRoles = getStaffGuideAccessRoleIds();
  if (!interaction?.inGuild?.()) {
    return { allowed: false, reason: "missing_role", requiredRoles, ownerId: null };
  }
  if (isPartnerManagerOnlyMember(interaction.member)) {
    return { allowed: false, reason: "missing_role", requiredRoles, ownerId: null };
  }
  const rolePass = await hasAnyRoleWithLiveFallback(interaction, requiredRoles);
  if (!rolePass) {
    return { allowed: false, reason: "missing_role", requiredRoles, ownerId: null };
  }
  return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
}

function getMainGuildIdFallback() {
  try {
    const configPath = path.join(__dirname, "..", "..", "config.json");
    const raw = fs.readFileSync(configPath, "utf8");
    const c = JSON.parse(raw);
    return c.mainGuildId || c.guildMain || null;
  } catch {
    return null;
  }
}
const CONFIG_MAIN_GUILD_ID = getMainGuildIdFallback();
const CATALOG_MAIN_GUILD_ID = IDs?.guilds?.main || null;
const MAIN_GUILD_ID = CONFIG_MAIN_GUILD_ID || CATALOG_MAIN_GUILD_ID || null;
const ALLOWED_GUILD_IDS = new Set(
  [
    CONFIG_MAIN_GUILD_ID,
    CATALOG_MAIN_GUILD_ID,
    MAIN_GUILD_ID,
    IDs?.guilds?.test,
    ...(Array.isArray(IDs?.guilds?.sponsorGuildIds) ? IDs.guilds.sponsorGuildIds : []),
  ]
    .filter(Boolean)
    .map(String),
);
const sponsorIdsForComponents = new Set(
  (Array.isArray(IDs?.guilds?.sponsorGuildIds) ? IDs.guilds.sponsorGuildIds : []).map(String).filter(Boolean),
);
const CANDIDATURE_BLACKLIST_ROLE_ID = String(
  IDs?.roles?.blacklistModuli || "1463248874725576879",
).trim();
function isAllowedGuildUfficiale(guildId) {
  return !guildId || ALLOWED_GUILD_IDS.has(String(guildId));
}
function isAllowedGuildForComponents(guildId) {
  if (!guildId) return true;
  const s = String(guildId);
  if (MAIN_GUILD_ID && s === String(MAIN_GUILD_ID)) return true;
  return ALLOWED_GUILD_IDS.has(s) || sponsorIdsForComponents.has(s);
}

const TENANT_UTILITY_COMPONENT_PREFIXES = [
  "repost_btn:",
  "repost_src:",
  "quote_remove:",
  "myrepost_page_",
];

function isTenantUtilityComponentInteraction(customId) {
  const id = String(customId || "");
  return TENANT_UTILITY_COMPONENT_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function tryTenantUtilityComponentBypass(guildId, customId) {
  if (!guildId || isAllowedGuildForComponents(guildId)) return null;
  if (!isTenantUtilityComponentInteraction(customId)) return null;
  try {
    const { canInvokePrefixCommand } = require("../../MultiGuild/core/accessPolicy");
    const gate = canInvokePrefixCommand(guildId, "utility");
    if (gate.managed && gate.ok) {
      return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] tenant utility component bypass:", err?.message || err);
  }
  return null;
}

function isMainGuild(guildId) {
  return Boolean(MAIN_GUILD_ID) && String(guildId || "") === String(MAIN_GUILD_ID);
}

const TICKET_INTERACTION_IDS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_perks",
  "ticket_supporto",
  "claim_ticket",
  "unclaim",
  "close_ticket",
  "close_ticket_motivo",
  "ticket_open_menu",
  "ticket_panel_add_member",
  "ticket_panel_remove_member",
  "ticket_panel_transfer_user",
  "ticket_panel_switch_category",
  "ticket_panel_nav_add",
  "ticket_panel_nav_remove",
  "ticket_panel_nav_switch",
  "ticket_panel_nav_rename",
  "ticket_panel_nav_closerequest",
  "ticket_panel_nav_transfer",
  "ticket_panel_reopen_pick",
  "ticket_panel_reopen_search",
  "ticket_panel_reopen_prev",
  "ticket_panel_reopen_next",
  "ticket_panel_reopen_close",
  "modal_ticket_panel_rename",
  "modal_ticket_panel_closerequest",
  "modal_ticket_panel_reopen_search",
]);
function isBackupInteraction(customId) {
  const id = String(customId || "").trim();
  if (!id) return false;
  return (
    id.startsWith("backup_") ||
    id.startsWith("backup-load_") ||
    id.startsWith("backup_list_")
  );
}
function isTicketInteraction(customId) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (id.startsWith("pm_shop_ack:")) return true;
  if (TICKET_INTERACTION_IDS.has(id)) return true;
  if (id.startsWith("modal_close_ticket"))
    return true;
  if (
    id.startsWith("ticket_panel_add_member:") ||
    id.startsWith("ticket_panel_remove_member:") ||
    id.startsWith("ticket_panel_switch_category:") ||
    id.startsWith("ticket_panel_transfer_user:")
  )
    return true;
  return false;
}

function isProfilePanelInteraction(customId) {
  if (!customId || typeof customId !== "string") return false;
  return String(customId).trim().startsWith("profile_panel:") || String(customId).trim().startsWith("staff_profile_panel:") || String(customId).trim().startsWith("staff_pm_shop:") || String(customId).trim().startsWith("staff_val_neg_trade:");
}

async function checkProfilePanelControlPermission(interaction, customId) {
  const id = String(customId || "");
  if (!id.startsWith("profile_panel:")) return null;
  const control = await resolveProfilePanelControl(interaction);
  if (control.ok) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  return {
    allowed: false,
    reason: "not_owner",
    requiredRoles: null,
    ownerId: control.ownerId || parseProfilePanelOwnerIdFromCustomId(id) || null,
  };
}

function isCustomRoleSystemInteraction(customId) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (!id) return false;
  return (
    id.startsWith("customrole_") ||
    id.startsWith("customvoc_") ||
    id.startsWith("customreaction_") ||
    id.startsWith("siterolerequest:")
  );
}

function isApplyOrCandidatureInteraction(customId) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (id === "apply_helper" || id === "apply_partnermanager") return true;
  if (id.startsWith("apply_start:") || id.startsWith("apply_back:") || id.startsWith("apply_page:")) return true;
  if (id.startsWith("apply_form:")) return true;
  if (id === "candidature_premi_partner") return true;
  return false;
}

async function isBlockedFromCandidaturesByRole(interaction, customId) {
  if (!isApplyOrCandidatureInteraction(customId)) return false;
  if (!CANDIDATURE_BLACKLIST_ROLE_ID) return false;
  if (!interaction?.inGuild?.()) return false;
  return hasAnyRoleWithLiveFallback(interaction, [CANDIDATURE_BLACKLIST_ROLE_ID]);
}

async function isGuildOwnerOrAdmin(interaction) {
  if (!interaction?.inGuild?.()) return false;
  const userId = String(interaction?.user?.id || "");
  if (!userId) return false;

  const guild = interaction.guild || null;
  const ownerId = String(guild?.ownerId || "");
  if (ownerId && ownerId === userId) return true;

  const member = interaction.member;
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;

  const freshMember = await fetchLiveMember(interaction);
  if (freshMember?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (guild && typeof guild.fetchOwner === "function") {
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner?.id && String(owner.id) === userId) return true;
  }

  return false;
}

function getIdsConfig() {
  if (idsFallbackCache) return idsFallbackCache;
  try {
    idsFallbackCache = require("../Config/ids");
    return idsFallbackCache;
  } catch {
    return {};
  }
}

function loadPermissions() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) return cache.data;
  try {
    const permissionsPath = PERMISSIONS_CANDIDATES.find((p) => fs.existsSync(p)) || null;
    if (!permissionsPath) return EMPTY_PERMISSIONS;
    const stat = fs.statSync(permissionsPath);
    if (
      cache.data &&
      cache.filePath === permissionsPath &&
      cache.mtimeMs === stat.mtimeMs
    ) {
      cache.expiresAt = now + PERMISSIONS_CACHE_TTL_MS;
      return cache.data;
    }
    const raw = fs.readFileSync(permissionsPath, "utf-8");
    const parsed = JSON.parse(raw) || {};
    const normalized = { slash: parsed.slash || {}, prefix: parsed.prefix || {}, channels: parsed.channels || {}, buttons: parsed.buttons || {}, selectMenus: parsed.selectMenus || {}, modals: parsed.modals || {}, };
    cache = {
      filePath: permissionsPath,
      mtimeMs: stat.mtimeMs,
      data: normalized,
      expiresAt: now + PERMISSIONS_CACHE_TTL_MS,
    };
    return cache.data;
  } catch {
    return EMPTY_PERMISSIONS;
  }
}

function resolveRoleReference(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
  else if (key.startsWith("roles.")) key = key.slice("roles.".length);

  const idsCfg = typeof IDs !== "undefined" && IDs ? IDs : getIdsConfig();
  const table = idsCfg?.roles;
  if (!table || typeof table !== "object") return null;
  if (table[key] != null && String(table[key]).trim() !== "") return String(table[key]);
  const lower = String(key).toLowerCase();
  for (const k of Object.keys(table)) {
    if (String(k).toLowerCase() === lower) {
      const v = table[k];
      if (v != null && String(v).trim() !== "") return String(v);
    }
  }
  return null;
}

function normalizeRoleList(roleIds) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds.map((value) => resolveRoleReference(value)).filter(Boolean);
}

const PERMISSION_NAME_LOOKUP = (() => { const map = new Map(); const sources = [PermissionsBitField?.Flags, PermissionFlagsBits]; for (const source of sources) { const entries = Object.entries(source || {}); for (const [name, value] of entries) { if (value == null) continue; const exact = String(name).trim().toLowerCase(); const compact = String(name).replace(/[^a-z0-9]/gi, "").toLowerCase(); map.set(exact, value); map.set(compact, value); } } return map; })(); function resolvePermissionReference(value) {
  if (value == null) return null;

  if (typeof value === "bigint") return value;

  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return BigInt(Math.trunc(value));
    } catch {
      return null;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }

  let key = raw;
  if (key.startsWith("PermissionFlagsBits.")) {
    key = key.slice("PermissionFlagsBits.".length);
  } else if (key.startsWith("PermissionsBitField.Flags.")) {
    key = key.slice("PermissionsBitField.Flags.".length);
  }

  const exact = key.toLowerCase();
  const compact = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    PERMISSION_NAME_LOOKUP.get(exact) ??
    PERMISSION_NAME_LOOKUP.get(compact) ??
    null
  );
}

function normalizePermissionList(permissionFlags) {
  if (!Array.isArray(permissionFlags)) return permissionFlags;
  const dedup = new Set();
  for (const flag of permissionFlags) {
    const resolved = resolvePermissionReference(flag);
    if (resolved == null) continue;
    dedup.add(String(resolved));
  }
  return Array.from(dedup, (value) => BigInt(value));
}

function parseChannelReferenceKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let key = raw;
  if (key.startsWith("ids.channels.")) key = key.slice("ids.channels.".length);
  else if (key.startsWith("channels.")) key = key.slice("channels.".length);
  return key;
}

function resolveChannelReference(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  const key = parseChannelReferenceKey(raw);
  const idsCfg = typeof IDs !== "undefined" && IDs ? IDs : getIdsConfig();
  if (key === "staffCmdsPmThread") {
    return getStaffCmdsThreadIdsCache().pm || null;
  }
  if (key === "staffCmdsHighThread" || key === "highCmds") {
    return getStaffCmdsThreadIdsCache().high || null;
  }
  const resolved = idsCfg?.channels?.[key];
  if (!resolved) return null;
  return String(resolved);
}

function expandResolvedChannelReference(rawValue, resolvedId) {
  const key = parseChannelReferenceKey(rawValue);
  const idsCfg = typeof IDs !== "undefined" && IDs ? IDs : getIdsConfig();
  const cache = getStaffCmdsThreadIdsCache();
  const out = new Set();
  if (resolvedId) out.add(String(resolvedId));
  if (key === "highCmds" || key === "staffCmdsHighThread") {
    out.add(HIGH_STAFF_COMMANDS_ZONE_TOKEN);
    if (cache.high) out.add(String(cache.high));
  } else if (key === "staffCmdsPmThread") {
    out.add(PM_COMMANDS_THREAD_ZONE_TOKEN);
    if (cache.pm) out.add(String(cache.pm));
  } else if (key === "staffCmdsHighThread") {
    if (cache.high) out.add(String(cache.high));
  } else if (key === "staffCmds") {
    const staffCmds = idsCfg?.channels?.staffCmds;
    if (staffCmds) out.add(String(staffCmds));
  }
  return [...out];
}

function normalizeChannelList(channelIds) {
  if (!Array.isArray(channelIds)) return channelIds;
  const expanded = new Set();
  for (const value of channelIds) {
    const resolved = resolveChannelReference(value);
    for (const id of expandResolvedChannelReference(value, resolved)) {
      expanded.add(id);
    }
  }
  const filtered = [...expanded];
  if (filtered.length === 0 && channelIds.length > 0) {
    global.logger?.warn?.(
      "[commandPermissions] Lista canali risolta vuota (verifica ids / permissions):",
      channelIds,
    );
  }
  return filtered;
}

function policyWantsHighStaffCommandsZone(policyIds) {
  const ids = (Array.isArray(policyIds) ? policyIds : []).map(String).filter(Boolean);
  if (ids.includes(HIGH_STAFF_COMMANDS_ZONE_TOKEN)) return true;
  const cache = getStaffCmdsThreadIdsCache();
  return Boolean(cache.high && ids.includes(String(cache.high)));
}

function policyWantsPmCommandsThread(policyIds) {
  const ids = (Array.isArray(policyIds) ? policyIds : []).map(String).filter(Boolean);
  if (ids.includes(PM_COMMANDS_THREAD_ZONE_TOKEN)) return true;
  const cache = getStaffCmdsThreadIdsCache();
  return Boolean(cache.pm && ids.includes(String(cache.pm)));
}

function channelMatchesPolicyChannelList(channel, policyIds) {
  const ids = (Array.isArray(policyIds) ? policyIds : []).map(String).filter(Boolean);
  if (!ids.length) return false;
  const ch = channel;
  if (!ch?.id) return false;
  if (ids.includes(String(ch.id))) return true;
  if (typeof ch.isThread === "function" && ch.isThread()) {
    const parent = String(ch.parentId || "");
    if (parent && ids.includes(parent)) return true;
    if (policyWantsHighStaffCommandsZone(ids) && isHighStaffCommandsThread(ch)) return true;
    if (policyWantsPmCommandsThread(ids) && isStaffCmdsPmCommandsThreadSync(ch)) return true;
  }
  return false;
}

function resolveCommandChannelPolicy(data, keys) {
  const map = data?.channels;
  if (!map || typeof map !== "object") return null;
  for (const key of keys || []) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const normalized = normalizeChannelList(map[key]);
    if (Array.isArray(normalized)) return normalized;
  }
  return null;
}

function resolvePrefixCommandChannels(data, commandName, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd || typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName && subcommands[subcommandName] && typeof subcommands[subcommandName] === "object" && Array.isArray(subcommands[subcommandName].channels)) {
    return normalizeChannelList(subcommands[subcommandName].channels);
  }
  if (Array.isArray(cmd.channels)) return normalizeChannelList(cmd.channels);
  return null;
}

function resolveSlashCommandChannels(data, commandName, groupName = null, subcommandName = null) {
  const cmd = data?.slash?.[commandName];
  if (!cmd || typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    const subCfg = subcommands[key];
    if (subCfg && typeof subCfg === "object" && Array.isArray(subCfg.channels)) {
      return normalizeChannelList(subCfg.channels);
    }
  }
  if (subcommandName && subcommands[subcommandName] && typeof subcommands[subcommandName] === "object" && Array.isArray(subcommands[subcommandName].channels)) {
    return normalizeChannelList(subcommands[subcommandName].channels);
  }
  if (Array.isArray(cmd.channels)) return normalizeChannelList(cmd.channels);
  return null;
}

function collectMemberRoleIds(member) {
  if (!member) return new Set();
  const ids = new Set();

  const cache = member?.roles?.cache;
  if (cache && typeof cache.forEach === "function") {
    cache.forEach((_, roleId) => ids.add(String(roleId)));
  }

  const rawRoles = member?.roles;
  if (Array.isArray(rawRoles)) {
    for (const roleId of rawRoles) {
      if (roleId) ids.add(String(roleId));
    }
  } else if (rawRoles && Array.isArray(rawRoles._roles)) {
    for (const roleId of rawRoles._roles) {
      if (roleId) ids.add(String(roleId));
    }
  }

  const plainRoles = Array.isArray(member?._roles) ? member._roles : [];
  for (const roleId of plainRoles) {
    if (roleId) ids.add(String(roleId));
  }

  return ids;
}

function hasAnyRole(member, roleIds) {
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized)) return false;
  if (normalized.length === 0) return false;
  const memberRoleIds = collectMemberRoleIds(member);
  if (!memberRoleIds.size) return false;
  return normalized.some((roleId) => memberRoleIds.has(String(roleId)));
}

function hasAllPermissions(member, permissionFlags) {
  const normalized = normalizePermissionList(permissionFlags);
  if (!Array.isArray(normalized)) return false;
  if (normalized.length === 0) return false;
  const memberPermissions = member?.permissions;
  if (!memberPermissions || typeof memberPermissions.has !== "function")
    return false;
  return normalized.every((flag) => memberPermissions.has(flag));
}

async function fetchLiveMember(entity) {
  const guild =
    entity?.guild ||
    entity?.member?.guild ||
    (entity?.guildId && entity?.client?.guilds?.cache?.get(String(entity.guildId))) ||
    null;
  const userId = entity?.user?.id || entity?.author?.id || entity?.member?.id || entity?.member?.user?.id || null;
  if (!guild || !userId || typeof guild.members?.fetch !== "function")
    return null;
  const cacheKey = `${String(guild.id)}:${String(userId)}`;
  const now = Date.now();
  const cached = liveMemberCache.get(cacheKey);
  if (cached?.member && now < Number(cached.expiresAt || 0)) {
    return cached.member;
  }
  if (cached?.promise) {
    return cached.promise;
  }
  const promise = getGuildMemberCached(guild, userId);
  liveMemberCache.set(cacheKey, {
    member: null,
    expiresAt: 0,
    promise,
  });
  const member = await promise;
  liveMemberCache.set(cacheKey, {
    member,
    expiresAt: Date.now() + LIVE_MEMBER_CACHE_TTL_MS,
    promise: null,
  });
  return member;
}

async function hasAnyRoleWithEventGrants(member, roleIds, guildId, userId) {
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized) || normalized.length === 0) return false;
  const gid = guildId || member?.guild?.id;
  const uid = userId || member?.id;
  if (!gid || !uid) return false;
  for (const roleId of normalized) {
    if (roleId === IDs.roles.Level50 && (await hasEventWeekWinnerGrant(gid, uid, 2))) return true;
    if (roleId === IDs.roles.Level70 && (await hasEventWeekWinnerGrant(gid, uid, 3))) return true;
  }
  return false;
}

async function hasAnyRoleWithLiveFallback(entity, roleIds) {
  if (hasAnyRole(entity?.member, roleIds)) return true;
  const freshMember = await fetchLiveMember(entity);
  if (!freshMember) return false;
  if (hasAnyRole(freshMember, roleIds)) return true;
  return hasAnyRoleWithEventGrants(freshMember, roleIds, freshMember.guild?.id, freshMember.id);
}

async function hasAllPermissionsWithLiveFallback(entity, permissionFlags) {
  if (hasAllPermissions(entity?.member, permissionFlags)) return true;
  const freshMember = await fetchLiveMember(entity);
  if (!freshMember) return false;
  return hasAllPermissions(freshMember, permissionFlags);
}

function resolveSlashRoles(data, commandName, groupName, subcommandName) {
  const cmd = data?.slash?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    if (Array.isArray(subcommands[key]))
      return normalizeRoleList(subcommands[key]);
  }
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return normalizeRoleList(subcommands[subcommandName]);
  }
  if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
  if (typeof cmd.roles === "string") {
    const resolved = resolveRoleReference(cmd.roles);
    return resolved ? [resolved] : [];
  }
  return null;
}

function resolveSlashPermissions(data, commandName, groupName, subcommandName) {
  const cmd = data?.slash?.[commandName];
  if (!cmd || typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    const cfg = subcommands[key];
    if (cfg && typeof cfg === "object") {
      if (Array.isArray(cfg.permissions))
        return normalizePermissionList(cfg.permissions);
      if (typeof cfg.permissions === "string") {
        const resolved = resolvePermissionReference(cfg.permissions);
        return resolved != null ? [resolved] : [];
      }
    }
  }
  if (subcommandName) {
    const cfg = subcommands[subcommandName];
    if (cfg && typeof cfg === "object") {
      if (Array.isArray(cfg.permissions))
        return normalizePermissionList(cfg.permissions);
      if (typeof cfg.permissions === "string") {
        const resolved = resolvePermissionReference(cfg.permissions);
        return resolved != null ? [resolved] : [];
      }
    }
  }
  if (Array.isArray(cmd.permissions))
    return normalizePermissionList(cmd.permissions);
  if (typeof cmd.permissions === "string") {
    const resolved = resolvePermissionReference(cmd.permissions);
    return resolved != null ? [resolved] : [];
  }
  return null;
}

function resolvePrefixRoles(data, commandName, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return normalizeRoleList(subcommands[subcommandName]);
  }
  if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
  if (typeof cmd.roles === "string") {
    const resolved = resolveRoleReference(cmd.roles);
    return resolved ? [resolved] : [];
  }
  return null;
}

function resolvePrefixPermissions(data, commandName, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd || typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName) {
    const cfg = subcommands[subcommandName];
    if (cfg && typeof cfg === "object") {
      if (Array.isArray(cfg.permissions))
        return normalizePermissionList(cfg.permissions);
      if (typeof cfg.permissions === "string") {
        const resolved = resolvePermissionReference(cfg.permissions);
        return resolved != null ? [resolved] : [];
      }
    }
  }
  if (Array.isArray(cmd.permissions))
    return normalizePermissionList(cmd.permissions);
  if (typeof cmd.permissions === "string") {
    const resolved = resolvePermissionReference(cmd.permissions);
    return resolved != null ? [resolved] : [];
  }
  return null;
}

function resolveComponentPolicy(map, customId) {
  if (!map || typeof map !== "object") return null;

  if (Object.prototype.hasOwnProperty.call(map, customId)) {
    return map[customId];
  }

  const wildcardKeys = Object.keys(map).filter((key) => key.endsWith("*")).sort((a, b) => b.length - a.length);

  for (const key of wildcardKeys) {
    const prefix = key.slice(0, -1);
    if (customId.startsWith(prefix)) return map[key];
  }

  return null;
}

function normalizeButtonPolicy(policy) {
  if (policy == null) return null;

  if (typeof policy === "string") {
    const resolved = resolveRoleReference(policy);
    return { roles: resolved ? [resolved] : [], permissions: null };
  }

  if (Array.isArray(policy)) {
    return { roles: normalizeRoleList(policy), permissions: null };
  }

  if (typeof policy === "object") {
    let roles = null;
    if (Array.isArray(policy.roles)) {
      roles = normalizeRoleList(policy.roles);
    } else if (typeof policy.roles === "string") {
      const resolved = resolveRoleReference(policy.roles);
      roles = resolved ? [resolved] : [];
    }
    let permissions = null;
    if (Array.isArray(policy.permissions)) {
      permissions = normalizePermissionList(policy.permissions);
    } else if (typeof policy.permissions === "string") {
      const resolved = resolvePermissionReference(policy.permissions);
      permissions = resolved != null ? [resolved] : [];
    }

    const parsedOwnerSegment = Number.parseInt(policy.ownerSegment, 10);
    const ownerSegment = Number.isFinite(parsedOwnerSegment) ? parsedOwnerSegment : null;
    const ownerSeparator = typeof policy.ownerSeparator === "string" && policy.ownerSeparator.length > 0 ? policy.ownerSeparator : ":";
    const ownerFromMessageMention = Boolean(policy.ownerFromMessageMention);
    const ownerOrRole = Boolean(policy.ownerOrRole);
    const grantRecipientOnly = Boolean(policy.grantRecipientOnly);
    const punticasaPrefectOnly = Boolean(policy.punticasaPrefectOnly);
    let channelPolicy = null;
    if (Array.isArray(policy.channels)) {
      channelPolicy = normalizeChannelList(policy.channels);
    }

    return {
      roles,
      permissions,
      ownerSegment,
      ownerSeparator,
      ownerFromMessageMention,
      ownerOrRole,
      grantRecipientOnly,
      punticasaPrefectOnly,
      channels: channelPolicy,
    };
  }

  return null;
}

function getPendingCustomRoleGrant(token) {
  try {
    const mod = require("../../Events/interaction/customRoleHandlers");
    if (typeof mod?.getPendingRoleGrantByToken !== "function") return null;
    return mod.getPendingRoleGrantByToken(token);
  } catch {
    return null;
  }
}

function extractOwnerIdFromMessageMention(message) {
  if (!message) return null;

  const scan = (text) => { const match = String(text || "").match(/<@!?(\d{16,20})>/); return match?.[1] || null; };

  const fromContent = scan(message.content);
  if (fromContent) return fromContent;

  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    const fromDescription = scan(embed?.description);
    if (fromDescription) return fromDescription;
    const fromTitle = scan(embed?.title);
    if (fromTitle) return fromTitle;
    const fields = Array.isArray(embed?.fields) ? embed.fields : [];
    for (const field of fields) {
      const fromFieldName = scan(field?.name);
      if (fromFieldName) return fromFieldName;
      const fromFieldValue = scan(field?.value);
      if (fromFieldValue) return fromFieldValue;
    }
  }

  return null;
}

function getDevIds(client) {
  const rawIds = IDs?.developers ?? IDs?.guilds?.developers ?? "";
  const fromIds = Array.isArray(rawIds) ? rawIds.map((id) => String(id).trim()).filter(Boolean) : String(rawIds).split(",").map((id) => id.trim()).filter(Boolean);
  const raw = client?.config?.developers ?? "";
  const fromConfig = Array.isArray(raw) ? raw.map((id) => String(id).trim()).filter(Boolean) : String(raw).split(",").map((id) => id.trim()).filter(Boolean);
  return Array.from(new Set([...fromIds, ...fromConfig]));
}

function denyIfPunticasaPrefectOnlyBlocked(userId, client, enabled) {
  if (!enabled) return null;
  try {
    const { isPunticasaAllowedUser } = require("../Community/punticasaPrefectAccess");
    if (isPunticasaAllowedUser(userId, client)) return null;
  } catch {
    return { allowed: false, reason: "missing_role", requiredRoles: null, ownerId: null, channels: null };
  }
  return { allowed: false, reason: "missing_role", requiredRoles: null, ownerId: null, channels: null };
}

async function checkSlashPermission(interaction, options = {}) {
  const userId = interaction?.user?.id || null;
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const onMainGuild = isMainGuild(guildId);

  if (guildId && !onMainGuild) {
    const allowed = await hasAllPermissionsWithLiveFallback(interaction, [PermissionFlagsBits.Administrator,]);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_permission",
        requiredRoles: null,
        channels: null,
      };
    }
    return allowed;
  }

  const data = loadPermissions();
  await ensureStaffCmdsThreadIdsHydrated().catch(() => {});
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  const channelPolicy = resolveSlashCommandChannels(data, String(interaction.commandName || "").toLowerCase(), group, sub) ?? resolveCommandChannelPolicy(data, buildSlashLookupKeys(interaction.commandName, group, sub));
  const bypassChannelPolicyForAntiNuke = String(interaction?.commandName || "").toLowerCase() === "antinuke";
  if (Array.isArray(channelPolicy) && channelPolicy.length > 0 && !bypassChannelPolicyForAntiNuke) {
    const ch = interaction?.channel;
    const allowed = ch
      ? channelMatchesPolicyChannelList(ch, channelPolicy)
      : Boolean(interaction?.channelId) && channelPolicy.includes(String(interaction.channelId));
    if (!allowed) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "channel",
          requiredRoles: null,
          channels: channelPolicy,
        };
      }
      return false;
    }
  }
  const roles = resolveSlashRoles(data, interaction.commandName, group, sub);
  const permissions = resolveSlashPermissions(data, interaction.commandName, group, sub,);
  if (!Array.isArray(roles) && !Array.isArray(permissions)) {
    if (options.returnDetails) {
      return { allowed: true, reason: null, requiredRoles: null, channels: channelPolicy || null };
    }
    return true;
  }
  if (!interaction.inGuild()) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: Array.isArray(roles) ? "missing_role" : "missing_permission",
        requiredRoles: roles,
        channels: channelPolicy || null,
      };
    }
    return false;
  }
  const hasRole = !Array.isArray(roles) ? true : await hasAnyRoleWithLiveFallback(interaction, roles);
  const hasPermissions = !Array.isArray(permissions) ? true : await hasAllPermissionsWithLiveFallback(interaction, permissions);
  const allowed = hasRole && hasPermissions;
  const reason = !hasRole ? "missing_role" : !hasPermissions ? "missing_permission" : null;
  if (options.returnDetails) {
    return {
      allowed,
      reason,
      requiredRoles: !hasRole ? roles : null,
      channels: channelPolicy || null,
    };
  }
  return allowed;
}

function tryResolveMultiGuildOpenMediaBypass(guildId, commandName, options) {
  try {
    const { resolveOpenMediaPrefixBypass } = require("../../MultiGuild/core/openMediaCommands");
    return resolveOpenMediaPrefixBypass(guildId, commandName, options);
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] MultiGuild open media bypass:", err?.message || err);
    return null;
  }
}

function tryResolveMultiGuildTenantPrefixRestriction(guildId, commandName, options) {
  try {
    const { resolveTenantPrefixRestriction } = require("../../MultiGuild/core/tenantPrefixGate");
    return resolveTenantPrefixRestriction(guildId, commandName, options);
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] MultiGuild tenant prefix gate:", err?.message || err);
    return null;
  }
}

async function checkPrefixPermission(message, commandName, subcommandName = null, options = {}) {
  const guildId = message?.guild?.id || null;
  const userId = message?.author?.id || null;
  const safeCommand = String(commandName || "").toLowerCase();
  const onMainGuild = isMainGuild(guildId);

  const openMediaBypass = tryResolveMultiGuildOpenMediaBypass(guildId, safeCommand, options);
  if (openMediaBypass !== null) {
    if (openMediaBypass.allowed !== false && message?.member) {
      try {
        const { resolveTenantModerationMemberCheck } = require("../../MultiGuild/core/tenantModerationPermissions");
        const modCheck = resolveTenantModerationMemberCheck(message.member, safeCommand, options);
        if (modCheck !== null) return modCheck;
      } catch (err) {
        global.logger?.warn?.("[commandPermissions] MultiGuild tenant mod check:", err?.message || err);
      }
    }
    return openMediaBypass;
  }

  const tenantRestriction = tryResolveMultiGuildTenantPrefixRestriction(guildId, safeCommand, options);
  if (tenantRestriction !== null) {
    return tenantRestriction;
  }

  if (guildId && !onMainGuild) {
    const playOnSponsor = safeCommand === "play" && isAllowedGuildUfficiale(guildId);
    if (!playOnSponsor) {
      const allowed = await hasAllPermissionsWithLiveFallback(message, [PermissionFlagsBits.Administrator,]);
      if (options.returnDetails) {
        return {
          allowed,
          reason: allowed ? null : "missing_permission",
          requiredRoles: null,
          channels: null,
        };
      }
      return allowed;
    }
  }

  const data = loadPermissions();
  await ensureStaffCmdsThreadIdsHydrated().catch(() => {});
  const channelPolicy = resolvePrefixCommandChannels(data, safeCommand, subcommandName) ?? resolveCommandChannelPolicy(data, buildPrefixLookupKeys(commandName, subcommandName));
  const bypassChannelPolicyForAntiNuke = safeCommand === "antinuke";
  if (Array.isArray(channelPolicy) && channelPolicy.length > 0 && !bypassChannelPolicyForAntiNuke) {
    const ch = message?.channel;
    const allowed = ch
      ? channelMatchesPolicyChannelList(ch, channelPolicy)
      : Boolean(message?.channelId) && channelPolicy.includes(String(message.channelId));
    const allowInPmThread =
      !allowed &&
      PM_THREAD_PREFIX_CHANNEL_BYPASS_COMMANDS.has(safeCommand) &&
      (await isPartnerPmDailyCommandsThread(ch).catch(() => false));
    const allowInTicketChannel =
      !allowed &&
      !allowInPmThread &&
      TICKET_PREFIX_CHANNEL_BYPASS_COMMANDS.has(safeCommand) &&
      isChannelInTicketCategory(ch);
    const allowInVoiceOrStanzaChat = await (async () => {
      if (allowed || allowInPmThread || allowInTicketChannel) return false;
      if (!ch) return false;
      try {
        const { isAllowedVoiceCommandChannel } = require("../../../shared/voice/voiceCommandChannelAccess");
        return await isAllowedVoiceCommandChannel(message.guild, ch, {
          blockedChannelIds: [IDs.channels?.riunioneStaff, IDs.channels?.serataFilm].filter(Boolean),
        });
      } catch (_) {
        return false;
      }
    })();
    if (!allowed && !allowInPmThread && !allowInTicketChannel && !allowInVoiceOrStanzaChat) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "channel",
          requiredRoles: null,
          channels: channelPolicy,
        };
      }
      return false;
    }
  }
  const cmdCfg = data?.prefix?.[safeCommand];
  const prefectGate = denyIfPunticasaPrefectOnlyBlocked(
    userId,
    message?.client,
    cmdCfg && typeof cmdCfg === "object" && cmdCfg.punticasaPrefectOnly,
  );
  if (prefectGate) {
    if (options.returnDetails) {
      return { ...prefectGate, channels: channelPolicy || null };
    }
    return false;
  }
  const roles = resolvePrefixRoles(data, commandName, subcommandName);
  const permissions = resolvePrefixPermissions(data, commandName, subcommandName);
  if (!Array.isArray(roles) && !Array.isArray(permissions)) {
    if (options.returnDetails) {
      return { allowed: true, reason: null, requiredRoles: null, channels: channelPolicy || null };
    }
    return true;
  }
  if (!message.guild) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: Array.isArray(roles) ? "missing_role" : "missing_permission",
        requiredRoles: roles,
        channels: channelPolicy || null,
      };
    }
    return false;
  }
  const hasRole = !Array.isArray(roles) ? true : await hasAnyRoleWithLiveFallback(message, roles);
  const hasPermissions = !Array.isArray(permissions) ? true : await hasAllPermissionsWithLiveFallback(message, permissions);
  const allowed = hasRole && hasPermissions;
  const reason = !hasRole ? "missing_role" : !hasPermissions ? "missing_permission" : null;
  if (options.returnDetails) {
    return {
      allowed,
      reason,
      requiredRoles: !hasRole ? roles : null,
      channels: channelPolicy || null,
    };
  }
  return allowed;
}

async function checkButtonPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (isCustomRoleSystemInteraction(customId)) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  if (await isBlockedFromCandidaturesByRole(interaction, customId)) {
    return {
      allowed: false,
      reason: "candidature_blacklist",
      requiredRoles: null,
      ownerId: null,
    };
  }
  if (guildId && !isAllowedGuildForComponents(guildId)) {
    if (isTicketInteraction(customId) || isProfilePanelInteraction(customId)) {
      return {
        allowed: true,
        reason: null,
        requiredRoles: null,
        ownerId: null,
      };
    }
    const tenantUtilityBypass = tryTenantUtilityComponentBypass(guildId, customId);
    if (tenantUtilityBypass) return tenantUtilityBypass;
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (isMainGuild(guildId) && isApplyOrCandidatureInteraction(customId)) {
    return {
      allowed: true,
      reason: null,
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (isMainGuild(guildId) && isCandidatureStaffReviewInteraction(customId)) {
    const allowed = hasCandidatureReviewAccess(interaction);
    return {
      allowed,
      reason: allowed ? null : "missing_role",
      requiredRoles: ["roles.Admin", "roles.Manager", "roles.Founder"],
      ownerId: null,
    };
  }

  if (isMainGuild(guildId) && isResocontoInteraction(customId)) {
    const allowed = interactionHasResocontoButtonAccess(interaction);
    return {
      allowed,
      reason: allowed ? null : "missing_role",
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const profilePanelGate = await checkProfilePanelControlPermission(interaction, customId);
  if (profilePanelGate) return profilePanelGate;

  const staffGuideGate = await checkStaffGuideButtonGate(interaction, customId);
  if (staffGuideGate) return staffGuideGate;

  const data = loadPermissions();
  await ensureStaffCmdsThreadIdsHydrated().catch(() => {});
  const rawPolicy = resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeButtonPolicy(rawPolicy);
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const prefectGate = denyIfPunticasaPrefectOnlyBlocked(
    interaction?.user?.id,
    interaction?.client,
    policy.punticasaPrefectOnly,
  );
  if (prefectGate) return prefectGate;

  let grantRecipientMatched = false;
  if (policy.grantRecipientOnly) {
    const [, token] = String(customId).split(":");
    const request = getPendingCustomRoleGrant(token);
    grantRecipientMatched =
      Boolean(request) &&
      Boolean(interaction?.user?.id) &&
      String(interaction.user.id) === String(request.targetId);
    if (
      request &&
      interaction?.user?.id &&
      String(interaction.user.id) !== String(request.targetId)
    ) {
      return {
        allowed: false,
        reason: "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: String(request.targetId),
      };
    }
  }

  const hasOwnerConstraint = (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) || policy.ownerFromMessageMention;
  let ownerId = null;
  let ownerPass = true;

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    ownerId =
      customId.split(policy.ownerSeparator || ":")[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      ownerPass = false;
    }
  }

  if (policy.ownerFromMessageMention) {
    const mentionedOwnerId = extractOwnerIdFromMessageMention(interaction?.message);
    ownerId = ownerId || mentionedOwnerId || null;
    if (
      !mentionedOwnerId ||
      (interaction?.user?.id && interaction.user.id !== mentionedOwnerId)
    ) {
      ownerPass = false;
    }
  }

  const hasRoleConstraint = Array.isArray(policy.roles);
  let rolePass = true;
  if (hasRoleConstraint) {
    if (grantRecipientMatched && !interaction?.inGuild?.()) {
      rolePass = true;
    } else if (!interaction?.inGuild?.()) {
      rolePass = false;
    } else {
      rolePass = await hasAnyRoleWithLiveFallback(interaction, policy.roles);
    }
  }
  const hasPermissionConstraint = Array.isArray(policy.permissions);
  let permissionPass = true;
  if (hasPermissionConstraint) {
    if (!interaction?.inGuild?.()) {
      permissionPass = false;
    } else {
      permissionPass = await hasAllPermissionsWithLiveFallback(
        interaction,
        policy.permissions,
      );
    }
  }
  const accessPass = rolePass && permissionPass;

  if (
    policy.ownerOrRole &&
    hasOwnerConstraint &&
    (hasRoleConstraint || hasPermissionConstraint)
  ) {
    if (!(ownerPass || accessPass)) {
      return {
        allowed: false,
        reason: ownerPass
          ? hasRoleConstraint && !rolePass
            ? "missing_role"
            : "missing_permission"
          : "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: policy.roles || null,
      ownerId: ownerId || null,
    };
  }

  if (hasRoleConstraint && !rolePass) {
    if (customId === "personality_colors_plus" && guildId && interaction?.user?.id) {
      const week2Grant = await hasEventWeekWinnerGrant(guildId, interaction.user.id, 2).catch(() => false);
      const week3Grant = await hasEventWeekWinnerGrant(guildId, interaction.user.id, 3).catch(() => false);
      if (week2Grant || week3Grant) return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
    return {
      allowed: false,
      reason: "missing_role",
      requiredRoles: policy.roles,
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  const hasChannelConstraint = Array.isArray(policy.channels) && policy.channels.length > 0;
  let channelPass = true;
  if (hasChannelConstraint) {
    const ch = interaction?.channel;
    channelPass = ch
      ? channelMatchesPolicyChannelList(ch, policy.channels)
      : Boolean(interaction?.channelId) && policy.channels.includes(String(interaction.channelId));
  }
  if (hasChannelConstraint && !channelPass) {
    return {
      allowed: false,
      reason: "channel",
      requiredRoles: policy.roles || null,
      channels: policy.channels,
      ownerId: null,
    };
  }
  return {
    allowed: true,
    reason: null,
    requiredRoles: policy.roles || null,
    ownerId: null,
  };
}

async function checkStringSelectPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (isCustomRoleSystemInteraction(customId)) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  if (await isBlockedFromCandidaturesByRole(interaction, customId)) {
    return {
      allowed: false,
      reason: "candidature_blacklist",
      requiredRoles: null,
      ownerId: null,
    };
  }
  if (guildId && !isAllowedGuildForComponents(guildId)) {
    if (isTicketInteraction(customId) || isProfilePanelInteraction(customId)) {
      return {
        allowed: true,
        reason: null,
        requiredRoles: null,
        ownerId: null,
      };
    }
    const tenantUtilityBypass = tryTenantUtilityComponentBypass(guildId, customId);
    if (tenantUtilityBypass) return tenantUtilityBypass;
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }
  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const profilePanelGate = await checkProfilePanelControlPermission(interaction, customId);
  if (profilePanelGate) return profilePanelGate;

  if (customId === "staff_guide_menu") {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const data = loadPermissions();
  await ensureStaffCmdsThreadIdsHydrated().catch(() => {});
  const rawPolicy = resolveComponentPolicy(data?.selectMenus, customId) || resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeButtonPolicy(rawPolicy);
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const prefectGate = denyIfPunticasaPrefectOnlyBlocked(
    interaction?.user?.id,
    interaction?.client,
    policy.punticasaPrefectOnly,
  );
  if (prefectGate) return prefectGate;

  const hasOwnerConstraint = (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) || policy.ownerFromMessageMention;
  let ownerId = null;
  let ownerPass = true;

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    ownerId =
      customId.split(policy.ownerSeparator || ":")[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      ownerPass = false;
    }
  }

  if (policy.ownerFromMessageMention) {
    const mentionedOwnerId = extractOwnerIdFromMessageMention(interaction?.message);
    ownerId = ownerId || mentionedOwnerId || null;
    if (
      !mentionedOwnerId ||
      (interaction?.user?.id && interaction.user.id !== mentionedOwnerId)
    ) {
      ownerPass = false;
    }
  }

  const hasRoleConstraint = Array.isArray(policy.roles);
  let rolePass = true;
  if (hasRoleConstraint) {
    if (!interaction?.inGuild?.()) {
      rolePass = false;
    } else {
      rolePass = await hasAnyRoleWithLiveFallback(interaction, policy.roles);
    }
  }
  const hasPermissionConstraint = Array.isArray(policy.permissions);
  let permissionPass = true;
  if (hasPermissionConstraint) {
    if (!interaction?.inGuild?.()) {
      permissionPass = false;
    } else {
      permissionPass = await hasAllPermissionsWithLiveFallback(
        interaction,
        policy.permissions,
      );
    }
  }
  const accessPass = rolePass && permissionPass;

  if (
    policy.ownerOrRole &&
    hasOwnerConstraint &&
    (hasRoleConstraint || hasPermissionConstraint)
  ) {
    if (!(ownerPass || accessPass)) {
      return {
        allowed: false,
        reason: ownerPass
          ? hasRoleConstraint && !rolePass
            ? "missing_role"
            : "missing_permission"
          : "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: policy.roles || null,
      ownerId: ownerId || null,
    };
  }

  if (hasRoleConstraint && !rolePass) {
    if (customId === "personality_colors_plus" && guildId && interaction?.user?.id) {
      const week2Grant = await hasEventWeekWinnerGrant(guildId, interaction.user.id, 2).catch(() => false);
      const week3Grant = await hasEventWeekWinnerGrant(guildId, interaction.user.id, 3).catch(() => false);
      if (week2Grant || week3Grant) return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
    return {
      allowed: false,
      reason: "missing_role",
      requiredRoles: policy.roles,
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }
  const hasChannelConstraint = Array.isArray(policy.channels) && policy.channels.length > 0;
  let channelPass = true;
  if (hasChannelConstraint) {
    const ch = interaction?.channel;
    channelPass = ch
      ? channelMatchesPolicyChannelList(ch, policy.channels)
      : Boolean(interaction?.channelId) && policy.channels.includes(String(interaction.channelId));
  }
  if (hasChannelConstraint && !channelPass) {
    return {
      allowed: false,
      reason: "channel",
      requiredRoles: policy.roles || null,
      channels: policy.channels,
      ownerId: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: policy.roles || null,
    ownerId: null,
  };
}

async function checkModalPermission(interaction) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (isCustomRoleSystemInteraction(customId)) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  if (await isBlockedFromCandidaturesByRole(interaction, customId)) {
    return {
      allowed: false,
      reason: "candidature_blacklist",
      requiredRoles: null,
      ownerId: null,
    };
  }
  if (guildId && !isAllowedGuildForComponents(guildId)) {
    if (isTicketInteraction(customId) || isProfilePanelInteraction(customId)) {
      return {
        allowed: true,
        reason: null,
        requiredRoles: null,
        ownerId: null,
      };
    }
    const tenantUtilityBypass = tryTenantUtilityComponentBypass(guildId, customId);
    if (tenantUtilityBypass) return tenantUtilityBypass;
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (isMainGuild(guildId) && isApplyOrCandidatureInteraction(customId)) {
    return {
      allowed: true,
      reason: null,
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (isMainGuild(guildId) && isCandidatureStaffReviewInteraction(customId)) {
    const allowed = hasCandidatureReviewAccess(interaction);
    return {
      allowed,
      reason: allowed ? null : "missing_role",
      requiredRoles: ["roles.Admin", "roles.Manager", "roles.Founder"],
      ownerId: null,
    };
  }

  if (isMainGuild(guildId) && isResocontoInteraction(customId)) {
    const allowed = interactionHasResocontoButtonAccess(interaction);
    return {
      allowed,
      reason: allowed ? null : "missing_role",
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const profilePanelGate = await checkProfilePanelControlPermission(interaction, customId);
  if (profilePanelGate) return profilePanelGate;

  const data = loadPermissions();
  await ensureStaffCmdsThreadIdsHydrated().catch(() => {});
  const rawPolicy = resolveComponentPolicy(data?.modals, customId) || resolveComponentPolicy(data?.buttons, customId);
  const policy = normalizeButtonPolicy(rawPolicy);
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  const prefectGate = denyIfPunticasaPrefectOnlyBlocked(
    interaction?.user?.id,
    interaction?.client,
    policy.punticasaPrefectOnly,
  );
  if (prefectGate) return prefectGate;

  const hasOwnerConstraint = (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) || policy.ownerFromMessageMention;
  let ownerId = null;
  let ownerPass = true;

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    ownerId =
      customId.split(policy.ownerSeparator || ":")[policy.ownerSegment] || null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      ownerPass = false;
    }
  }

  if (policy.ownerFromMessageMention) {
    const mentionedOwnerId = extractOwnerIdFromMessageMention(interaction?.message);
    ownerId = ownerId || mentionedOwnerId || null;
    if (
      !mentionedOwnerId ||
      (interaction?.user?.id && interaction.user.id !== mentionedOwnerId)
    ) {
      ownerPass = false;
    }
  }

  const hasRoleConstraint = Array.isArray(policy.roles);
  let rolePass = true;
  if (hasRoleConstraint) {
    if (!interaction?.inGuild?.()) {
      rolePass = false;
    } else {
      rolePass = await hasAnyRoleWithLiveFallback(interaction, policy.roles);
    }
  }
  const hasPermissionConstraint = Array.isArray(policy.permissions);
  let permissionPass = true;
  if (hasPermissionConstraint) {
    if (!interaction?.inGuild?.()) {
      permissionPass = false;
    } else {
      permissionPass = await hasAllPermissionsWithLiveFallback(
        interaction,
        policy.permissions,
      );
    }
  }
  const accessPass = rolePass && permissionPass;

  if (
    policy.ownerOrRole &&
    hasOwnerConstraint &&
    (hasRoleConstraint || hasPermissionConstraint)
  ) {
    if (!(ownerPass || accessPass)) {
      return {
        allowed: false,
        reason: ownerPass
          ? hasRoleConstraint && !rolePass
            ? "missing_role"
            : "missing_permission"
          : "not_owner",
        requiredRoles: policy.roles || null,
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: policy.roles || null,
      ownerId: ownerId || null,
    };
  }

  if (hasRoleConstraint && !rolePass) {
    if (customId === "personality_colors_plus" && guildId && interaction?.user?.id) {
      const week2Grant = await hasEventWeekWinnerGrant(guildId, interaction.user.id, 2).catch(() => false);
      const week3Grant = await hasEventWeekWinnerGrant(guildId, interaction.user.id, 3).catch(() => false);
      if (week2Grant || week3Grant) return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
    return {
      allowed: false,
      reason: "missing_role",
      requiredRoles: policy.roles,
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: policy.roles || null,
      ownerId: null,
    };
  }
  const hasChannelConstraint = Array.isArray(policy.channels) && policy.channels.length > 0;
  let channelPass = true;
  if (hasChannelConstraint) {
    const ch = interaction?.channel;
    channelPass = ch
      ? channelMatchesPolicyChannelList(ch, policy.channels)
      : Boolean(interaction?.channelId) && policy.channels.includes(String(interaction.channelId));
  }
  if (hasChannelConstraint && !channelPass) {
    return {
      allowed: false,
      reason: "channel",
      requiredRoles: policy.roles || null,
      channels: policy.channels,
      ownerId: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: policy.roles || null,
    ownerId: null,
  };
}

function getSlashRequiredRoles(interaction) {
  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  return resolveSlashRoles(data, interaction.commandName, group, sub);
}

function getPrefixRequiredRoles(commandName, subcommandName = null) {
  const data = loadPermissions();
  return resolvePrefixRoles(data, commandName, subcommandName);
}

function buildGlobalPermissionDeniedEmbed(requiredRoleIds = [], entityLabel = "comando", customDescription = null, guild = null) {
  let roles = Array.isArray(requiredRoleIds) ? requiredRoleIds.filter(Boolean) : [];
  if (guild?.roles?.cache) {
    roles = roles.filter((id) => guild.roles.cache.has(id));
  }
  const rolesText = roles.length ? roles.map((id) => `<@&${id}>`).join(", ")
    : "<:VC_Attention:1482534443632558151> Nessun ruolo configurato.";
  const description = customDescription != null ? customDescription : `<:VC_Lock:1482526739044368476> Questo ${entityLabel} è riservato ad una categoria di utenti specifici.`;

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> **Non hai i permessi**")
    .setDescription(description);
  if (roles.length > 0) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `<a:VC_Arrow:1482706699365257397> Ottieni uno dei seguenti ruoli: ${rolesText}`,
    });
  }
  return embed;
}

function buildGlobalChannelDeniedEmbed(allowedChannelIds = [], entityLabel = "comando") {
  const channels = Array.isArray(allowedChannelIds)
    ? allowedChannelIds.filter(Boolean).map(String).filter((id) => !id.startsWith("__zone:"))
    : [];
  const channelsText = channels.length ? channels.map((id) => `<#${id}>`).join(", ")
    : "<:VC_Attention:1482534443632558151> Nessun canale configurato.";

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> **Non hai i permessi**")
    .setDescription(`<:VC_Lock:1482526739044368476> Questo ${entityLabel} è disponibile solo in canali specifici.`);
  if (channels.length > 0) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `<a:VC_Arrow:1482706699365257397> Usa il comando in uno dei seguenti canali: ${channelsText}`,
    });
  } else if (Array.isArray(allowedChannelIds) && allowedChannelIds.some((id) => String(id) === HIGH_STAFF_COMMANDS_ZONE_TOKEN)) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando nel thread **Comandi High Staff** sotto #staff-cmds.",
    });
  } else if (Array.isArray(allowedChannelIds) && allowedChannelIds.some((id) => String(id) === PM_COMMANDS_THREAD_ZONE_TOKEN)) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando nel thread **Comandi Partner Manager** sotto #staff-cmds.",
    });
  }
  return embed;
}

function buildGlobalNotYourControlEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> **Accesso negato**")
    .setDescription("<:VC_Attention:1482534443632558151> Questo controllo non è associato al tuo comando.");
}

module.exports = {
  checkSlashPermission,
  checkPrefixPermission,
  checkButtonPermission,
  checkStringSelectPermission,
  checkModalPermission,
  getSlashRequiredRoles,
  getPrefixRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
  buildGlobalNotYourControlEmbed,
  hasAnyRole,
  getDevIds,
  __test: {
    channelMatchesPolicyChannelList,
    normalizeChannelList,
    expandResolvedChannelReference,
    HIGH_STAFF_COMMANDS_ZONE_TOKEN,
    PM_COMMANDS_THREAD_ZONE_TOKEN,
  },
};