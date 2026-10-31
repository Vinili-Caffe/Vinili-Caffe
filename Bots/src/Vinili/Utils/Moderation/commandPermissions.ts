const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { EmbedBuilder, PermissionsBitField, PermissionFlagsBits, } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../Config/ids") as typeof import("../Config/ids");
const { hasAdminsProfileCapability } = require("../../Services/Moderation/securityProfilesService") as typeof import("../../Services/Moderation/securityProfilesService");
const { isPartnerPmDailyCommandsThread } = require("../Partner/partnersChatChannelUtils") as typeof import("../Partner/partnersChatChannelUtils");
const { getStaffCmdsThreadIdsCache, ensureStaffCmdsThreadIdsHydrated, isHighStaffCommandsThread, isStaffCmdsPmCommandsThreadSync } = require("../Staff/staffCmdsChannelUtils") as typeof import("../Staff/staffCmdsChannelUtils");
const { isChannelInTicketCategory } = require("../Ticket/ticketCategoryUtils") as typeof import("../Ticket/ticketCategoryUtils");
const { buildPrefixLookupKeys, buildSlashLookupKeys } = require("./temporaryCommandPermissions") as typeof import("./temporaryCommandPermissions");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService") as typeof import("../../Services/Community/weekWinnerGrantsService");
const { parseProfilePanelOwnerIdFromCustomId, resolveProfilePanelControl } = require("../Community/profilePanelControl") as typeof import("../Community/profilePanelControl");
const {
  STAFF_LADDER_KEYS_HIGH_TO_LOW,
} = require("../Staff/staffRoleHierarchy") as typeof import("../Staff/staffRoleHierarchy");
const {
  interactionHasResocontoButtonAccess,
  hasCandidatureReviewAccess,
  isResocontoInteraction,
  isCandidatureStaffReviewInteraction,
} = require("../Staff/resocontoAccess") as typeof import("../Staff/resocontoAccess");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  SETUP_REQUIRED_REPLY,
} = require("../Partner/partnershipConfigResolver") as typeof import("../Partner/partnershipConfigResolver");
const EMPTY_PERMISSIONS = { slash: {}, prefix: {}, channels: {}, buttons: {}, selectMenus: {}, modals: {}, };
const PERMISSIONS_CANDIDATES = [
  path.resolve(__dirname, "../../permissions.json"),
  path.join(process.cwd(), "permissions.json"),
];
const PERMISSIONS_CACHE_TTL_MS = 3000;
let cache = { filePath: null, mtimeMs: 0, data: EMPTY_PERMISSIONS, expiresAt: 0 };
let idsFallbackCache = null;
const LIVE_MEMBER_CACHE_TTL_MS = 15_000;
const liveMemberCache = new Map();
const PM_THREAD_PREFIX_CHANNEL_BYPASS_COMMANDS = new Set(["help", "profile"]);
const TICKET_PREFIX_CHANNEL_BYPASS_COMMANDS = new Set(["sezioneproibita", "libriproibiti", "forbiddenbooks"]);
const WEB_TICKET_PREFIX_ALLOWED_COMMANDS = new Set([
  "description",
]);
const WEB_TICKET_PREFIX_CATEGORY_LIMIT = Object.freeze({
  description: Object.freeze(["partnership"]),
});
const VOICE_STANZA_PREFIX_CHANNEL_BYPASS_COMMANDS = new Set([
  "play",
  "pause",
  "resume",
  "skip",
  "stop",
  "volume",
  "shuffle",
  "clear",
  "repeat",
  "previous",
  "rewind",
  "restart",
  "now",
  "next",
  "queue",
  "lyrics",
  "requested",
  "upcoming",
  "join",
  "leave",
  "set",
  "voices",
]);
const WEB_TICKET_PREFIX_HIDDEN_COMMANDS = new Set([
  "ticket",
  ...VOICE_STANZA_PREFIX_CHANNEL_BYPASS_COMMANDS,
]);
const WEB_TICKET_SLASH_ALLOWED_COMMANDS = new Set([
  "partnership",
]);
const WEB_TICKET_SLASH_HIDDEN_COMMANDS = new Set(["music"]);
const WEB_TICKET_SLASH_CATEGORY_LIMIT = Object.freeze({
  partnership: Object.freeze(["partnership"]),
});
const HIGH_STAFF_COMMANDS_ZONE_TOKEN = "__zone:highStaffCommands";
const PM_COMMANDS_THREAD_ZONE_TOKEN = "__zone:pmCommandsThread";
const STAFF_GUIDE_BUTTON_IDS = new Set([
  "regolamento",
  "regole_staff",
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
    .map((id?) => String(id || "").trim())
    .filter(Boolean);
}

function isPartnerManagerOnlyMember(member?) {
  const pmId = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmId || !member?.roles?.cache?.has(pmId)) return false;
  const access = getStaffGuideAccessRoleIds();
  return !access.some((id?) => member.roles.cache.has(id));
}

