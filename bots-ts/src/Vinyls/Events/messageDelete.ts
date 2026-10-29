const { EmbedBuilder, MessageFlagsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { getGuildChannelCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { maybePunishCountingOnDelete } = require("../Utils/Message/officialMessageCommunityHandlers") as typeof import("../Utils/Message/officialMessageCommunityHandlers");
const { toDiscordTimestamp } = require("../Utils/Logging/channelRolesLogUtils") as typeof import("../Utils/Logging/channelRolesLogUtils");
const { handlePartnerDescriptionMessageDelete } = require("../Services/Partner/partnerDescriptionSyncService") as typeof import("../Services/Partner/partnerDescriptionSyncService");
const { handleTenantPartnerDescriptionMessageDelete } = require("../Services/Partner/tenantPartnerDescriptionService") as typeof import("../Services/Partner/tenantPartnerDescriptionService");

function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

const MAX_CONTENT_LOG_LENGTH = 1800;
const VERIFICATION_EXCLUDED_CHANNEL_IDS=new Set([IDs.channels.verify,IDs.channels.clickMe,IDs.channels.activityLogs].filter(Boolean).map((id?) => String(id)));

async function resolveMessage(message?) {
  if (!message?.partial) return message;
  try {
    return await message.fetch();
  } catch {
    return message;
  }
}

function buildSnipePayload(message?, channelId?) {
  const firstAttachment = message.attachments?.first?.() || null;
  const firstEmbed = Array.isArray(message?.embeds) ? message.embeds[0] : null;
  const embedPreview = String(
    firstEmbed?.description || firstEmbed?.title || firstEmbed?.author?.name || "",
  ).trim();
  const embedFieldAnswers = Array.isArray(firstEmbed?.fields)
    ? firstEmbed.fields.map((f?) => String(f?.value || "").trim()).filter(Boolean).join("\n")
    : "";
  const content =
    message.content ||
    [embedPreview, embedFieldAnswers].filter(Boolean).join("\n") ||
    "Nessun contenuto.";
  return {
    messageId: String(message.id || "").trim() || null,
    content,
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || "Sconosciuto",
    channel: message.channel?.toString?.() || `<#${channelId}>`,
    attachment: firstAttachment?.proxyURL || null,
    isEmbedOnly:
      normalizeText(message?.content || "").length === 0 &&
      !Boolean(message?.attachments?.size) &&
      Array.isArray(message?.embeds) &&
      message.embeds.length > 0,
  };
}

function normalizeText(value?) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function hasMessageFlag(message?, flag?) {
  if (!message) return false;
  try {
    if (typeof message.flags?.has === "function") {
      return Boolean(message.flags.has(flag));
    }
  } catch (err) {
    const chId = String(message?.channelId || message?.channel?.id || "");
    if (chId !== String(IDs.channels?.activityLogs || "")) {
      global.logger?.warn?.("[messageDelete] ", err?.message || err);
    }
  }
  const raw = message?.flags?.bitfield ?? message?.flags ?? 0;
  try {
    const bits = typeof raw === "bigint" ? raw : BigInt(raw);
    const target = typeof flag === "bigint" ? flag : BigInt(flag);
    return (bits & target) === target;
  } catch {
    return false;
  }
}

function isTransientInteractionMessage(message?) {
  if (!message) return false;
  if (hasMessageFlag(message, MessageFlagsBitField.Flags.Ephemeral)) return true;
  if (hasMessageFlag(message, MessageFlagsBitField.Flags.Loading)) return true;
  return false;
}

function buildDeletedDiff(value?) {
  const text = normalizeText(value);
  const raw = text ? `- ${text}` : "- Nessun contenuto.";
  if (raw.length <= MAX_CONTENT_LOG_LENGTH) return raw;
  return `${raw.slice(0, MAX_CONTENT_LOG_LENGTH - 3)}...`;
}

function collectAttachmentNames(message?) {
  const names = [];
  const attachments = message?.attachments;
  if (!attachments) return names;
  for (const item of attachments.values()) {
    const name = String(item?.name || "").trim();
    if (name) names.push(name);
  }
  return names;
}

function firstImageAttachment(message?) {
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

function buildAuthorLabel(message?) {
  const author = message?.author;
  if (!author) return "sconosciuto";
  const flags = [];
  if (author?.bot) flags.push("BOT");
  if (message?.webhookId) flags.push("WEBHOOK");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${author}${suffix} \`${author.id}\``;
}

function hasMeaningfulDeleteData(message?) {
  if (!message) return false;
  if (isTransientInteractionMessage(message)) return false;
  const content = normalizeText(message.content || "");
  const hasContent = content.length > 0;
  const hasAttachments = Boolean(message.attachments?.size);
  const hasMessageId = Boolean(message.id);
  return (hasContent || hasAttachments) && hasMessageId;
}

async function resolveLogChannel(guild?) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId)) ||
    (await guild.channels.fetch(channelId).catch(() => null));
}

