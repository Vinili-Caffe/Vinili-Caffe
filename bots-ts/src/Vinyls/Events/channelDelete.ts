const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { queueCategoryRenumber, } = require("../Services/Community/communityOpsService") as typeof import("../Services/Community/communityOpsService");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync") as typeof import("../Utils/Config/idsAutoSync");
const { markDeletedChannelSnapshot, } = require("../Utils/Community/channelSnapshotUtils") as typeof import("../Utils/Community/channelSnapshotUtils");
const { ARROW, toDiscordTimestamp, channelTypeLabel, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils") as typeof import("../Utils/Logging/channelRolesLogUtils");
const { handleChannelDeletionAction: antiNukeHandleChannelDeletionAction } = require("../Services/Moderation/antiNukeService") as typeof import("../Services/Moderation/antiNukeService");
const { clearGameForChannel } = require("../Services/Minigames/minigameService") as typeof import("../Services/Minigames/minigameService");
const { finishSerataFilmSessionsForChannel } = require("../Services/Staff/staffAutoValutazioniService") as typeof import("../Services/Staff/staffAutoValutazioniService");
const { isTicketCategoryName } = require("../Utils/Ticket/ticketCategoryUtils") as typeof import("../Utils/Ticket/ticketCategoryUtils");
const { tryDeleteEmptyCustomPrivateCategory } = require("../Utils/Community/customPrivateCategoryUtils") as typeof import("../Utils/Community/customPrivateCategoryUtils");
const { shouldResyncAutomodForChannel, scheduleDiscordAutomodRulesResync } = require("../Services/Moderation/discordAutomodRulesService") as typeof import("../Services/Moderation/discordAutomodRulesService");
const { handleCustomPrivateVoiceChannelDelete } = require("../Services/Community/customVocChannelCleanupService") as typeof import("../Services/Community/customVocChannelCleanupService");
const { ChannelType } = require("discord.js") as typeof import("discord.js");

function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
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

        const lines = [`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
        `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
        ];

        if (audit.reason) lines.push(`<:VC_reason:1478517122929004544> **Motivo:** ${audit.reason}`);

        lines.push(
          "",
          "**<:VC_tools:1478862265305272364> Impostazioni precedenti**",
          `<:VC_Modifica:1478859646587633717> **Nome:** ${channel.name || "sconosciuto"} \`[${channel.id}]\``,
          `<a:VC_Channel:1482534583944871996> **Tipo:** ${channelTypeLabel(channel)}`,
        );
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type"]));

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("<a:VC_Channel:1482534583944871996> Channel Delete")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => { });
      }
    } catch (error) {
      global.logger?.error?.("[channelDelete] log failed:", error);
    }

    await antiNukeHandleChannelDeletionAction({ guild: channel.guild, executorId, channelName: String(channel.name || ""), channelId: String(channel.id || ""), channel }).catch(() => { });
    await markDeletedChannelSnapshot(channel).catch(() => { });

    try {
      const { isProtectedStreamerStageChannelId, ensureStreamerStageChannel } = require("../Services/Community/streamerStageGuardService") as typeof import("../Services/Community/streamerStageGuardService");
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
        const { getMainGuildId } = require("../Utils/Config/testGuildMirrorRemap") as typeof import("../Utils/Config/testGuildMirrorRemap");
        if (String(channel.guildId) === String(getMainGuildId() || "")) {
          const { mirrorMainChannelDeleteToTest } = require("../Services/Partner/testGuildMirrorSyncService") as typeof import("../Services/Partner/testGuildMirrorSyncService");
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