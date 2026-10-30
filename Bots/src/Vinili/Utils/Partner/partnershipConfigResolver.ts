const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { getPartnershipConfigSync, isPartnershipSetupComplete } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
const { PARTNER_SAME_TARGET_COOLDOWN_MS } = require("./partnerSameTargetCooldown") as typeof import("./partnerSameTargetCooldown");
const {
  remapRoleIdForward,
  expandRemappedRoleIds,
  memberHasAnyRemappedRole,
  memberHasRoleNameMatch,
} = require("../Config/emergencyRoleIdRemap") as typeof import("../Config/emergencyRoleIdRemap");

function preferLivePartnerManagerRoleId(rawRoleId?, { preferIds = true } = {}) {
  const fromRaw = remapRoleIdForward(rawRoleId);
  if (!preferIds) return fromRaw || null;
  const fromIds = remapRoleIdForward(IDs.roles?.PartnerManager);
  // Main guild only: prefer current ids.js after emergency remap; never keep a dead pre-remap id.
  return fromIds || fromRaw || null;
}

function preferLivePartnershipPingRoleId(rawRoleId?, { preferIds = true } = {}) {
  const fromRaw = remapRoleIdForward(rawRoleId);
  if (!preferIds) return fromRaw || null;
  const fromIds = remapRoleIdForward(IDs.roles?.Partnership);
  // Prefer live Partnership role from ids.js (old mongo ping ids still tag dead roles).
  return fromIds || fromRaw || null;
}

function normalizePartnershipPings(pings?, { preferIds = true } = {}) {
  if (!pings || typeof pings !== "object") return pings;
  const customRoleId = preferLivePartnershipPingRoleId(pings.customRoleId, { preferIds }) || null;
  if (String(pings.customRoleId || "").trim() === String(customRoleId || "").trim()) return pings;
  return { ...pings, customRoleId };
}

function getMainGuildId() {
  return String(IDs.guilds?.main || "").trim();
}

function isMainPartnershipSettingsGuild(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
      try {
    const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../MultiGuild/core/viniliProtectedGuilds");
    if (isViniliProtectedGuild(gid)) return true;
  } catch (_) {}
  return Boolean(gid && gid === getMainGuildId());
}

function emptyThankYouEmbed() {
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
  };
}

function emptyPartnerDesc() {
  return {
    mode: null,
    channelId: null,
    staticText: null,
    sourceMessageId: null,
    configured: false,
  };
}

function buildLegacyPartnershipConfig(guildId?) {
  const gid = String(guildId || IDs.guilds?.main || "").trim();
  const cfg = {
    guildId: gid,
    partnershipsChannelId: IDs.channels?.partnerships || null,
    logsChannelId: IDs.channels?.partnerLogs || null,
    pointsRemovedChannelId: IDs.channels?.puntiTolti || null,
    descriptionChannelId: IDs.channels?.descriptionPartner || null,
    partnersChatChannelId: IDs.channels?.partnersChat || null,
    partnerManagerRoleId: preferLivePartnerManagerRoleId(IDs.roles?.PartnerManager),
    partnerBlacklistRoleId: remapRoleIdForward(IDs.roles?.blackilistPartner) || IDs.roles?.blackilistPartner || null,
    partnershipPingRoleId: preferLivePartnershipPingRoleId(IDs.roles?.Partnership),
    invite: null,
    pings: {
      hereMembers: null,
      everyoneMembers: null,
      customRoleId: preferLivePartnershipPingRoleId(IDs.roles?.Partnership),
      customRoleMembers: null,
      configured: Boolean(IDs.roles?.Partnership),
    },
    setupCompleted: true,
    legacy: true,
    tenantPrefixToolkitEnabled: true,
  };
  try {
    const { remapDeepConfigForTestGuild } = require("../Config/testGuildMirrorRemap") as typeof import("../Config/testGuildMirrorRemap");
    return remapDeepConfigForTestGuild(gid, cfg);
  } catch (_) {
    return cfg;
  }
}

