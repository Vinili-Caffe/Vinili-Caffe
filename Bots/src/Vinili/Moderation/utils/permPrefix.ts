/** Permessi: comandi con il prefisso. */
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { isPartnerPmDailyCommandsThread } = require("../../Partner/runtime/partnersChatChannelUtils") as typeof import("../../Partner/runtime/partnersChatChannelUtils");
const { ensureStaffCmdsThreadIdsHydrated } = require("../../Staff/utils/staffCmdsChannelUtils") as typeof import("../../Staff/utils/staffCmdsChannelUtils");
const { isChannelInTicketCategory } = require("../../../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../../../MultiGuild/tickets/discord/ticketCategoryUtils");
const { buildPrefixLookupKeys } = require("./temporaryCommandPermissions") as typeof import("./temporaryCommandPermissions");
const { isAllowedGuildUfficiale, isMainGuild, tryResolveMultiGuildOpenMediaBypass, tryResolveMultiGuildTenantPrefixRestriction } = require("./permTenantBypass") as typeof import("./permTenantBypass");
const { resolvePermissionReference, normalizePermissionList } = require("./permReferences") as typeof import("./permReferences");
const { WEB_TICKET_PREFIX_ALLOWED_COMMANDS, WEB_TICKET_PREFIX_CATEGORY_LIMIT, VOICE_STANZA_PREFIX_CHANNEL_BYPASS_COMMANDS, WEB_TICKET_PREFIX_HIDDEN_COMMANDS, resolvePrefixRoles, getDevIds, peekMainDashboardCommandAcl } = require("./permWebTicket") as typeof import("./permWebTicket");
const { loadPermissions, normalizeChannelList, channelMatchesPolicyChannelList, resolveCommandChannelPolicy, hasAnyRoleWithLiveFallback, hasAllPermissionsWithLiveFallback } = require("./permSlash") as typeof import("./permSlash");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const PM_THREAD_PREFIX_CHANNEL_BYPASS_COMMANDS = new Set(["help", "profile"]);
const TICKET_PREFIX_CHANNEL_BYPASS_COMMANDS = new Set(["sezioneproibita", "libriproibiti", "forbiddenbooks"]);

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

function resolveDashboardCommandAclDenial(message?, commandName?, options: Record<string, any> = {}) {
  try {
    const { resolveTenantCommandAcl } = require("../../../MultiGuild/core/tenantCommandAcl") as typeof import("../../../MultiGuild/core/tenantCommandAcl");
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

async function checkPrefixPermission(message?, commandName?, subcommandName = null, options: Record<string, any> = {}) {
  const guildId = message?.guild?.id || null;
  const userId = message?.author?.id || null;
  const safeCommand = String(commandName || "").toLowerCase();
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
          message: `${E.vegax} Non puoi usare questo bot.`,
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
          message: `${E.vegax} Questo server non può usare il bot.`,
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
      } = require("../../Partner/core/tenantPartnershipAdminAccess") as typeof import("../../Partner/core/tenantPartnershipAdminAccess");
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
        const { resolveTenantModerationMemberCheck } = require("../../../MultiGuild/core/tenantModerationPermissions") as typeof import("../../../MultiGuild/core/tenantModerationPermissions");
        const modCheck = resolveTenantModerationMemberCheck(message.member, safeCommand, options);
        if (modCheck !== null) return modCheck;
      } catch (err) {
        global.logger?.warn?.("[commandPermissions] MultiGuild tenant mod check:", err?.message || err);
      }
      try {
        const { resolveTenantCommandAcl } = require("../../../MultiGuild/core/tenantCommandAcl") as typeof import("../../../MultiGuild/core/tenantCommandAcl");
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
    const playOnOfficial = safeCommand === "play" && isAllowedGuildUfficiale(guildId);
    if (!playOnOfficial) {
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
      const { channelPassesChannelAcl } = require("../../../MultiGuild/core/tenantCommandAcl") as typeof import("../../../MultiGuild/core/tenantCommandAcl");
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
        const { dashboardChannelIncludeAllows } = require("../../../MultiGuild/core/tenantCommandAcl") as typeof import("../../../MultiGuild/core/tenantCommandAcl");
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
      const { channelPassesChannelAcl } = require("../../../MultiGuild/core/tenantCommandAcl") as typeof import("../../../MultiGuild/core/tenantCommandAcl");
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
      const { memberPassesRoleAcl } = require("../../../MultiGuild/core/tenantCommandAcl") as typeof import("../../../MultiGuild/core/tenantCommandAcl");
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
  let hasRole = !Array.isArray(roles) ? true : await hasAnyRoleWithLiveFallback(message, roles);
  if (!hasRole && message.member) {
    try {
      const {
        isTenantModerationPrefixCommand,
        memberHasModeratorRole,
      } = require("../../../MultiGuild/core/tenantModerationPermissions") as typeof import("../../../MultiGuild/core/tenantModerationPermissions");
      if (isTenantModerationPrefixCommand(safeCommand) && memberHasModeratorRole(message.member)) {
        hasRole = true;
      }
    } catch (_) {}
  }
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

export = { resolvePrefixCommandChannels, checkPrefixPermission };
