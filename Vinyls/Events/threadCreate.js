const { formatItalianMinutesPlain } = require("../Utils/Text/italianDurationLabels");
const { AuditLogEvent, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils");
const { handleThreadCreationAction: antiNukeHandleThreadCreationAction } = require("../Services/Moderation/antiNukeService");
const { handleIdeaBugCategoryThreadCreate } = require("../Services/Community/ideaBugThreadService");
const THREAD_CREATE_ACTION = AuditLogEvent?.ThreadCreate ?? 110;

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsibleWithRetry(guild, threadId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit=await resolveResponsible(guild,THREAD_CREATE_ACTION,(entry) => String(entry?.target?.id||"")===String(threadId||""),);
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

function threadTypeLabel(threadType) {
  if (threadType === ChannelType.PrivateThread) return "Thread privato";
  if (threadType === ChannelType.PublicThread) return "Thread pubblico";
  if (threadType === ChannelType.AnnouncementThread) return "Thread annuncio";
  return `Sconosciuto (${Number(threadType || 0)})`;
}

module.exports = {
  name: "threadCreate",
  async execute(thread) {
    try {
      if (!thread?.guild || !thread?.id) return;
      await handleIdeaBugCategoryThreadCreate(thread).catch((err) => {
        global.logger?.warn?.("[threadCreate] idea bug category ping failed:", err?.message || err);
      });
      const audit = await resolveResponsibleWithRetry(thread.guild, thread.id);
      const executorId = String(audit?.executor?.id || "");
      const responsible = formatAuditActor(audit.executor);

      const logChannel = await resolveChannelRolesLogChannel(thread.guild);
      if (logChannel?.isTextBased?.()) {
        const lines = [
          `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
          `<:VC_User:1482527453586002103> **Target:** ${thread} \`${thread.id}\``,
          `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**<:VC_tools:1478862265305272364> Impostazioni**",
          `<:VC_Modifica:1478859646587633717> **Nome:** ${thread.name || "sconosciuto"}`,
          `<:VC_Modifica:1478859646587633717> **Tipo:** ${threadTypeLabel(thread.type)}`,
          `<:VC_Modifica:1478859646587633717> **Archivio:** ${yesNo(Boolean(thread.archived))}`,
          `<:VC_Modifica:1478859646587633717> **Bloccato:** ${yesNo(Boolean(thread.locked))}`,
          `<:VC_Modifica:1478859646587633717> **Durata auto-archiviazione:** ${Number(thread.autoArchiveDuration || 0) ? formatItalianMinutesPlain(thread.autoArchiveDuration) : "Nessuna"}`,
          `<:VC_Modifica:1478859646587633717> **Slowmode per utente:** ${Number(thread.rateLimitPerUser || 0) || "Nessuna"}`,
        ];

        if (Array.isArray(thread.appliedTags) && thread.appliedTags.length) {
          lines.push(`<:VC_Modifica:1478859646587633717> **Tag applicati:** \`${thread.appliedTags.map((id) => String(id)).join(", ")}\``);
        }
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type", "archived", "locked", "auto_archive_duration", "rate_limit_per_user", "applied_tags"]));

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("<:VC_threads:1478515497569095760> Thread Creato")
          .setDescription(lines.join("\n"));

        const payload = { embeds: [embed] };
        if (thread.url) {
          payload.components = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel("Vai al Thread")
                .setEmoji("<:VC_threads:1478515497569095760>")
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