function enrichLegacyPartnershipConfigForSettings(legacy?) {
  const base = legacy || buildLegacyPartnershipConfig();
  const descriptionChannelId = base.descriptionChannelId || null;
  let mainFilters;
  try {
    ({ mainPartnershipContentFilters: mainFilters } = require("./partnershipMessageUtils"));
  } catch (_) {
    mainFilters = null;
  }
  const defaultFilters =
    typeof mainFilters === "function"
      ? mainFilters()
      : {
          stripMentions: true,
          stripMassMentions: true,
          stripNonInviteLinks: true,
          stripCustomEmojis: false,
          stripInvisibleChars: false,
          stripSpoilers: false,
          stripExtraInvites: false,
        };
  return {
    ...base,
    skipManager: base.skipManager === true,
    pmCommandsChannelId: base.partnersChatChannelId || null,
    pmCommandsCategoryIds: Array.isArray(base.pmCommandsCategoryIds) ? base.pmCommandsCategoryIds : [],
    managerBadgeRoleId: base.managerBadgeRoleId || null,
    managerLeaveAction: base.managerLeaveAction || null,
    manualPartnershipEnabled: base.manualPartnershipEnabled === true,
    sameServerCooldownMs:
      base.sameServerCooldownMs !== undefined
        ? base.sameServerCooldownMs
        : PARTNER_SAME_TARGET_COOLDOWN_MS,
    thankYouEmbed: base.thankYouEmbed || emptyThankYouEmbed(),
    partnerDesc: base.partnerDesc?.configured
      ? base.partnerDesc
      : {
          mode: descriptionChannelId ? "channel" : null,
          channelId: descriptionChannelId,
          staticText: null,
          sourceMessageId: null,
          configured: Boolean(descriptionChannelId),
        },
    invite: base.invite || { code: null, url: null, channelId: null },
    contentFilters: base.contentFilters || defaultFilters,
    contentFiltersConfigured: base.contentFiltersConfigured === true,
    setupCompleted: true,
    legacy: true,
    tenantPrefixToolkitEnabled: base.tenantPrefixToolkitEnabled !== false,
  };
}

function mergeMainPartnershipConfig(guildId?) {
  const legacy = enrichLegacyPartnershipConfigForSettings(buildLegacyPartnershipConfig(guildId));
  const mongo = getPartnershipConfigSync(guildId);
  if (!mongo) return legacy;

  let thankYouEmbed = legacy.thankYouEmbed;
  try {
    const { hasThankYouEmbedContent } = require("./partnershipThankYouEmbed") as typeof import("./partnershipThankYouEmbed");
    if (hasThankYouEmbedContent(mongo.thankYouEmbed)) thankYouEmbed = mongo.thankYouEmbed;
  } catch (_) {
    if (mongo.thankYouEmbed) thankYouEmbed = mongo.thankYouEmbed;
  }

  const partnerDesc = mongo.partnerDesc?.configured ? mongo.partnerDesc : legacy.partnerDesc;
  const pings = normalizePartnershipPings(mongo.pings?.configured ? mongo.pings : legacy.pings, {
    preferIds: true,
  });
  const descriptionChannelId =
    partnerDesc?.mode === "channel" ? partnerDesc.channelId || legacy.descriptionChannelId : legacy.descriptionChannelId;

  const merged = {
    ...legacy,
    partnershipsChannelId: mongo.partnershipsChannelId || legacy.partnershipsChannelId,
    logsChannelId: mongo.logsChannelId ?? legacy.logsChannelId,
    pointsRemovedChannelId: legacy.pointsRemovedChannelId,
    partnersChatChannelId: mongo.pmCommandsChannelId || legacy.partnersChatChannelId,
    pmCommandsChannelId: mongo.pmCommandsChannelId || legacy.pmCommandsChannelId,
    pmCommandsCategoryIds: mongo.pmCommandsCategoryIds?.length
      ? mongo.pmCommandsCategoryIds
      : legacy.pmCommandsCategoryIds,
    partnerManagerRoleId:
      preferLivePartnerManagerRoleId(mongo.partnerManagerRoleId) ||
      preferLivePartnerManagerRoleId(legacy.partnerManagerRoleId),
    partnershipPingRoleId:
      preferLivePartnershipPingRoleId(pings?.customRoleId) ||
      preferLivePartnershipPingRoleId(legacy.partnershipPingRoleId),
    pings,
    skipManager: mongo.skipManager === true,
    thankYouEmbed,
    partnerDesc,
    descriptionChannelId,
    manualPartnershipEnabled: mongo.manualPartnershipEnabled === true,
    managerBadgeRoleId: remapRoleIdForward(mongo.managerBadgeRoleId) || remapRoleIdForward(legacy.managerBadgeRoleId) || mongo.managerBadgeRoleId || legacy.managerBadgeRoleId,
    managerLeaveAction: mongo.managerLeaveAction || legacy.managerLeaveAction,
    sameServerCooldownMs:
      mongo.sameServerCooldownMs !== undefined ? mongo.sameServerCooldownMs : legacy.sameServerCooldownMs,
    invite:
      mongo.invite?.url || mongo.invite?.code || mongo.invite?.channelId
        ? { ...legacy.invite, ...mongo.invite }
        : legacy.invite,
    contentFilters:
      mongo.contentFiltersConfigured === true ? mongo.contentFilters : legacy.contentFilters,
    contentFiltersConfigured: mongo.contentFiltersConfigured === true,
    setupCompleted: true,
    legacy: true,
    tenantPrefixToolkitEnabled: true,
  };
  try {
    const { remapDeepConfigForTestGuild } = require("../Config/testGuildMirrorRemap") as typeof import("../Config/testGuildMirrorRemap");
    return remapDeepConfigForTestGuild(guildId, merged);
  } catch (_) {
    return merged;
  }
}

