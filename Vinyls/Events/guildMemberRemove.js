const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, PermissionsBitField, } = require("discord.js");
const { closeOpenTicketsForGuildUser } = require("../Utils/Ticket/ticketCloseRuntime");
const { autoUnclaimOpenTicketsClaimedByUser } = require("../Utils/Ticket/ticketAutoUnclaimOnStaffLoss");
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../Schemas/Community/communitySchemas");
const { sponsorMainLeave } = require("../Utils/Community/activityUserProfilePaths");
const IDs = require("../Utils/Config/ids");
const { getGuildChannelCached, getClientGuildCached } = require("../Utils/Interaction/interactionEntityCache");
const { scheduleStaffListRefresh, memberHasStaffRole, } = require("../Utils/Community/staffListUtils");
const { scheduleMemberCounterRefresh } = require("../Utils/Community/memberCounterUtils");
const { getStaffRoleEmojiByRoleId } = require("../Utils/Community/staffRoleEmoji");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { runCleanupAfterMemberLeave } = require("../Services/Community/cleanupUsersNotInServerService");
const {
  attachHogwartsRetentionMarkers,
  extractHogwartsProfileSlice,
  shouldRetainHogwartsProfileOnLeave,
} = require("../Services/Community/hogwartsLeaveRetention");
const { resolveHogwartsEventConfig } = require("../Utils/Web/hogwartsSortingConfig");
const { backupUserOnLeave } = require("../Services/Community/userLeaveBackupService");
const { handleMuteMirrorOnMemberLeave } = require("../Services/Moderation/mutedMirrorRoleService");
const {
  handleTenantPartnerManagerLeave,
} = require("../Services/Partner/partnerManagerLeaveService");
const { enqueueCustomPerksDiscordCleanupAfterLeave } = require("../Services/Community/customPerksDiscordCleanupQueueService");
const { purgeLeftMemberCustomPerksFromDiscord } = require("../Services/Community/customRoleLeftMemberDiscordCleanupService");
const sponsorVerifiedRequiresMain = require("../Services/Community/sponsorVerifiedRequiresMainService");
const { buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { handleKickBanAction: antiNukeHandleKickBanAction } = require("../Services/Moderation/antiNukeService");
const { consumeRecentJoinGateKick } = require("../Utils/Moderation/joinGateKickCache");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity");
const { trackMemberLeave } = require("../Services/Community/dailyMemberStatsService");
const { handleMainGuildMemberRemove } = require("../Services/Staff/staffAccessMirrorService");
const { cancelOpenPausesOnMemberLeave } = require("../Utils/Pause/pauseHandlersUtils");
const { appendStaffRolesHistoryEntry } = require("../Utils/Staff/staffDocUtils");
const { identityFromMember } = require("../Utils/Web/siteStaffRosterCache");

function isViniliFullFeatureGuild(guildId) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const STAFF_TRACKED_ROLE_IDS = new Set([IDs.roles.PartnerManager, IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.SeniorModerator, IDs.roles.HighStaff, IDs.roles.Director, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.Founder,]);
const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;
const MAIN_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const SPONSOR_GUILD_IDS = IDs.guilds?.sponsorGuildIds || [];
const OFFICIAL_INVITE_URL = "https://discord.gg/viniliecaffe";
const REJOIN_DEADLINE_MS = 24 * 60 * 60 * 1000;
const STAFF_DB_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const JOIN_GATE_KICK_REASON_PATTERNS = ["account is too young to be allowed", "account too young to be allowed", "unverified bot addition", "bot added by unauthorized member", "advertising invite link in username", "username matches blocked pattern", "post-join filter",];

function formatActor(actor) {
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

async function isUserInAnySponsorGuild(client, userId) {
  for (const guildId of SPONSOR_GUILD_IDS) {
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) return true;
  }
  return false;
}

async function upsertSponsorLeaveRecord(userId, leftAt, kickAt) {
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

async function markSponsorDmResult(userId, dmOk) {
  await ActivityUserProfile.updateOne(
    { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
    { $set: dmOk ? { [sponsorMainLeave("dmSent")]: true } : { [sponsorMainLeave("dmFailed")]: true } },
  ).catch(() => { });
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveGuildChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  return getGuildChannelCached(guild, channelId);
}

async function sendLeaveLog(member) {
  const channel = await resolveGuildChannel(member.guild, JOIN_LEAVE_LOG_CHANNEL_ID,);
  if (!channel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("<:VC_User:1482527453586002103> Membro Uscito")
    .setDescription([`<:VC_User:1482527453586002103> **Membro:** ${member.user} ${member.user.tag}.`, ""].join("\n"))
    .setFooter({ text: `ID: ${member.user.id}` })
    .setTimestamp()
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || null);

  await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger.error("[guildMemberRemove] Failed to send leave log:", err);
  });
}

async function markInviteInactive(member) {
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

async function closeOpenTicketsForMember(member, closeReason = "Utente uscito dal server") {
  await closeOpenTicketsForGuildUser(member.guild, member.id, {
    closeReason,
    closedBy: member.client.user?.id || null,
    deleteReason: `Ticket chiuso automaticamente: ${closeReason} (${member.id})`,
  });
}

async function closeOpenWebTicketsForMember(member, closeReason = "Utente uscito dal server") {
  const {
    closeOpenWebTicketsForGuildUser,
    autoUnclaimOpenWebTicketsClaimedByUser,
    removeLeftUserFromOpenWebTickets,
  } = require("../Utils/Web/siteWebTicketsApi");
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
  }).catch((err) => {
    global.logger?.warn?.(
      "[guildMemberRemove] web ticket auto-unclaim on leave:",
      userId,
      err?.message || err,
    );
  });
  await removeLeftUserFromOpenWebTickets(client, guildId, userId).catch((err) => {
    global.logger?.warn?.(
      "[guildMemberRemove] web ticket remove added on leave:",
      userId,
      err?.message || err,
    );
  });
}

