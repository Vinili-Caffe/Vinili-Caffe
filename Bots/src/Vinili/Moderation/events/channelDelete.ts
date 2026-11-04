const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { queueCategoryRenumber, } = require("../../Community/services/communityOpsService") as typeof import("../../Community/services/communityOpsService");
const { queueIdsCatalogSync } = require("../../Config/idsAutoSync") as typeof import("../../Config/idsAutoSync");
const { markDeletedChannelSnapshot, } = require("../../Community/utils/channelSnapshotUtils") as typeof import("../../Community/utils/channelSnapshotUtils");
const { toDiscordTimestamp, channelTypeLabel, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handleChannelDeletionAction: antiNukeHandleChannelDeletionAction } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { clearGameForChannel } = require("../../Minigames/services/minigameService") as typeof import("../../Minigames/services/minigameService");
const { finishSerataFilmSessionsForChannel } = require("../../Staff/services/staffAutoValutazioniService") as typeof import("../../Staff/services/staffAutoValutazioniService");
const { isTicketCategoryName } = require("../../../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../../../MultiGuild/tickets/discord/ticketCategoryUtils");
const { tryDeleteEmptyCustomPrivateCategory } = require("../../Community/utils/customPrivateCategoryUtils") as typeof import("../../Community/utils/customPrivateCategoryUtils");
const { shouldResyncAutomodForChannel, scheduleDiscordAutomodRulesResync } = require("../../Moderation/services/discordAutomodRulesService") as typeof import("../../Moderation/services/discordAutomodRulesService");
const { handleCustomPrivateVoiceChannelDelete } = require("../../Community/services/customVocChannelCleanupService") as typeof import("../../Community/services/customVocChannelCleanupService");
const { ChannelType } = require("discord.js") as typeof import("discord.js");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

const CHANNEL_DELETE_ACTION = AuditLogEvent?.ChannelDelete ?? 12;
const AUDIT_RETRY_ATTEMPTS = 3;
const AUDIT_RETRY_DELAY_MS = 700;

function isTicketsCategory(name?) {
  return String(name || "")
    .toLowerCase()
    .includes("tickets");
}

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveDeleteAuditWithRetry(guild?, channelId?) {
  for (let attempt = 0; attempt < AUDIT_RETRY_ATTEMPTS; attempt += 1) {
    const audit = await resolveResponsible(guild, CHANNEL_DELETE_ACTION, (entry?) => String(entry?.target?.id || "") === String(channelId || ""),);
    if (audit?.entry || audit?.executor) return audit;
    if (attempt < AUDIT_RETRY_ATTEMPTS - 1) {
      await wait(AUDIT_RETRY_DELAY_MS);
    }
  }
  return { executor: null, reason: null, entry: null };
}