function buildMainPartnershipMongoSeed(guildId?) {
  const merged = mergeMainPartnershipConfig(guildId);
  return {
    partnershipsChannelId: merged.partnershipsChannelId,
    logsChannelId: merged.logsChannelId,
    partnerManagerRoleId: merged.partnerManagerRoleId,
    invite: merged.invite,
    pings: merged.pings,
    thankYouEmbed: merged.thankYouEmbed,
    partnerDesc: merged.partnerDesc,
    contentFilters: merged.contentFilters,
    contentFiltersConfigured: merged.contentFiltersConfigured === true,
    pmCommandsChannelId: merged.pmCommandsChannelId,
    pmCommandsCategoryIds: merged.pmCommandsCategoryIds,
    manualPartnershipEnabled: merged.manualPartnershipEnabled,
    skipManager: merged.skipManager,
    managerBadgeRoleId: merged.managerBadgeRoleId,
    managerLeaveAction: merged.managerLeaveAction,
    sameServerCooldownMs: merged.sameServerCooldownMs,
    setupCompleted: true,
    setupCompletedAt: Date.now(),
    setupCompletedBy: null,
  };
}

function resolvePartnershipConfigSync(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  if (isViniliFullFeatureGuild(gid)) {
    return mergeMainPartnershipConfig(gid);
  }
  const tenant = getPartnershipConfigSync(gid);
  const complete = isPartnershipSetupComplete(tenant);
  const logsId = tenant?.logsChannelId || null;
  return {
    guildId: gid,
    partnershipsChannelId: tenant?.partnershipsChannelId || null,
    logsChannelId: logsId,
    pointsRemovedChannelId: logsId,
    partnersChatChannelId: tenant?.pmCommandsChannelId || null,
    pmCommandsChannelId: tenant?.pmCommandsChannelId || null,
    pmCommandsCategoryIds: tenant?.pmCommandsCategoryIds || [],
    partnerManagerRoleId: preferLivePartnerManagerRoleId(tenant?.partnerManagerRoleId, { preferIds: false }),
    managerBadgeRoleId: remapRoleIdForward(tenant?.managerBadgeRoleId) || tenant?.managerBadgeRoleId || null,
    managerLeaveAction: tenant?.managerLeaveAction ?? null,
    behaviorDeleteAction: tenant?.behaviorDeleteAction ?? null,
    sameServerCooldownMs: tenant?.sameServerCooldownMs ?? null,
    partnerBlacklistRoleId: null,
    partnershipPingRoleId: preferLivePartnershipPingRoleId(tenant?.pings?.customRoleId, { preferIds: false }),
    invite: tenant?.invite || null,
    pings: normalizePartnershipPings(
      tenant?.pings || {
        hereMembers: null,
        everyoneMembers: null,
        customRoleId: null,
        customRoleMembers: null,
        configured: false,
      },
      { preferIds: false },
    ),
    thankYouEmbed: tenant?.thankYouEmbed || {
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
    },
    partnerDesc: tenant?.partnerDesc || {
      mode: null,
      channelId: null,
      staticText: null,
      sourceMessageId: null,
      configured: false,
    },
    contentFilters: tenant?.contentFilters || {
      stripMentions: false,
      stripMassMentions: false,
      stripNonInviteLinks: false,
      stripCustomEmojis: false,
      stripInvisibleChars: false,
      stripSpoilers: false,
      stripExtraInvites: false,
    },
    manualPartnershipEnabled: tenant?.manualPartnershipEnabled === true,
    setupCompleted: complete,
    skipManager: tenant?.skipManager === true,
    legacy: false,
    descriptionChannelId:
      tenant?.partnerDesc?.mode === "channel" ? tenant.partnerDesc.channelId || null : null,
  };
}

