/** Ingresso membri: bot aggiunti al server (ruoli, log, chi li ha aggiunti). */
const { EmbedBuilder, PermissionsBitField, AuditLogEvent, UserFlagsBitField, MessageFlags } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { queueIdsCatalogSync } = require("../../Config/idsAutoSync") as typeof import("../../Config/idsAutoSync");
const { registerJoinRaidSecuritySignal } = require("../../Moderation/services/joinRaidService") as typeof import("../../Moderation/services/joinRaidService");
const { getJoinGateConfigSnapshot } = require("../../Moderation/services/joinGateService") as typeof import("../../Moderation/services/joinGateService");
const { resolveJoinGateConfiguredExempt } = require("../../Moderation/services/joinGateExemptUtils") as typeof import("../../Moderation/services/joinGateExemptUtils");
const { markJoinGateKick } = require("../../Moderation/utils/joinGateKickCache") as typeof import("../../Moderation/utils/joinGateKickCache");
const { createModCase, getModConfig, logModCase } = require("../../Moderation/utils/moderation") as typeof import("../../Moderation/utils/moderation");
const { buildUnbanRequestRow } = require("../../Moderation/utils/unbanRequestButton") as typeof import("../../Moderation/utils/unbanRequestButton");
const { enforceUntrustedBotMember, punishMemberForBotAbuse, buildTrustedBotIdSet, isDiscordOfficialActor } = require("../../Moderation/services/trustedBotGuardService") as typeof import("../../Moderation/services/trustedBotGuardService");
const { addRolesAndGetMember, getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { refreshWelcomeContextForGuild } = require("../../Community/services/officialMessageCommunityHandlers") as typeof import("../../Community/services/officialMessageCommunityHandlers");
const { guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { formatInviteCountIt, formatInviteLinkForJoinMessage, resolveGuildChannel, resolveInviteInfo } = require("../../Community/events/joinInvites") as typeof import("../../Community/events/joinInvites");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const INVITE_LOG_CHANNEL_ID = IDs.channels.chat;
const JOIN_GATE_WHITELIST_ROLE_IDS = new Set([IDs.roles.Founder].filter(Boolean).map(String),);
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
/** Evita doppio benvenuto se guildMemberAdd e deferred (guildMemberUpdate) partono insieme. */
const welcomeSendInflight = new Set();

function formatActor(actor?) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

async function addBotRoles(member?) {
  const roleIds = [IDs.roles.Bots].filter(Boolean);
  if (!roleIds.length) return;
  const me = member.guild.members.me;

  if (!me) {
    global.logger.warn(
      "[guildMemberAdd] Bot member not cached; cannot add bot roles.",
    );
    return;
  }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    global.logger.warn(
      "[guildMemberAdd] Missing Manage Roles permission; cannot add bot roles.",
    );
    return;
  }

  const roles = roleIds.map((id?) => member.guild.roles.cache.get(id)).filter(Boolean);

  const missingRoles = roleIds.filter((id?) => !member.guild.roles.cache.has(id),);
  if (missingRoles.length) {
    global.logger.warn(
      "[guildMemberAdd] Some bot roles not found:",
      missingRoles,
    );
  }
  if (!roles.length) return;

  const blocked = roles.filter((role?) => role.position >= me.roles.highest.position,);
  if (blocked.length) {
    global.logger.warn(
      "[guildMemberAdd] Bot role hierarchy prevents adding roles:",
      blocked.map((role?) => role.id),
    );
    return;
  }

  const idsToAdd = roles.map((r?) => r.id);
  const memberAfter = await addRolesAndGetMember(member.guild, member.id, idsToAdd);
  if (!memberAfter) return;
  const unappliedRoleIds = idsToAdd.filter((id?) => !memberAfter.roles.cache.has(id));
  if (unappliedRoleIds.length) {
    global.logger.warn(
      "[guildMemberAdd] Failed to add bot roles:",
      unappliedRoleIds,
    );
  }
}

/**
 * Prenota lo slot benvenuto (atomico): solo chi vince il claim manda il messaggio.
 * Copre la race join live + deferred su guildMemberUpdate (restore ruoli).
 */
async function claimJoinAnnounceSlot(member?) {
  if (!member?.guild?.id || !member?.id) return false;
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const key = `${guildId}:${userId}`;
  if (welcomeSendInflight.has(key)) return false;
  welcomeSendInflight.add(key);

  const joined = Number(member.joinedTimestamp || 0);
  const cutoff = joined > 0 ? new Date(joined - 5_000) : new Date(0);
  const claimId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const doc: any = await ActivityUserProfile.findOneAndUpdate(
      {
        guildId,
        userId,
        $or: [
          { "profile.joinAnnounceSentAt": { $exists: false } },
          { "profile.joinAnnounceSentAt": null },
          { "profile.joinAnnounceSentAt": { $lt: cutoff } },
        ],
      },
      {
        $set: {
          guildId,
          userId,
          "profile.joinAnnounceSentAt": new Date(),
          "profile.joinAnnounceClaimId": claimId,
        },
        $unset: { "profile.joinAnnouncePending": "" },
      },
      { upsert: true, new: true },
    ).catch((err?) => {
      if (err?.code === 11000) return null;
      throw err;
    });
    if (!doc || String(doc?.profile?.joinAnnounceClaimId || "") !== claimId) {
      welcomeSendInflight.delete(key);
      return false;
    }
    return true;
  } catch (err) {
    welcomeSendInflight.delete(key);
    global.logger?.warn?.("[guildMemberAdd] welcome claim:", err?.message || err);
    return false;
  }
}