const PARTNER_MANAGER_ROLE_ID = String(IDs.roles?.PartnerManager || "").trim();

function getHighestStaffTrackedRoleExcludingPm(member) {
  if (!member?.roles?.cache) return null;
  const pmId = PARTNER_MANAGER_ROLE_ID;
  return member.roles.cache
    .filter((role) => STAFF_TRACKED_ROLE_IDS.has(role.id) && (!pmId || role.id !== pmId))
    .sort((a, b) => b.position - a.position)
    .first();
}

const STAFF_LEAVE_FALLBACK_ROLE_EMOJI = "<:VC_Staff:1494286904089247754>";

function formatStaffRoleLeadingEmoji(role) {
  return getStaffRoleEmojiByRoleId(role?.id, STAFF_LEAVE_FALLBACK_ROLE_EMOJI);
}

function buildStaffLeaveResignationContent(member, staffRole, userRoleLabel) {
  const label = String(staffRole?.name || "Staff/PM").trim() || "Staff/PM";
  const dest = String(userRoleLabel || "User").trim() || "User";
  const lead = formatStaffRoleLeadingEmoji(staffRole);
  return `**<:cancel:1461730653677551691> DEPEX** ${member.user}
${lead}\`${label}\` <a:VC_Arrow:1482706699365257397> \`${dest}\`
<:VC_reason:1478517122929004544> __Dimissioni (Esce dal server)__`;
}

async function handleTrackedStaffLeave(member) {
  const guild = member.guild;
  const highestStaffExPm = getHighestStaffTrackedRoleExcludingPm(member);
  const hasPm = Boolean(PARTNER_MANAGER_ROLE_ID && member.roles?.cache?.has(PARTNER_MANAGER_ROLE_ID));
  if (!highestStaffExPm && !hasPm) return;

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
    const { resolveStaffPexDepexChannel } = require("../Utils/Staff/staffChannelUtils");
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
}