function isPartnershipSkipManagerAllowed(guildId?) {
  const cfg = resolvePartnershipConfigSync(guildId);
  return Boolean(cfg?.skipManager);
}

function buildSkipDeniedEmbed() {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription("<:vegax:1443934876440068179> **Non puoi usare lo skip!**");
}

function buildPartnershipCompletedReplyEmbed({ client, guildId, managerId, pingRoleId = undefined, pingHere = false, pingEveryone = false }) {
  const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
  const { formatPartnershipPingDisplay } = require("./partnershipPingUtils") as typeof import("./partnershipPingUtils");
  const resolvedPingRoleId = pingRoleId !== undefined ? String(pingRoleId || "").trim() || null : String(getPartnershipPingRoleId(guildId) || "").trim() || null;
  const managerValue = managerId ? `<@${managerId}>` : "`null`";
  const pingValue = formatPartnershipPingDisplay({ pingHere, pingEveryone, pingRoleId: resolvedPingRoleId });
  const botUser = client?.user;
  const iconURL = userAvatarUrlDynamic(botUser, { size: 64 }) || undefined;

  return new EmbedBuilder()
    .setColor(0x6f4e37)
    .setDescription(
      [
        "<a:VC_Verified:1482532479637127188> **Partnership** completata con **successo**!",
        "",
        `<:VC_Collab:1482534540089098260> **Manager:** ${managerValue}`,
        `<:VC_Mention:1482526855289634997> **Ping:** ${pingValue}`,
      ].join("\n"),
    )
}

function isPartnershipOperational(guildId?) {
  const cfg = resolvePartnershipConfigSync(guildId);
  return Boolean(cfg?.partnershipsChannelId && cfg.partnerManagerRoleId);
}

function collectPartnerManagerRoleIds(guildId?) {
  const ids = new Set();
  const gid = String(guildId || "").trim();
  const fromCfg = resolvePartnershipConfigSync(gid)?.partnerManagerRoleId;
  for (const id of expandRemappedRoleIds(fromCfg)) ids.add(id);
  // Main / Vinili only: also accept live ids.js PartnerManager (emergency remap aliases).
  if (gid && (isViniliFullFeatureGuild(gid) || isMainPartnershipSettingsGuild(gid))) {
    for (const id of expandRemappedRoleIds(IDs.roles?.PartnerManager)) ids.add(id);
  }
  return [...ids];
}

function memberHasPartnerManagerRole(member?, guildId?) {
  if (!member) return false;
  const roleIds = collectPartnerManagerRoleIds(guildId);
  if (roleIds.length && memberHasAnyRemappedRole(member, roleIds)) return true;
  // Last resort after emergency role recreate: match by display name.
  return memberHasRoleNameMatch(member, /partner\s*manager/i);
}