async function checkStaffGuideButtonGate(interaction?, customId?) {
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
function isAllowedGuildUfficiale(guildId?) {
  return !guildId || ALLOWED_GUILD_IDS.has(String(guildId));
}
function isAllowedGuildForComponents(guildId?) {
  if (!guildId) return true;
  const s = String(guildId);
  if (MAIN_GUILD_ID && s === String(MAIN_GUILD_ID)) return true;
  if (ALLOWED_GUILD_IDS.has(s) || sponsorIdsForComponents.has(s)) return true;
  try {
    const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
    const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
    if (isMultiGuildLayerEnabled() && shouldApplyMultiGuildLayer(s)) return true;
  } catch {
      }
  return false;
}

const TENANT_UTILITY_COMPONENT_PREFIXES = [
  "repost_btn:",
  "repost_src:",
  "repost_remove:",
  "quote_remove:",
  "myrepost_page_",
  "myrepost_del:",
  "myrepost_close:",
  "myclip_page_",
  "myclip_del:",
  "myclip_close:",
  "myquote_page_",
  "myquote_del:",
  "myquote_close:",
];

const TENANT_PARTNERSHIP_SETUP_PREFIXES = [
  "psetup:",
  "psetup_modal:",
  "psettings:",
  "psettings_modal:",
  "tprof:",
];

const TENANT_HELP_NAV_PREFIXES = [
  "help_home_",
  "help_prev_",
  "help_next_",
  "help_page_",
  "badges_prev_",
  "badges_next_",
  "badges_page_",
];

function isPartnershipModalInteraction(customId?) {
  const id = String(customId || "");
  return id.startsWith("partnershipModal_");
}

function isTenantUtilityComponentInteraction(customId?) {
  const id = String(customId || "");
  return TENANT_UTILITY_COMPONENT_PREFIXES.some((prefix?) => id.startsWith(prefix));
}

function isPartnershipSetupComponentInteraction(customId?) {
  const id = String(customId || "");
  return TENANT_PARTNERSHIP_SETUP_PREFIXES.some((prefix?) => id.startsWith(prefix));
}

function isTenantHelpNavComponentInteraction(customId?) {
  const id = String(customId || "");
  return TENANT_HELP_NAV_PREFIXES.some((prefix?) => id.startsWith(prefix));
}

function tryTenantHelpNavComponentBypass(guildId?, customId?) {
  if (!guildId || !isTenantHelpNavComponentInteraction(customId)) return null;
  try {
    const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
    const { resolveGuildAccess } = require("../../MultiGuild/core/guildRegistry") as typeof import("../../MultiGuild/core/guildRegistry");
    const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
    if (!isMultiGuildLayerEnabled()) return null;
    if (isViniliFullFeatureGuild(guildId)) return null;
    const access = resolveGuildAccess(guildId);
    if (access?.managed && access?.allowed) {
      return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
  } catch (err) {
    global.logger?.warn?.(
      "[commandPermissions] tenant help nav component bypass:",
      err?.message || err,
    );
  }
  return null;
}

function tryTenantManagedComponentBypass(guildId?, customId?, category?) {
  if (!guildId || isAllowedGuildForComponents(guildId)) return null;
  try {
    const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
    if (!isMultiGuildLayerEnabled()) return null;
    const { canInvokePrefixCommand } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
    const gate = canInvokePrefixCommand(guildId, category);
    if (gate.managed && gate.ok) {
      return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
  } catch (err) {
    global.logger?.warn?.(
      `[commandPermissions] tenant ${category} component bypass:`,
      err?.message || err,
    );
  }
  return null;
}

function tryTenantUtilityComponentBypass(guildId?, customId?) {
  if (!isTenantUtilityComponentInteraction(customId)) return null;
  return tryTenantManagedComponentBypass(guildId, customId, "utility");
}

function isTenantLeaderboardComponentInteraction(customId?) {
  const id = String(customId || "");
  return id.startsWith("tlb:");
}

function tryTenantPartnershipSetupBypass(guildId?, customId?, interaction = null) {
  if (isTenantLeaderboardComponentInteraction(customId)) {
    return tryTenantManagedComponentBypass(guildId, customId, "partnership");
  }
  if (isPartnershipSetupComponentInteraction(customId)) {
    try {
      const {
        memberCanManageTenantPartnershipSettings,
      } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
      if (
        !memberCanManageTenantPartnershipSettings(interaction?.member, interaction?.guild)
      ) {
        return {
          allowed: false,
          reason: "missing_permission",
          requiredRoles: null,
          ownerId: null,
        };
      }
    } catch (err) {
      global.logger?.warn?.(
        "[commandPermissions] tenant partnership admin gate:",
        err?.message || err,
      );
      return {
        allowed: false,
        reason: "missing_permission",
        requiredRoles: null,
        ownerId: null,
      };
    }
    return tryTenantManagedComponentBypass(guildId, customId, "partnership");
  }
  if (isPartnershipModalInteraction(customId)) {
    return tryTenantManagedComponentBypass(guildId, customId, "partnership");
  }
  return null;
}

function isMainGuild(guildId?) {
  if (!guildId) return false;
  const s = String(guildId);
  if (MAIN_GUILD_ID && s === String(MAIN_GUILD_ID)) return true;
  // Server di test = stesso set comandi del main (niente gate "solo partnership")
  const testId = IDs?.guilds?.test;
  if (testId && s === String(testId)) return true;
  return false;
}

const TICKET_INTERACTION_IDS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_perks",
  "ticket_supporto",
  "claim_ticket",
  "unclaim",
  "close_ticket",
  "close_ticket_confirm",
  "close_ticket_cancel",
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
function isBackupInteraction(customId?) {
  const id = String(customId || "").trim();
  if (!id) return false;
  return (
    id.startsWith("backup_") ||
    id.startsWith("backup-load_") ||
    id.startsWith("backup_list_")
  );
}
function isTicketInteraction(customId?) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (id.startsWith("pm_shop_ack:")) return true;
  if (id.startsWith("tkp:")) return true;
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

function isProfilePanelInteraction(customId?) {
  if (!customId || typeof customId !== "string") return false;
  return String(customId).trim().startsWith("profile_panel:") || String(customId).trim().startsWith("staff_profile_panel:") || String(customId).trim().startsWith("staff_pm_shop:") || String(customId).trim().startsWith("staff_val_neg_trade:");
}

function checkTenantProfilePanelPermission(interaction?, customId?) {
  const id = String(customId || "");
  if (!id.startsWith("tprof:")) return null;
  const parts = id.split(":");
  const ownerId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(ownerId)) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  const ok = String(interaction?.user?.id || "") === ownerId;
  return {
    allowed: ok,
    reason: ok ? null : "tenant_profile_not_owner",
    requiredRoles: null,
    ownerId: ok ? null : ownerId,
  };
}

async function checkProfilePanelControlPermission(interaction?, customId?) {
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

function isCustomRoleSystemInteraction(customId?) {
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

function isApplyOrCandidatureInteraction(customId?) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (id === "apply_helper" || id === "apply_partnermanager") return true;
  if (id.startsWith("apply_start:") || id.startsWith("apply_back:") || id.startsWith("apply_page:")) return true;
  if (id.startsWith("apply_form:")) return true;
  if (id === "candidature_premi_partner") return true;
  return false;
}

async function isBlockedFromCandidaturesByRole(interaction?, customId?) {
  if (!isApplyOrCandidatureInteraction(customId)) return false;
  if (!CANDIDATURE_BLACKLIST_ROLE_ID) return false;
  if (!interaction?.inGuild?.()) return false;
  return hasAnyRoleWithLiveFallback(interaction, [CANDIDATURE_BLACKLIST_ROLE_ID]);
}

async function isGuildOwnerOrAdmin(interaction?) {
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
    const permissionsPath = PERMISSIONS_CANDIDATES.find((p?) => fs.existsSync(p)) || null;
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
    try {
      require("../Config/emergencyRoleIdRemap").remapDeepRoleIdsInPlace(parsed);
    } catch (_) {}
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

function resolveRoleReference(value?) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  let resolved = null;
  if (/^\d{16,22}$/.test(raw)) {
    resolved = raw;
  } else {
    let key = raw;
    if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
    else if (key.startsWith("roles.")) key = key.slice("roles.".length);

    const idsCfg = typeof IDs !== "undefined" && IDs ? IDs : getIdsConfig();
    const table = idsCfg?.roles;
    if (!table || typeof table !== "object") return null;
    if (table[key] != null && String(table[key]).trim() !== "") resolved = String(table[key]);
    else {
      const lower = String(key).toLowerCase();
      for (const k of Object.keys(table)) {
        if (String(k).toLowerCase() === lower) {
          const v = table[k];
          if (v != null && String(v).trim() !== "") {
            resolved = String(v);
            break;
          }
        }
      }
    }
  }
  if (!resolved) return null;
  try {
    const { remapRoleIdForward } = require("../Config/emergencyRoleIdRemap") as typeof import("../Config/emergencyRoleIdRemap");
    return remapRoleIdForward(resolved) || resolved;
  } catch {
    return resolved;
  }
}

function normalizeRoleList(roleIds?) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds.map((value?) => resolveRoleReference(value)).filter(Boolean);
}

function asRequiredRoles(roles?) {
  if (roles == null) return null;
  const list = normalizeRoleList(Array.isArray(roles) ? roles : [roles]);
  return Array.isArray(list) && list.length ? list : null;
}

const PERMISSION_NAME_LOOKUP = (() => { const map = new Map(); const sources = [PermissionsBitField?.Flags, PermissionFlagsBits]; for (const source of sources) { const entries = Object.entries(source || {}); for (const [name, value] of entries) { if (value == null) continue; const exact = String(name).trim().toLowerCase(); const compact = String(name).replace(/[^a-z0-9]/gi, "").toLowerCase(); map.set(exact, value); map.set(compact, value); } } return map; })(); function resolvePermissionReference(value?) {
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

function normalizePermissionList(permissionFlags?) {
  if (!Array.isArray(permissionFlags)) return permissionFlags;
  const dedup = new Set();
  for (const flag of permissionFlags) {
    const resolved = resolvePermissionReference(flag);
    if (resolved == null) continue;
    dedup.add(String(resolved));
  }
  return Array.from(dedup, (value?) => BigInt((value as any)));
}

function parseChannelReferenceKey(value?) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let key = raw;
  if (key.startsWith("ids.channels.")) key = key.slice("ids.channels.".length);
  else if (key.startsWith("channels.")) key = key.slice("channels.".length);
  return key;
}

function resolveChannelReference(value?) {
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

function expandResolvedChannelReference(rawValue?, resolvedId?) {
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

function normalizeChannelList(channelIds?) {
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

function policyWantsHighStaffCommandsZone(policyIds?) {
  const ids = (Array.isArray(policyIds) ? policyIds : []).map(String).filter(Boolean);
  if (ids.includes(HIGH_STAFF_COMMANDS_ZONE_TOKEN)) return true;
  const cache = getStaffCmdsThreadIdsCache();
  return Boolean(cache.high && ids.includes(String(cache.high)));
}

function policyWantsPmCommandsThread(policyIds?) {
  const ids = (Array.isArray(policyIds) ? policyIds : []).map(String).filter(Boolean);
  if (ids.includes(PM_COMMANDS_THREAD_ZONE_TOKEN)) return true;
  const cache = getStaffCmdsThreadIdsCache();
  return Boolean(cache.pm && ids.includes(String(cache.pm)));
}

function channelMatchesPolicyChannelList(channel?, policyIds?) {
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

function resolveCommandChannelPolicy(data?, keys?) {
  const map = data?.channels;
  if (!map || typeof map !== "object") return null;
  for (const key of keys || []) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const normalized = normalizeChannelList(map[key]);
    if (Array.isArray(normalized)) return normalized;
  }
  return null;
}

function resolvePrefixCommandChannels(data?, commandName?, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd || typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName && subcommands[subcommandName] && typeof subcommands[subcommandName] === "object" && Array.isArray(subcommands[subcommandName].channels)) {
    return normalizeChannelList(subcommands[subcommandName].channels);
  }
  if (Array.isArray(cmd.channels)) return normalizeChannelList(cmd.channels);
  return null;
}

function resolveSlashCommandChannels(data?, commandName?, groupName = null, subcommandName = null) {
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

function collectMemberRoleIds(member?) {
  if (!member) return new Set();
  const ids = new Set();

  const cache = member?.roles?.cache;
  if (cache && typeof cache.forEach === "function") {
    cache.forEach((_?, roleId?) => ids.add(String(roleId)));
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

function memberRoleCacheLooksUsable(member?) {
  if (!member) return false;
  const cache = member?.roles?.cache;
  const everyoneId = member?.guild?.id ? String(member.guild.id) : null;
  if (cache && typeof cache.size === "number") {
    if (cache.size === 0) return false;
        if (cache.size === 1 && everyoneId && cache.has(everyoneId)) return false;
    return true;
  }
  const ids = collectMemberRoleIds(member);
  if (ids.size === 0) return false;
  if (ids.size === 1 && everyoneId && ids.has(everyoneId)) return false;
  return true;
}

/** Owner / Founder / Administrator always clear role gates. Higher ladder clears lower required ranks. */
function memberSatisfiesRequiredRolesByStaffRank(member?, roleIds?) {
  if (!member) return false;
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized) || normalized.length === 0) return false;

  const memberIds = collectMemberRoleIds(member);
  const founderId = String(IDs.roles?.Founder || "").trim();
  const isOwner = String(member.id || "") === String(member.guild?.ownerId || "");
  let isAdmin = false;
  try {
    isAdmin = Boolean(member.permissions?.has?.(PermissionFlagsBits.Administrator));
  } catch (_) {}
  if (isOwner || isAdmin || (founderId && memberIds.has(founderId))) return true;

  const ladderIds = STAFF_LADDER_KEYS_HIGH_TO_LOW.map((k?) => String(IDs.roles?.[k] || "").trim()).filter(Boolean);
  let memberRank = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ladderIds.length; i += 1) {
    if (memberIds.has(ladderIds[i])) {
      memberRank = i;
      break;
    }
  }
  const highStaffId = String(IDs.roles?.HighStaff || "").trim();
  if (memberRank === Number.POSITIVE_INFINITY && highStaffId && memberIds.has(highStaffId)) {
    const directorIdx = ladderIds.indexOf(String(IDs.roles?.Director || "").trim());
    memberRank = directorIdx >= 0 ? directorIdx : 3;
  }
  if (memberRank === Number.POSITIVE_INFINITY) return false;

  for (const rid of normalized) {
    const idx = ladderIds.indexOf(String(rid));
    if (idx >= 0 && memberRank <= idx) return true;
  }
  return false;
}

function hasAnyRole(member?, roleIds?) {
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized)) return false;
  if (normalized.length === 0) return false;
  if (memberSatisfiesRequiredRolesByStaffRank(member, normalized)) return true;
  if (!memberRoleCacheLooksUsable(member)) return false;
  try {
    const { memberHasAnyRemappedRole } = require("../Config/emergencyRoleIdRemap") as typeof import("../Config/emergencyRoleIdRemap");
    if (memberHasAnyRemappedRole(member, normalized)) return true;
  } catch {
  }
  const memberRoleIds = collectMemberRoleIds(member);
  return normalized.some((roleId?) => memberRoleIds.has(String(roleId)));
}

function hasAllPermissions(member?, permissionFlags?) {
  const normalized = normalizePermissionList(permissionFlags);
  if (!Array.isArray(normalized)) return false;
  if (normalized.length === 0) return false;
  const memberPermissions = member?.permissions;
  if (!memberPermissions || typeof memberPermissions.has !== "function")
    return false;
  return normalized.every((flag?) => memberPermissions.has(flag));
}

function resolveLiveMemberGuildUser(entity?) {
  const guild =
    entity?.guild ||
    entity?.member?.guild ||
    (entity?.guildId && entity?.client?.guilds?.cache?.get(String(entity.guildId))) ||
    null;
  const userId =
    entity?.user?.id ||
    entity?.author?.id ||
    entity?.member?.id ||
    entity?.member?.user?.id ||
    null;
  return { guild, userId: userId ? String(userId) : null };
}

async function fetchLiveMember(entity?, { preferFresh = false } = {}) {
  const { guild, userId } = resolveLiveMemberGuildUser(entity);
  if (!guild || !userId || typeof guild.members?.fetch !== "function") return null;
  const cacheKey = `${String(guild.id)}:${userId}`;
  const now = Date.now();
  if (!preferFresh) {
    const cached = liveMemberCache.get(cacheKey);
    if (cached?.member && memberRoleCacheLooksUsable(cached.member) && now < Number(cached.expiresAt || 0)) {
      return cached.member;
    }
    if (cached?.promise) return cached.promise;
  } else {
    liveMemberCache.delete(cacheKey);
  }
  const promise = getGuildMemberCached(guild, userId, { preferFresh: Boolean(preferFresh) }).catch(() => null);
  liveMemberCache.set(cacheKey, {
    member: null,
    expiresAt: 0,
    promise,
  });
  const member = await promise;
  if (member && memberRoleCacheLooksUsable(member)) {
    liveMemberCache.set(cacheKey, {
      member,
      expiresAt: Date.now() + LIVE_MEMBER_CACHE_TTL_MS,
      promise: null,
    });
  } else {
    liveMemberCache.delete(cacheKey);
  }
  return member;
}

async function hasAnyRoleWithEventGrants(member?, roleIds?, guildId?, userId?) {
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

async function hasAnyRoleWithLiveFallback(entity?, roleIds?) {
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized) || normalized.length === 0) return false;

  if (hasAnyRole(entity?.member, roleIds)) return true;

    let member = await fetchLiveMember(entity, { preferFresh: false });
  if (member && hasAnyRole(member, roleIds)) return true;

    member = await fetchLiveMember(entity, { preferFresh: true });
  if (member && hasAnyRole(member, roleIds)) return true;
  if (member) {
    return hasAnyRoleWithEventGrants(member, roleIds, member.guild?.id, member.id);
  }
  return false;
}

async function hasAllPermissionsWithLiveFallback(entity?, permissionFlags?) {
  if (hasAllPermissions(entity?.member, permissionFlags)) return true;
  let member = await fetchLiveMember(entity, { preferFresh: false });
  if (member && hasAllPermissions(member, permissionFlags)) return true;
  member = await fetchLiveMember(entity, { preferFresh: true });
  if (!member) return false;
  return hasAllPermissions(member, permissionFlags);
}

function resolveSlashRoles(data?, commandName?, groupName?, subcommandName?) {
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

function resolveSlashPermissions(data?, commandName?, groupName?, subcommandName?) {
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

function resolvePrefixRoles(data?, commandName?, subcommandName = null) {
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

function resolvePrefixPermissions(data?, commandName?, subcommandName = null) {
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

function resolveComponentPolicy(map?, customId?) {
  if (!map || typeof map !== "object") return null;

  if (Object.prototype.hasOwnProperty.call(map, customId)) {
    return map[customId];
  }

  const wildcardKeys = Object.keys(map).filter((key?) => key.endsWith("*")).sort((a?, b?) => b.length - a.length);

  for (const key of wildcardKeys) {
    const prefix = key.slice(0, -1);
    if (customId.startsWith(prefix)) return map[key];
  }

  return null;
}

function normalizeButtonPolicy(policy?) {
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
      channels: channelPolicy,
    };
  }

  return null;
}

function getPendingCustomRoleGrant(token?) {
  try {
    const mod = require("../../Events/interaction/customRoleHandlers") as typeof import("../../Events/interaction/customRoleHandlers");
    if (typeof mod?.getPendingRoleGrantByToken !== "function") return null;
    return mod.getPendingRoleGrantByToken(token);
  } catch {
    return null;
  }
}

function extractOwnerIdFromMessageMention(message?) {
  if (!message) return null;

  const scan = (text?) => { const match = String(text || "").match(/<@!?(\d{16,20})>/); return match?.[1] || null; };

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

function getDevIds(client?) {
  const rawIds = IDs?.developers ?? IDs?.guilds?.developers ?? "";
  const fromIds = Array.isArray(rawIds) ? rawIds.map((id?) => String(id).trim()).filter(Boolean) : String(rawIds).split(",").map((id?) => id.trim()).filter(Boolean);
  const raw = client?.config?.developers ?? "";
  const fromConfig = Array.isArray(raw) ? raw.map((id?) => String(id).trim()).filter(Boolean) : String(raw).split(",").map((id?) => id.trim()).filter(Boolean);
  return Array.from(new Set([...fromIds, ...fromConfig]));
}

async function checkTenantPartnershipSlashAccess(interaction?, options: Record<string, any> = {}) {
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const cmd = String(interaction?.commandName || "").toLowerCase();
  const tenantPartnerCommands = new Set([
    "partnership",
    "delete",
    "elimina partnership",
    "aggiungi punti",
    "rimuovi punti",
  ]);
  if (!guildId || isMainGuild(guildId) || !tenantPartnerCommands.has(cmd)) return null;
  if (!isPartnershipOperational(guildId)) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: "partnership_not_configured",
        requiredRoles: null,
        channels: null,
        message: SETUP_REQUIRED_REPLY,
      };
    }
    return false;
  }
  if (cmd === "partnership") {
    const member = interaction.member;
    const isOwner = String(interaction.guild?.ownerId || "") === String(interaction.user?.id || "");
    const hasManageGuild = Boolean(
      member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        member?.permissions?.has?.(PermissionFlagsBits.ManageGuild),
    );
    const allowed =
      memberHasPartnerManagerRole(member, guildId) || isOwner || hasManageGuild;
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_role",
        requiredRoles: null,
        channels: null,
        message: allowed
          ? null
          : "<:vegax:1443934876440068179> Ti serve il **ruolo Partner Manager** (o **Gestisci server**) per usare `/partnership`.",
      };
    }
    return allowed;
  }
  if (cmd === "elimina partnership") {
    const {
      memberCanManageTenantPartnershipSettings,
      TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
    } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
    const allowed = memberCanManageTenantPartnershipSettings(interaction.member, interaction.guild);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_role",
        requiredRoles: null,
        channels: null,
        message: allowed ? null : TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
      };
    }
    return allowed;
  }
  if (cmd === "aggiungi punti" || cmd === "rimuovi punti") {
    const allowed = Boolean(
      interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator),
    );
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_permission",
        requiredRoles: null,
        channels: null,
        message: allowed
          ? null
          : "<a:VC_Cross:1482532424570376253> Solo un **Amministratore** può usare questo comando.",
      };
    }
    return allowed;
  }
  if (cmd === "delete") {
    const sub = String(interaction.options?.getSubcommand?.(false) || "").toLowerCase();
    if (sub !== "partnership") {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "tenant_partnership_only",
          requiredRoles: null,
          channels: null,
          message:
            "<:vegax:1443934876440068179> Su questo server è disponibile solo `/delete partnership`.",
        };
      }
      return false;
    }
    const {
      memberCanManageTenantPartnershipSettings,
      TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
    } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
    const allowed = memberCanManageTenantPartnershipSettings(interaction.member, interaction.guild);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_role",
        requiredRoles: null,
        channels: null,
        message: allowed ? null : TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
      };
    }
    return allowed;
  }
  if (cmd === "segnala") {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: "main_guild_only",
        requiredRoles: null,
        channels: null,
        message: "<:vegax:1443934876440068179> Questo comando è disponibile solo sul server principale.",
      };
    }
    return false;
  }
}

