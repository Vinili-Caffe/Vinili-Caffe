const path = require("path") as typeof import("path");
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { createPermissionsStore } = require("../../../shared/moderation/createPermissionsStore") as typeof import("../../../shared/moderation/createPermissionsStore");
const { createPermissionPolicyHelpers } = require("../../../shared/moderation/permissionPolicyHelpers") as typeof import("../../../shared/moderation/permissionPolicyHelpers");
const { createPermissionDeniedEmbeds } = require("../../../shared/moderation/createPermissionDeniedEmbeds") as typeof import("../../../shared/moderation/createPermissionDeniedEmbeds");
const { loadPermissions } = createPermissionsStore({
  ids: IDs,
  permissionsCandidates: [
    path.resolve(__dirname, "../../permissions.json"),
    path.join(process.cwd(), "permissions.json"),
  ],
});
const {
  resolveRoleReference,
  normalizeRoleList,
  asRequiredRoles,
  normalizeChannelList,
  channelMatchesPolicyChannelList,
  resolveCommandChannelPolicy,
  resolvePrefixCommandChannels,
  buildSlashLookupKeys,
  buildPrefixLookupKeys,
  hasAnyRole,
  resolveSlashRoles,
  resolvePrefixRoles,
  resolveComponentPolicy,
  normalizeComponentPolicy,
} = createPermissionPolicyHelpers({ ids: IDs });
const {
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
  buildGlobalNotYourControlEmbed,
} = createPermissionDeniedEmbeds({
  color: "#6f4e37",
  normalizeRoleList,
  filterRolesByGuildCache: true,
});
const TEST_MAIN_GUILD_ID = IDs?.guilds?.test || null;
const OFFICIAL_MAIN_GUILD_ID = IDs?.guilds?.main || null;
const TEST_SCOPE_GUILD_IDS = new Set(
  [TEST_MAIN_GUILD_ID, OFFICIAL_MAIN_GUILD_ID].filter(Boolean).map(String),
);

function isTestMainScopeGuild(guildId?) {
  return guildId != null && TEST_SCOPE_GUILD_IDS.has(String(guildId));
}

function isOfficialMainGuild(guildId?) {
  return OFFICIAL_MAIN_GUILD_ID != null && String(guildId || "") === String(OFFICIAL_MAIN_GUILD_ID);
}

function isExternalGuild(guildId?) {
  return guildId != null && !isTestMainScopeGuild(guildId);
}


async function fetchLiveMember(entity?) {
  const guild = entity?.guild || entity?.member?.guild || null;
  const userId = entity?.user?.id || entity?.author?.id || entity?.member?.id || entity?.member?.user?.id || null;
  if (!guild || !userId || typeof guild.members?.fetch !== "function") return null;
  return getGuildMemberCached(guild, userId, {
    ttlMs: 15_000,
    preferFresh: true,
  });
}

async function hasAnyRoleWithLiveFallback(entity?, roleIds?) {
  if (hasAnyRole(entity?.member, roleIds)) return true;
  const freshMember = await fetchLiveMember(entity);
  if (!freshMember) return false;
  return hasAnyRole(freshMember, roleIds);
}

async function hasAdminPermissionWithFallback(entity?) {
  const member = entity?.member;
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const freshMember = await fetchLiveMember(entity);
  return Boolean(
    freshMember?.permissions?.has?.(PermissionFlagsBits.Administrator),
  );
}