async function guildMemberHasPartnerManagerRole(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!client || !gid || !uid) return false;
  const roleId = resolvePartnershipConfigSync(gid)?.partnerManagerRoleId;
  if (!roleId) return false;
  const guild = client.guilds?.cache?.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  if (!guild) return false;
  const member = guild.members?.cache?.get(uid) || (await guild.members.fetch(uid).catch(() => null));
  return memberHasPartnerManagerRole(member, gid);
}

async function userIsPartnerManagerOnAnyGuild(client?, userId?) {
  const uid = String(userId || "").trim();
  if (!client || !uid) return false;

      let guildIds = [];
  try {
    guildIds = listOperationalPartnershipGuildIds(client);
  } catch (_) {
    guildIds = [];
  }
  if (!guildIds.length && client.guilds?.cache?.size) {
    guildIds = Array.from(client.guilds.cache.keys());
  }

  const pendingFetch = [];
  for (const rawId of guildIds) {
    const gid = String(rawId || "").trim();
    if (!gid || !isPartnershipOperational(gid)) continue;
    const roleId = String(getPartnerManagerRoleId(gid) || "").trim();
    if (!roleId) continue;

    const guild = client.guilds.cache.get(gid);
    const cached = guild?.members?.cache?.get(uid);
    if (cached) {
      if (cached.roles.cache.has(roleId)) return true;
      continue;
    }
    pendingFetch.push(gid);
  }

  for (const gid of pendingFetch) {
    if (await guildMemberHasPartnerManagerRole(client, gid, uid)) return true;
  }
  return false;
}

async function userHasPartnerManagerHistory(userId?) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return false;
  const row = await ActivityUserProfile.findOne({
    $or: [
      {
        userId: uid,
        $or: [
          { "staff.partnerActions.0": { $exists: true } },
          { "staff.partnerCount": { $gt: 0 } },
          { "staff.managerId": { $exists: true, $ne: null } },
          { "profile.tenantPartnership.objectivesCompleted.0": { $exists: true } },
          { "profile.tenantPartnership.objectiveStats": { $exists: true } },
        ],
      },
            { "staff.managerId": uid },
      { "staff.partnerActions.managerId": uid },
    ],
  })
    .select("_id")
    .lean()
    .catch(() => null);
  return Boolean(row);
}

async function userQualifiesForTenantMissions(client?, userId?) {
  if (await userIsPartnerManagerOnAnyGuild(client, userId)) return true;
  return userHasPartnerManagerHistory(userId);
}

function getPartnershipChannelId(guildId?) {
  return resolvePartnershipConfigSync(guildId)?.partnershipsChannelId || null;
}

function getPartnerManagerRoleId(guildId?) {
  const gid = String(guildId || "").trim();
  const fromCfg = resolvePartnershipConfigSync(gid)?.partnerManagerRoleId;
  if (gid && (isViniliFullFeatureGuild(gid) || isMainPartnershipSettingsGuild(gid))) {
    return preferLivePartnerManagerRoleId(fromCfg) || preferLivePartnerManagerRoleId(IDs.roles?.PartnerManager);
  }
  return preferLivePartnerManagerRoleId(fromCfg, { preferIds: false });
}

function memberCanExecutePartnership(member?, guildId?) {
  const gid = String(guildId || member?.guild?.id || "").trim();
  if (memberHasPartnerManagerRole(member, gid)) return true;
  if (!gid || isViniliFullFeatureGuild(gid) || isMainPartnershipSettingsGuild(gid)) return false;
  try {
    const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
    if (
      member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
      member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)
    ) {
      return true;
    }
  } catch (_) {}
  try {
    const ownerId = String(member?.guild?.ownerId || "").trim();
    if (ownerId && ownerId === String(member?.id || member?.user?.id || "").trim()) return true;
  } catch (_) {}
  return false;
}

function getPartnershipLogsChannelId(guildId?) {
  const cfg = resolvePartnershipConfigSync(guildId);
  return cfg?.logsChannelId || null;
}