async function checkSlashPermission(interaction?, options: Record<string, any> = {}) {
  const userId = interaction?.user?.id || null;
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const onMainGuild = isMainGuild(guildId);

  try {
    const {
      isUserBotUsageBlacklisted,
      isGuildBotUsageBlacklisted,
    } = require("../../Services/Moderation/botUsageBlacklistService") as typeof import("../../Services/Moderation/botUsageBlacklistService");
    if (userId && (await isUserBotUsageBlacklisted(userId))) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "bot_usage_blacklisted_user",
          requiredRoles: null,
          channels: null,
          message: "<:vegax:1443934876440068179> Non puoi usare questo bot.",
          silent: true,
        };
      }
      return false;
    }
    if (guildId && (await isGuildBotUsageBlacklisted(guildId))) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "bot_usage_blacklisted_guild",
          requiredRoles: null,
          channels: null,
          message: "<:vegax:1443934876440068179> Questo server non può usare il bot.",
          silent: true,
        };
      }
      return false;
    }
  } catch (_) {}

  const tenantPartnershipAccess = await checkTenantPartnershipSlashAccess(interaction, options);
  if (tenantPartnershipAccess !== null) {
    return tenantPartnershipAccess;
  }

  if (guildId && !onMainGuild) {
    const cmd = String(interaction?.commandName || "").toLowerCase();
    const sub = String(interaction.options?.getSubcommand?.(false) || "").toLowerCase();
    const tenantDeleteAllowed = cmd === "delete" && sub === "partnership";
    const tenantDeleteContextAllowed = cmd === "elimina partnership";
    const tenantPointsContextAllowed = cmd === "aggiungi punti" || cmd === "rimuovi punti";
    if (cmd === "giveaway") {
      try {
        const { isTenantFeatureEnabled } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
        if (isTenantFeatureEnabled(guildId, "giveaway")) {
          const member = interaction.member;
          const isOwner = String(interaction.guild?.ownerId || "") === String(interaction.user?.id || "");
          const hasManageGuild = Boolean(
            member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
              member?.permissions?.has?.(PermissionFlagsBits.ManageGuild),
          );
          const allowed = isOwner || hasManageGuild;
          if (options.returnDetails) {
            return {
              allowed,
              reason: allowed ? null : "missing_permission",
              requiredRoles: null,
              channels: null,
              message: allowed
                ? null
                : "<:vegax:1443934876440068179> Ti serve **Gestisci server** (o **Amministratore**) per usare `/giveaway` su questo server.",
            };
          }
          return allowed;
        }
      } catch (err) {
        global.logger?.warn?.("[commandPermissions] tenant giveaway gate:", err?.message || err);
      }
    }
    if (cmd !== "partnership" && !tenantDeleteAllowed && !tenantDeleteContextAllowed && !tenantPointsContextAllowed) {
      const message =
        "<:vegax:1443934876440068179> Su questo server sono disponibili solo i comandi **partnership**.";
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "tenant_partnership_only",
          requiredRoles: null,
          channels: null,
          message,
        };
      }
      return false;
    }
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

