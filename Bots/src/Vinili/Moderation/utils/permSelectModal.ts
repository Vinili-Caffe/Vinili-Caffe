/** Permessi: menu a tendina e moduli. */
const { ensureStaffCmdsThreadIdsHydrated } = require("../../Staff/utils/staffCmdsChannelUtils") as typeof import("../../Staff/utils/staffCmdsChannelUtils");
const { isAllowedGuildForComponents, tryTenantUtilityComponentBypass, tryTenantPartnershipSetupBypass, isMainGuild } = require("./permTenantBypass") as typeof import("./permTenantBypass");
const { isTicketInteraction, isProfilePanelInteraction, checkProfilePanelControlPermission, isCustomRoleSystemInteraction, isApplyOrCandidatureInteraction, extractOwnerIdFromMessageMention } = require("./permInteractionKinds") as typeof import("./permInteractionKinds");
const { asRequiredRoles } = require("./permReferences") as typeof import("./permReferences");
const { loadPermissions, channelMatchesPolicyChannelList, hasAnyRoleWithLiveFallback, hasAllPermissionsWithLiveFallback } = require("./permSlash") as typeof import("./permSlash");
const { isBlockedFromCandidaturesByRole, resolveComponentPolicy, normalizeButtonPolicy } = require("./permButton") as typeof import("./permButton");

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

export = { checkStringSelectPermission, checkModalPermission };
