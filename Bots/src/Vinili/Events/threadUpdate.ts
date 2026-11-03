const { AuditLogEvent, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const { toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Moderation/utils/channelRolesLogUtils") as typeof import("../Moderation/utils/channelRolesLogUtils");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
const THREAD_UPDATE_ACTION = AuditLogEvent?.ThreadUpdate ?? 111;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function normalizeTagList(value?) {
  const list = Array.isArray(value) ? value.map((id?) => String(id)) : [];
  list.sort((a?, b?) => a.localeCompare(b));
  return list;
}

function isHttpUrl(value?) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

async function resolveResponsibleWithRetry(guild?, threadId?, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit=await resolveResponsible(guild,THREAD_UPDATE_ACTION,(entry?) => String(entry?.target?.id||"")===String(threadId||""),);
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

export = {
  name: "threadUpdate",
  async execute(oldThread?, newThread?) {
    try {
      const guild = newThread?.guild || oldThread?.guild;
      const threadId = String(newThread?.id || oldThread?.id || "");
      if (!guild || !threadId) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;

      const nameChanged = oldThread?.name !== newThread?.name;
      const archivedChanged = Boolean(oldThread?.archived) !== Boolean(newThread?.archived);
      const lockedChanged = Boolean(oldThread?.locked) !== Boolean(newThread?.locked);
      const oldTags = normalizeTagList(oldThread?.appliedTags);
      const newTags = normalizeTagList(newThread?.appliedTags);
      const tagsChanged=String(oldTags.join(","))!==String(newTags.join(","));
      if (!nameChanged && !archivedChanged && !lockedChanged && !tagsChanged) return;

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const audit = await resolveResponsibleWithRetry(guild, threadId);
      const responsible = formatAuditActor(audit.executor);

      const lines = [
        `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
        `<:VC_User:1482527453586002103> **Utente:** ${newThread || oldThread || "thread"} \`${threadId}\``,
        `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**<:VC_tools:1478862265305272364> Cambiamenti**",
      ];

      if (nameChanged) {
        lines.push(`<:VC_Modifica:1478859646587633717> **Nome:** ${oldThread.name || "sconosciuto"} <a:VC_Arrow:1482706699365257397> ${newThread.name || "sconosciuto"}`);
      }
      if (archivedChanged) {
        lines.push(
          `<:VC_Modifica:1478859646587633717> **Archivio:** ${yesNo(Boolean(oldThread.archived))} <a:VC_Arrow:1482706699365257397> ${yesNo(Boolean(newThread.archived))}`,
        );
      }
      if (lockedChanged) {
        lines.push(
          `<:VC_Modifica:1478859646587633717> **Bloccato:** ${yesNo(Boolean(oldThread.locked))} <a:VC_Arrow:1482706699365257397> ${yesNo(Boolean(newThread.locked))}`,
        );
      }
      if (tagsChanged) {
        lines.push(
          `<:VC_Modifica:1478859646587633717> **Tag applicati:** \`${oldTags.join(", ") || "nessuno"}\` <a:VC_Arrow:1482706699365257397> \`${newTags.join(", ") || "nessuno"}\``,
        );
      }
      lines.push(...buildAuditExtraLines(audit.entry, ["name", "archived", "locked", "applied_tags"]));

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("<:VC_threads:1478515497569095760> Thread Aggiornato")
        .setDescription(lines.join("\n"));

      const payload: Record<string, any> = { embeds: [embed] };
      if (isHttpUrl(newThread?.url)) {
        payload.components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Vai al Thread")
              .setEmoji("<:VC_threads:1478515497569095760>")
              .setURL(newThread.url),
          ),
        ];
      }
      await logChannel.send(payload).catch(() => null);
    } catch (error) {
      global.logger?.error?.("[threadUpdate] failed:", error);
    }
  },
};