function tryResolveMultiGuildOpenMediaBypass(guildId?, commandName?, options?) {
  try {
    const { resolveOpenMediaPrefixBypass } = require("../../MultiGuild/core/openMediaCommands") as typeof import("../../MultiGuild/core/openMediaCommands");
    return resolveOpenMediaPrefixBypass(guildId, commandName, options);
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] MultiGuild open media bypass:", err?.message || err);
    return null;
  }
}

function tryResolveMultiGuildTenantPrefixRestriction(guildId?, commandName?, options?) {
  try {
    const { resolveTenantPrefixRestriction } = require("../../MultiGuild/core/tenantPrefixGate") as typeof import("../../MultiGuild/core/tenantPrefixGate");
    return resolveTenantPrefixRestriction(guildId, commandName, options);
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] MultiGuild tenant prefix gate:", err?.message || err);
    return null;
  }
}

function resolveDashboardCommandAclDenial(message?, commandName?, options: Record<string, any> = {}) {
  try {
    const { resolveTenantCommandAcl } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
    const aclCheck = resolveTenantCommandAcl(message, commandName, options);
    if (aclCheck == null || aclCheck === true) return null;
    if (aclCheck === false) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "tenant_command_acl",
          requiredRoles: null,
          channels: null,
        };
      }
      return false;
    }
    if (typeof aclCheck === "object" && aclCheck.allowed === false) return aclCheck;
    return null;
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] dashboard command ACL:", err?.message || err);
    return null;
  }
}

