const { formatItalianMinutesPlain } = require("../../../shared/utils/italianDurationLabels") as typeof import("../../../shared/utils/italianDurationLabels");
const { AuditLogEvent, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handleThreadDeletionAction: antiNukeHandleThreadDeletionAction } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const THREAD_DELETE_ACTION = AuditLogEvent?.ThreadDelete ?? 112;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsibleWithRetry(guild?, threadId?, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit=await resolveResponsible(guild,THREAD_DELETE_ACTION,(entry?) => String(entry?.target?.id||"")===String(threadId||""),);
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

function threadTypeLabel(threadType?) {
  const value = Number(threadType || 0);
  if (value === 12) return "Thread privato";
  if (value === 11) return "Thread pubblico";
  if (value === 10) return "Thread annuncio";
  return `Sconosciuto (${value})`;
}

export = {
  name: "threadDelete",
  async execute(thread?) {
    try {
      const guild = thread?.guild;
      const threadId = String(thread?.id || "");
      if (!guild || !threadId) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;
      const audit = await resolveResponsibleWithRetry(guild, threadId);
      const executorId = String(audit?.executor?.id || "");
      const responsible = formatAuditActor(audit.executor);

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const lines = [
          `${E.VC_Staff} **Responsabile:** ${responsible}`,
          `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          `**${E.VC_tools} Impostazioni precedenti**`,
          `${E.VC_Modifica} **Nome:** ${thread?.name || "sconosciuto"} \`[${threadId}]\``,
          `${E.VC_Modifica} **Tipo:** ${threadTypeLabel(thread?.type)}`,
          `${E.VC_Modifica} **Archivio:** ${yesNo(Boolean(thread?.archived))}`,
          `${E.VC_Modifica} **Bloccato:** ${yesNo(Boolean(thread?.locked))}`,
          `${E.VC_Modifica} **Durata auto-archiviazione:** ${Number(thread?.autoArchiveDuration || 0) ? formatItalianMinutesPlain(thread.autoArchiveDuration) : "Nessuna"}`,
          `${E.VC_Modifica} **Slowmode per utente:** ${Number(thread?.rateLimitPerUser || 0) || "Nessuna"}`,
        ];

        if (Array.isArray(thread?.appliedTags) && thread.appliedTags.length) {
          lines.push(`${E.VC_Modifica} **Tag applicati:** \`${thread.appliedTags.map((id?) => String(id)).join(", ")}\``);
        }
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type", "archived", "locked", "auto_archive_duration", "rate_limit_per_user", "applied_tags"]));

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle(`${E.VC_threads} Thread Eliminato`)
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
      await antiNukeHandleThreadDeletionAction({ guild, executorId, threadName: String(thread?.name || ""), threadId, thread });
    } catch (error) {
      global.logger?.error?.("[threadDelete] failed:", error);
    }
  },
};