const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, PermissionsBitField, } = require("discord.js") as typeof import("discord.js");
const { closeOpenTicketsForGuildUser } = require("../Utils/Ticket/ticketCloseRuntime") as typeof import("../Utils/Ticket/ticketCloseRuntime");
const { autoUnclaimOpenTicketsClaimedByUser } = require("../Utils/Ticket/ticketAutoUnclaimOnStaffLoss") as typeof import("../Utils/Ticket/ticketAutoUnclaimOnStaffLoss");
const { ActivityUserProfile, UserLeaveBackup, ACTIVITY_MAIN_GUILD_ID } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const { sponsorMainLeave } = require("../Utils/Community/activityUserProfilePaths") as typeof import("../Utils/Community/activityUserProfilePaths");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { getGuildChannelCached, getClientGuildCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { scheduleStaffListRefresh, memberHasStaffRole, } = require("../Utils/Community/staffListUtils") as typeof import("../Utils/Community/staffListUtils");
const { scheduleMemberCounterRefresh } = require("../Utils/Community/memberCounterUtils") as typeof import("../Utils/Community/memberCounterUtils");
const { getStaffRoleEmojiByRoleId } = require("../Utils/Community/staffRoleEmoji") as typeof import("../Utils/Community/staffRoleEmoji");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync") as typeof import("../Utils/Config/idsAutoSync");
const { runCleanupAfterMemberLeave } = require("../Services/Community/cleanupUsersNotInServerService") as typeof import("../Services/Community/cleanupUsersNotInServerService");
const { backupUserOnLeave } = require("../Services/Community/userLeaveBackupService") as typeof import("../Services/Community/userLeaveBackupService");
const { handleMuteMirrorOnMemberLeave } = require("../Services/Moderation/mutedMirrorRoleService") as typeof import("../Services/Moderation/mutedMirrorRoleService");
const {
  handleTenantPartnerManagerLeave,
} = require("../Services/Partner/partnerManagerLeaveService") as typeof import("../Services/Partner/partnerManagerLeaveService");
const { enqueueCustomPerksDiscordCleanupAfterLeave } = require("../Services/Community/customPerksDiscordCleanupQueueService") as typeof import("../Services/Community/customPerksDiscordCleanupQueueService");
const { purgeLeftMemberCustomPerksFromDiscord } = require("../Services/Community/customRoleLeftMemberDiscordCleanupService") as typeof import("../Services/Community/customRoleLeftMemberDiscordCleanupService");
const sponsorVerifiedRequiresMain = require("../Services/Community/sponsorVerifiedRequiresMainService") as typeof import("../Services/Community/sponsorVerifiedRequiresMainService");
const { buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils") as typeof import("../Utils/Logging/channelRolesLogUtils");
const { handleKickBanAction: antiNukeHandleKickBanAction } = require("../Services/Moderation/antiNukeService") as typeof import("../Services/Moderation/antiNukeService");
const { consumeRecentJoinGateKick } = require("../Utils/Moderation/joinGateKickCache") as typeof import("../Utils/Moderation/joinGateKickCache");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { trackMemberLeave } = require("../Services/Community/dailyMemberStatsService") as typeof import("../Services/Community/dailyMemberStatsService");
const { handleMainGuildMemberRemove } = require("../Services/Staff/staffAccessMirrorService") as typeof import("../Services/Staff/staffAccessMirrorService");
const { cancelOpenPausesOnMemberLeave } = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
const { appendStaffRolesHistoryEntry } = require("../Utils/Staff/staffDocUtils") as typeof import("../Utils/Staff/staffDocUtils");
const { identityFromMember } = require("../Web/siteStaffRosterCache") as typeof import("../Web/siteStaffRosterCache");

function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
function buildStaffTrackedRoleIdSet() {
  const { expandRemappedRoleIds } = require("../Utils/Config/emergencyRoleIdRemap") as typeof import("../Utils/Config/emergencyRoleIdRemap");
  const keys = [
    "PartnerManager",
    "Staff",
    "Helper",
    "Mod",
    "SeniorModerator",
    "HighStaff",
    "Director",
    "Admin",
    "Manager",
    "Founder",
  ];
  const out = new Set();
  for (const key of keys) {
    const id = String(IDs.roles?.[key] || "").trim();
    if (!id) continue;
    for (const x of expandRemappedRoleIds(id)) out.add(String(x));
  }
  return out;
}
const STAFF_TRACKED_ROLE_IDS = buildStaffTrackedRoleIdSet();
const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;
const MAIN_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const SPONSOR_GUILD_IDS = IDs.guilds?.sponsorGuildIds || [];
const OFFICIAL_INVITE_URL = "https://discord.gg/viniliecaffe";
const REJOIN_DEADLINE_MS = 24 * 60 * 60 * 1000;
const STAFF_DB_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const JOIN_GATE_KICK_REASON_PATTERNS = ["account is too young to be allowed", "account too young to be allowed", "unverified bot addition", "bot added by unauthorized member", "advertising invite link in username", "username matches blocked pattern", "post-join filter",];

function formatActor(actor?) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function makeSponsorRejoinEmbed() {
  return new EmbedBuilder()
    .setColor("#ffb020")
    .setTitle("Rientra nel server principale")
    .setDescription(
      "Hai lasciato il server principale **Vinili & Caffè**.\n\n" +
      "Per mantenere l'accesso ai server TAGS devi rientrare entro **24 ore**.\n\n" +
      "Clicca il bottone qui sotto per rientrare.",
    )
    .setFooter({
      text: "Se non rientri entro 24h sarai rimosso dal server e perderai la TAG.",
    });
}

function makeSponsorRejoinRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Rientra nel server principale")
      .setURL(OFFICIAL_INVITE_URL),
  );
}