async function sendRaw(channel?, payload?) {
  if (!channel) return null;
  const originalSend = channel.__vcOriginalSend;
  if (typeof originalSend === "function") {
    return originalSend.call(channel, payload);
  }
  return channel.send(payload).catch(() => null);
}

async function sendDeleteLog(message?) {
  const guild = message?.guild;
  if (!guild) return;
  if (
    VERIFICATION_EXCLUDED_CHANNEL_IDS.has(
      String(message?.channelId || message?.channel?.id || ""),
    )
  ) {
    return;
  }

  const logChannel = await resolveLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const content = String(message?.content || "");
  const attachmentNames = collectAttachmentNames(message);
  const hasContent = normalizeText(content).length > 0;
  const hasAttachments = attachmentNames.length > 0;

  const lines=[`<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
    "",
    "**Impostazioni precedenti**",
    `<:VC_Modifica:1478859646587633717> **Canale:** ${message.channel||"#sconosciuto"}`,
    `<:VC_Modifica:1478859646587633717> **Id:** \`${message.id||"sconosciuto"}\``,];

  lines.push("<:VC_Modifica:1478859646587633717> **Contenuto:**");
  lines.push("```diff");
  lines.push(buildDeletedDiff(hasContent ? content : "Nessun contenuto."));
  lines.push("```");
  lines.push(
    `<:VC_Modifica:1478859646587633717> **Attachment:** ${hasAttachments ? `[ ${attachmentNames.join(", ")} ]` : "[ nessuno ]"}`,
  );
  if (message?.author) {
    lines.push(`<:VC_Modifica:1478859646587633717> **Autore:** ${buildAuthorLabel(message)}`);
  }

  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("<a:VC_Verified:1482532479637127188> Messaggio eliminato")
    .setDescription(lines.join("\n"));

  const preview = firstImageAttachment(message);
  if (preview?.url) {
    embed.setImage(preview.url);
  }

  await sendRaw(logChannel, { embeds: [embed] });
}

export = {
  name: "messageDelete",
  async execute(message?, client?) {
    let resolved = null;
    try {
      if (!message) return;
      const resolvedClient = client || message.client;

      resolved = await resolveMessage(message);
      if (!resolved?.guild) return;

      if (!isViniliFullFeatureGuild(resolved.guild.id)) {
        void handleTenantPartnerDescriptionMessageDelete(resolvedClient, resolved).catch(() => null);
        return;
      }

      void handlePartnerDescriptionMessageDelete(resolvedClient, resolved).catch(() => null);
      void handleTenantPartnerDescriptionMessageDelete(resolvedClient, resolved).catch(() => null);
      await maybePunishCountingOnDelete(resolved, resolvedClient);
      if (!hasMeaningfulDeleteData(resolved)) return;

      await sendDeleteLog(resolved);

      const channelId = resolved.channel?.id || resolved.channelId;
      if (!channelId || !resolvedClient) return;
      if (!resolvedClient.snipes) resolvedClient.snipes = new Map();

      const payload = buildSnipePayload(resolved, channelId);
      try {
        const { shouldSkipStoringSnipe } = require("../Services/Minigames/minigameService") as typeof import("../Services/Minigames/minigameService");
        if (shouldSkipStoringSnipe(resolvedClient, channelId, payload)) return;
      } catch (_) {}
      const existing = resolvedClient.snipes.get(channelId);
      const history = Array.isArray(existing) ? existing.slice(0, 9) : existing ? [existing] : [];
      const row = {
        ...payload,
        createdTimestamp: Number(payload?.createdTimestamp || resolved?.createdTimestamp || Date.now()),
        at: Date.now(),
      };
      history.unshift(row);
      resolvedClient.snipes.set(channelId, history.slice(0, 10));
    } catch (error) {
      const chId = String(resolved?.channel?.id || resolved?.channelId || message?.channelId || "");
      if (chId !== String(IDs.channels?.activityLogs || "")) {
        global.logger?.error?.("[messageDelete] failed:", error);
      }
    }
  },
};