function peekMainDashboardCommandAcl(guildId?, commandName?) {
  try {
    const { peekDashboardCommandAcl } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
    return peekDashboardCommandAcl(guildId, commandName);
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] peek dashboard ACL:", err?.message || err);
    return null;
  }
}

async function checkPrefixPermission(message?, commandName?, subcommandName = null, options: Record<string, any> = {}) {
  const guildId = message?.guild?.id || null;
  const userId = message?.author?.id || null;
  const safeCommand = String(commandName || "").toLowerCase();
  const onMainGuild = isMainGuild(guildId);

  try {
    const {
      isUserBotUsageBlacklisted,
      isGuildBotUsageBlacklisted,
    } = require("../../Services/Moderation/botUsageBlacklistService") as typeof import("../../Services/Moderation/botUsageBlacklistService");
    if (userId && (await isUserBotUsageBlacklisted(userId))) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "bot_usage_blacklisted_user",
          requiredRoles: null,
          channels: null,
          message: "<:vegax:1443934876440068179> Non puoi usare questo bot.",
          silent: true,
        };
      }
      return false;
    }
    if (guildId && (await isGuildBotUsageBlacklisted(guildId))) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "bot_usage_blacklisted_guild",
          requiredRoles: null,
          channels: null,
          message: "<:vegax:1443934876440068179> Questo server non può usare il bot.",
          silent: true,
        };
      }
      return false;
    }
  } catch (_) {}

  if (safeCommand === "notify") {
    const isDev = getDevIds(message?.client).includes(String(userId || ""));
    const allowed = onMainGuild && isDev;
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : onMainGuild ? "missing_permission" : "main_guild_only",
        requiredRoles: null,
        channels: null,
      };
    }
    return allowed;
  }

  if (safeCommand === "quit") {
    const allowed = getDevIds(message?.client).includes(String(userId || ""));
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

  if (
    guildId &&
    message?.member &&
    (safeCommand === "settings" ||
      (!onMainGuild &&
        (safeCommand === "setup" ||
          (safeCommand === "leave" && String(subcommandName || "").toLowerCase() === "partnership"))))
  ) {
    try {
      const {
        memberCanManageTenantPartnershipSettings,
      } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
      const allowed = memberCanManageTenantPartnershipSettings(message.member, message.guild);
      if (options.returnDetails) {
        return {
          allowed,
          reason: allowed ? null : "missing_permission",
          requiredRoles: null,
          channels: null,
        };
      }
      return allowed;
    } catch (err) {
      global.logger?.warn?.("[commandPermissions] tenant setup/settings gate:", err?.message || err);
    }
  }

  const openMediaBypass: any = tryResolveMultiGuildOpenMediaBypass(guildId, safeCommand, options);
  if (openMediaBypass !== null) {
    if (openMediaBypass.allowed !== false && message?.member) {
      try {
        const { resolveTenantModerationMemberCheck } = require("../../MultiGuild/core/tenantModerationPermissions") as typeof import("../../MultiGuild/core/tenantModerationPermissions");
        const modCheck = resolveTenantModerationMemberCheck(message.member, safeCommand, options);
        if (modCheck !== null) return modCheck;
      } catch (err) {
        global.logger?.warn?.("[commandPermissions] MultiGuild tenant mod check:", err?.message || err);
      }
      try {
        const { resolveTenantCommandAcl } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
        const aclCheck = resolveTenantCommandAcl(message, safeCommand, options);
        if (aclCheck !== null) {
          if (typeof aclCheck === "object") return aclCheck;
          if (aclCheck === false) {
            if (options.returnDetails) {
              return {
                allowed: false,
                reason: "tenant_command_acl",
                requiredRoles: null,
                channels: null,
              };
            }
            return false;
          }
        }
      } catch (err) {
        global.logger?.warn?.("[commandPermissions] MultiGuild tenant command ACL:", err?.message || err);
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
  const dashAcl = peekMainDashboardCommandAcl(guildId, safeCommand);
  const dashRoleWhitelist = Boolean(
    dashAcl && dashAcl.enabled !== false && dashAcl.roleMode === "include" && Array.isArray(dashAcl.roleIds) && dashAcl.roleIds.length,
  );
  const dashChannelWhitelist = Boolean(
    dashAcl && dashAcl.enabled !== false && dashAcl.channelMode === "include" && Array.isArray(dashAcl.channelIds) && dashAcl.channelIds.length,
  );
  const webTicketChannelId = String(message?.channelId || message?.channel?.id || "");
  const isWebTicketPrefixChannel = webTicketChannelId.startsWith("web-ticket-");

  if (isWebTicketPrefixChannel) {
    if (
      WEB_TICKET_PREFIX_HIDDEN_COMMANDS.has(safeCommand) ||
      !WEB_TICKET_PREFIX_ALLOWED_COMMANDS.has(safeCommand)
    ) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "web_ticket_hidden",
          requiredRoles: null,
          channels: null,
        };
      }
      return false;
    }
    const webCat = String(message?.__webTicketCategory || "").toLowerCase();
    const onlyCats = WEB_TICKET_PREFIX_CATEGORY_LIMIT[safeCommand];
    if (onlyCats && !onlyCats.includes(webCat)) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "web_ticket_category",
          requiredRoles: null,
          channels: null,
        };
      }
      return false;
    }
  }

  const webTicketSkipsChannelPolicy =
    isWebTicketPrefixChannel && WEB_TICKET_PREFIX_ALLOWED_COMMANDS.has(safeCommand);

  if (dashAcl && dashAcl.enabled === false) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: "tenant_command_disabled",
        requiredRoles: null,
        channels: null,
      };
    }
    return false;
  }

  if (dashChannelWhitelist && !webTicketSkipsChannelPolicy) {
    if (isWebTicketPrefixChannel) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "tenant_command_channel",
          requiredRoles: null,
          channels: dashAcl.channelIds,
        };
      }
      return false;
    }
    try {
      const { channelPassesChannelAcl } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
      if (!channelPassesChannelAcl(message?.channel, message?.channelId, dashAcl)) {
        if (options.returnDetails) {
          return {
            allowed: false,
            reason: "tenant_command_channel",
            requiredRoles: null,
            channels: dashAcl.channelIds,
          };
        }
        return false;
      }
    } catch (_) {}
  } else if (
    !webTicketSkipsChannelPolicy &&
    Array.isArray(channelPolicy) &&
    channelPolicy.length > 0 &&
    !bypassChannelPolicyForAntiNuke
  ) {
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
      if (!VOICE_STANZA_PREFIX_CHANNEL_BYPASS_COMMANDS.has(safeCommand)) return false;
      if (!ch) return false;
      try {
        const { isAllowedVoiceCommandChannel } = require("../../../shared/voice/voiceCommandChannelAccess") as typeof import("../../../shared/voice/voiceCommandChannelAccess");
        return await isAllowedVoiceCommandChannel(message.guild, ch, {
          blockedChannelIds: [IDs.channels?.riunioneStaff, IDs.channels?.serataFilm].filter(Boolean),
        });
      } catch (_) {
        return false;
      }
    })();
    let allowViaDashboardChannels = false;
    if (!allowed && !allowInPmThread && !allowInTicketChannel && !allowInVoiceOrStanzaChat) {
      try {
        const { dashboardChannelIncludeAllows } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
        allowViaDashboardChannels = dashboardChannelIncludeAllows(message, safeCommand);
      } catch (_) {}
    }
    if (!allowed && !allowInPmThread && !allowInTicketChannel && !allowInVoiceOrStanzaChat && !allowViaDashboardChannels) {
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

  if (dashAcl && dashAcl.channelMode === "exclude" && Array.isArray(dashAcl.channelIds) && dashAcl.channelIds.length && !isWebTicketPrefixChannel) {
    try {
      const { channelPassesChannelAcl } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
      if (!channelPassesChannelAcl(message?.channel, message?.channelId, dashAcl)) {
        if (options.returnDetails) {
          return {
            allowed: false,
            reason: "tenant_command_channel",
            requiredRoles: null,
            channels: dashAcl.channelIds,
          };
        }
        return false;
      }
    } catch (_) {}
  }

  const cmdCfg = data?.prefix?.[safeCommand];
  const roles = resolvePrefixRoles(data, commandName, subcommandName);
  const permissions = resolvePrefixPermissions(data, commandName, subcommandName);

    if (dashRoleWhitelist) {
    if (!message.guild) {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "missing_role",
          requiredRoles: dashAcl.roleIds,
          channels: dashChannelWhitelist ? dashAcl.channelIds : channelPolicy || null,
        };
      }
      return false;
    }
    let roleOk = false;
    try {
      const { memberPassesRoleAcl } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
      roleOk = memberPassesRoleAcl(message.member, dashAcl);
    } catch (_) {
      roleOk = false;
    }
        if (!roleOk && Array.isArray(dashAcl.roleIds) && dashAcl.roleIds.length) {
      roleOk = await hasAnyRoleWithLiveFallback(message, dashAcl.roleIds);
    }
    const hasPermissions = !Array.isArray(permissions) ? true : await hasAllPermissionsWithLiveFallback(message, permissions);
    const allowed = Boolean(roleOk && hasPermissions);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? "dashboard_command_acl" : !roleOk ? "tenant_command_role" : "missing_permission",
        requiredRoles: !roleOk ? dashAcl.roleIds : null,
        channels: dashChannelWhitelist ? dashAcl.channelIds : channelPolicy || null,
      };
    }
    return allowed;
  }

  if (!Array.isArray(roles) && !Array.isArray(permissions)) {
    const aclDenial = resolveDashboardCommandAclDenial(message, safeCommand, options);
    if (aclDenial !== null) return aclDenial;
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
  if (allowed) {
        const aclDenial = resolveDashboardCommandAclDenial(message, safeCommand, options);
    if (aclDenial !== null) return aclDenial;
  }
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

async function checkButtonPermission(interaction?) {
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
    const tenantPartnershipSetupBypass = tryTenantPartnershipSetupBypass(guildId, customId, interaction);
    if (tenantPartnershipSetupBypass) return tenantPartnershipSetupBypass;
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
      requiredRoles: normalizeRoleList(["roles.Admin", "roles.Manager", "roles.Founder"]),
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

  if (guildId && !isMainGuild(guildId)) {
    const id = String(customId);
    const isGiveawayEnter =
      id.startsWith("giveaway_enter:") ||
      id.startsWith("giveaway_leave:") ||
      id.startsWith("giveaway_count:") ||
      id.startsWith("giveaway_morgames_retry:");
    const isGiveawayReroll = id.startsWith("giveaway_reroll:");
    if (isGiveawayEnter || isGiveawayReroll) {
      try {
        const { isTenantFeatureEnabled } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
        if (isTenantFeatureEnabled(guildId, "giveaway")) {
          if (isGiveawayEnter) {
            return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
          }
          const member = interaction.member;
          const isOwner = String(interaction.guild?.ownerId || "") === String(interaction.user?.id || "");
          const hasManageGuild = Boolean(
            member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
              member?.permissions?.has?.(PermissionFlagsBits.ManageGuild),
          );
          const allowed = isOwner || hasManageGuild;
          return {
            allowed,
            reason: allowed ? null : "missing_permission",
            requiredRoles: null,
            ownerId: null,
          };
        }
      } catch (err) {
        global.logger?.warn?.("[commandPermissions] tenant giveaway button gate:", err?.message || err);
      }
    }
  }

  const tenantProfileGate = checkTenantProfilePanelPermission(interaction, customId);
  if (tenantProfileGate) return tenantProfileGate;

  const tenantHelpNavBypass = tryTenantHelpNavComponentBypass(guildId, customId);
  if (tenantHelpNavBypass) return tenantHelpNavBypass;

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
        requiredRoles: asRequiredRoles(policy.roles),
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
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: asRequiredRoles(policy.roles),
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: asRequiredRoles(policy.roles),
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
      requiredRoles: asRequiredRoles(policy.roles),
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: asRequiredRoles(policy.roles),
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
      requiredRoles: asRequiredRoles(policy.roles),
      channels: policy.channels,
      ownerId: null,
    };
  }
  return {
    allowed: true,
    reason: null,
    requiredRoles: asRequiredRoles(policy.roles),
    ownerId: null,
  };
}