async function isUserInAnySponsorGuild(client?, userId?) {
  for (const guildId of SPONSOR_GUILD_IDS) {
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) return true;
  }
  return false;
}

async function upsertSponsorLeaveRecord(userId?, leftAt?, kickAt?) {
  await ActivityUserProfile.updateOne(
    { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
    {
      $set: {
        [sponsorMainLeave("leftAt")]: leftAt,
        [sponsorMainLeave("kickAt")]: kickAt,
        [sponsorMainLeave("dmSent")]: false,
        [sponsorMainLeave("dmFailed")]: false,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

async function markSponsorDmResult(userId?, dmOk?) {
  await ActivityUserProfile.updateOne(
    { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
    { $set: dmOk ? { [sponsorMainLeave("dmSent")]: true } : { [sponsorMainLeave("dmFailed")]: true } },
  ).catch(() => { });
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveGuildChannel(guild?, channelId?) {
  if (!guild || !channelId) return null;
  return getGuildChannelCached(guild, channelId);
}

async function sendLeaveLog(member?) {
  const channel = await resolveGuildChannel(member.guild, JOIN_LEAVE_LOG_CHANNEL_ID,);
  if (!channel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("<:VC_User:1482527453586002103> Membro Uscito")
    .setDescription([`<:VC_User:1482527453586002103> **Membro:** ${member.user} ${member.user.tag}.`, ""].join("\n"))
    .setFooter({ text: `ID: ${member.user.id}` })
    .setTimestamp()
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || null);

  await channel.send({ embeds: [embed] }).catch((err?) => {
    global.logger.error("[guildMemberRemove] Failed to send leave log:", err);
  });
}

async function markInviteInactive(member?) {
  await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: member.guild.id,
      userId: member.id,
      "profile.inviteTrack.active": true,
    },
    {
      $set: {
        "profile.inviteTrack.active": false,
        "profile.inviteTrack.leftAt": new Date(),
      },
    },
  ).catch(() => { });
}

async function closeOpenTicketsForMember(member?, closeReason = "Utente uscito dal server") {
  await closeOpenTicketsForGuildUser(member.guild, member.id, {
    closeReason,
    closedBy: member.client.user?.id || null,
    deleteReason: `Ticket chiuso automaticamente: ${closeReason} (${member.id})`,
  });
}

async function closeOpenWebTicketsForMember(member?, closeReason = "Utente uscito dal server") {
  const {
    closeOpenWebTicketsForGuildUser,
    autoUnclaimOpenWebTicketsClaimedByUser,
    removeLeftUserFromOpenWebTickets,
  } = require("../Web/siteWebTicketsApi") as typeof import("../Web/siteWebTicketsApi");
  const client = member.client;
  const guildId = member.guild?.id;
  const userId = member.id;
  await closeOpenWebTicketsForGuildUser(client, guildId, userId, {
    closeReason,
    closedBy: client?.user?.id || "system",
    closedByName: "Sistema",
  });
  await autoUnclaimOpenWebTicketsClaimedByUser(client, guildId, userId, {
    reason: closeReason.includes("kick")
      ? "perché è stato kickato dal server"
      : "perché è uscito dal server",
    claimerName: member.user?.globalName || member.user?.username || "",
  }).catch((err?) => {
    global.logger?.warn?.(
      "[guildMemberRemove] web ticket auto-unclaim on leave:",
      userId,
      err?.message || err,
    );
  });
  await removeLeftUserFromOpenWebTickets(client, guildId, userId).catch((err?) => {
    global.logger?.warn?.(
      "[guildMemberRemove] web ticket remove added on leave:",
      userId,
      err?.message || err,
    );
  });
}

const PARTNER_MANAGER_ROLE_ID = String(IDs.roles?.PartnerManager || "").trim();

function getHighestStaffTrackedRoleExcludingPm(member?) {
  if (!member?.roles?.cache) return null;
  const pmIds = new Set();
  try {
    const { expandRemappedRoleIds } = require("../Utils/Config/emergencyRoleIdRemap") as typeof import("../Utils/Config/emergencyRoleIdRemap");
    for (const id of expandRemappedRoleIds(PARTNER_MANAGER_ROLE_ID)) pmIds.add(String(id));
  } catch {
    if (PARTNER_MANAGER_ROLE_ID) pmIds.add(PARTNER_MANAGER_ROLE_ID);
  }
  return member.roles.cache
    .filter((role?) => STAFF_TRACKED_ROLE_IDS.has(role.id) && !pmIds.has(String(role.id)))
    .sort((a?, b?) => b.position - a.position)
    .first();
}

/** When Discord clears roles before guildMemberRemove, recover last ladder/PM/Staff id from DB. */
async function resolveLeaveStaffRoleIdsFromDb(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { ladderRoleId: null, hasPm: false };
  const doc = await ActivityUserProfile.findOne(
    { guildId: gid, userId: uid },
    { staff: 1, staffRolesHistoryRetention: 1 },
  )
    .lean()
    .catch(() => null);
  if (!doc) return { ladderRoleId: null, hasPm: false };

  try {
    const { expandRemappedRoleIds, remapRoleIdForward } = require("../Utils/Config/emergencyRoleIdRemap") as typeof import("../Utils/Config/emergencyRoleIdRemap");
    const { staffLadderRoleIds, STAFF_LADDER_KEYS_HIGH_TO_LOW } = require("../Utils/Staff/staffRoleHierarchy") as typeof import("../Utils/Staff/staffRoleHierarchy");
    const pmIds = new Set(expandRemappedRoleIds(PARTNER_MANAGER_ROLE_ID).map(String));
    const ladderIds = staffLadderRoleIds(STAFF_LADDER_KEYS_HIGH_TO_LOW);
    // organicoLeaveStaffBare1: generic Staff/HighStaff are tracked on Discord but not on the pex ladder.
    const bareStaffIds = new Set();
    for (const key of ["Staff", "HighStaff"]) {
      const raw = String(IDs.roles?.[key] || "").trim();
      if (!raw) continue;
      for (const id of expandRemappedRoleIds(raw)) bareStaffIds.add(String(id));
    }
    const leaveTrackIds = new Set([...ladderIds, ...bareStaffIds]);
    const memberId = String(IDs.roles?.Member || "").trim();

    const rows = []
      .concat(Array.isArray(doc.staff?.rolesHistory) ? doc.staff.rolesHistory : [])
      .concat(Array.isArray(doc.staffRolesHistoryRetention) ? doc.staffRolesHistoryRetention : [])
      .filter(Boolean);
    rows.sort((a?, b?) => (new Date(b?.date || 0) as any) - (new Date(a?.date || 0) as any));

    // If career already ends at Member: skip inventing ladder from older rows,
    // but organicoLeaveAfterDim1 — plain "Dimissioni" then leave still needs Esce stamp.
    const latest = rows[0];
    if (latest) {
      const latestNew =
        remapRoleIdForward(String(latest.newRole || "").trim()) || String(latest.newRole || "").trim();
      const latestKind = String(latest.kind || "").toLowerCase();
      const latestReason = String(latest.reason || "");
      const alreadyDepexed =
        (memberId && latestNew === memberId) ||
        latestKind === "depex" ||
        /\bdimission|\bdepex\b|\besce dal server/i.test(latestReason);
      if (alreadyDepexed && memberId && latestNew === memberId) {
        if (/\besce dal server/i.test(latestReason)) {
          return { ladderRoleId: null, hasPm: false };
        }
        const plainDim = /^\s*dimissioni\s*$/i.test(latestReason.trim());
        if (plainDim) {
          const oldId =
            remapRoleIdForward(String(latest.oldRole || "").trim()) || String(latest.oldRole || "").trim();
          if (oldId && oldId !== memberId) {
            if (pmIds.has(oldId)) return { ladderRoleId: null, hasPm: true, leaveAfterDim: true };
            if (leaveTrackIds.has(oldId)) {
              return { ladderRoleId: oldId, hasPm: false, leaveAfterDim: true };
            }
          }
        }
        return { ladderRoleId: null, hasPm: false };
      }
    }

    // Prefer the most recent held staff/PM role (newest row first), not the historically highest ladder rank.
    let hasPm = false;
    let ladderRoleId = null;
    for (let i = 0; i < Math.min(rows.length, 24); i += 1) {
      const row = rows[i];
      for (const raw of [row?.newRole, row?.oldRole]) {
        const id = remapRoleIdForward(String(raw || "").trim()) || String(raw || "").trim();
        if (!id || (memberId && id === memberId)) continue;
        if (pmIds.has(id)) {
          hasPm = true;
          continue;
        }
        if (!leaveTrackIds.has(id)) continue;
        if (!ladderRoleId) ladderRoleId = id;
      }
      if (ladderRoleId && hasPm) break;
    }
    return { ladderRoleId, hasPm };
  } catch {
    return { ladderRoleId: null, hasPm: false };
  }
}

const STAFF_LEAVE_FALLBACK_ROLE_EMOJI = "<:VC_Staff:1494286904089247754>";

function formatStaffRoleLeadingEmoji(role?) {
  return getStaffRoleEmojiByRoleId(role?.id, STAFF_LEAVE_FALLBACK_ROLE_EMOJI);
}

function buildStaffLeaveResignationContent(member?, staffRole?, userRoleLabel?) {
  const label = String(staffRole?.name || "Staff/PM").trim() || "Staff/PM";
  const dest = String(userRoleLabel || "User").trim() || "User";
  const lead = formatStaffRoleLeadingEmoji(staffRole);
  return `**<:cancel:1461730653677551691> DEPEX** ${member.user}
${lead}\`${label}\` <a:VC_Arrow:1482706699365257397> \`${dest}\`
<:VC_reason:1478517122929004544> __Dimissioni (Esce dal server)__`;
}

/** organicoLeaveAfterDim1: rename plain "Dimissioni" → "Dimissioni (Esce dal server)" on leave. */
async function stampDimissioniReasonAsLeaveExit(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  const memberId = String(IDs.roles?.Member || "").trim();
  const doc = await ActivityUserProfile.findOne(
    { guildId: gid, userId: uid },
    { staff: 1, staffRolesHistoryRetention: 1 },
  ).catch(() => null);
  if (!doc) return false;

  const stampArr = (arr?) => {
    if (!Array.isArray(arr) || !arr.length) return { changed: false, arr };
    const sortedIdx = arr
      .map((row?, i?) => ({ i, t: new Date(row?.date || 0).getTime() }))
      .sort((a?, b?) => b.t - a.t);
    for (const { i } of sortedIdx) {
      const row = arr[i];
      if (!row) continue;
      const neu = String(row.newRole || "").trim();
      const reason = String(row.reason || "").trim();
      if (memberId && neu !== memberId) continue;
      if (/\besce dal server/i.test(reason)) return { changed: false, arr };
      if (!/^\s*dimissioni\s*$/i.test(reason)) continue;
      row.reason = "Dimissioni (Esce dal server)";
      if (!row.kind) row.kind = "depex";
      return { changed: true, arr };
    }
    return { changed: false, arr };
  };

  let changed = false;
  if (doc.staff && typeof doc.staff === "object") {
    const rh = stampArr(doc.staff.rolesHistory);
    if (rh.changed) {
      doc.staff.rolesHistory = rh.arr;
      doc.markModified("staff");
      changed = true;
    }
    const th = stampArr(doc.staff.trackHistory);
    if (th.changed) {
      doc.staff.trackHistory = th.arr;
      doc.markModified("staff");
      changed = true;
    }
  }
  const ret = stampArr(doc.staffRolesHistoryRetention);
  if (ret.changed) {
    doc.staffRolesHistoryRetention = ret.arr;
    doc.markModified("staffRolesHistoryRetention");
    changed = true;
  }
  if (!changed) return false;
  await doc.save().catch((err?) => {
    global.logger?.warn?.("[guildMemberRemove] stamp Dimissioni Esce save:", uid, err?.message || err);
    return null;
  });
  return true;
}

async function handleTrackedStaffLeave(member?) {
  const guild = member.guild;
  let highestStaffExPm = getHighestStaffTrackedRoleExcludingPm(member);
  let hasPm = false;
  try {
    const { memberHasAnyRemappedRole } = require("../Utils/Config/emergencyRoleIdRemap") as typeof import("../Utils/Config/emergencyRoleIdRemap");
    hasPm = Boolean(PARTNER_MANAGER_ROLE_ID && memberHasAnyRemappedRole(member, PARTNER_MANAGER_ROLE_ID));
  } catch {
    hasPm = Boolean(PARTNER_MANAGER_ROLE_ID && member.roles?.cache?.has(PARTNER_MANAGER_ROLE_ID));
  }

  // organicoLeaveRetain1: Discord often delivers remove with empty role cache — fall back to DB career.
  let leaveAfterDim = false;
  if (!highestStaffExPm && !hasPm) {
    const fromDb = await resolveLeaveStaffRoleIdsFromDb(guild.id, member.id);
    hasPm = Boolean(fromDb.hasPm);
    leaveAfterDim = Boolean(fromDb.leaveAfterDim);
    if (fromDb.ladderRoleId) {
      highestStaffExPm = guild.roles.cache.get(fromDb.ladderRoleId) || {
        id: fromDb.ladderRoleId,
        name: guild.roles.cache.get(fromDb.ladderRoleId)?.name || "Staff",
      };
    }
  }
  if (!highestStaffExPm && !hasPm) return;

  // organicoLeaveAfterDim1: already had "Dimissioni" → Member — rename reason to Esce (no duplicate row).
  if (leaveAfterDim) {
    const stamped = await stampDimissioniReasonAsLeaveExit(guild.id, member.id).catch((err?) => {
      global.logger?.warn?.(
        "[guildMemberRemove] stampDimissioniReasonAsLeaveExit:",
        member.id,
        err?.message || err,
      );
      return false;
    });
    if (stamped) {
      const pruneAt = new Date(Date.now() + REJOIN_DEADLINE_MS * 7);
      await ActivityUserProfile.updateOne(
        { guildId: guild.id, userId: member.id },
        { $set: { staffPendingPurgeAt: pruneAt, updatedAt: new Date() } },
      ).catch(() => {});
      try {
        const { archiveStaffRolesHistoryThenUnsetStaff } = require("../Utils/Staff/staffDocUtils") as typeof import("../Utils/Staff/staffDocUtils");
        await archiveStaffRolesHistoryThenUnsetStaff(guild.id, member.id);
      } catch (err) {
        global.logger?.warn?.(
          "[guildMemberRemove] archive leave-after-dim retention:",
          member.id,
          err?.message || err,
        );
      }
      return;
    }
  }

  const pruneAt = new Date(Date.now() + REJOIN_DEADLINE_MS * 7);
  await ActivityUserProfile.updateOne(
    { guildId: guild.id, userId: member.id },
    { $set: { staffPendingPurgeAt: pruneAt, updatedAt: new Date() } },
  ).catch(() => { });

  const userRole = guild.roles.cache.get(IDs.roles.Member);
  const userRoleLabel = userRole?.name || "User";

  const pmRole = hasPm ? guild.roles.cache.get(PARTNER_MANAGER_ROLE_ID) : null;
  const pmLabel = pmRole?.name || "Partner Manager";

  const resignChannel = await (async () => {
    const { resolveStaffPexDepexChannel } = require("../Utils/Staff/staffChannelUtils") as typeof import("../Utils/Staff/staffChannelUtils");
    return resolveStaffPexDepexChannel(guild);
  })();

  if (highestStaffExPm) {
    const idSnap = identityFromMember(member);
    await appendStaffRolesHistoryEntry(guild.id, member.id, {
      oldRole: highestStaffExPm.id,
      newRole: String(IDs.roles?.Member || ""),
      reason: "Dimissioni (Esce dal server)",
      date: new Date(),
      kind: "depex",
      displayName: idSnap.displayName,
      username: idSnap.username,
      avatarUrl: idSnap.avatarUrl,
    });
    if (resignChannel?.isTextBased?.()) {
      const content = buildStaffLeaveResignationContent(member, highestStaffExPm, userRoleLabel);
      await resignChannel.send({ content, __skipNoticeEmbed: true }).catch(() => null);
    }
  }
  if (hasPm) {
    const idSnap = identityFromMember(member);
    await appendStaffRolesHistoryEntry(guild.id, member.id, {
      oldRole: PARTNER_MANAGER_ROLE_ID,
      newRole: String(IDs.roles?.Member || ""),
      reason: "Dimissioni (Esce dal server)",
      date: new Date(),
      kind: "depex",
      displayName: idSnap.displayName,
      username: idSnap.username,
      avatarUrl: idSnap.avatarUrl,
    });
    if (resignChannel?.isTextBased?.()) {
      const contentPm = buildStaffLeaveResignationContent(
        member,
        pmRole || { id: PARTNER_MANAGER_ROLE_ID, name: pmLabel },
        userRoleLabel,
      );
      await resignChannel.send({ content: contentPm, __skipNoticeEmbed: true }).catch(() => null);
    }
  }

  // Persist leave depex into retention immediately so leave-cleanup replaceOne cannot drop it.
  try {
    const { archiveStaffRolesHistoryThenUnsetStaff } = require("../Utils/Staff/staffDocUtils") as typeof import("../Utils/Staff/staffDocUtils");
    await archiveStaffRolesHistoryThenUnsetStaff(guild.id, member.id);
  } catch (err) {
    global.logger?.warn?.(
      "[guildMemberRemove] archive leave depex to retention:",
      member.id,
      err?.message || err,
    );
  }
}

async function handlePmStaffPartnershipWipeOnLeave(member?, client?) {
  const guild = member?.guild;
  if (!guild?.id || String(guild.id) !== String(MAIN_GUILD_ID)) return;
  if (!PARTNER_MANAGER_ROLE_ID || !member.roles?.cache?.has(PARTNER_MANAGER_ROLE_ID)) return;

  const { deletePartnershipsForPmStaffLeave } = require("../Services/Partner/tenantPartnershipDeleteService") as typeof import("../Services/Partner/tenantPartnershipDeleteService");
  const removed = await deletePartnershipsForPmStaffLeave(
    guild,
    member.id,
    client || member.client,
  ).catch((err?) => {
    global.logger?.warn?.(
      "[guildMemberRemove] deletePartnershipsForPmStaffLeave:",
      err?.message || err,
    );
    return 0;
  });
  if (removed > 0) {
    global.logger?.info?.(
      `[guildMemberRemove] PM ${member.id} leave: rimosse ${removed} partnership dal main.`,
    );
  }
}

async function sendRejoinDm(member?) {
  const dmChannel = await member.user.createDM().catch(() => null);
  if (!dmChannel) return;

  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Rientra nel server").setStyle(ButtonStyle.Link).setURL(IDs.links.invite),);
  const embed = new EmbedBuilder()
    .setColor("#ff6b6b")
    .setTitle("Sei uscito dal server")
    .setDescription(
      "Puoi rientrare quando vuoi con il pulsante qui sotto.",
    );

  await dmChannel
    .send({
      embeds: [embed],
      components: [row],
    })
    .catch((error?) => {
      if (![50007, 50278].includes(error?.code)) {
        global.logger.error(error);
      }
    });
}

async function handlePartnershipOnLeave(member?, client?) {
  const mainGuildId = IDs.guilds.main;
  const partnerships = await ActivityUserProfile.find({
    guildId: mainGuildId,
    $or: [
      { "staff.managerId": member.id },
      { "staff.partnerActions.managerId": member.id },
    ],
  }).catch(() => []);

  if (!partnerships.length) return;

  try {
    const mainGuild = await getClientGuildCached(client, mainGuildId);
    if (!mainGuild) return;

    await sendRejoinDm(member);
  } catch (err) {
    global.logger.error(err);
  }
}

async function sendMemberKickLog(member?) {
  const guild = member?.guild;
  const targetId = String(member?.user?.id || "");
  if (!guild || !targetId) return false;
  const recentJoinGateKick = consumeRecentJoinGateKick(guild.id, targetId);
  if (recentJoinGateKick) return false;

  if (
    !guild.members.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return false;
  }

  let entry = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      entry =
        logs.entries.find((item?) => {
          const created = Number(item?.createdTimestamp || 0);
          return (
            created > 0 &&
            now - created <= AUDIT_LOOKBACK_MS &&
            String(item?.target?.id || "") === targetId
          );
        }) || null;
    }
    if (entry) break;
    if (attempt < 2) await sleep(700);
  }
  if (!entry) return false;
  const executorId = String(entry?.executor?.id || "");
  const botUserId = String(guild?.members?.me?.id || guild?.client?.user?.id || "");
  const reasonText = String(entry?.reason || "").trim().toLowerCase();
  const isJoinGateKickByBot = botUserId && executorId && executorId === botUserId && JOIN_GATE_KICK_REASON_PATTERNS.some((value?) => reasonText.includes(value));
  if (isJoinGateKickByBot) return false;

  const logChannel = await getGuildChannelCached(guild, IDs.channels.modLogs);
  if (!logChannel?.isTextBased?.()) return true;

  const responsible = formatActor(entry.executor);
  const nowTs = Math.floor(Date.now() / 1000);
  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("<:VC_User:1482527453586002103> Membro Kickato")
    .setDescription([`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
    `<:VC_User:1482527453586002103> **Utente:** ${member.user}\`${member.user.id}\``,
    `<:VC_Clock:1473359204189474886> <t:${nowTs}:F>`,
    entry.reason ? `<:VC_reason:1478517122929004544> **Motivo:** ${entry.reason}` : null,
    ...buildAuditExtraLines(entry, ["reason"]),
    ]
      .filter(Boolean)
      .join("\n"));

  await logChannel.send({ embeds: [embed] }).catch((err?) => {
    global.logger.error("[guildMemberRemove] Failed to send kick log:", err);
  });
  await antiNukeHandleKickBanAction({
    guild,
    executorId,
    action: "kick",
    targetId,
  });
  return true;
}

async function resolveLeaveRolesHistoryRetention(gid?, uid?, doc?) {
  const fromDoc = Array.isArray(doc?.staffRolesHistoryRetention)
    ? doc.staffRolesHistoryRetention.filter(Boolean)
    : [];
  const fromLiveHist = Array.isArray(doc?.staff?.rolesHistory)
    ? doc.staff.rolesHistory.filter(Boolean)
    : [];
  let rolesHistoryRetention = fromDoc.concat(fromLiveHist);
  let backupPurgeAt = null;
  if (!rolesHistoryRetention.length) {
    // organicoLeaveRetain2: leave cleanup can race and see empty retention while UserLeaveBackup
    // still holds the career (pex/depex/dimissioni) snapped moments earlier.
    const bak = await UserLeaveBackup.findOne({ guildId: gid, userId: uid })
      .select("backupDoc.staffRolesHistoryRetention backupDoc.staff.rolesHistory backupDoc.staffPendingPurgeAt")
      .lean()
      .catch(() => null);
    const fromBakRet = Array.isArray(bak?.backupDoc?.staffRolesHistoryRetention)
      ? bak.backupDoc.staffRolesHistoryRetention.filter(Boolean)
      : [];
    const fromBakHist = Array.isArray(bak?.backupDoc?.staff?.rolesHistory)
      ? bak.backupDoc.staff.rolesHistory.filter(Boolean)
      : [];
    rolesHistoryRetention = fromBakRet.concat(fromBakHist);
    backupPurgeAt = bak?.backupDoc?.staffPendingPurgeAt || null;
  }
  return { rolesHistoryRetention, backupPurgeAt };
}

async function cleanupActivityUserProfileOnGuildLeave(guildId?, userId?, client?) {
  const gid = String(guildId);
  const uid = String(userId);
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .lean()
    .catch(() => null);
  if (!doc) return;

  const pendingCustomPerksCleanup = doc?.profile?.customPerksDiscordCleanup?.runAt
    ? doc.profile.customPerksDiscordCleanup
    : null;

  const staffBlock = doc.staff;
  let staffPendingPurgeAt = doc.staffPendingPurgeAt;
  const { rolesHistoryRetention, backupPurgeAt } = await resolveLeaveRolesHistoryRetention(gid, uid, doc);
  if (!staffPendingPurgeAt && backupPurgeAt) staffPendingPurgeAt = backupPurgeAt;
  const keepRolesHistoryRetention = rolesHistoryRetention.length > 0;
  const keepStaffGrace =
    Boolean(staffPendingPurgeAt) ||
    (staffBlock != null && typeof staffBlock === "object" && Object.keys(staffBlock).length > 0);

  const keepModeration =
    doc.moderation != null && typeof doc.moderation === "object";
  const keepEventWeekWinners =
    Array.isArray(doc?.profile?.totals?.exp?.event?.weekWinners) && doc.profile.totals.exp.event.weekWinners.length > 0;
  const keepCustomPerksCleanup = Boolean(pendingCustomPerksCleanup);

  if (
    !keepModeration &&
    !keepEventWeekWinners &&
    !keepStaffGrace &&
    !keepCustomPerksCleanup &&
    !keepRolesHistoryRetention
  ) {
    await ActivityUserProfile.deleteOne({ _id: doc._id }).catch(() => { });
    return;
  }

  const payload: Record<string, any> = {
    _id: doc._id,
    guildId: gid,
    userId: uid,
    updatedAt: new Date(),
  };
  if (doc.createdAt) payload.createdAt = doc.createdAt;
  if (keepModeration) payload.moderation = doc.moderation;
  if (keepStaffGrace && staffBlock) payload.staff = staffBlock;
  if (staffPendingPurgeAt) payload.staffPendingPurgeAt = staffPendingPurgeAt;
  // organicoLeaveRetain1+2: never drop pex/depex retention on leave cleanup replaceOne
  if (keepRolesHistoryRetention) payload.staffRolesHistoryRetention = rolesHistoryRetention;

  const profile: Record<string, any> = {};
  if (keepEventWeekWinners) {
    profile.totals = { exp: { event: { weekWinners: doc.profile.totals.exp.event.weekWinners } } };
  }
  if (keepCustomPerksCleanup) {
    profile.customPerksDiscordCleanup = pendingCustomPerksCleanup;
  }
  if (Object.keys(profile).length) payload.profile = profile;

  await ActivityUserProfile.collection.replaceOne({ _id: doc._id }, payload).catch(() => { });
  // Belt: if replaceOne somehow omitted retention, force it back.
  if (keepRolesHistoryRetention) {
    await ActivityUserProfile.updateOne(
      { _id: doc._id },
      { $set: { staffRolesHistoryRetention: rolesHistoryRetention } },
    ).catch(() => null);
  }
}

async function cleanupUserData(guildId?, userId?, client?) {
  const gid = String(guildId);
  const uid = String(userId);
  await Promise.allSettled([cleanupActivityUserProfileOnGuildLeave(gid, uid, client)]);
}

export = {
  name: "guildMemberRemove",
  async execute(member?, client?) {
    try {
      if (!member?.guild || !member?.user) return;

      if (member.guild?.id && !isViniliFullFeatureGuild(member.guild.id)) {
        await autoUnclaimOpenTicketsClaimedByUser(member.guild, member.id, {
          reason: "perché è uscito dal server",
        }).catch((err?) => {
          global.logger?.warn?.("[guildMemberRemove] ticket auto-unclaim on leave (tenant):", member.id, err?.message || err);
        });
        let autoCloseOnLeaveTenant = true;
        try {
          const { getTicketSettingsSync } = require("../MultiGuild/core/tenantTicketSettings") as typeof import("../MultiGuild/core/tenantTicketSettings");
          autoCloseOnLeaveTenant =
            getTicketSettingsSync(member.guild.id)?.autoCloseOnUserLeave !== false;
        } catch (_) {
          autoCloseOnLeaveTenant = true;
        }
        if (autoCloseOnLeaveTenant) {
          await closeOpenWebTicketsForMember(member, "Utente uscito dal server").catch((err?) => {
            global.logger?.warn?.(
              "[guildMemberRemove] web tickets auto-close on leave (tenant):",
              member.id,
              err?.message || err,
            );
          });
        } else {
          const {
            autoUnclaimOpenWebTicketsClaimedByUser,
            removeLeftUserFromOpenWebTickets,
          } = require("../Web/siteWebTicketsApi") as typeof import("../Web/siteWebTicketsApi");
          await autoUnclaimOpenWebTicketsClaimedByUser(member.client, member.guild.id, member.id, {
            reason: "perché è uscito dal server",
            claimerName: member.user?.globalName || member.user?.username || "",
          }).catch(() => {});
          await removeLeftUserFromOpenWebTickets(member.client, member.guild.id, member.id).catch(
            () => {},
          );
        }
        await handleTenantPartnerManagerLeave(member, client).catch((err?) => {
          global.logger?.warn?.("[guildMemberRemove] handleTenantPartnerManagerLeave:", err?.message || err);
        });
        return;
      }

      await handleMainGuildMemberRemove(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberRemove] staff access mirror:", member.id, err?.message || err);
      });
      await trackMemberLeave(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberRemove] daily member stats:", err?.message || err);
      });
      if (member?.user && !member.user.bot) {
        sponsorVerifiedRequiresMain.handleGuildMemberRemoveFromSponsor(member);
      }
      if (member?.user?.bot && member?.guild?.id) {
        if (client) queueIdsCatalogSync(client, member.guild.id, "botLeave");
      }
      if (member?.guild?.id === IDs.guilds.main) {
        if (client && memberHasStaffRole(member)) {
          scheduleStaffListRefresh(client, member.guild.id);
        }
      }

      if (
        member?.user &&
        !member.user.bot &&
        member?.guild?.id === MAIN_GUILD_ID &&
        SPONSOR_GUILD_IDS.length > 0
      ) {
        const activeClient = client || member.client;
        const inSponsorGuild = await isUserInAnySponsorGuild(activeClient, member.user.id,);
        if (inSponsorGuild) {
          const leftAt = new Date();
          const kickAt = new Date(Date.now() + REJOIN_DEADLINE_MS);
          await upsertSponsorLeaveRecord(member.user.id, leftAt, kickAt);
          const dmOk = await member.user.send({ embeds: [makeSponsorRejoinEmbed()], components: [makeSponsorRejoinRow()], }).then(() => true).catch(() => false);
          await markSponsorDmResult(member.user.id, dmOk);
        }
      }

      const guild = member.guild;
      scheduleMemberCounterRefresh(guild, { delayMs: 300, secondPassMs: 2200 });

      const activeClient = client || member.client;
      // organicoLeaveStaffBare1: record leave depex before logs/tickets/cleanup (those can throw/skip).
      await handleTrackedStaffLeave(member).catch((err?) => {
        global.logger?.warn?.(
          "[guildMemberRemove] handleTrackedStaffLeave:",
          member.id,
          err?.message || err,
        );
      });

      await sendLeaveLog(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberRemove] sendLeaveLog:", member.id, err?.message || err);
      });
      const wasKicked = await sendMemberKickLog(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberRemove] sendMemberKickLog:", member.id, err?.message || err);
        return false;
      });
      await markInviteInactive(member).catch(() => {});

      let autoCloseOnLeave = true;
      try {
        const { getTicketSettingsSync } = require("../MultiGuild/core/tenantTicketSettings") as typeof import("../MultiGuild/core/tenantTicketSettings");
        autoCloseOnLeave = getTicketSettingsSync(guild.id)?.autoCloseOnUserLeave !== false;
      } catch (_) {
        autoCloseOnLeave = true;
      }
      const leaveCloseReason = wasKicked
        ? "Utente kickato dal server"
        : "Utente uscito dal server";
      if (autoCloseOnLeave) {
        await closeOpenTicketsForMember(member, leaveCloseReason).catch((err?) => {
          global.logger?.warn?.(
            "[guildMemberRemove] tickets auto-close on leave:",
            member.id,
            err?.message || err,
          );
        });
        await closeOpenWebTicketsForMember(member, leaveCloseReason).catch((err?) => {
          global.logger?.warn?.(
            "[guildMemberRemove] web tickets auto-close on leave:",
            member.id,
            err?.message || err,
          );
        });
      } else {
        const {
          autoUnclaimOpenWebTicketsClaimedByUser,
          removeLeftUserFromOpenWebTickets,
        } = require("../Web/siteWebTicketsApi") as typeof import("../Web/siteWebTicketsApi");
        await autoUnclaimOpenWebTicketsClaimedByUser(member.client, member.guild.id, member.id, {
          reason: wasKicked
            ? "perché è stato kickato dal server"
            : "perché è uscito dal server",
          claimerName: member.user?.globalName || member.user?.username || "",
        }).catch(() => {});
        await removeLeftUserFromOpenWebTickets(member.client, member.guild.id, member.id).catch(
          () => {},
        );
      }
      await autoUnclaimOpenTicketsClaimedByUser(member.guild, member.id, {
        reason: wasKicked ? "perché è stato kickato dal server" : "perché è uscito dal server",
      }).catch((err?) => {
        global.logger?.warn?.("[guildMemberRemove] ticket auto-unclaim on leave:", member.id, err?.message || err);
      });
      try {
        require("../Web/siteReviewsApi").scheduleExStaffReviewsPurge(client || member.client);
      } catch (_) {}
      await handlePmStaffPartnershipWipeOnLeave(member, activeClient).catch((err?) => {
        global.logger?.warn?.(
          "[guildMemberRemove] PM partnership wipe:",
          err?.message || err,
        );
      });
      await cancelOpenPausesOnMemberLeave(member.guild, member.id, {
        client: activeClient,
        reason: "Uscita dal server",
      }).catch((err?) => {
        global.logger?.warn?.("[guildMemberRemove] cancel pauses:", err?.message || err);
      });
      try {
        const { cancelPendingPauseWorkflowForUser, cancelPendingResocontiWorkflowForUser } = require("../Web/siteStaffWorkflowStore") as typeof import("../Web/siteStaffWorkflowStore");
        await cancelPendingPauseWorkflowForUser(member.guild.id, member.id, {
          statusLabel: "Annullato (uscita)",
          decidedBy: "system",
        });
        await cancelPendingResocontiWorkflowForUser(member.guild.id, member.id, {
          statusLabel: "Annullato (uscita)",
          decidedBy: "system",
        });
      } catch (err) {
        global.logger?.warn?.("[guildMemberRemove] cancel pending workflows on leave:", member.id, err?.message || err);
      }
      await handlePartnershipOnLeave(member, client);
      await handleTenantPartnerManagerLeave(member, client);
      await handleMuteMirrorOnMemberLeave(member).catch(() => null);
      await backupUserOnLeave(guild.id, member.id, member);
      if (!member.user.bot && String(guild.id) === String(MAIN_GUILD_ID)) {
        await enqueueCustomPerksDiscordCleanupAfterLeave(guild.id, member.id).catch(() => {});
        await purgeLeftMemberCustomPerksFromDiscord(guild, member.id, { source: "guildMemberRemove" }).catch((err?) => {
          global.logger?.warn?.("[guildMemberRemove] custom role discord purge:", member.id, err?.message || err);
        });
      }
      await cleanupUserData(guild.id, member.id, activeClient);
      /* leaveProfileLive1: drop site profile caches + WS so open community/staff tabs clear now */
      try {
        const {
          broadcastSiteMemberLeft,
          broadcastSiteLiveStatsChangedDebounced,
        } = require("../Web/siteSuggestionsBroadcast") as typeof import("../Web/siteSuggestionsBroadcast");
        broadcastSiteMemberLeft(member.id, guild.id);
        broadcastSiteLiveStatsChangedDebounced();
      } catch (err) {
        global.logger?.warn?.("[guildMemberRemove] site profile leave broadcast:", member.id, err?.message || err);
      }
      void runCleanupAfterMemberLeave(activeClient, guild).catch((err?) => {
        global.logger?.warn?.("[guildMemberRemove] cleanup not-in-server:", err?.message || err);
      });
    } catch (err) {
      global.logger?.error?.("[guildMemberRemove] failed:", err);
    }
  },
};