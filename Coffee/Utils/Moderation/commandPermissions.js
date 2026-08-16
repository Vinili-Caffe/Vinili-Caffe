const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const IDs = require("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/entityCache");
const { loadPermissions } = require("./permissionsStore");
const TEST_MAIN_GUILD_ID = IDs?.guilds?.test || null;
const OFFICIAL_MAIN_GUILD_ID = IDs?.guilds?.main || null;
const TEST_SCOPE_GUILD_IDS = new Set(
  [TEST_MAIN_GUILD_ID, OFFICIAL_MAIN_GUILD_ID].filter(Boolean).map(String),
);

function isTestMainScopeGuild(guildId) {
  return guildId != null && TEST_SCOPE_GUILD_IDS.has(String(guildId));
}

function isOfficialMainGuild(guildId) {
  return OFFICIAL_MAIN_GUILD_ID != null && String(guildId || "") === String(OFFICIAL_MAIN_GUILD_ID);
}

function isExternalGuild(guildId) {
  return guildId != null && !isTestMainScopeGuild(guildId);
}

function resolveRoleReference(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
  else if (key.startsWith("roles.")) key = key.slice("roles.".length);

  const resolved = IDs?.roles?.[key];
  return resolved ? String(resolved) : null;
}

function normalizeRoleList(roleIds) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds.map((value) => resolveRoleReference(value)).filter(Boolean);
}

function asRequiredRoles(roles) {
  if (roles == null) return null;
  const list = normalizeRoleList(Array.isArray(roles) ? roles : [roles]);
  return Array.isArray(list) && list.length ? list : null;
}

function resolveChannelReference(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith("ids.channels.")) key = key.slice("ids.channels.".length);
  else if (key.startsWith("channels.")) key = key.slice("channels.".length);

  const resolved = IDs?.channels?.[key];
  return resolved ? String(resolved) : null;
}

function normalizeChannelList(channelIds) {
  if (!Array.isArray(channelIds)) return channelIds;
  return channelIds
    .map((value) => resolveChannelReference(value))
    .filter(Boolean);
}

function channelMatchesPolicyChannelList(channel, policyIds) {
  const ids = (Array.isArray(policyIds) ? policyIds : []).map(String).filter(Boolean);
  if (!ids.length) return false;
  const ch = channel;
  if (!ch?.id) return false;
  if (ids.includes(String(ch.id))) return true;
  if (typeof ch.isThread === "function" && ch.isThread()) {
    const parent = String(ch.parentId || "");
    return Boolean(parent && ids.includes(parent));
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
  if (
    subcommandName &&
    subcommands[subcommandName] &&
    typeof subcommands[subcommandName] === "object" &&
    Array.isArray(subcommands[subcommandName].channels)
  ) {
    return normalizeChannelList(subcommands[subcommandName].channels);
  }
  if (Array.isArray(cmd.channels)) return normalizeChannelList(cmd.channels);
  return null;
}

function buildSlashLookupKeys(commandName, groupName, subcommandName) {
  const command = String(commandName || "").trim().toLowerCase();
  const group = String(groupName || "").trim().toLowerCase();
  const sub = String(subcommandName || "").trim().toLowerCase();
  const out = [];
  if (!command) return out;
  if (group && sub) {
    out.push(`${command}.${group}.${sub}`);
    out.push(`${command}.${group}_${sub}`);
    out.push(`${command}.${group}-${sub}`);
  }
  if (sub) out.push(`${command}.${sub}`);
  out.push(command);
  return out;
}

function buildPrefixLookupKeys(commandName, subcommandName) {
  const command = String(commandName || "").trim().toLowerCase();
  const sub = String(subcommandName || "").trim().toLowerCase();
  const out = [];
  if (!command) return out;
  if (sub) out.push(`${command}.${sub}`);
  out.push(command);
  return out;
}

function collectMemberRoleIds(member) {
  if (!member) return new Set();
  const ids = new Set();

  if (member?.roles?.cache && typeof member.roles.cache.forEach === "function") {
    member.roles.cache.forEach((_, roleId) => ids.add(String(roleId)));
  }
  if (Array.isArray(member?.roles)) {
    for (const roleId of member.roles) {
      if (roleId) ids.add(String(roleId));
    }
  }
  if (Array.isArray(member?._roles)) {
    for (const roleId of member._roles) {
      if (roleId) ids.add(String(roleId));
    }
  }

  return ids;
}

function hasAnyRole(member, roleIds) {
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized)) return true;
  if (normalized.length === 0) return false;
  const memberRoleIds = collectMemberRoleIds(member);
  if (!memberRoleIds.size) return false;
  return normalized.some((roleId) => memberRoleIds.has(String(roleId)));
}

async function fetchLiveMember(entity) {
  const guild = entity?.guild || entity?.member?.guild || null;
  const userId = entity ?. user ?. id || entity ?. author ?. id || entity ?. member ?. id || entity ?. member ?. user ?. id || null;
  if (!guild || !userId || typeof guild.members?.fetch !== "function") return null;
  return getGuildMemberCached(guild, userId, {
    ttlMs: 15_000,
    preferFresh: true,
  });
}