async function checkStringSelectPermission(interaction?) {
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
    const tenantPartnershipSetupBypass = tryTenantPartnershipSetupBypass(guildId, customId, interaction);
    if (tenantPartnershipSetupBypass) return tenantPartnershipSetupBypass;
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
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: asRequiredRoles(policy.roles),
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: asRequiredRoles(policy.roles),
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
      requiredRoles: asRequiredRoles(policy.roles),
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: asRequiredRoles(policy.roles),
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
      requiredRoles: asRequiredRoles(policy.roles),
      channels: policy.channels,
      ownerId: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: asRequiredRoles(policy.roles),
    ownerId: null,
  };
}

async function checkModalPermission(interaction?) {
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
    const tenantPartnershipSetupBypass = tryTenantPartnershipSetupBypass(guildId, customId, interaction);
    if (tenantPartnershipSetupBypass) return tenantPartnershipSetupBypass;
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
      requiredRoles: normalizeRoleList(["roles.Admin", "roles.Manager", "roles.Founder"]),
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
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: ownerId || null,
      };
    }
    return {
      allowed: true,
      reason: null,
      requiredRoles: asRequiredRoles(policy.roles),
      ownerId: null,
    };
  }

  if (hasOwnerConstraint && !ownerPass) {
    return {
      allowed: false,
      reason: "not_owner",
      requiredRoles: asRequiredRoles(policy.roles),
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
      requiredRoles: asRequiredRoles(policy.roles),
      ownerId: null,
    };
  }
  if (hasPermissionConstraint && !permissionPass) {
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: asRequiredRoles(policy.roles),
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
      requiredRoles: asRequiredRoles(policy.roles),
      channels: policy.channels,
      ownerId: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: asRequiredRoles(policy.roles),
    ownerId: null,
  };
}

