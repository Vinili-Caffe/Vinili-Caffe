const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, PermissionsBitField, } = require("discord.js");
const Staff = require("../Schemas/Staff/staffSchema");
const Ticket = require("../Schemas/Ticket/ticketSchema");
const SponsorMainLeave = require("../Schemas/Tags/tagsSchema");
const { createTranscript, createTranscriptHtml, saveTranscriptHtml, } = require("../Utils/Ticket/transcriptUtils");
const { buildTicketClosedEmbed, sendTranscriptWithBrowserLink } = require("../Utils/Ticket/ticketCloseRuntime");
const { getNextTicketId } = require("../Utils/Ticket/ticketIdUtils");
const {
  InviteTrack,
  ExpUser,
  ActivityUser,
  LevelHistoryUser,
  ActivityDaily,
  ActivityDailyCompact,
  ActivityHourly,
  ActivityHourlyCompact,
  VoteRole,
  VerificationTenure,
  InviteReminderState,
  ActivityEventReward,
  EventUserExpSnapshot,
  EventWeekWinner,
  StaffEventPoints,
  StaffEventWeeklyReward,
  StaffEventRewardGiven,
  CustomRole,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
} = require("../Schemas/Community/communitySchemas");
const { MinigameUser } = require("../Schemas/Minigames/minigameSchema");
const AFK = require("../Schemas/Afk/afkSchema");
const { MentionReaction } = require("../Schemas/Community/autoInteractionSchemas");
const { RolePersistUser } = require("../Schemas/Moderation/rolePersistSchema");
const { ModCaseUser } = require("../Schemas/Moderation/moderationSchemas");
const TemporaryRoleGrant = require("../Schemas/Moderation/temporaryRoleGrantSchema");
const TemporaryCommandPermission = require("../Schemas/Moderation/temporaryCommandPermissionSchema");
const SupporterStatus = require("../Schemas/Supporter/supporterStatusSchema");
const VoiceDisconnectCounter = require("../Schemas/Voice/voiceDisconnectCounterSchema");
const SuspiciousAccount = require("../Schemas/Moderation/suspiciousAccountSchema");
const BirthdayProfile = require("../Schemas/Community/birthdayProfileSchema");
const NoDmPreference = require("../Schemas/Community/noDmPreferenceSchema");
const BumpVoteReward = require("../Schemas/Bump/bumpVoteRewardSchema");
const { DiscadiaVoter } = require("../Schemas/Discadia/discadiaSchemas");
const OneTimeReminder = require("../Schemas/Reminders/oneTimeReminderSchema");
const OneTimeReminderUser = require("../Schemas/Reminders/oneTimeReminderUserSchema");
const AutoModBadUser = require("../Schemas/Moderation/autoModBadUserSchema");
const IDs = require("../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, getClientGuildCached, getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { scheduleStaffListRefresh, memberHasStaffRole, } = require("../Utils/Community/staffListUtils");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { handleKickBanAction: antiNukeHandleKickBanAction } = require("../Services/Moderation/antiNukeService");
const { consumeRecentJoinGateKick } = require("../Utils/Moderation/joinGateKickCache");
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const STAFF_TRACKED_ROLE_IDS = new Set([IDs.roles.PartnerManager, IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.Coordinator, IDs.roles.Supervisor, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.CoFounder, IDs.roles.Founder,]);
const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;
const ARROW = "<:VC_right_arrow:1482459908245815296>";
const MAIN_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const SPONSOR_GUILD_IDS = IDs.guilds?.sponsorGuildIds || [];
const OFFICIAL_INVITE_URL = "https://discord.gg/viniliecaffe";
const REJOIN_DEADLINE_MS = 24 * 60 * 60 * 1000;
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
  await SponsorMainLeave.updateOne(
    { userId },
    { $set: { userId, leftAt, kickAt, dmSent: false, dmFailed: false } },
    { upsert: true },
  ).catch(() => { });
}

async function markSponsorDmResult(userId, dmOk) {
  await SponsorMainLeave.updateOne(
    { userId },
    { $set: dmOk ? { dmSent: true } : { dmFailed: true } },
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
    .setTitle("Member Left")
    .setDescription([`${member.user} ${member.user.tag}.`, ""].join("\n"))
    .setFooter({ text: `ID: ${member.user.id}` })
    .setTimestamp()
    .setThumbnail(member.user.displayAvatarURL({ extension: "png", size: 256 }));

  await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger.error("[guildMemberRemove] Failed to send leave log:", err);
  });
}

async function markInviteInactive(member) {
  await InviteTrack.findOneAndUpdate(
    { guildId: member.guild.id, userId: member.id, active: true },
    { $set: { active: false, leftAt: new Date() } },
  ).catch(() => { });
}

