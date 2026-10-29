const { EmbedBuilder, ChannelType, PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached, getGuildMemberCached, getGuildRoleCached } = require("./interactionEntityCache") as typeof import("./interactionEntityCache");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getCustomPrivateCategoryIdSet, isChannelInCustomPrivateCategory } = require("../Community/customPrivateCategoryUtils") as typeof import("../Community/customPrivateCategoryUtils");

async function fetchGuildChannel(guild?, channelId?) {
  return getGuildChannelCached(guild, channelId);
}

async function fetchGuildMember(guild?, userId?) {
  return getGuildMemberCached(guild, userId);
}

async function fetchGuildRole(guild?, roleId?) {
  return getGuildRoleCached(guild, roleId);
}

async function replyEphemeral(interaction?, payload?) {
  if (interaction?.deferred && !interaction?.replied) {
    return interaction.editReply(payload).catch(() => {});
  }
  if (interaction?.replied) {
    return interaction.followUp(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

function parseRoleActionId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length !== 3) return null;
  const [head, ownerId, roleId] = parts;
  if (!head || !ownerId || !roleId) return null;
  return { head, ownerId, roleId };
}

function parseVoiceActionId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length !== 3) return null;
  const [head, ownerId, channelId] = parts;
  if (!head || !ownerId || !channelId) return null;
  if (
    head !== "customvoc_name" &&
    head !== "customvoc_emoji" &&
    head !== "customvoc_add" &&
    head !== "customvoc_remove"
  )
    return null;
  return { head, ownerId, channelId };
}

function findCustomVoiceByRole(guild?, roleId?) {
  if (!guild || !roleId) return null;
  return (
    guild.channels.cache.find((ch?) => {
      if (ch.type !== ChannelType.GuildVoice) return false;
      if (!isChannelInCustomPrivateCategory(ch, guild)) return false;
      const overwrite = ch.permissionOverwrites.cache.get(roleId);
      if (!overwrite) return false;
      return (
        overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) &&
        overwrite.allow.has(PermissionsBitField.Flags.Connect) &&
        overwrite.allow.has(PermissionsBitField.Flags.Speak)
      );
    }) || null
  );
}

function findCustomVoiceByOwner(guild?, ownerId?) {
  const uid = String(ownerId || "").trim();
  if (!guild || !uid) return null;
  return (
    guild.channels.cache.find((ch?) => {
      if (ch.type !== ChannelType.GuildVoice) return false;
      if (!isChannelInCustomPrivateCategory(ch, guild)) return false;
      const overwrite = ch.permissionOverwrites.cache.get(uid);
      if (!overwrite) return false;
      return (
        overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) &&
        overwrite.allow.has(PermissionsBitField.Flags.Connect) &&
        overwrite.allow.has(PermissionsBitField.Flags.Speak) &&
        overwrite.allow.has(PermissionsBitField.Flags.ManageChannels)
      );
    }) || null
  );
}

function listCustomPrivateVoiceChannelsByOwner(guild?, ownerId?) {
  const privateCategoryIds = getCustomPrivateCategoryIdSet(guild);
  const uid = String(ownerId || "").trim();
  if (!guild?.channels?.cache || !privateCategoryIds.size || !/^\d{17,22}$/.test(uid)) return [];
  const ManageChannels = PermissionsBitField.Flags.ManageChannels;
  const MoveMembers = PermissionsBitField.Flags.MoveMembers;
  const Connect = PermissionsBitField.Flags.Connect;
  const list = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    if (!privateCategoryIds.has(String(ch.parentId || ""))) continue;
    const ow = ch.permissionOverwrites?.cache?.get(uid);
    if (!ow?.allow) continue;
    if (ow.allow.has(Connect) && (ow.allow.has(MoveMembers) || ow.allow.has(ManageChannels))) list.push(ch);
  }
  list.sort((a?, b?) => a.id.localeCompare(b.id));
  return list;
}

function discoverCustomPrivateVoiceOwnersFromGuild(guild?) {
  const privateCategoryIds = getCustomPrivateCategoryIdSet(guild);
  const botId = String(guild?.client?.user?.id || "");
  const owners = new Map();
  if (!guild?.channels?.cache || !privateCategoryIds.size) return owners;
  const ManageChannels = PermissionsBitField.Flags.ManageChannels;
  const MoveMembers = PermissionsBitField.Flags.MoveMembers;
  const Connect = PermissionsBitField.Flags.Connect;
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    if (!privateCategoryIds.has(String(ch.parentId || ""))) continue;
    const overwrites = ch.permissionOverwrites?.cache;
    if (!overwrites) continue;
    for (const ow of overwrites.values()) {
      if (ow.type !== OverwriteType.Member) continue;
      const uid = String(ow.id || "");
      if (!uid || uid === botId || !/^\d{17,22}$/.test(uid)) continue;
      if (!ow.allow?.has(Connect)) continue;
      if (!ow.allow?.has(MoveMembers) && !ow.allow?.has(ManageChannels)) continue;
      const prev = owners.get(uid);
      if (!prev || ch.id.localeCompare(prev) < 0) owners.set(uid, ch.id);
    }
  }
  return owners;
}