function getSlashRequiredRoles(interaction?) {
  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  return resolveSlashRoles(data, interaction.commandName, group, sub);
}

function getPrefixRequiredRoles(commandName?, subcommandName = null) {
  const data = loadPermissions();
  return resolvePrefixRoles(data, commandName, subcommandName);
}

function isPrefixCommandAllowedInWebTicket({
  member,
  userId,
  commandName,
  ticketCategory,
  client,
  guildId,
}: any = {}) {
  const safeCommand = String(commandName || "")
    .trim()
    .toLowerCase();
  if (!safeCommand) return false;
  if (WEB_TICKET_PREFIX_HIDDEN_COMMANDS.has(safeCommand)) return false;
  if (!WEB_TICKET_PREFIX_ALLOWED_COMMANDS.has(safeCommand)) return false;

  const isDev = getDevIds(client).includes(String(userId || ""));
  if ((safeCommand === "notify" || safeCommand === "quit") && !isDev) return false;

  const onlyCats = WEB_TICKET_PREFIX_CATEGORY_LIMIT[safeCommand];
  if (onlyCats) {
    const cat = String(ticketCategory || "").toLowerCase();
    if (!onlyCats.includes(cat)) return false;
  }

  const gid = String(guildId || "").trim();
  const dashAcl = gid ? peekMainDashboardCommandAcl(gid, safeCommand) : null;
  if (dashAcl && dashAcl.enabled === false) return false;

  const data = loadPermissions();
  const roles = resolvePrefixRoles(data, safeCommand);
  if (Array.isArray(roles) && roles.length && !hasAnyRole(member, roles)) return false;

  return true;
}