async function hasAnyRoleWithLiveFallback(entity, roleIds) {
  if (hasAnyRole(entity?.member, roleIds)) return true;
  const freshMember = await fetchLiveMember(entity);
  if (!freshMember) return false;
  return hasAnyRole(freshMember, roleIds);
}

async function hasAdminPermissionWithFallback(entity) {
  const member = entity?.member;
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const freshMember = await fetchLiveMember(entity);
  return Boolean(
    freshMember?.permissions?.has?.(PermissionFlagsBits.Administrator),
  );
}

function resolveSlashRoles(data, commandName, groupName, subcommandName) {
  const cmd = data?.slash?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    if (Array.isArray(subcommands[key])) return normalizeRoleList(subcommands[key]);
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

function resolveComponentPolicy(map, customId) {
  if (!map || typeof map !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(map, customId)) return map[customId];

  const wildcardKeys = Object.keys(map).filter((key)=>key.endsWith("*")).sort((a,b)=>b.length - a.length);

  for (const key of wildcardKeys) {
    const prefix = key.slice(0, -1);
    if (customId.startsWith(prefix)) return map[key];
  }
  return null;
}

function normalizeComponentPolicy(policy) {
  if (policy == null) return null;

  if (typeof policy === "string") {
    const resolved = resolveRoleReference(policy);
    return { roles: resolved ? [resolved] : [] };
  }

  if (Array.isArray(policy)) return { roles: normalizeRoleList(policy) };

  if (typeof policy === "object") {
    let roles = null;
    if (Array.isArray(policy.roles)) roles = normalizeRoleList(policy.roles);
    else if (typeof policy.roles === "string") {
      const resolved = resolveRoleReference(policy.roles);
      roles = resolved ? [resolved] : [];
    }

    const ownerSegment = Number.isFinite(Number.parseInt(policy.ownerSegment,10))? Number.parseInt(policy.ownerSegment,10):null;

    return {
      roles,
      ownerSegment,
      ownerSeparator:
        typeof policy.ownerSeparator === "string" && policy.ownerSeparator
          ? policy.ownerSeparator
          : ":",
      ownerFromMessageMention: Boolean(policy.ownerFromMessageMention),
    };
  }

  return null;
}

function extractOwnerIdFromMessageMention(message) {
  if (!message) return null;
  const scan = (text) => String(text || "").match(/<@!?(\d{16,20})>/)?.[1] || null;

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

async function checkSlashPermission(interaction) {
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

async function checkPrefixPermission(message, commandName, subcommandName = null, options = {}) {
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
        const { isAllowedVoiceCommandChannel } = require("../../../shared/voice/voiceCommandChannelAccess");
        return await isAllowedVoiceCommandChannel(message.guild, ch, {
          blockedChannelIds: [
            IDs.channels?.riunioneStaff || "1443958044802420798",
            IDs.channels?.serataFilm || "1497535199813042306",
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

function evaluateComponentPolicy(interaction, policy) {
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

async function checkButtonPermission(interaction) {
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

  if (customId.startsWith("stanza_")) {
    const { isStanzaButtonActorAllowed } = require("../../Services/Voice/stanzaVoiceRoomsService");
    const stanzaOk = await isStanzaButtonActorAllowed(interaction);
    if (!stanzaOk) {
      return {
        allowed: false,
        reason: "stanza_actor",
        requiredRoles: asRequiredRoles(policy?.roles),
        ownerId: null,
      };
    }
  }

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

async function checkStringSelectPermission(interaction) {
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

async function checkModalPermission(interaction) {
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
  let roles = normalizeRoleList(Array.isArray(requiredRoleIds) ? requiredRoleIds : []);
  if (guild?.roles?.cache) {
    roles = roles.filter((id) => guild.roles.cache.has(String(id)));
  }
  const rolesText = roles.length
    ? roles.map((id) => `<@&${id}>`).join(", ")
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
  const { formatVisibleChannelMentionsList } = require("../../../shared/discord/visibleChannelMentions");
  const rawIds = Array.isArray(allowedChannelIds) ? allowedChannelIds : [];
  const channelsText = formatVisibleChannelMentionsList(rawIds, viewer, {
    sep: ", ",
    emptyFallback: "",
  });
  const hasVisibleChannels = Boolean(channelsText);

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> **Non hai i permessi**")
    .setDescription(`<:VC_Lock:1482526739044368476> Questo ${entityLabel} è disponibile solo in canali specifici.`);
  if (hasVisibleChannels) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `<a:VC_Arrow:1482706699365257397> Usa il comando in uno dei seguenti canali: ${channelsText}`,
    });
  } else if (rawIds.some((id) => /^\d{5,30}$/.test(String(id || "").trim()))) {
    embed.addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: "<a:VC_Arrow:1482706699365257397> Usa il comando in un canale consentito (quelli a cui hai accesso).",
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

module.exports = { checkSlashPermission, checkPrefixPermission, checkButtonPermission, checkStringSelectPermission, checkModalPermission, getSlashRequiredRoles, getPrefixRequiredRoles, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed, hasAnyRole, resolveRoleReference, normalizeRoleList };