function canManageRole(interaction?, role?) {
  const me =
    interaction.guild?.members?.me ||
    interaction.guild?.members?.cache?.get(interaction.client.user.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles))
    return false;
  if (!role) return false;
  return role.position < me.roles.highest.position;
}

function refreshEmbedRoleLine(sourceEmbed?, role?) {
  const embed = sourceEmbed
    ? EmbedBuilder.from(sourceEmbed)
    : new EmbedBuilder().setColor("#6f4e37");
  const oldDesc = String(embed.data?.description || "");
  let nextDesc = oldDesc;
  if (/\*\*Ruolo:\*\*/.test(oldDesc)) {
    nextDesc = oldDesc.replace(
      /(\*\*Ruolo:\*\*\n)([\s\S]*)$/m,
      `$1${role}`,
    );
  } else {
    nextDesc = [oldDesc, "", "<:VC_Mention:1482526855289634997> **Ruolo:**", `${role}`]
      .join("\n")
      .trim();
  }
  embed.setDescription(nextDesc);
  return embed;
}

const CUSTOM_VOC_EMOJI_TOKEN_RE = /<a?:[a-zA-Z0-9_~]{2,32}:\d{16,22}>/g;

function extractFirstUnicodeEmoji(text?) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const part of segmenter.segment(raw)) {
      const seg = String(part.segment || "").trim();
      if (!seg) continue;
      if (/\p{Extended_Pictographic}/u.test(seg) || /\p{Emoji_Presentation}/u.test(seg)) return seg;
    }
  } catch {
    const match = raw.match(/\p{Extended_Pictographic}/u);
    if (match) return match[0];
  }
  return "";
}

function normalizeCustomVocEmojiValue(raw?) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (/^nessuno$/i.test(text) || /^rimuovi$/i.test(text)) return "\uD83C\uDFA7";
  const unicode = extractFirstUnicodeEmoji(text.replace(CUSTOM_VOC_EMOJI_TOKEN_RE, " ").trim()) || extractFirstUnicodeEmoji(text);
  if (unicode) return unicode;
  if (CUSTOM_VOC_EMOJI_TOKEN_RE.test(text)) return "";
  const compact = text.replace(/\s+/g, "");
  if (compact.length >= 1 && compact.length <= 8 && !/[<>]/.test(compact)) return compact;
  return "";
}

function extractCustomVocEmojiFromMessage(message?) {
  const content = String(message?.content || "").trim();
  if (!content) return "";
  return normalizeCustomVocEmojiValue(content);
}

function sanitizeVoiceBaseName(name?) {
  const clean = String(name || "")
    .replace(/[^\p{L}\p{N}_ ',.!?\-']/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "privata";
  return clean;
}

/* discordNameEmoji1: SEP = U+01C0 ǀ (lettera). Win/font fallback trasformava
   U+FE32 ︰ in "-" sul sito; |/│/｜ venivano sanitizzati. */
const CUSTOM_VOC_SEP = "\u01C0";
const CUSTOM_VOC_SEPARATORS = [
  CUSTOM_VOC_SEP,
  "\uFE32",
  "\u2758",
  "︲",
  "|",
  "│",
  "｜",
  "⠂",
  "•",
  "·",
  "—",
  "–",
  "-",
];

function parseCustomVocName(rawName?) {
  const name = String(rawName || "").trim();
  if (!name) return { emoji: "", baseName: "privata" };

  for (const separator of CUSTOM_VOC_SEPARATORS) {
    if (!name.includes(separator)) continue;
    const parts = name.split(separator);
    const left = String(parts.shift() || "")
      .replace(/^\u0F04/u, "")
      .replace(/^༄/u, "")
      .trim();
    const right = parts.join(separator).trim();
    /* dash solo se sinistra è emoji corta (evita spezzare nomi con "-") */
    if (separator === "-" && left.length > 8) continue;
    return { emoji: left, baseName: right || "privata" };
  }

  return { emoji: "", baseName: name };
}

function buildCustomVocName(emoji?, baseName?) {
  const safeEmoji = normalizeCustomVocEmojiValue(emoji) || "\uD83C\uDFA7";
  const safeBase = sanitizeVoiceBaseName(baseName);
  const prefix = `\u0F04${safeEmoji}${CUSTOM_VOC_SEP}`;
  const maxBaseLength = Math.max(1, 100 - prefix.length);
  return `${prefix}${safeBase.slice(0, maxBaseLength)}`;
}

export = { fetchGuildChannel, fetchGuildMember, fetchGuildRole, replyEphemeral, parseRoleActionId, parseVoiceActionId, findCustomVoiceByRole, findCustomVoiceByOwner, listCustomPrivateVoiceChannelsByOwner, discoverCustomPrivateVoiceOwnersFromGuild, canManageRole, refreshEmbedRoleLine, sanitizeVoiceBaseName, parseCustomVocName, buildCustomVocName, extractFirstUnicodeEmoji, normalizeCustomVocEmojiValue, extractCustomVocEmojiFromMessage };