function releaseWelcomeInflight(member?) {
  if (!member?.guild?.id || !member?.id) return;
  welcomeSendInflight.delete(`${String(member.guild.id)}:${String(member.id)}`);
}

/** Benvenuto nel canale: testi e canale sono quelli della dashboard (Benvenuto), anche sul principale. */
async function sendWelcomeChannelAnnouncement(_channel?, member?) {
  if (!member?.guild?.id) return null;
  if (!(require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches")).isModuleOn(member.guild.id, "benvenuto")) return null;
  const claimed = await claimJoinAnnounceSlot(member);
  if (!claimed) return null;
  try {
    const { sendDashboardWelcome } = require("../../../MultiGuild/services/welcomeRuntime") as typeof import("../../../MultiGuild/services/welcomeRuntime");
    const sent = await sendDashboardWelcome(member);
    refreshWelcomeContextForGuild(member.guild.id, member.id);
    return sent || null;
  } catch (err) {
    global.logger?.warn?.("[guildMemberAdd] dashboard welcome:", err?.message || err);
    return null;
  } finally {
    releaseWelcomeInflight(member);
  }
}

async function sendBotAddLog(member?) {
  const guild = member?.guild;
  if (!guild || !member?.user?.bot) return;

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(guild, modLogId) : null;
  if (!logChannel?.isTextBased?.()) return;

  let executor = null;
  const entry = await fetchRecentBotAddEntry(guild, member.user.id);
  if (entry && !entry.__noAuditPermission && !entry.__auditNotFound && entry.executor) {
    executor = entry.executor;
  }

  const responsible = formatActor(executor);
  const createdTs = Math.floor(new Date(member.user.createdAt).getTime() / 1000);
  const nowTs = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle(`${E.VC_User} Bot Add`)
    .setDescription(
      [
        `${E.VC_Staff} **Responsabile:** ${responsible}`,
        `${E.VC_User} **Target:** ${member.user} \`${member.user.id}\``,
        `${E.VC_Clock} <t:${nowTs}:F>`,
        "",
        `**${E.VC_tools} Informazioni aggiuntive**`,
        `${E.VC_Id} **Id:** \`${member.user.id}\``,
        `${E.VC_Modifica} **Username:** ${member.user.username}`,
        `${E.VC_Clock} **Creation:** <t:${createdTs}:R>`,
      ].join("\n"),
    );

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}
async function handleBotJoin(member?, joinGateConfig?) {
  queueIdsCatalogSync(member.client, member.guild.id, "botJoin");
  await sendBotAddLog(member).catch(() => { });
  await sendJoinGateNoAvatarLog(member).catch(() => { });

  const botAddEntry = await fetchRecentBotAddEntry(member.guild, member.user.id);
  const noAuditPerm = Boolean(botAddEntry?.__noAuditPermission);
  const auditNotFound = Boolean(botAddEntry?.__auditNotFound);
  const executorId =
    !noAuditPerm && !auditNotFound
      ? botAddEntry?.executorId || botAddEntry?.executor?.id || null
      : null;
  const executorText =
    botAddEntry?.executor && !noAuditPerm && !auditNotFound
      ? formatActor(botAddEntry.executor)
      : "sconosciuto";
  /* allowlistedBotSkipUnverified1: IDs.bots + trustedBotOnly.extraBotIds contano come autorizzati anche senza VerifiedBot. */
  const allowlistedBot =
    isDiscordOfficialActor(member.user) ||
    buildTrustedBotIdSet(member.client).has(String(member.user.id || ""));
  const verifiedBot = allowlistedBot || (await isVerifiedBot(member.user));

  if ( joinGateConfig?.enabled && joinGateConfig?.unverifiedBotAdditions?.enabled && !verifiedBot) {
    const result = await kickForJoinGate(member, "Aggiunta di bot non verificato.", [
      `${E.VC_Rules} **Regola:** Aggiunta di bot non verificato`,
      `${E.VC_Staff} **Responsabile:** ${executorText}`,
    ], joinGateConfig?.unverifiedBotAdditions?.action || "kick");
    if (result?.blocked) return;
  }

  if (joinGateConfig?.enabled && joinGateConfig?.botAdditions?.enabled) {
    if (noAuditPerm) {
      global.logger?.warn?.(
        `[JoinGate] botAdditions skipped (no ViewAuditLog) target=${member.user?.id || "sconosciuto"}`,
      );
    } else if (!executorId && auditNotFound) {
      global.logger?.warn?.(
        `[JoinGate] botAdditions: no BotAdd row after retries — kick fallito target=${member.user?.id || "sconosciuto"}`,
      );
      const result = await kickForJoinGate(
        member,
        "Aggiunta di bot da membro non autorizzato (no audit match — kick fallito).",
        [
          `${E.VC_Rules} **Regola:** Aggiunta di bot`,
          `${E.VC_Staff} **Responsabile:** ${executorText}`,
        ],
        joinGateConfig?.botAdditions?.action || "kick",
      );
      if (result?.blocked) return;
    } else if (executorId) {
      const authorized = await isAuthorizedBotAdder(member.guild, executorId);
      if (!authorized) {
        const result = await kickForJoinGate(member, "Aggiunta di bot da membro non autorizzato.", [
          `${E.VC_Rules} **Regola:** Aggiunta di bot`,
          `${E.VC_Staff} **Responsabile:** ${executorText}`,
        ], joinGateConfig?.botAdditions?.action || "kick");
        if (result?.blocked && executorId) {
          await punishMemberForBotAbuse(
            member.guild,
            executorId,
            `Ha aggiunto un bot non autorizzato: ${member.user?.tag || member.user?.id || "sconosciuto"}`,
            "ban",
          );
        }
        if (result?.blocked) return;
      }
    }
  }

  const trustedOnly = await enforceUntrustedBotMember(member, { executorId });
  if (trustedOnly?.blocked) return;

  try {
    await addBotRoles(member);
  } catch (error) {
    global.logger.error("[guildMemberAdd] Failed to add bot roles:", error);
  }

  const welcomeChannel = await resolveGuildChannel(member.guild, IDs.channels.chat,);
  if (welcomeChannel) {
    await sendWelcomeChannelAnnouncement(welcomeChannel, member);
  }

  const inviteChannel = await resolveGuildChannel(member.guild, INVITE_LOG_CHANNEL_ID,);
  if (!inviteChannel) return;

  try {
    const info = await resolveInviteInfo(member);
    if (info.isVanity) {
      await inviteChannel
        .send({
          content:
            `${E.VC_Reply} Bot entrato tramite vanity **.gg/viniliecaffe**`,
        })
        .catch(() => { });
    } else {
      await inviteChannel
        .send({
          content: `${E.VC_Reply} Bot entrato con il link ${formatInviteLinkForJoinMessage(info.link)},\n-# -> invitato da ${info.inviterTag} che ora ha **${formatInviteCountIt(info.totalInvites)}**.`,
          flags: MessageFlags.SuppressEmbeds,
        })
        .catch(() => { });
    }
  } catch (err) {
    global.logger?.warn?.("[guildMemberAdd] ", err?.message || err);
  }
}

function hasNoAvatar(member?) {
  if (!member?.user) return false;
  return !member.user.avatar;
}

async function fetchRecentBotAddEntry(guild?, botId?) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return { __noAuditPermission: true };
  }
  const delays = [0, 450, 900, 1400, 2200];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve?) => {
        const timer = setTimeout(resolve, delays[attempt] - delays[attempt - 1]);
        timer.unref?.();
      });
    }
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const found =
        logs.entries.find((entry?) => {
          const createdTs = Number(entry?.createdTimestamp || 0);
          return (
            createdTs > 0 &&
            now - createdTs <= AUDIT_LOOKBACK_MS &&
            String(entry?.target?.id || "") === String(botId || "")
          );
        }) || null;
      if (found) return found;
    }
  }
  return { __auditNotFound: true };
}

