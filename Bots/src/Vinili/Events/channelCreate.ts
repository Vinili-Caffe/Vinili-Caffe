const { AuditLogEvent, EmbedBuilder, PermissionsBitField, } = require("discord.js") as typeof import("discord.js");
const{queueCategoryRenumber,}=require("../Services/Community/communityOpsService") as typeof import("../Services/Community/communityOpsService");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync") as typeof import("../Utils/Config/idsAutoSync");
const{upsertChannelSnapshot,}=require("../Utils/Community/channelSnapshotUtils") as typeof import("../Utils/Community/channelSnapshotUtils");
const { toDiscordTimestamp, channelDisplay, channelTypeLabel, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible } = require("../Utils/Logging/channelRolesLogUtils") as typeof import("../Utils/Logging/channelRolesLogUtils");
const{handleChannelCreationAction:antiNukeHandleChannelCreationAction,}=require("../Moderation/services/antiNukeService") as typeof import("../Moderation/services/antiNukeService");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { shouldResyncAutomodForChannel, scheduleDiscordAutomodRulesResync } = require("../Moderation/services/discordAutomodRulesService") as typeof import("../Moderation/services/discordAutomodRulesService");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
const CHANNEL_CREATE_ACTION = AuditLogEvent?.ChannelCreate ?? 10;
const AUDIT_RETRY_ATTEMPTS = 3;
const AUDIT_RETRY_DELAY_MS = 700;
const QUARANTINE_ROLE_ID=String(IDs.roles?.Muted||"1442568884833095832",);

async function forceQuarantineOverwrite(channel?) {
  if (!channel?.guild || !QUARANTINE_ROLE_ID) return;
  if (channel?.isThread?.()) return;
  const { isChannelInTicketCategory } = require("../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../MultiGuild/tickets/discord/ticketCategoryUtils");
  if (isChannelInTicketCategory(channel)) return;

  const me = channel.guild.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return;
  if (!channel.permissionsFor?.(me)?.has(PermissionsBitField.Flags.ManageChannels)) return;

  const role=channel.guild.roles.cache.get(QUARANTINE_ROLE_ID)||(await channel.guild.roles.fetch(QUARANTINE_ROLE_ID).catch(() => null));
  if (!role) return;

  await channel.permissionOverwrites
    .edit(
      role.id,
      {
        ViewChannel: false,
        CreateInstantInvite: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
      },
      { reason: "<:vegax:1443934876440068179> Forza la quarantena per negare le autorizzazioni sul nuovo canale" },
    )
    .catch(() => {});
}

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveCreateAuditWithRetry(guild?, channelId?) {
  for (let attempt = 0; attempt < AUDIT_RETRY_ATTEMPTS; attempt += 1) {
    const audit=await resolveResponsible(guild,CHANNEL_CREATE_ACTION,(entry?) => String(entry?.target?.id||"")===String(channelId||""),);
    if (audit?.entry || audit?.executor) return audit;
    if (attempt < AUDIT_RETRY_ATTEMPTS - 1) {
      await wait(AUDIT_RETRY_DELAY_MS);
    }
  }
  return { executor: null, reason: null, entry: null };
}

export = {
  name: "channelCreate",
  async execute(channel?, client?) {
    if (!channel?.guildId) return;
    if (!isViniliFullFeatureGuild(channel.guildId)) return;
    await forceQuarantineOverwrite(channel).catch(() => {});
    let executorId = "";
    
    try {
      const audit = await resolveCreateAuditWithRetry(channel.guild, channel.id);
      executorId = String(audit?.executor?.id || "");

      const logChannel = await resolveChannelRolesLogChannel(channel.guild);
      if (logChannel?.isTextBased?.()) {
        const responsible = formatAuditActor(audit?.executor || null);
        const lines = [
          `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
          `<:VC_User:1482527453586002103> **Utente:** ${channelDisplay(channel)} \`${channel.id}\``,
          `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**<:VC_tools:1478862265305272364> Impostazioni**",
          `<:VC_Modifica:1478859646587633717> **Nome:** ${channel.name || "sconosciuto"}`,
          `<a:VC_Channel:1482534583944871996> **Tipo:** ${channelTypeLabel(channel)}`,
          `<a:VC_PepeEggPlant:1331622686014570588> **NSFW:** ${yesNo(Boolean(channel.nsfw))}`,
          `<:VC_Info:1482526956703580372> **RPM utente:** ${Number(channel.rateLimitPerUser || 0) || "Nessuno"}`,
        ];
        lines.push(
          ...buildAuditExtraLines(audit?.entry, [
            "name",
            "type",
            "rate_limit_per_user",
            "nsfw",
          ]),
        );

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("<a:VC_Channel:1482534583944871996> Channel Create")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (error) {
      global.logger?.error?.("[channelCreate] log failed:", error);
    }

    await antiNukeHandleChannelCreationAction({ guild: channel.guild, executorId, channelId: String(channel.id || ""), channel }).catch(() => {});
    await upsertChannelSnapshot(channel).catch(() => {});
    if (client) {
      queueCategoryRenumber(client, channel.guildId);
      queueIdsCatalogSync(client, channel.guildId, "channelCreate");
      if (shouldResyncAutomodForChannel(channel)) {
        scheduleDiscordAutomodRulesResync(client);
      }
    }
  },
};