export = {
  name: "channelDelete",
  async execute(channel?, client?) {
    if (!channel?.guildId) return;
    if (!isViniliFullFeatureGuild(channel.guildId)) return;

    const guild = channel.guild || client?.guilds?.cache?.get(channel.guildId) || (await client?.guilds?.fetch?.(channel.guildId).catch(() => null));
    if (!guild) return;

    clearGameForChannel(channel.id, client, channel.guildId);
    await finishSerataFilmSessionsForChannel(guild, channel.id).catch((err?) => {
      global.logger?.warn?.("[channelDelete] serata film staff auto:", err?.message || err);
    });

    let executorId = "";
    try {
      const audit = await resolveDeleteAuditWithRetry(guild, channel.id);
      executorId = String(audit?.executor?.id || "");

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const responsible = formatAuditActor(audit?.executor || null);

        const lines = [`${E.VC_Staff} **Responsabile:** ${responsible}`,
        `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
        ];

        if (audit.reason) lines.push(`${E.VC_reason} **Motivo:** ${audit.reason}`);

        lines.push(
          "",
          `**${E.VC_tools} Impostazioni precedenti**`,
          `${E.VC_Modifica} **Nome:** ${channel.name || "sconosciuto"} \`[${channel.id}]\``,
          `${E.VC_Channel} **Tipo:** ${channelTypeLabel(channel)}`,
        );
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type"]));

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle(`${E.VC_Channel} Channel Delete`)
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => { });
      }
    } catch (error) {
      global.logger?.error?.("[channelDelete] log failed:", error);
    }

    await antiNukeHandleChannelDeletionAction({ guild: channel.guild, executorId, channelName: String(channel.name || ""), channelId: String(channel.id || ""), channel }).catch(() => { });
    await markDeletedChannelSnapshot(channel).catch(() => { });

    try {
      const { isProtectedStreamerStageChannelId, ensureStreamerStageChannel } = require("../../Community/services/streamerStageGuardService") as typeof import("../../Community/services/streamerStageGuardService");
      if (isProtectedStreamerStageChannelId(channel.id, client) || /Streaming diunk|Streaming D1uk/i.test(String(channel.name || ""))) {
        global.logger?.warn?.("[channelDelete] protected streamer stage deleted — recreating:", channel.id, channel.name);
        await ensureStreamerStageChannel(client).catch((err?) => {
          global.logger?.warn?.("[channelDelete] streamer stage recreate failed:", err?.message || err);
        });
      }
    } catch (eGuard) {
      global.logger?.warn?.("[channelDelete] streamer stage guard:", eGuard?.message || eGuard);
    }

    try {
      const parentId = channel.parentId;
      if (parentId) {
        const parent = guild?.channels?.cache?.get(parentId) || (await guild?.channels?.fetch(parentId).catch(() => null));

        if (parent?.type === 4 && isTicketsCategory(parent?.name)) {
          const childrenCount = guild.channels.cache.filter((child?) => String(child?.parentId || "") === String(parent.id) && String(child?.id || "") !== String(channel.id || ""),).size;
          if (childrenCount === 0) {
            await parent
              .delete("Auto cleanup empty tickets category")
              .catch(() => { });
          }
        }
      }
    } catch (error) {
      global.logger?.error?.("[channelDelete] tickets-category cleanup failed:", error);
    }

    try {
      const isVoiceDelete = channel.type === ChannelType.GuildVoice;
      if (isVoiceDelete) {
        await handleCustomPrivateVoiceChannelDelete(channel, guild).catch((err?) => {
          global.logger?.warn?.("[channelDelete] custom voc DB cleanup failed:", err?.message || err);
        });
      }
      if (isVoiceDelete || channel.parentId) {
        await tryDeleteEmptyCustomPrivateCategory(guild, {
          excludeChannelId: channel.id,
          reason: "Auto cleanup empty custom private category",
        });
      }
    } catch (error) {
      global.logger?.error?.("[channelDelete] custom-private-category cleanup failed:", error);
    }

    if (client) {
      queueCategoryRenumber(client, channel.guildId);
      queueIdsCatalogSync(client, channel.guildId, "channelDelete");
      const ticketCategoryDeleted =
        channel.type === ChannelType.GuildCategory && isTicketCategoryName(channel.name);
      if (ticketCategoryDeleted || shouldResyncAutomodForChannel(channel)) {
        scheduleDiscordAutomodRulesResync(client);
      }
      try {
        const { getMainGuildId } = require("../../Config/testGuildMirrorRemap") as typeof import("../../Config/testGuildMirrorRemap");
        if (String(channel.guildId) === String(getMainGuildId() || "")) {
          const { mirrorMainChannelDeleteToTest } = require("../../Partner/services/testGuildMirrorSyncService") as typeof import("../../Partner/services/testGuildMirrorSyncService");
          void mirrorMainChannelDeleteToTest(client, channel).catch((err?) => {
            global.logger?.warn?.("[channelDelete] test mirror:", err?.message || err);
          });
        }
      } catch (eMirror) {
        global.logger?.warn?.("[channelDelete] test mirror hook:", eMirror?.message || eMirror);
      }
    }
  },
};