function extractOwnerIdFromMessageMention(message?) {
  if (!message) return null;
  const scan = (text?) => String(text || "").match(/<@!?(\d{16,20})>/)?.[1] || null;

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

async function checkSlashPermission(interaction?) {
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const userId = interaction?.user?.id || null;
  if (!guildId) return false;

  if (isExternalGuild(guildId)) {
    return true;
  }

  if (
    String(guildId) === String(TEST_MAIN_GUILD_ID || "") ||
    isOfficialMainGuild(guildId)
  ) {
    return hasAdminPermissionWithFallback(interaction);
  }

  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  const channelPolicy = resolveCommandChannelPolicy(data,buildSlashLookupKeys(interaction.commandName,group,sub),);
  if (isOfficialMainGuild(guildId) && Array.isArray(channelPolicy) && channelPolicy.length > 0) {
    const channelId = interaction?.channelId || interaction?.channel?.id || null;
    if (!channelId || !channelPolicy.includes(String(channelId))) return false;
  }
  const roles = resolveSlashRoles(data, interaction.commandName, group, sub);
  if (!Array.isArray(roles)) return true;
  if (!interaction.inGuild?.()) return false;
  return hasAnyRoleWithLiveFallback(interaction, roles);
}

async function checkPrefixPermission(message?, commandName?, subcommandName = null, options: Record<string, any> = {}) {
  const returnDetails = Boolean(options && typeof options === "object" && options.returnDetails);
  const guildId = message?.guild?.id || null;
  if (!guildId) {
    return returnDetails
      ? { allowed: false, reason: "missing_guild", requiredRoles: null, channels: null }
      : false;
  }

  if (isExternalGuild(guildId)) {
    return returnDetails
      ? { allowed: true, reason: null, requiredRoles: null, channels: null }
      : true;
  }

  const data = loadPermissions();
  const safeCommand = String(commandName || "").toLowerCase();
  const channelPolicy =
    resolvePrefixCommandChannels(data, safeCommand, subcommandName) ??
    resolveCommandChannelPolicy(data, buildPrefixLookupKeys(commandName, subcommandName));
  if (Array.isArray(channelPolicy) && channelPolicy.length > 0) {
    const ch = message?.channel;
    const allowed = ch
      ? channelMatchesPolicyChannelList(ch, channelPolicy)
      : Boolean(message?.channelId) && channelPolicy.includes(String(message.channelId));
    const allowInVoiceOrStanzaChat = await (async () => {
      if (allowed) return false;
      if (!ch) return false;
      try {
        const { isAllowedVoiceCommandChannel } = require("../../../shared/voice/voiceCommandChannelAccess") as typeof import("../../../shared/voice/voiceCommandChannelAccess");
        return await isAllowedVoiceCommandChannel(message.guild, ch, {
          blockedChannelIds: [
            (IDs.channels as any)?.riunioneStaff || "1443958044802420798",
            (IDs.channels as any)?.serataFilm || "1497535199813042306",
          ],
        });
      } catch (_) {
        return false;
      }
    })();
    if (!allowed && !allowInVoiceOrStanzaChat) {
      return returnDetails
        ? { allowed: false, reason: "channel", requiredRoles: null, channels: channelPolicy }
        : false;
    }
  }
  const roles = resolvePrefixRoles(data, commandName, subcommandName);
  if (!Array.isArray(roles)) {
    return returnDetails
      ? { allowed: true, reason: null, requiredRoles: null, channels: null }
      : true;
  }
  if (!message.guild) {
    return returnDetails
      ? { allowed: false, reason: "missing_guild", requiredRoles: roles, channels: null }
      : false;
  }
  const ok = await hasAnyRoleWithLiveFallback(message, roles);
  if (returnDetails) {
    return ok
      ? { allowed: true, reason: null, requiredRoles: null, channels: null }
      : { allowed: false, reason: "missing_role", requiredRoles: roles, channels: null };
  }
  return ok;
}

function evaluateComponentPolicy(interaction?, policy?) {
  if (!policy) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  if (Number.isInteger(policy.ownerSegment) && policy.ownerSegment >= 0) {
    const ownerId = String(interaction ?. customId || "").split(policy.ownerSeparator || ":")[policy.ownerSegment]|| null;
    if (ownerId && interaction?.user?.id && interaction.user.id !== ownerId) {
      return {
        allowed: false,
        reason: "not_owner",
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId,
      };
    }
  }

  if (policy.ownerFromMessageMention) {
    const ownerId = extractOwnerIdFromMessageMention(interaction?.message);
    if (!ownerId || (interaction?.user?.id && interaction.user.id !== ownerId)) {
      return {
        allowed: false,
        reason: "not_owner",
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: ownerId || null,
      };
    }
  }

  return null;
}

async function checkButtonPermission(interaction?) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const data = loadPermissions();
  const rawPolicy = resolveComponentPolicy(data?.buttons, customId);

  if (isExternalGuild(guildId)) {
    return {
      allowed: true,
      reason: null,
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (guildId && isOfficialMainGuild(guildId)) {
    if (!rawPolicy) {
      return {
        allowed: false,
        reason: "mono_guild",
        requiredRoles: null,
        ownerId: null,
      };
    }
  } else if (guildId && !isTestMainScopeGuild(guildId)) {
    const member = interaction?.member || (await fetchLiveMember(interaction));
    const allowed = Boolean(member ?. permissions ?. has ?.(PermissionFlagsBits.Administrator),);
    if (allowed) {
      return {
        allowed: true,
        reason: null,
        requiredRoles: null,
        ownerId: null,
      };
    }
    return {
      allowed: false,
      reason: "missing_permission",
      requiredRoles: null,
      ownerId: null,
    };
  }

  const policy = normalizeComponentPolicy(rawPolicy);
  const precheck = evaluateComponentPolicy(interaction, policy);
  if (precheck) return precheck;

  if (Array.isArray(policy?.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: null,
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: null,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: asRequiredRoles(policy?.roles),
    ownerId: null,
  };
}

async function checkStringSelectPermission(interaction?) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const data = loadPermissions();
  const rawPolicy =
    resolveComponentPolicy(data?.selectMenus, customId) || resolveComponentPolicy(data?.buttons, customId);

  if (isExternalGuild(guildId)) {
    return {
      allowed: true,
      reason: null,
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (guildId && isOfficialMainGuild(guildId)) {
    if (!rawPolicy) {
      return {
        allowed: false,
        reason: "mono_guild",
        requiredRoles: null,
        ownerId: null,
      };
    }
  } else if (guildId && !isTestMainScopeGuild(guildId)) {
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }

  const policy = normalizeComponentPolicy(rawPolicy);
  const precheck = evaluateComponentPolicy(interaction, policy);
  if (precheck) return precheck;

  if (Array.isArray(policy?.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: null,
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: null,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: asRequiredRoles(policy?.roles),
    ownerId: null,
  };
}

async function checkModalPermission(interaction?) {
  const customId = String(interaction?.customId || "");
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const data = loadPermissions();
  const rawPolicy =
    resolveComponentPolicy(data?.modals, customId) || resolveComponentPolicy(data?.buttons, customId);

  if (isExternalGuild(guildId)) {
    return {
      allowed: true,
      reason: null,
      requiredRoles: null,
      ownerId: null,
    };
  }

  if (guildId && isOfficialMainGuild(guildId)) {
    if (!rawPolicy) {
      return {
        allowed: false,
        reason: "mono_guild",
        requiredRoles: null,
        ownerId: null,
      };
    }
  } else if (guildId && !isTestMainScopeGuild(guildId)) {
    return {
      allowed: false,
      reason: "mono_guild",
      requiredRoles: null,
      ownerId: null,
    };
  }

  const policy = normalizeComponentPolicy(rawPolicy);
  const precheck = evaluateComponentPolicy(interaction, policy);
  if (precheck) return precheck;

  if (Array.isArray(policy?.roles)) {
    if (!interaction?.inGuild?.()) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: null,
      };
    }
    if (!(await hasAnyRoleWithLiveFallback(interaction, policy.roles))) {
      return {
        allowed: false,
        reason: "missing_role",
        requiredRoles: asRequiredRoles(policy.roles),
        ownerId: null,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    requiredRoles: asRequiredRoles(policy?.roles),
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

export = { loadPermissions, checkSlashPermission, checkPrefixPermission, checkButtonPermission, checkStringSelectPermission, checkModalPermission, getSlashRequiredRoles, getPrefixRequiredRoles, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed, hasAnyRole, resolveRoleReference, normalizeRoleList };