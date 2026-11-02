const { getPartnershipLogsChannelId } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");

function normalizePartnershipLogId(raw?) {
  const id = Math.floor(Number(raw));
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function isChannelOrThreadUnderTargetChannel(channel?, targetChannelId?) {
  const target = String(targetChannelId || "").trim();
  if (!target || !channel) return false;
  if (String(channel.id) === target) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    return String(channel.parentId || "") === target;
  }
  return false;
}

function isPartnershipExecuteLogChannel(channel?, guildId?) {
  const logsId = String(getPartnershipLogsChannelId(guildId) || "").trim();
  if (!logsId || !channel) return false;
  return isChannelOrThreadUnderTargetChannel(channel, logsId);
}

function isPartnershipPublishChannel(channel?, guildId?) {
  const { getPartnershipChannelId } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
  const publishId = String(getPartnershipChannelId(guildId) || "").trim();
  if (!publishId || !channel) return false;
  return isChannelOrThreadUnderTargetChannel(channel, publishId);
}

function isPartnershipDeleteContextChannel(channel?, guildId?) {
  return (
    isPartnershipPublishChannel(channel, guildId) ||
    isPartnershipExecuteLogChannel(channel, guildId)
  );
}

function collectPartnershipMessageText(message?) {
  const parts = [message?.content];
  for (const embed of message?.embeds || []) {
    parts.push(embed.title, embed.description, embed.footer?.text, embed.author?.name);
    for (const field of embed.fields || []) {
      parts.push(field.name, field.value);
    }
  }
  return parts.filter(Boolean).join("\n");
}

function isThankYouPartnershipMessage(message?) {
  for (const embed of message?.embeds || []) {
    const blob = `${embed.title || ""} ${embed.description || ""}`.toUpperCase();
    if (blob.includes("PARTNER EFFETTUATA")) return true;
  }
  return false;
}

function normalizePartnerLookupName(value?) {
  return String(value || "")
    .replace(/[🌊|•]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractManagerIdFromPartnershipText(text?) {
  const raw = String(text || "");
  const labeled = raw.match(/Manager:\s*<@!?(\d{16,20})>/i);
  if (labeled?.[1]) return labeled[1];
  const mentions = [...raw.matchAll(/<@!?(\d{16,20})>/g)].map((m?) => m[1]);
  return mentions.length ? mentions[mentions.length - 1] : null;
}

function extractUserIdFromDiscordAssetUrl(url?) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  const guildUser = raw.match(/\/guilds\/\d+\/users\/(\d{16,20})\//);
  if (guildUser?.[1]) return guildUser[1];
  const avatar = raw.match(/\/avatars\/(\d{16,20})\//);
  if (avatar?.[1]) return avatar[1];
  return null;
}

function extractPmUserIdFromThankYouEmbedAuthor(message?) {
  for (const embed of message?.embeds || []) {
    const author = embed?.author;
    if (!author) continue;
    const fromUrl =
      extractUserIdFromDiscordAssetUrl(author.iconURL) ||
      extractUserIdFromDiscordAssetUrl(author.proxyIconURL);
    if (fromUrl) return fromUrl;
  }
  return null;
}

function extractPartnerNamesFromMessage(message?) {
  const names = new Set();
  for (const embed of message?.embeds || []) {
    const footer = String(embed.footer?.text || "").trim();
    if (footer) {
      const head = footer.split("•")[0].trim();
      if (head) names.add(normalizePartnerLookupName(head));
      names.add(normalizePartnerLookupName(footer));
    }
    if (embed.author?.name) names.add(normalizePartnerLookupName(embed.author.name));
  }
  return Array.from(names).filter(Boolean);
}

function extractPartnershipLogIdFromText(text?) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const match =
    raw.match(/\*\*ID:\*\*\s*`(\d+)`/i) ||
    raw.match(/\*\*ID:\*\*\s*(\d+)/i) ||
    raw.match(/\bID:\s*`(\d+)`/i);
  if (!match?.[1]) return null;
  return normalizePartnershipLogId(match[1]);
}

function extractPartnershipLogIdFromMessage(message?) {
  if (!message) return null;
  for (const embed of message.embeds || []) {
    const chunks = [embed.title, embed.description, embed.footer?.text].filter(Boolean);
    for (const chunk of chunks) {
      const id = extractPartnershipLogIdFromText(chunk);
      if (id) return id;
    }
    for (const field of embed.fields || []) {
      const id = extractPartnershipLogIdFromText(`${field.name || ""}\n${field.value || ""}`);
      if (id) return id;
    }
  }
  return extractPartnershipLogIdFromText(message.content);
}

export = {
  normalizePartnershipLogId,
  isChannelOrThreadUnderTargetChannel,
  isPartnershipPublishChannel,
  isPartnershipDeleteContextChannel,
  collectPartnershipMessageText,
  isThankYouPartnershipMessage,
  normalizePartnerLookupName,
  extractManagerIdFromPartnershipText,
  extractPmUserIdFromThankYouEmbedAuthor,
  extractPartnerNamesFromMessage,
  extractPartnershipLogIdFromText,
  extractPartnershipLogIdFromMessage,
};
