/** Permessi: pulsanti. */
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { ensureStaffCmdsThreadIdsHydrated } = require("../Staff/staffCmdsChannelUtils") as typeof import("../Staff/staffCmdsChannelUtils");
const { STAFF_GUIDE_BUTTON_IDS, getStaffGuideAccessRoleIds, isPartnerManagerOnlyMember, resolveRoleReference, normalizeRoleList } = require("./permStaffGuide") as typeof import("./permStaffGuide");
const { isAllowedGuildForComponents, tryTenantHelpNavComponentBypass, tryTenantUtilityComponentBypass, tryTenantPartnershipSetupBypass, isMainGuild } = require("./permTenantBypass") as typeof import("./permTenantBypass");
const { CANDIDATURE_BLACKLIST_ROLE_ID, isTicketInteraction, isProfilePanelInteraction, checkTenantProfilePanelPermission, checkProfilePanelControlPermission, isCustomRoleSystemInteraction, isApplyOrCandidatureInteraction, getPendingCustomRoleGrant, extractOwnerIdFromMessageMention } = require("./permInteractionKinds") as typeof import("./permInteractionKinds");
const { asRequiredRoles, resolvePermissionReference, normalizePermissionList } = require("./permReferences") as typeof import("./permReferences");
const { loadPermissions, normalizeChannelList, channelMatchesPolicyChannelList, hasAnyRoleWithLiveFallback, hasAllPermissionsWithLiveFallback } = require("./permSlash") as typeof import("./permSlash");

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

async function isBlockedFromCandidaturesByRole(interaction?, customId?) {
  if (!isApplyOrCandidatureInteraction(customId)) return false;
  if (!CANDIDATURE_BLACKLIST_ROLE_ID) return false;
  if (!interaction?.inGuild?.()) return false;
  return hasAnyRoleWithLiveFallback(interaction, [CANDIDATURE_BLACKLIST_ROLE_ID]);
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

  if (!customId) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }

  if (guildId && !isMainGuild(guildId)) {
    const id = String(customId);
    const isGiveawayEnter =
      id.startsWith("giveaway_enter:") ||
      id.startsWith("giveaway_leave:") ||
      id.startsWith("giveaway_count:");
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

export = { isBlockedFromCandidaturesByRole, resolveComponentPolicy, normalizeButtonPolicy, checkButtonPermission };
