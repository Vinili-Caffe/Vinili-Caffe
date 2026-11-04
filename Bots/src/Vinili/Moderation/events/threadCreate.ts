const { formatItalianMinutesPlain } = require("../../../shared/utils/italianDurationLabels") as typeof import("../../../shared/utils/italianDurationLabels");
const { AuditLogEvent, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const { toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handleThreadCreationAction: antiNukeHandleThreadCreationAction } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const THREAD_CREATE_ACTION = AuditLogEvent?.ThreadCreate ?? 110;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsibleWithRetry(guild?, threadId?, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit=await resolveResponsible(guild,THREAD_CREATE_ACTION,(entry?) => String(entry?.target?.id||"")===String(threadId||""),);
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

function threadTypeLabel(threadType?) {
  if (threadType === ChannelType.PrivateThread) return "Thread privato";
  if (threadType === ChannelType.PublicThread) return "Thread pubblico";
  if (threadType === ChannelType.AnnouncementThread) return "Thread annuncio";
  return `Sconosciuto (${Number(threadType || 0)})`;
}

export = {
  name: "threadCreate",
  async execute(thread?) {
    try {
      if (!thread?.guild || !thread?.id) return;
      if (!isViniliFullFeatureGuild(thread.guild.id)) return;
      const audit = await resolveResponsibleWithRetry(thread.guild, thread.id);
      const executorId = String(audit?.executor?.id || "");
      const responsible = formatAuditActor(audit.executor);

      const logChannel = await resolveChannelRolesLogChannel(thread.guild);
      if (logChannel?.isTextBased?.()) {
        const lines = [
          `${E.VC_Staff} **Responsabile:** ${responsible}`,
          `${E.VC_User} **Target:** ${thread} \`${thread.id}\``,
          `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          `**${E.VC_tools} Impostazioni**`,
          `${E.VC_Modifica} **Nome:** ${thread.name || "sconosciuto"}`,
          `${E.VC_Modifica} **Tipo:** ${threadTypeLabel(thread.type)}`,
          `${E.VC_Modifica} **Archivio:** ${yesNo(Boolean(thread.archived))}`,
          `${E.VC_Modifica} **Bloccato:** ${yesNo(Boolean(thread.locked))}`,
          `${E.VC_Modifica} **Durata auto-archiviazione:** ${Number(thread.autoArchiveDuration || 0) ? formatItalianMinutesPlain(thread.autoArchiveDuration) : "Nessuna"}`,
          `${E.VC_Modifica} **Slowmode per utente:** ${Number(thread.rateLimitPerUser || 0) || "Nessuna"}`,
        ];

        if (Array.isArray(thread.appliedTags) && thread.appliedTags.length) {
          lines.push(`${E.VC_Modifica} **Tag applicati:** \`${thread.appliedTags.map((id?) => String(id)).join(", ")}\``);
        }
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type", "archived", "locked", "auto_archive_duration", "rate_limit_per_user", "applied_tags"]));

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle(`${E.VC_threads} Thread Creato`)
          .setDescription(lines.join("\n"));

        const payload: Record<string, any> = { embeds: [embed] };
        if (thread.url) {
          payload.components = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel("Vai al Thread")
                .setEmoji(E.VC_threads)
                .setURL(thread.url),
            ),
          ];
        }

        await logChannel.send(payload).catch(() => {});
      }
      await antiNukeHandleThreadCreationAction({
        guild: thread.guild,
        executorId,
        threadId: String(thread.id || ""),
        thread,
      });
    } catch (error) {
      global.logger?.error?.("[threadCreate] failed:", error);
    }
  },
};