function isSlashCommandAllowedInWebTicket({
  member,
  userId,
  commandName,
  ticketCategory,
  client,
  guildId,
}: any = {}) {
  const safeCommand = String(commandName || "")
    .trim()
    .toLowerCase();
  if (!safeCommand) return false;
  if (WEB_TICKET_SLASH_HIDDEN_COMMANDS.has(safeCommand)) return false;
  if (!WEB_TICKET_SLASH_ALLOWED_COMMANDS.has(safeCommand)) return false;

  const isDev = getDevIds(client).includes(String(userId || ""));
  if (safeCommand === "say" && !isDev) return false;

  const onlyCats = WEB_TICKET_SLASH_CATEGORY_LIMIT[safeCommand];
  if (onlyCats) {
    const cat = String(ticketCategory || "").toLowerCase();
    if (!onlyCats.includes(cat)) return false;
  }

  const gid = String(guildId || "").trim();
  const dashAcl = gid ? peekMainDashboardCommandAcl(gid, `s:1:${safeCommand}`) : null;
  if (dashAcl && dashAcl.enabled === false) return false;

  const data = loadPermissions();
  const roles = resolveSlashRoles(data, safeCommand);
  if (Array.isArray(roles) && roles.length && !hasAnyRole(member, roles)) return false;
  const permissionFlags = resolveSlashPermissions(data, safeCommand);
  if (Array.isArray(permissionFlags) && permissionFlags.length && !hasAllPermissions(member, permissionFlags)) {
    return false;
  }

  return true;
}

function buildGlobalPermissionDeniedEmbed(requiredRoleIds = [], entityLabel = "comando", customDescription = null, guild = null) {
  const roles = normalizeRoleList(Array.isArray(requiredRoleIds) ? requiredRoleIds : []);
  void guild;
  const rolesText = roles.length
    ? roles.map((id?) => `<@&${id}>`).join(", ")
    : "<:VC_Attention:1482534443632558151> Nessun ruolo configurato.";
  const description =
    customDescription != null
      ? customDescription
      : `<:VC_Lock:1482526739044368476> Questo ${entityLabel} è riservato ad una categoria di utenti specifici.`;

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

function buildGlobalChannelDeniedEmbed(allowedChannelIds = [], entityLabel = "comando", viewer = null) {
  const { formatVisibleChannelMentionsList, memberCanViewChannel } = require("../Discord/visibleChannelMentions") as typeof import("../Discord/visibleChannelMentions");
  const { staffCmdsChannelId } = require("../Staff/staffCmdsChannelUtils") as typeof import("../Staff/staffCmdsChannelUtils");
  const rawIds = Array.isArray(allowedChannelIds) ? allowedChannelIds : [];
  const channelsText = formatVisibleChannelMentionsList(rawIds, viewer, {
    sep: ", ",
    emptyFallback: "",
  });
  const hasVisibleChannels = Boolean(channelsText);
  const staffCmdsId = staffCmdsChannelId();
  const canSeeStaffCmds = Boolean(staffCmdsId && memberCanViewChannel(viewer, staffCmdsId));
  const hasHighStaffZone = rawIds.some((id?) => String(id) === HIGH_STAFF_COMMANDS_ZONE_TOKEN);
  const hasPmZone = rawIds.some((id?) => String(id) === PM_COMMANDS_THREAD_ZONE_TOKEN);
  const hasNumericChannels = rawIds.some((id?) => /^\d{5,30}$/.test(String(id || "").trim()));

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> **Non hai i permessi**")
    .setDescription(`<:VC_Lock:1482526739044368476> Questo ${entityLabel} è disponibile solo in canali specifici.`);
  if (hasVisibleChannels) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `<a:VC_Arrow:1482706699365257397> Usa il comando in uno dei seguenti canali: ${channelsText}`,
    });
  } else if (hasHighStaffZone && canSeeStaffCmds) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando nel thread **Comandi High Staff** sotto #staff-cmds.",
    });
  } else if (hasPmZone && canSeeStaffCmds) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando nel thread **Comandi Partner Manager** sotto #staff-cmds.",
    });
  } else if (hasNumericChannels || hasHighStaffZone || hasPmZone) {
        embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando in un canale consentito a cui hai accesso.",
    });
  } else {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<:VC_Attention:1482534443632558151> Nessun canale configurato.",
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

function buildPrefixAclFromPermissionsJson(commandName?) {
  const cmd = String(commandName || "")
    .trim()
    .toLowerCase()
    .replace(/^\+/, "");
  if (!cmd) return null;
  const data = loadPermissions();
  const rolesRaw = resolvePrefixRoles(data, cmd);
  const channelsRaw =
    resolvePrefixCommandChannels(data, cmd) ??
    resolveCommandChannelPolicy(data, buildPrefixLookupKeys(cmd, null));
  const roleIds = Array.isArray(rolesRaw)
    ? [...new Set(rolesRaw.map((id?) => String(id || "").trim()).filter((id?) => /^\d{16,22}$/.test(id)))]
    : [];
  const channelIds = Array.isArray(channelsRaw)
    ? [
        ...new Set(
          channelsRaw
            .map((id?) => String(id || "").trim())
            .filter((id?) => /^\d{16,22}$/.test(id)),
        ),
      ]
    : [];
  if (!roleIds.length && !channelIds.length) return null;
  return {
    enabled: true,
    roleMode: roleIds.length ? "include" : null,
    roleIds,
    channelMode: channelIds.length ? "include" : null,
    channelIds,
  };
}

export = {
  checkSlashPermission,
  checkPrefixPermission,
  checkButtonPermission,
  checkStringSelectPermission,
  checkModalPermission,
  getSlashRequiredRoles,
  getPrefixRequiredRoles,
  isPrefixCommandAllowedInWebTicket,
  isSlashCommandAllowedInWebTicket,
  buildPrefixAclFromPermissionsJson,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
  buildGlobalNotYourControlEmbed,
  hasAnyRole,
  getDevIds,
  resolveRoleReference,
  normalizeRoleList,
  __test: {
    channelMatchesPolicyChannelList,
    normalizeChannelList,
    expandResolvedChannelReference,
    HIGH_STAFF_COMMANDS_ZONE_TOKEN,
    PM_COMMANDS_THREAD_ZONE_TOKEN,
  },
};