const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlagsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { getGuildChannelCached, getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { runAutoModMessage } = require("../Services/Moderation/automodService");
const { handleDisboardBump, handleDiscadiaBump, handleVoteManagerMessage } = require("../Utils/Message/officialMessageAutomationHandlers");
const { handleMentionAutoReactions, handleWordReactions, maybePunishCountingOnEdit } = require("../Utils/Message/officialMessageCommunityHandlers");
const { toDiscordTimestamp } = require("../Utils/Logging/channelRolesLogUtils");
const { handlePartnerDescriptionMessageUpsert, isPartnerDescriptionChannel } = require("../Services/Partner/partnerDescriptionSyncService");
const { shouldDeleteHumanPartnershipsChannelMessage } = require("../Utils/Partner/partnerPointContextUtils");
const MAX_EMBED_DIFF_LENGTH = 900;
const VERIFICATION_EXCLUDED_CHANNEL_IDS = new Set(
  [IDs.channels.verify, IDs.channels.clickMe, IDs.channels.activityLogs].filter(Boolean).map((id) => String(id)),
);

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function collectAttachmentNames(message) {
  const names = [];
  const attachments = message?.attachments;
  if (!attachments) return names;
  for (const item of attachments.values()) {
    const name = String(item?.name || "").trim();
    if (name) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function buildSimpleDiff(before, after) {
  const prev = normalizeText(before);
  const next = normalizeText(after);
  if (!prev && !next) return "";
  return [
    prev ? `- ${prev}` : "- Nessun contenuto.",
    next ? `+ ${next}` : "+ Nessun contenuto.",
  ].join("\n");
}

function attachmentsChanged(beforeNames, afterNames) {
  if (beforeNames.length !== afterNames.length) return true;
  for (let i = 0; i < beforeNames.length; i += 1) {
    if (beforeNames[i] !== afterNames[i]) return true;
  }
  return false;
}

function formatAttachmentsChange(beforeNames, afterNames) {
  const oldLabel=beforeNames.length?`[ ${beforeNames.join(", ")}]`
    : "[ Nessuno ]";
  const newLabel=afterNames.length?`[ ${afterNames.join(", ")}]`
    : "[ Nessuno ]";
  return `${oldLabel} -> ${newLabel}`;
}

function buildEditLogText(previous, updated, beforeNames, afterNames) {
  const nowTs = Math.floor((Number(updated?.editedTimestamp) || Date.now()) / 1000);
  const oldContent = String(previous?.content || "");
  const newContent = String(updated?.content || "");
  const oldAttachments=beforeNames.length?beforeNames.join(", "):"Nessuno";
  const newAttachments=afterNames.length?afterNames.join(", "):"Nessuno";

  return [
    "------ LOG MODIFICA MESSAGGIO ------",
    `<:VC_Server:1494287244156049448> Server: ${updated?.guild?.name || "sconosciuto"} (${updated?.guild?.id || "-"})`,
    `<a:VC_Channel:1482534583944871996> Canale: ${updated?.channel?.name || "sconosciuto"} (${updated?.channelId || "-"})`,
    `<:VC_id:1478517313618575419> ID Messaggio: ${updated?.id || "-"}`,
    `<:VC_User:1482527453586002103> Autore: ${updated?.author?.tag || "sconosciuto"} (${updated?.author?.id || "-"})`,
    `<:VC_Clock:1473359204189474886> Data Modifica: <t:${nowTs}:F>`,
    "",
    "<:VC_Modifica:1478859646587633717> **Contenuto precedente:**",
    oldContent || "Nessun contenuto.",
    "",
    "<:VC_Modifica:1478859646587633717> **Contenuto nuovo:**",
    newContent || "Nessun contenuto.",
    "",
    "<:VC_Modifica:1478859646587633717> **Attachment:**",
    `<:VC_Modifica:1478859646587633717> **Attachment precedente:** ${oldAttachments}`,
    `<:VC_Modifica:1478859646587633717> **Attachment nuovo:** ${newAttachments}`,
    "",
  ].join("\n");
}

function firstImageAttachment(message) {
  const attachments = message?.attachments;
  if (!attachments) return null;
  for (const item of attachments.values()) {
    const contentType = String(item?.contentType || "").toLowerCase();
    if (contentType.startsWith("image/")) return item;
    const name = String(item?.name || "").toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(name)) return item;
  }
  return null;
}

function isHttpUrl(value) {
  const text = String(value || "").trim();
  return /^https?:\/\/\S+$/i.test(text);
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  const client = guild.client;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId)) || (client ? (await getClientChannelCached(client, channelId)) : null);
}

async function sendRaw(channel, payload) {
  if (!channel) return null;
  const originalSend = channel.__vcOriginalSend;
  if (typeof originalSend === "function") {
    return originalSend.call(channel, payload);
  }
  return channel.send(payload).catch(() => null);
}