async function closeOpenTicketsForMember(member) {
  const guild = member.guild;
  const client = member.client;
  const openTickets = await Ticket.find({ userId: member.id, open: true, guildId: guild.id }).catch(() => []);
  if (!openTickets.length) return;

  const centralTicketLogChannelId = IDs.channels.ticketLogs || "1442569290682208296";
  let logChannel = client.channels.cache.get(centralTicketLogChannelId) ||
    (await getClientChannelCached(client, centralTicketLogChannelId)) ||
    (await client.channels.fetch(centralTicketLogChannelId).catch(() => null));
  if (!logChannel?.isTextBased?.()) logChannel = null;

  for (const ticket of openTickets) {
    const ticketGuild = String(ticket.guildId || "") === String(guild.id) ? guild : await client.guilds.fetch(ticket.guildId).catch(() => null);
    let channel = ticketGuild ? ticketGuild.channels.cache.get(ticket.channelId) || (await ticketGuild.channels.fetch(ticket.channelId).catch(() => null)) : null;
    if (!channel) channel = client.channels.cache.get(ticket.channelId) || (await client.channels.fetch(ticket.channelId).catch(() => null));

    let transcriptTXT = "";
    let transcriptHtmlPath = null;
    if (channel) {
      transcriptTXT = await createTranscript(channel).catch(() => "");
      const transcriptHTML = await createTranscriptHtml(channel).catch(() => "");
      transcriptHtmlPath = transcriptHTML ? await saveTranscriptHtml(channel, transcriptHTML).catch(() => null) : null;
    }

    let ticketNumber = Number(ticket.ticketNumber || 0);
    if (!ticketNumber) ticketNumber = await getNextTicketId();

    await Ticket.updateOne(
      { _id: ticket._id },
      {
        $set: {
          open: false,
          ticketNumber,
          transcript: transcriptTXT,
          transcriptHtmlPath: transcriptHtmlPath || null,
          closeReason: "Utente uscito dal server",
          closedAt: new Date(),
          closedBy: member.client.user?.id || null,
        },
      },
    ).catch(() => { });

    const ticketAfter = await Ticket.findById(ticket._id).lean().catch(() => null);
    if (logChannel?.isTextBased?.()) {
      const closeEmbedData = {
        ...(ticketAfter || ticket.toObject?.() || {}),
        ticketNumber,
        closeReason: "Utente uscito dal server",
        closedBy: member.client.user?.id || null,
        closedAt: new Date(),
        guildName: ticketGuild?.name || guild?.name || "Ticket System",
        guildIconURL: ticketGuild?.iconURL?.({ size: 128 }) || guild?.iconURL?.({ size: 128 }) || null,
      };
      const closeEmbed = buildTicketClosedEmbed(closeEmbedData);
      const transcriptRows = transcriptHtmlPath
        ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket_transcript:${ticket._id}`).setLabel("Visualizza Trascrizione").setStyle(ButtonStyle.Secondary).setEmoji("<:VC_file:1478515880722698300>"))]
        : [];
      const logSentMessage = await sendTranscriptWithBrowserLink(logChannel, { embeds: [closeEmbed] }, false, transcriptRows).catch(() => null);
      if (logSentMessage?.id && logChannel?.id) {
        await Ticket.updateOne(
          { _id: ticket._id },
          { $set: { closeLogChannelId: logChannel.id, closeLogMessageId: logSentMessage.id } },
        ).catch(() => { });
      }
    }

    if (channel) {
      const channelDeleteTimer = setTimeout(() => channel.delete().catch(() => { }), 1500);
      channelDeleteTimer.unref?.();
    }
  }
}

function getHighestTrackedRole(member) {
  return member.roles.cache
    .filter((role) => STAFF_TRACKED_ROLE_IDS.has(role.id))
    .sort((a, b) => b.position - a.position)
    .first();
}

async function handleTrackedStaffLeave(member) {
  const guild = member.guild;
  const result = await Staff.deleteOne({ guildId: guild.id, userId: member.id }).catch(() => ({ deletedCount: 0 }));
  if (result?.deletedCount === 0) return;

  const resignChannel = guild.channels.cache.get(IDs.channels.pexDepex) || (await getGuildChannelCached(guild, IDs.channels.pexDepex)) || (await getClientChannelCached(member.client, IDs.channels.pexDepex));
  if (resignChannel?.isTextBased?.()) {
    const highestTrackedRole = member.roles?.cache ? getHighestTrackedRole(member) : null;
    const roleLabel = highestTrackedRole?.name || "Staff/PM";
    const userRole = guild.roles.cache.get(IDs.roles.Member);
    const userRoleLabel = userRole?.name || "User";
    const content = `**<a:laydowntorest:1444006796661358673> DEPEX** ${member.user}<:member_role_icon:1330530086792728618>\`${roleLabel}\` <a:vegarightarrow:1443673039156936837> \`${userRoleLabel}\`
<:discordstaff:1443651872258003005> __Dimissioni (Esce dal server)__`;
    await resignChannel.send({ content }).catch(() => { });
  }
}

async function sendRejoinDm(member) {
  const dmChannel = await member.user.createDM().catch(() => null);
  if (!dmChannel) return;

  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Rientra nel server").setStyle(ButtonStyle.Link).setURL(IDs.links.invite),);

  await dmChannel
    .send({
      content:
        "<:vegax:1443934876440068179> Sei uscito dal server! Rientra entro 5 minuti per non perdere la tua partnership.",
      components: [row],
    })
    .catch((error) => {
      if (![50007, 50278].includes(error?.code)) {
        global.logger.error(error);
      }
    });
}

function schedulePartnershipRollback(member, partnerships) {
  const guild = member.guild;
  const rollbackTimer = setTimeout(
    async () => {
      const stillInGuild = await getGuildMemberCached(guild, member.id);
      if (stillInGuild) return;

      for (const doc of partnerships) {
        const actions = Array.isArray(doc.partnerActions) ? doc.partnerActions : [];
        const toRollback = actions.filter((action) => action?.managerId === member.id,);

        for (const action of toRollback) {
          const channelId = action?.partnershipChannelId || IDs.channels.partnerships;
          const channel = await getGuildChannelCached(guild, channelId);
          if (!channel?.isTextBased?.()) continue;

          const messageIds = Array.isArray(action?.partnerMessageIds) ? action.partnerMessageIds : [];
          for (const messageId of messageIds) {
            if (!messageId) continue;
            const msg = await channel.messages.fetch(messageId).catch(() => null);
            if (msg) await msg.delete().catch(() => { });
          }
        }

        if (toRollback.length > 0) {
          doc.partnerActions = actions.filter(
            (action) => action?.managerId !== member.id,
          );
        }
        doc.managerId = null;
        await doc.save().catch(() => { });
      }
    },
    5 * 60 * 1000,
  );
  rollbackTimer.unref?.();
}

async function handlePartnershipOnLeave(member, client) {
  const mainGuildId = IDs.guilds.main;
  const partnerships = await Staff.find({ guildId: mainGuildId, $or: [{ managerId: member.id }, { "partnerActions.managerId": member.id }], }).catch(() => []);

  if (!partnerships.length) return;

  try {
    const mainGuild = await getClientGuildCached(client, mainGuildId);
    if (!mainGuild) return;

    await sendRejoinDm(member);
    schedulePartnershipRollback(member, partnerships);
  } catch (err) {
    global.logger.error(err);
  }
}

async function sendMemberKickLog(member) {
  const guild = member?.guild;
  const targetId = String(member?.user?.id || "");
  if (!guild || !targetId) return;
  const recentJoinGateKick = consumeRecentJoinGateKick(guild.id, targetId);
  if (recentJoinGateKick) return;

  if (
    !guild.members.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return;
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
  if (!entry) return;
  const executorId = String(entry?.executor?.id || "");
  const botUserId = String(guild?.members?.me?.id || guild?.client?.user?.id || "");
  const reasonText = String(entry?.reason || "").trim().toLowerCase();
  const isJoinGateKickByBot = botUserId && executorId && executorId === botUserId && JOIN_GATE_KICK_REASON_PATTERNS.some((value) => reasonText.includes(value));
  if (isJoinGateKickByBot) return;

  const logChannel = await getGuildChannelCached(guild, IDs.channels.modLogs);
  if (!logChannel?.isTextBased?.()) return;

  const responsible = formatActor(entry.executor);
  const nowTs = Math.floor(Date.now() / 1000);
  const embed = new EmbedBuilder()
  .setColor("#ED4245")
  .setTitle("Member Kick")
  .setDescription([`${ARROW} **Responsible:** ${responsible}`,
    `${ARROW} **Target:** ${member.user}\`${member.user.id}\``,
    `${ARROW} <t:${nowTs}:F>`,
    entry.reason ? `${ARROW} **Reason:** ${entry.reason}` : null,
    ...buildAuditExtraLines(entry, ["reason"]),
  ]
    .filter(Boolean)
    .join("\n"));

  await logChannel.send({ embeds: [embed] }).catch(() => { });
  await antiNukeHandleKickBanAction({
    guild,
    executorId,
    action: "kick",
    targetId,
  });
}
async function cleanupUserData(guildId, userId) {
  const dailyMode = String(process.env.ACTIVITY_DAILY_STORAGE_MODE || "dual").trim().toLowerCase();
  const hourlyMode = String(process.env.ACTIVITY_HOURLY_STORAGE_MODE || "dual").trim().toLowerCase();
  const useLegacyActivityDaily = dailyMode === "legacy" || dailyMode === "dual";
  const useLegacyActivityHourly = hourlyMode === "legacy" || hourlyMode === "dual";
  const compactDocs = await ActivityDailyCompact.find({ guildId })
    .select("_id users")
    .lean()
    .catch(() => []);
  const compactOps = [];
  const compactHourlyDocs = await ActivityHourlyCompact.find({ guildId })
    .select("_id users")
    .lean()
    .catch(() => []);
  const compactHourlyOps = [];
  for (const row of compactDocs) {
    const users = row?.users && typeof row.users === "object" ? row.users : {};
    if (!Object.prototype.hasOwnProperty.call(users, String(userId))) continue;
    compactOps.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $unset: { [`users.${String(userId)}`]: 1 } },
      },
    });
  }
  for (const row of compactHourlyDocs) {
    const users = row?.users && typeof row.users === "object" ? row.users : {};
    if (!Object.prototype.hasOwnProperty.call(users, String(userId))) continue;
    compactHourlyOps.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $unset: { [`users.${String(userId)}`]: 1 } },
      },
    });
  }
  await Promise.allSettled([
    ExpUser.deleteOne({ guildId, userId }),
    ActivityUser.deleteOne({ guildId, userId }),
    useLegacyActivityDaily ? ActivityDaily.deleteMany({ guildId, userId }) : Promise.resolve(),
    compactOps.length ? ActivityDailyCompact.bulkWrite(compactOps, { ordered: false }) : Promise.resolve(),
    useLegacyActivityHourly ? ActivityHourly.deleteMany({ guildId, userId }) : Promise.resolve(),
    compactHourlyOps.length ? ActivityHourlyCompact.bulkWrite(compactHourlyOps, { ordered: false }) : Promise.resolve(),
    LevelHistoryUser.deleteOne({ guildId, userId }),
    MinigameUser.deleteOne({ guildId, userId }),
    AFK.deleteOne({ guildId, userId }),
    MentionReaction.deleteOne({ guildId, userId }),
    RolePersistUser.deleteOne({ guildId, userId }),
    ModCaseUser.deleteOne({ guildId, userId }),
    TemporaryRoleGrant.deleteMany({ guildId, userId }),
    TemporaryCommandPermission.deleteMany({ guildId, userId }),
    SupporterStatus.deleteOne({ guildId, userId }),
    VoiceDisconnectCounter.deleteOne({ guildId, userId }),
    Staff.deleteOne({ guildId, userId }),
    SuspiciousAccount.deleteMany({ guildId, userId }),
    BirthdayProfile.deleteOne({ guildId, userId }),
    NoDmPreference.deleteOne({ guildId, userId }),
    BumpVoteReward.deleteMany({ guildId, userId }),
    DiscadiaVoter.deleteOne({ guildId, userId }),
    VoteRole.deleteOne({ guildId, userId }),
    VerificationTenure.deleteOne({ guildId, userId }),
    InviteReminderState.deleteOne({ guildId, userId }),
    ActivityEventReward.deleteMany({ guildId, userId }),
    EventUserExpSnapshot.deleteOne({ guildId, userId }),
    EventWeekWinner.deleteMany({ guildId, userId }),
    StaffEventPoints.deleteOne({ guildId, userId }),
    StaffEventWeeklyReward.deleteMany({ guildId, userId }),
    StaffEventRewardGiven.deleteMany({ guildId, userId }),
    CustomRole.deleteOne({ guildId, userId }),
    AvatarPrivacy.deleteOne({ guildId, userId }),
    BannerPrivacy.deleteOne({ guildId, userId }),
    QuotePrivacy.deleteOne({ guildId, userId }),
    InviteTrack.deleteOne({ guildId, userId }),
    OneTimeReminder.deleteMany({ userId }),
    OneTimeReminderUser.deleteOne({ userId }),
    AutoModBadUser.deleteOne({ userId }),
  ]);
}

module.exports = {
  name: "guildMemberRemove",
  async execute(member, client) {
    try {
      if (!member?.guild || !member?.user) return;
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
      await sendMemberKickLog(member);
      await markInviteInactive(member);

      const guild = member.guild;

      await closeOpenTicketsForMember(member);
      await handleTrackedStaffLeave(member);
      await handlePartnershipOnLeave(member, client);
      await cleanupUserData(guild.id, member.id);
    } catch (err) {
      global.logger?.error?.("[guildMemberRemove] failed:", err);
    }
  },
};