async function handlePmStaffPartnershipWipeOnLeave(member, client) {
  const guild = member?.guild;
  if (!guild?.id || String(guild.id) !== String(MAIN_GUILD_ID)) return;
  if (!PARTNER_MANAGER_ROLE_ID || !member.roles?.cache?.has(PARTNER_MANAGER_ROLE_ID)) return;

  const { deletePartnershipsForPmStaffLeave } = require("../Services/Partner/tenantPartnershipDeleteService");
  const removed = await deletePartnershipsForPmStaffLeave(
    guild,
    member.id,
    client || member.client,
  ).catch((err) => {
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

async function sendRejoinDm(member) {
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
    .catch((error) => {
      if (![50007, 50278].includes(error?.code)) {
        global.logger.error(error);
      }
    });
}

async function handlePartnershipOnLeave(member, client) {
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

async function sendMemberKickLog(member) {
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
        logs.entries.find((item) => {
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
  const isJoinGateKickByBot = botUserId && executorId && executorId === botUserId && JOIN_GATE_KICK_REASON_PATTERNS.some((value) => reasonText.includes(value));
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

  await logChannel.send({ embeds: [embed] }).catch((err) => {
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

async function cleanupActivityUserProfileOnGuildLeave(guildId, userId, client) {
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
  const staffPendingPurgeAt = doc.staffPendingPurgeAt;
  const keepStaffGrace =
    Boolean(staffPendingPurgeAt) ||
    (staffBlock != null && typeof staffBlock === "object" && Object.keys(staffBlock).length > 0);

  const keepModeration =
    doc.moderation != null && typeof doc.moderation === "object";
  const keepEventWeekWinners =
    Array.isArray(doc?.profile?.totals?.exp?.event?.weekWinners) && doc.profile.totals.exp.event.weekWinners.length > 0;
  const keepHogwarts = await shouldRetainHogwartsProfileOnLeave(client, doc, { guildId: gid, userId: uid });
  const keepCustomPerksCleanup = Boolean(pendingCustomPerksCleanup);

  if (!keepModeration && !keepEventWeekWinners && !keepStaffGrace && !keepHogwarts && !keepCustomPerksCleanup) {
    await ActivityUserProfile.deleteOne({ _id: doc._id }).catch(() => { });
    return;
  }

  const payload = {
    _id: doc._id,
    guildId: gid,
    userId: uid,
    updatedAt: new Date(),
  };
  if (doc.createdAt) payload.createdAt = doc.createdAt;
  if (keepModeration) payload.moderation = doc.moderation;
  if (keepStaffGrace && staffBlock) payload.staff = staffBlock;
  if (staffPendingPurgeAt) payload.staffPendingPurgeAt = staffPendingPurgeAt;

  const profile = {};
  if (keepEventWeekWinners) {
    profile.totals = { exp: { event: { weekWinners: doc.profile.totals.exp.event.weekWinners } } };
  }
  if (keepHogwarts) {
    const hogwartsSlice = extractHogwartsProfileSlice(doc);
    if (hogwartsSlice) {
      const cfg = client ? resolveHogwartsEventConfig(client) : null;
      profile.events = { hogwarts: attachHogwartsRetentionMarkers(hogwartsSlice, cfg) };
    }
  }
  if (keepCustomPerksCleanup) {
    profile.customPerksDiscordCleanup = pendingCustomPerksCleanup;
  }
  if (Object.keys(profile).length) payload.profile = profile;

  await ActivityUserProfile.collection.replaceOne({ _id: doc._id }, payload).catch(() => { });
}

async function cleanupUserData(guildId, userId, client) {
  const gid = String(guildId);
  const uid = String(userId);
  await Promise.allSettled([cleanupActivityUserProfileOnGuildLeave(gid, uid, client)]);
}

module.exports = {
  name: "guildMemberRemove",
  async execute(member, client) {
    try {
      if (!member?.guild || !member?.user) return;

      if (member.guild?.id && !isViniliFullFeatureGuild(member.guild.id)) {
        await autoUnclaimOpenTicketsClaimedByUser(member.guild, member.id, {
          reason: "perché è uscito dal server",
        }).catch((err) => {
          global.logger?.warn?.("[guildMemberRemove] ticket auto-unclaim on leave (tenant):", member.id, err?.message || err);
        });
        let autoCloseOnLeaveTenant = true;
        try {
          const { getTicketSettingsSync } = require("../MultiGuild/core/tenantTicketSettings");
          autoCloseOnLeaveTenant =
            getTicketSettingsSync(member.guild.id)?.autoCloseOnUserLeave !== false;
        } catch (_) {
          autoCloseOnLeaveTenant = true;
        }
        if (autoCloseOnLeaveTenant) {
          await closeOpenWebTicketsForMember(member, "Utente uscito dal server").catch((err) => {
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
          } = require("../Utils/Web/siteWebTicketsApi");
          await autoUnclaimOpenWebTicketsClaimedByUser(member.client, member.guild.id, member.id, {
            reason: "perché è uscito dal server",
            claimerName: member.user?.globalName || member.user?.username || "",
          }).catch(() => {});
          await removeLeftUserFromOpenWebTickets(member.client, member.guild.id, member.id).catch(
            () => {},
          );
        }
        await handleTenantPartnerManagerLeave(member, client).catch((err) => {
          global.logger?.warn?.("[guildMemberRemove] handleTenantPartnerManagerLeave:", err?.message || err);
        });
        return;
      }

      await handleMainGuildMemberRemove(member).catch((err) => {
        global.logger?.warn?.("[guildMemberRemove] staff access mirror:", member.id, err?.message || err);
      });
      await trackMemberLeave(member).catch((err) => {
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

      await sendLeaveLog(member);
      const wasKicked = await sendMemberKickLog(member);
      await markInviteInactive(member);

      const guild = member.guild;
      scheduleMemberCounterRefresh(guild, { delayMs: 300, secondPassMs: 2200 });

      let autoCloseOnLeave = true;
      try {
        const { getTicketSettingsSync } = require("../MultiGuild/core/tenantTicketSettings");
        autoCloseOnLeave = getTicketSettingsSync(guild.id)?.autoCloseOnUserLeave !== false;
      } catch (_) {
        autoCloseOnLeave = true;
      }
      const leaveCloseReason = wasKicked
        ? "Utente kickato dal server"
        : "Utente uscito dal server";
      if (autoCloseOnLeave) {
        await closeOpenTicketsForMember(member, leaveCloseReason);
        await closeOpenWebTicketsForMember(member, leaveCloseReason).catch((err) => {
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
        } = require("../Utils/Web/siteWebTicketsApi");
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
      }).catch((err) => {
        global.logger?.warn?.("[guildMemberRemove] ticket auto-unclaim on leave:", member.id, err?.message || err);
      });
      const activeClient = client || member.client;
      await handleTrackedStaffLeave(member);
      await handlePmStaffPartnershipWipeOnLeave(member, activeClient).catch((err) => {
        global.logger?.warn?.(
          "[guildMemberRemove] PM partnership wipe:",
          err?.message || err,
        );
      });
      await cancelOpenPausesOnMemberLeave(member.guild, member.id, {
        client: activeClient,
        reason: "Uscita dal server",
      }).catch((err) => {
        global.logger?.warn?.("[guildMemberRemove] cancel pauses:", err?.message || err);
      });
      try {
        const { cancelPendingPauseWorkflowForUser, cancelPendingResocontiWorkflowForUser } = require("../Utils/Web/siteStaffWorkflowStore");
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
        await purgeLeftMemberCustomPerksFromDiscord(guild, member.id, { source: "guildMemberRemove" }).catch((err) => {
          global.logger?.warn?.("[guildMemberRemove] custom role discord purge:", member.id, err?.message || err);
        });
      }
      await cleanupUserData(guild.id, member.id, activeClient);
      void runCleanupAfterMemberLeave(activeClient, guild).catch((err) => {
        global.logger?.warn?.("[guildMemberRemove] cleanup not-in-server:", err?.message || err);
      });
    } catch (err) {
      global.logger?.error?.("[guildMemberRemove] failed:", err);
    }
  },
};