async function sendMessageEditLog(previous, updated) {
  if (!updated?.guild || !updated?.author) return;
  if (
    updated.flags?.has(MessageFlagsBitField.Flags.Ephemeral) ||
    updated.flags?.has(MessageFlagsBitField.Flags.Loading)
  ) {
    return;
  }
  if (
    VERIFICATION_EXCLUDED_CHANNEL_IDS.has(
      String(updated?.channelId || updated?.channel?.id || ""),
    )
  ) {
    return;
  }
  const logChannel = await resolveLogChannel(updated.guild);
  if (!logChannel?.isTextBased?.()) return;

  const beforeContent = String(previous?.content || "");
  const afterContent = String(updated?.content || "");
  const beforeNames = collectAttachmentNames(previous);
  const afterNames = collectAttachmentNames(updated);

  const contentChanged = normalizeText(beforeContent) !== normalizeText(afterContent);
  const filesChanged = attachmentsChanged(beforeNames, afterNames);
  if (!contentChanged && !filesChanged) return;

  const actorFlags = [];
  if (updated?.author?.bot) actorFlags.push("BOT");
  if (updated?.webhookId) actorFlags.push("WEBHOOK");
  const actorSuffix = actorFlags.length ? ` [${actorFlags.join("/")}]` : "";

  const lines=[`<:VC_right_arrow:1482459908245815296> **Autore:** ${updated.author}${actorSuffix}\`${updated.author.id}\``,`<:VC_right_arrow:1482459908245815296> **Target:** ${updated.channel||"#sconosciuto"}•\`${updated.id}\``,`<:VC_right_arrow:1482459908245815296> ${toDiscordTimestamp(new Date(),"F")}`,
    "",
    "**Modifiche**",
  ];

  const files = [];
  if (contentChanged) {
    const fullDiff = buildSimpleDiff(beforeContent, afterContent);
    if (fullDiff.length <= MAX_EMBED_DIFF_LENGTH) {
      lines.push("<:VC_Modifica:1478859646587633717> **Contenuto:**");
      lines.push("```diff");
      lines.push(fullDiff);
      lines.push("```");
    } else {
      lines.push("<:VC_Modifica:1478859646587633717> **Contenuto:** diff troppo lungo, vedi allegato `.txt`.");
      const text = buildEditLogText(previous, updated, beforeNames, afterNames);
      const name = `${updated.channelId || "channel"}_${updated.id || Date.now()}.txt`;
      files.push(new AttachmentBuilder(Buffer.from(text, "utf8"), { name }));
    }
  }

  if (filesChanged) {
    lines.push("<:VC_Modifica:1478859646587633717> **Attachment:**");
    lines.push(formatAttachmentsChange(beforeNames, afterNames));
  }

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle("<a:VC_Verified:1482532479637127188> Messaggio modificato")
    .setDescription(lines.join("\n"));

  const preview = firstImageAttachment(updated);
  if (preview?.url) {
    embed.setImage(preview.url);
  }

  const payload = { embeds: [embed], files };
  if (isHttpUrl(updated.url)) {
    const row = new ActionRowBuilder()
    .addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Vai al Messaggio").setURL(updated.url),);
    payload.components = [row];
  }

  await sendRaw(logChannel, payload);
}

module.exports = {
  name: "messageUpdate",
  async execute(oldMessage, newMessage, client) {
    let previous = oldMessage;
    let updated = newMessage;
    const resolvedClient = client || newMessage?.client || oldMessage?.client;

    try {
      if (previous?.partial) {
        previous = await previous.fetch().catch(() => previous);
      }
      if (updated?.partial) {
        updated = await updated.fetch().catch(() => updated);
      }
      if (!updated?.guild || !updated?.author) return;

      if (shouldDeleteHumanPartnershipsChannelMessage(updated)) {
        await updated.delete().catch(() => null);
        return;
      }

      if (!updated.author.bot && !updated.system && !updated.webhookId) {
        await maybePunishCountingOnEdit(previous, updated, resolvedClient);
      }

      const before = String(previous?.content || "");
      const after = String(updated?.content || "");
      const contentChanged = before !== after;

      if (contentChanged && after && !updated.author.bot && !updated.system && !updated.webhookId) {
        try {
          const automodResult = await runAutoModMessage(updated);
          if (automodResult?.blocked) return;
        } catch (error) {
          global.logger?.error?.("[messageUpdate] automodazione failed:", error);
        }
        try {
          const { maybeBlockDiscordHeadingMarkdown } = require("../Services/Moderation/discordHeadingMarkdownBlock");
          if (await maybeBlockDiscordHeadingMarkdown(updated)) return;
        } catch (error) {
          global.logger?.error?.("[messageUpdate] blocco markdown discord failed:", error);
        }
      }

      await sendMessageEditLog(previous, updated);

      if (contentChanged && isPartnerDescriptionChannel(updated.channelId || updated.channel?.id)) {
        void handlePartnerDescriptionMessageUpsert(resolvedClient, updated).catch(() => null);
      }

      if (updated.author.bot || updated.system || updated.webhookId || updated.applicationId) {
        try {
          if (await handleDisboardBump(updated, resolvedClient)) return;
          if (await handleDiscadiaBump(updated, resolvedClient)) return;
          await handleVoteManagerMessage(updated, resolvedClient);
        } catch (error) {
          global.logger?.error?.("[messageUpdate] gestori automazione failed:", error);
        }
        return;
      }
      if (!after || !contentChanged) return;

      const [mentionsResult, wordResult] = await Promise.allSettled([
        handleMentionAutoReactions(updated),
        handleWordReactions(updated),
      ]);
      if (mentionsResult.status === "rejected") {
        global.logger?.error?.("[messageUpdate] reazioni menzione auto failed:", mentionsResult.reason);
      }
      if (wordResult.status === "rejected") {
        global.logger?.error?.("[messageUpdate] reazioni parola failed:", wordResult.reason);
      }

      const looksLikePrefix = after.startsWith("+");
      if (!looksLikePrefix) return;

      updated.__fromMessageUpdatePrefix = true;
      resolvedClient?.emit?.("messageCreate", updated);
    } catch (error) {
      global.logger?.error?.("[messageUpdate] errore:", error);
    }
  },
};