function getPointsRemovedLogChannelId(guildId?) {
  const cfg = resolvePartnershipConfigSync(guildId);
  const id = cfg?.pointsRemovedChannelId || null;
  if (!id) return null;
  const legacyPuntiTolti = String(IDs.channels?.puntiTolti || "").trim();
  if (legacyPuntiTolti && String(id) === legacyPuntiTolti) {
    try {
      const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
      if (!isDiscordStaffChannelPostsEnabled()) return null;
    } catch (_) {}
  }
  return id;
}

function resolvePartnershipLifecycleLogChannelId(guildId?) {
  return getPartnershipLogsChannelId(guildId);
}

function resolvePointsCustomLogChannelId(guildId?) {
  return getPointsRemovedLogChannelId(guildId) || getPartnershipLogsChannelId(guildId);
}

function getPartnershipLogChannelIds(guildId?) {
  const pointsChannelId = resolvePointsCustomLogChannelId(guildId);
  return {
    primary: pointsChannelId,
    fallback: null,
  };
}

function getPartnershipPingRoleId(guildId?) {
  const cfg = resolvePartnershipConfigSync(guildId);
  if (!cfg) return null;
  const preferIds = Boolean(cfg.legacy);
  return (
    preferLivePartnershipPingRoleId(cfg.partnershipPingRoleId, { preferIds }) ||
    preferLivePartnershipPingRoleId(cfg.pings?.customRoleId, { preferIds }) ||
    null
  );
}

function getPartnerBlacklistRoleId(guildId?) {
  return resolvePartnershipConfigSync(guildId)?.partnerBlacklistRoleId || null;
}

function getDescriptionChannelId(guildId?) {
  return resolvePartnershipConfigSync(guildId)?.descriptionChannelId || null;
}

function getPartnersChatChannelId(guildId?) {
  return resolvePartnershipConfigSync(guildId)?.partnersChatChannelId || null;
}

function getPmCommandsCategoryIds(guildId?) {
  const ids = resolvePartnershipConfigSync(guildId)?.pmCommandsCategoryIds;
  return Array.isArray(ids) ? ids.filter((id?) => /^\d{16,20}$/.test(String(id || ""))) : [];
}

function tenantPmCommandsZoneConfigured(guildId?) {
  return Boolean(getPartnersChatChannelId(guildId) || getPmCommandsCategoryIds(guildId).length);
}

function shouldApplyMainPartnershipFilters(guildId?) {
  return Boolean(resolvePartnershipConfigSync(guildId)?.legacy);
}

function isTenantPartnershipPrefixToolkitEnabled(guildId?) {
  const cfg = resolvePartnershipConfigSync(guildId);
  if (!cfg) return false;
  if (!cfg.legacy) return true;
  return cfg.tenantPrefixToolkitEnabled !== false;
}

function shouldBlockTenantPartnershipPrefixCommands(guildId?) {
  return !isTenantPartnershipPrefixToolkitEnabled(guildId);
}

function shouldUseTenantStatsInfoRouting(guildId?) {
  if (!guildId || isViniliFullFeatureGuild(guildId)) return false;
  if (shouldBlockTenantPartnershipPrefixCommands(guildId)) return false;
  return isPartnershipOperational(guildId);
}

