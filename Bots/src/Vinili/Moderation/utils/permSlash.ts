/** Permessi: comandi slash. */
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { getStaffCmdsThreadIdsCache, ensureStaffCmdsThreadIdsHydrated, isHighStaffCommandsThread, isStaffCmdsPmCommandsThreadSync } = require("../../Staff/utils/staffCmdsChannelUtils") as typeof import("../../Staff/utils/staffCmdsChannelUtils");
const { buildSlashLookupKeys } = require("./temporaryCommandPermissions") as typeof import("./temporaryCommandPermissions");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { STAFF_LADDER_KEYS_HIGH_TO_LOW } = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");
const { EMPTY_PERMISSIONS, LIVE_MEMBER_CACHE_TTL_MS, liveMemberCache, getIdsConfig, normalizeRoleList, resolveLiveMemberGuildUser, hasAnyRoleWithEventGrants } = require("./permStaffGuide") as typeof import("./permStaffGuide");
const { isMainGuild, checkTenantPartnershipSlashAccess } = require("./permTenantBypass") as typeof import("./permTenantBypass");
const { HIGH_STAFF_COMMANDS_ZONE_TOKEN, PM_COMMANDS_THREAD_ZONE_TOKEN, parseChannelReferenceKey, resolveChannelReference } = require("./permReferences") as typeof import("./permReferences");
const { hasAllPermissions } = require("./permMemberChecks") as typeof import("./permMemberChecks");
const { resolveSlashRoles, resolveSlashPermissions } = require("./permWebTicket") as typeof import("./permWebTicket");
const path = require("path") as typeof import("path");
const { createPermissionsStore } = require("../../../shared/moderation/createPermissionsStore") as typeof import("../../../shared/moderation/createPermissionsStore");
const { loadPermissions } = createPermissionsStore({
  ids: IDs,
  normalizeRoles: false,
  cacheTtlMs: 3000,
  permissionsCandidates: [
    path.resolve(__dirname, "../../permissions.json"),
    path.join(process.cwd(), "permissions.json"),
  ],
  transformParsed: (parsed?) => {
    try {
      require("../../Config/emergencyRoleIdRemap").remapDeepRoleIdsInPlace(parsed);
    } catch (_) {}
  },
});

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
    const { memberHasAnyRemappedRole } = require("../../Config/emergencyRoleIdRemap") as typeof import("../../Config/emergencyRoleIdRemap");
    if (memberHasAnyRemappedRole(member, normalized)) return true;
  } catch {
  }
  const memberRoleIds = collectMemberRoleIds(member);
  return normalized.some((roleId?) => memberRoleIds.has(String(roleId)));
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

async function checkSlashPermission(interaction?, options: Record<string, any> = {}) {
  const userId = interaction?.user?.id || null;
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const onMainGuild = isMainGuild(guildId);

  try {
    const {
      isUserBotUsageBlacklisted,
      isGuildBotUsageBlacklisted,
    } = require("../services/botUsageBlacklistService") as typeof import("../services/botUsageBlacklistService");
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
    if (cmd === "giveaway") {
      try {
        const { isTenantFeatureEnabled } = require("../../../MultiGuild/core/accessPolicy") as typeof import("../../../MultiGuild/core/accessPolicy");
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
    if (cmd !== "partnership" && !tenantDeleteAllowed) {
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

export = { loadPermissions, expandResolvedChannelReference, normalizeChannelList, channelMatchesPolicyChannelList, resolveCommandChannelPolicy, hasAnyRole, fetchLiveMember, hasAnyRoleWithLiveFallback, hasAllPermissionsWithLiveFallback, checkSlashPermission };