async function isVerifiedBot(user?) {
  if (!user?.bot) return false;
  let flags = user.flags || null;
  if (!flags && typeof user.fetchFlags === "function") {
    flags = await user.fetchFlags().catch(() => null);
  }
  return Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
}

async function isAuthorizedBotAdder(guild?, executorId?) {
  if (!guild || !executorId) return false;
  const executorMember = await getGuildMemberCached(guild, String(executorId || ""));
  if (await resolveJoinGateConfiguredExempt(guild, executorId, executorMember)) return true;
  const executor = executorMember;
  if (!executor) return false;
  if (
    executor.permissions.has(PermissionsBitField.Flags.Administrator) ||
    executor.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) {
    return true;
  }
  return [...JOIN_GATE_WHITELIST_ROLE_IDS].some((roleId?) =>
    executor.roles.cache.has(roleId),
  );
}

async function sendJoinGatePunishDm(member?, reason?, extraLines = [], action = "") {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Azione JoinGate in ${member.guild.name}`)
    .setDescription(
      [
        `${E.VC_User} **Membro:** ${member.user} [\`${member.user.id}\`]`,
        `${E.VC_Reason} **Motivo:** ${reason}`,
        ...extraLines.filter(Boolean),
      ].join("\n"),
    );
  try {
    const dmChannel = member.user.dmChannel || (await member.user.createDM().catch(() => null));
    if (!dmChannel) return false;
    const components = String(action || "").toLowerCase() === "ban" ? [buildUnbanRequestRow()] : [];
    await dmChannel.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}