async function shouldRouteTenantPartnershipProfile(message?, opts: Record<string, any> = {}) {
  const forcePmMode = opts.forcePmMode === true;
  const guildId = String(message?.guild?.id || "").trim();
  if (!guildId || !isTenantPartnershipPrefixToolkitEnabled(guildId)) return false;
  if (!isPartnershipOperational(guildId)) return false;

  if (!isViniliFullFeatureGuild(guildId)) return true;

  let member = message?.member || null;
  const authorId = String(message?.author?.id || "").trim();
  const guild = message?.guild;
  const pmRoleId = String(resolvePartnershipConfigSync(guildId)?.partnerManagerRoleId || "").trim();
  if (guild && authorId) {
    const needsFetch =
      !member ||
      (pmRoleId && !member.roles?.cache?.has(pmRoleId));
    if (needsFetch) {
      member = await guild.members.fetch(authorId).catch(() => member);
    }
  }

  if (!memberHasPartnerManagerRole(member, guildId)) return false;

  if (forcePmMode) return true;

  try {
    const {
      isStaffCmdsPmCommandsThread,
      isStaffCmdsPmCommandsThreadSync,
      isStaffCmdsMainChannel,
      ensureStaffCmdsThreadIdsHydrated,
    } = require("../Staff/staffCmdsChannelUtils") as typeof import("../Staff/staffCmdsChannelUtils");
    const channel = message?.channel;
    if (isStaffCmdsPmCommandsThreadSync(channel)) return true;
    if (isStaffCmdsMainChannel(channel)) return true;
    await ensureStaffCmdsThreadIdsHydrated().catch(() => null);
    if (await isStaffCmdsPmCommandsThread(channel)) return true;
  } catch (_) {}

  return false;
}

function isProfilePmModeArg(args = []) {
  return String(args?.[0] || "").trim().toLowerCase() === "pm";
}

function listPartnershipAuditGuildIds(client?) {
  const mainId = String(IDs.guilds?.main || "").trim();
  if (!mainId) return [];
  if (client?.guilds?.cache?.has(mainId)) return [mainId];
  return [mainId];
}

function listOperationalPartnershipGuildIds(client?) {
  const ids = new Set();
  const mainId = String(IDs.guilds?.main || "").trim();
  if (mainId) ids.add(mainId);
  try {
    const {
      listConfiguredPartnershipGuildIds,
    } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
    for (const gid of listConfiguredPartnershipGuildIds()) {
      if (isPartnershipOperational(gid)) ids.add(String(gid));
    }
  } catch (_) {}
  if (client?.guilds?.cache) {
    for (const guild of client.guilds.cache.values()) {
      if (guild?.id && isPartnershipOperational(guild.id)) ids.add(String(guild.id));
    }
  }
  return Array.from(ids);
}

function collectPartnershipChannelIdsForAutomod() {
  const ids = new Set(
    [IDs.channels?.partnerships, "1442569193470824448"].filter(Boolean).map(String),
  );
  try {
    const { getAllPartnershipConfigCacheRows } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
    for (const cfg of getAllPartnershipConfigCacheRows()) {
      if (cfg?.partnershipsChannelId) ids.add(String(cfg.partnershipsChannelId));
    }
  } catch (_) {}
  return ids;
}

const SETUP_REQUIRED_REPLY =
  "<:vegax:1443934876440068179> Partnership non configurata su questo server. Un admin deve completare `+setup`.";

export = { buildLegacyPartnershipConfig, buildMainPartnershipMongoSeed, getMainGuildId, isMainPartnershipSettingsGuild, resolvePartnershipConfigSync, isPartnershipOperational, shouldApplyMainPartnershipFilters, isTenantPartnershipPrefixToolkitEnabled, shouldBlockTenantPartnershipPrefixCommands, shouldUseTenantStatsInfoRouting, shouldRouteTenantPartnershipProfile, isProfilePmModeArg, memberHasPartnerManagerRole, memberCanExecutePartnership, guildMemberHasPartnerManagerRole, userQualifiesForTenantMissions, getPartnershipChannelId, getPartnerManagerRoleId, getPartnershipLogsChannelId, getPointsRemovedLogChannelId, resolvePartnershipLifecycleLogChannelId, resolvePointsCustomLogChannelId, getPartnershipLogChannelIds, getPartnershipPingRoleId, getPartnerBlacklistRoleId, getDescriptionChannelId, getPartnersChatChannelId, getPmCommandsCategoryIds, tenantPmCommandsZoneConfigured, listPartnershipAuditGuildIds, listOperationalPartnershipGuildIds, collectPartnershipChannelIdsForAutomod, SETUP_REQUIRED_REPLY, isPartnershipSkipManagerAllowed, buildSkipDeniedEmbed, buildPartnershipCompletedReplyEmbed };