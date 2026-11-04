/** Ingresso membri: join gate (DM, espulsione, log). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getJoinGateConfigSnapshot } = require("../../Moderation/services/joinGateService") as typeof import("../../Moderation/services/joinGateService");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { resolveGuildChannel } = require("../../Community/events/joinInvites") as typeof import("../../Community/events/joinInvites");
const { kickForJoinGate } = require("./joinBots") as typeof import("./joinBots");
const { toUnix, formatAccountAge } = require("./joinSuspicious") as typeof import("./joinSuspicious");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;

async function handleTooYoungAccount(member?, joinGateConfig = null) {
  const createdTs = toUnix(member.user.createdAt);
  const cfg = joinGateConfig || getJoinGateConfigSnapshot();
  const minAgeDays = Number(cfg?.newAccounts?.minAgeDays || 3);
  await kickForJoinGate(member, "Account troppo giovane per essere permesso.", [
    `${E.VC_Rules} **Regola:** Account troppo giovane`,
    `${E.VC_Clock} **Età account:** <t:${createdTs}:R>`,
    `${E.VC_Info} **Età minima:** ${minAgeDays} giorni`,
  ], cfg?.newAccounts?.action || "kick");
}

async function sendJoinLog(member?) {
  const joinLeaveLogChannel = await resolveGuildChannel(member.guild, JOIN_LEAVE_LOG_CHANNEL_ID,);
  if (!joinLeaveLogChannel) return;

  const createdTs = toUnix(member.user.createdAt);
  const accountAge = formatAccountAge(member.user.createdAt);
  const joinLogEmbed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle(`${E.VC_User} Membro Entrato`)
    .setDescription(
      [
        `${E.VC_User} **Membro:** ${member.user} ${member.user.tag}.`,
        "",
        `**${E.VC_tools} Informazioni aggiuntive**`,
        `${E.VC_Id} **Id:** \`${member.user.id}\``,
        `${E.VC_Modifica} **Username:** ${member.user.username}`,
        `${E.VC_Clock} **Creation:** <t:${createdTs}:R>`,
        accountAge,
      ].join("\n"),
    )
    .setFooter({ text: `ID: ${member.user.id}` })
    .setTimestamp()
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || undefined);

  await joinLeaveLogChannel.send({ embeds: [joinLogEmbed] }).catch((err?) => {
    global.logger.error("[guildMemberAdd] Failed to send join log:", err);
  });
}

export = { handleTooYoungAccount, sendJoinLog };