function buildJoinGateTriggeredEmbed(member?, reason?) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${member.user.username} ha attivato il join gate!`)
    .setDescription(
      [
        `${E.VC_User} **Membro:** ${member.user.username} [\`${member.user.id}\`]`,
        `${E.VC_Reason} **Motivo:** ${reason}`,
      ].join("\n"),
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || undefined);
}

async function kickForJoinGate(member?, reason?, extraLines = [], action = "kick") {
  const me = member.guild.members.me;
  const normalizedAction = ["kick", "ban", "timeout", "log"].includes(String(action || "").toLowerCase(),) ? String(action || "").toLowerCase() : "log";
  const canKick = Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) && Boolean(member?.kickable);
  const canBan = Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) && Boolean(member?.bannable);
  const canTimeout = Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) && Boolean(member?.moderatable);
  const joinGateCfg = getJoinGateConfigSnapshot();
  const dmPunishedMembers = typeof joinGateCfg?.dmPunishedMembers === "boolean" ? joinGateCfg.dmPunishedMembers : true;
  let dmSent = false;
  if (normalizedAction !== "log" && dmPunishedMembers) {
    dmSent = await sendJoinGatePunishDm(member, reason, extraLines, normalizedAction);
  }

  let punished = false;
  let appliedAction = normalizedAction;
  if (normalizedAction === "kick" && canKick) {
    punished = await member
      .kick(reason)
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] kick failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  } else if (normalizedAction === "ban" && canBan) {
    punished = await member.guild.members
      .ban(member.id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] ban failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  } else if (normalizedAction === "ban" && !canBan && canKick) {
    punished = await member
      .kick(reason)
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] kick (ban fallback) failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
    if (punished) appliedAction = "kick";
  } else if (normalizedAction === "timeout" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate timeout: ${reason}`)
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] timeout failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  }
  if (!punished && normalizedAction !== "log" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate fallback timeout: ${reason}`)
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] fallback timeout failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
    if (punished) appliedAction = "timeout";
  }
  if (!punished && normalizedAction !== "log") {
    appliedAction = "log";
  }
  if (!dmSent && appliedAction !== "log" && punished && dmPunishedMembers) {
    dmSent = await sendJoinGatePunishDm(member, reason, extraLines);
  }
  const blocked = appliedAction === "log" ? false : punished;
  if (punished) {
    if (appliedAction === "kick") {
      markJoinGateKick(member.guild.id, member.id, reason);
    }
    if (joinGateCfg.escalateRaidOnJoinGatePunish) {
      await registerJoinRaidSecuritySignal(member, {
        reason: `Join Gate action: ${reason}`,
        enableAntiNuke: false,
        antiNukeHeat: 0,
        enableAutoMod: false,
        raidBoost: 0,
      }).catch(() => null);
    }

    if (member.guild?.client && appliedAction !== "log") {
      const modAction = appliedAction === "timeout" ? "MUTE" : appliedAction === "ban" ? "BAN" : "KICK";
      const durationMs = appliedAction === "timeout" ? 6 * 60 * 60_000 : null;
      try {
        const config = await getModConfig(member.guild.id);
        const { doc, created } = await createModCase({
          guildId: member.guild.id, action: modAction, userId: member.id, modId: member.client.user.id, reason: `JoinGate: ${reason}`,
          durationMs,
          context: {},
          dedupe: { enabled: true, windowMs: 15_000, matchReason: true },
        });
        if (created) {
          await logModCase({ client: member.client, guild: member.guild, modCase: doc, config });
        }
      } catch (e) {
        global.logger?.warn?.("[JoinGate] ModCase creation failed:", member.guild.id, member.id, e?.message || e);
      }
    }
  }
  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(member.guild, modLogId) : null;
  if (logChannel?.isTextBased?.()) {
    const actionLabel = appliedAction === "ban" ? "banned" : appliedAction === "timeout" ? "timed out" : appliedAction === "kick" ? "kicked" : "flagged";
    const embed = punished
      ? new EmbedBuilder()
        .setColor("#A97142")
        .setTitle(`${member.user.username} è stato ${actionLabel}!!`)
        .setDescription(
          [
            `${E.VC_User} **Membro:** ${member.user.username} [\`${member.user.id}\`]`,
            `${E.VC_Reason} **Motivo:** ${reason}`,
            ...extraLines.filter(Boolean),
            "",
            `**${E.VC_tools} Informazioni aggiuntive**`,
            `${E.VC_Info} **Membro messaggio diretto?** ${dmSent ? E.VC_Verified : E.VC_Cross}`,
            `${E.VC_Info} **Membro punito?** ${punished ? E.VC_Verified : E.VC_Cross}`,
          ].join("\n"),
        )
        .setFooter({ text: "© 2026 Vinili & Caffè. Tutti i diritti riservati." })
        .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || undefined)
      : buildJoinGateTriggeredEmbed(member, reason);
    await logChannel.send({ embeds: [embed] }).catch(() => { });
  }
  return {
    blocked,
    attempted:
      appliedAction === "log"
        ? false
        : appliedAction === "ban"
          ? canBan
          : appliedAction === "kick"
            ? canKick
            : appliedAction === "timeout"
              ? canTimeout
              : false,
    punished,
    dmSent,
    canKick,
    canBan,
    canTimeout,
    action: appliedAction,
  };
}

async function sendJoinGateNoAvatarLog(member?) {
  if (!member?.guild || !member?.user) return;
  if (!hasNoAvatar(member)) return;

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(member.guild, modLogId) : null;
  if (!logChannel?.isTextBased?.()) return;

  const embed = buildJoinGateTriggeredEmbed(member, "Account has no avatar.");

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

async function markJoinAnnounceSent(member?) {
  if (!member?.guild?.id || !member?.id) return;
  await ActivityUserProfile.updateOne(
    { guildId: String(member.guild.id), userId: String(member.id) },
    { $set: { "profile.joinAnnounceSentAt": new Date() }, $unset: { "profile.joinAnnouncePending": "" } },
  ).catch(() => null);
}

export = {
  sendWelcomeChannelAnnouncement,
  handleBotJoin,
  hasNoAvatar,
  buildJoinGateTriggeredEmbed,
  kickForJoinGate,
  markJoinAnnounceSent,
  claimJoinAnnounceSlot,
};
