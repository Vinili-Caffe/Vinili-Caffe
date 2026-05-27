const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { GuildRepost } = require("../../Schemas/Community/repostSchema");
const { QuotePrivacy } = require("../../Schemas/Community/communitySchemas");
const { normalizeQuoteMessageText } = require("../../Utils/Quote/normalizeQuoteMessageText");
const { resolveQuotePostChannel } = require("../../Utils/Quote/quotePostChannel");
const { nextQuoteCount } = require("../../Utils/Quote/quoteCounter");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const IDs = require("../../Utils/Config/ids");

const REPOST_COLOR = 0xeb6ea5;
const REPOST_BTN_PREFIX = "repost_btn:";
const REPOST_SRC_PREFIX = "repost_src:";
const REPOST_EMOJI = "<a:reddiamond:1443652837346377841>";
const MAX_EMBED_BODY_CHARS = 3600;
const REPOST_DISABLED_MESSAGE = "I repost sono disattivati su questo server per ora.";

function isRepostDisabledInGuild(guildId) {
  const gid = String(guildId || "").trim();
  const mainId = String(IDs.guilds?.main || "").trim();
  return Boolean(gid && mainId && gid === mainId);
}

function messageJumpUrl(guildId, channelId, messageId) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!g || !c || !m) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

function escapeItalicMarkdown(text) {
  return String(text || "").replace(/\*/g, "\\*").replace(/_/g, "\\_");
}

function formatRepostBody(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const clipped = raw.length > MAX_EMBED_BODY_CHARS ? `${raw.slice(0, MAX_EMBED_BODY_CHARS - 1)}…` : raw;
  return `» *${escapeItalicMarkdown(clipped)}*`;
}

function pickImageUrlFromMessage(targetMessage) {
  if (!targetMessage) return "";
  for (const att of targetMessage.attachments.values()) {
    const ct = String(att.contentType || "").toLowerCase();
    if (ct.startsWith("image/") || ct === "image/gif") return String(att.url || "");
    const name = String(att.name || "").toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return String(att.url || "");
  }
  const embeds = Array.isArray(targetMessage.embeds) ? targetMessage.embeds : [];
  for (const emb of embeds) {
    if (emb?.image?.url) return String(emb.image.url);
    if (emb?.thumbnail?.url) return String(emb.thumbnail.url);
  }
  return "";
}

function extractRepostPayload(targetMessage) {
  const text = normalizeQuoteMessageText(targetMessage).trim();
  const imageUrl = pickImageUrlFromMessage(targetMessage);
  return { text, imageUrl, hasContent: Boolean(text || imageUrl) };
}

function resolveReposterProfile(reposter) {
  const user = reposter?.user || reposter;
  const name =
    reposter?.displayName ||
    user?.globalName ||
    user?.username ||
    "Utente";
  let iconURL = null;
  try {
    if (typeof reposter?.displayAvatarURL === "function") {
      iconURL = reposter.displayAvatarURL({ size: 128, extension: "png" });
    } else if (typeof user?.displayAvatarURL === "function") {
      iconURL = user.displayAvatarURL({ size: 128, extension: "png" });
    }
  } catch {
    iconURL = null;
  }
  return { name: String(name).slice(0, 256), iconURL };
}

function buildShareAckEmbed({ reposterId, boardUrl, rare }) {
  const lines = rare
    ? [
        `${REPOST_EMOJI} * . ˊ <@${reposterId}> ha trovato un messaggio raro e l'ha ripubblicato per tutti!`,
        `» [Clicca qui](${boardUrl}) per vedere il repost`,
        `✧ * . ˊ +repost`,
      ]
    : [
        `${REPOST_EMOJI} * . ˊ <@${reposterId}> ha condiviso questo messaggio`,
        `» [Clicca qui per vedere il repost](${boardUrl})`,
        `${REPOST_EMOJI} * . ˊ +repost`,
      ];
  return new EmbedBuilder().setColor(REPOST_COLOR).setDescription(lines.join("\n"));
}

function buildBoardEmbed({ reposter, reposterId, sourceAuthorId, sourceUrl, totalPosts, text, imageUrl }) {
  const profile = resolveReposterProfile(reposter);
  const parts = [
    `di 🍵 <@${reposterId}> 🎀`,
    `• [Clicca qui per andare al messaggio](${sourceUrl})`,
    `ɤ⌒➴ Autore del messaggio: 🍵 <@${sourceAuthorId}>`,
  ];
  const body = formatRepostBody(text);
  if (body) parts.push(body);

  const embed = new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setAuthor({ name: profile.name, iconURL: profile.iconURL || undefined })
    .setTitle(`${REPOST_EMOJI} * . ˊ Nuovo repost!`)
    .setDescription(parts.join("\n"))
    .setFooter({
      text: `† · ৎ Aggiungi un messaggio alla bacheca ⭐ usando il comando +repost · Post #${totalPosts}`,
    });

  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildRouletteEmbed({ sourceUrl, text, imageUrl }) {
  const parts = [];
  const body = formatRepostBody(text);
  if (body) parts.push(body);
  parts.push(`• [Messaggio Originale](${sourceUrl})`);

  const embed = new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setTitle(`${REPOST_EMOJI} * . ˊ Roulette dei Repost Passati`)
    .setDescription(parts.join("\n\n"))
    .setFooter({ text: "† · ৎ Revival casuale dal database 🎲" });

  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildRepostaButtonRow(repostId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${REPOST_BTN_PREFIX}${repostId}`)
      .setLabel("Reposta")
      .setEmoji("1443652837346377841")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function checkQuotePrivacyBlocked(guildId, authorId) {
  try {
    const privacy = await QuotePrivacy.findOne({ guildId, userId: authorId }).lean();
    return Boolean(privacy?.blocked);
  } catch {
    return false;
  }
}

async function resolveBoardChannel(guild, replyChannel) {
  const dedicated = await resolveQuotePostChannel(guild);
  if (dedicated?.isTextBased?.()) return dedicated;
  if (replyChannel?.isTextBased?.()) return replyChannel;
  return null;
}

async function createRepostFromMessage(ctx) {
  const { guild, reposter, targetMessage, replyChannel: replyChannelRaw } = ctx;
  const reposterId = String(reposter?.id || reposter?.user?.id || "");
  const guildId = String(guild?.id || "");
  if (isRepostDisabledInGuild(guildId)) {
    return { ok: false, message: REPOST_DISABLED_MESSAGE };
  }
  if (!isValidGuildUserId(guildId, reposterId)) {
    return { ok: false, message: "Contesto non valido." };
  }

  const author = targetMessage.author;
  if (!author || author.bot) {
    return { ok: false, message: "Non puoi repostare messaggi di bot." };
  }

  const payload = extractRepostPayload(targetMessage);
  if (!payload.hasContent) {
    return {
      ok: false,
      message: "Il messaggio deve avere testo o un'immagine da repostare.",
    };
  }

  if (await checkQuotePrivacyBlocked(guildId, author.id)) {
    const authorLabel = accountUsername(author) || author.username;
    return {
      ok: false,
      message: `**${authorLabel}** ha bloccato le quote dei propri messaggi.`,
      privacyBlocked: true,
    };
  }

  let totalPosts = 1;
  try {
    totalPosts = await nextQuoteCount(guildId);
  } catch {
    totalPosts = 1;
  }

  const replyChannel =
    replyChannelRaw?.isTextBased?.() ? replyChannelRaw : targetMessage.channel?.isTextBased?.() ? targetMessage.channel : null;
  const boardChannel = await resolveBoardChannel(guild, replyChannel);
  if (!boardChannel?.isTextBased?.()) {
    return { ok: false, message: "Impossibile pubblicare il repost in questo canale." };
  }

  const sourceUrl = messageJumpUrl(guildId, targetMessage.channel.id, targetMessage.id);
  const boardEmbed = buildBoardEmbed({
    reposter,
    reposterId,
    sourceAuthorId: author.id,
    sourceUrl,
    totalPosts,
    text: payload.text,
    imageUrl: payload.imageUrl,
  });

  const authorLabel = accountUsername(author) || targetMessage.member?.displayName || author.username;

  const doc = await GuildRepost.create({
    guildId,
    reposterUserId: reposterId,
    sourceAuthorId: String(author.id),
    sourceChannelId: String(targetMessage.channel.id),
    sourceMessageId: String(targetMessage.id),
    content: payload.text,
    attachmentUrl: payload.imageUrl || "",
    authorUsername: authorLabel,
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlDynamic(targetMessage.member || author, { size: 512 }) || "",
    boardChannelId: String(boardChannel.id),
    totalPosts,
  }).catch(() => null);

  if (!doc?._id) {
    return { ok: false, message: "Impossibile salvare il repost." };
  }

  const repostId = String(doc._id);
  const boardMsg = await boardChannel
    .send({
      embeds: [boardEmbed],
      components: [buildRepostaButtonRow(repostId)],
    })
    .catch(() => null);

  if (!boardMsg?.id) {
    await GuildRepost.deleteOne({ _id: doc._id }).catch(() => {});
    return { ok: false, message: "Impossibile pubblicare sulla bacheca." };
  }

  await GuildRepost.updateOne(
    { _id: doc._id },
    { $set: { boardMessageId: String(boardMsg.id) } },
  ).catch(() => {});

  const boardUrl = messageJumpUrl(guildId, boardChannel.id, boardMsg.id);
  const rare = Math.random() < 0.08;
  const ackEmbed = buildShareAckEmbed({ reposterId, boardUrl, rare });

  return {
    ok: true,
    ackEmbed,
    boardMessage: boardMsg,
    repostId,
    components: [buildRepostaButtonRow(repostId)],
  };
}

async function resolveSourceMessageFromInteraction(interaction, sourceChannelId, sourceMessageId) {
  const channel =
    interaction.guild.channels.cache.get(sourceChannelId) ||
    (await interaction.guild.channels.fetch(sourceChannelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel.messages.fetch(sourceMessageId).catch(() => null);
}

async function handleRepostaButton(interaction) {
  const raw = String(interaction.customId || "");
  if (!interaction.guild) return { handled: false };
  if (isRepostDisabledInGuild(interaction.guild.id)) {
    await interaction
      .reply({ content: REPOST_DISABLED_MESSAGE, flags: 1 << 6 })
      .catch(() => {});
    return { handled: true };
  }

  let sourceChannelId = "";
  let sourceMessageId = "";

  if (raw.startsWith(REPOST_SRC_PREFIX)) {
    const parts = raw.slice(REPOST_SRC_PREFIX.length).split(":");
    sourceChannelId = String(parts[0] || "").trim();
    sourceMessageId = String(parts[1] || "").trim();
  } else if (raw.startsWith(REPOST_BTN_PREFIX)) {
    const repostId = raw.slice(REPOST_BTN_PREFIX.length).trim();
    if (!repostId) {
      await interaction.reply({ content: "Repost non valido.", flags: 1 << 6 }).catch(() => {});
      return { handled: true };
    }
    const doc = await GuildRepost.findById(repostId).lean().catch(() => null);
    if (!doc || String(doc.guildId) !== String(interaction.guild.id)) {
      await interaction.reply({ content: "Repost non trovato.", flags: 1 << 6 }).catch(() => {});
      return { handled: true };
    }
    sourceChannelId = String(doc.sourceChannelId || "");
    sourceMessageId = String(doc.sourceMessageId || "");
  } else {
    return { handled: false };
  }

  const targetMessage = await resolveSourceMessageFromInteraction(
    interaction,
    sourceChannelId,
    sourceMessageId,
  );
  if (!targetMessage) {
    await interaction.reply({
      content: "Il messaggio originale non esiste più: non posso ripostarlo.",
      flags: 1 << 6,
    }).catch(() => {});
    return { handled: true };
  }

  await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});

  const result = await createRepostFromMessage({
    guild: interaction.guild,
    reposter: interaction.member || interaction.user,
    targetMessage,
    client: interaction.client,
    replyChannel: interaction.channel?.isTextBased?.() ? interaction.channel : null,
  });

  if (!result.ok) {
    await interaction
      .editReply({ content: result.message || "Repost fallito.", embeds: [], components: [] })
      .catch(() => {});
    return { handled: true };
  }

  await interaction
    .editReply({
      embeds: [result.ackEmbed],
      components: result.components || [],
    })
    .catch(() => {});

  return { handled: true };
}

async function pickRandomRepostForGuild(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const count = await GuildRepost.countDocuments({ guildId: gid }).catch(() => 0);
  if (!count) return null;
  const skip = Math.floor(Math.random() * count);
  return GuildRepost.findOne({ guildId: gid }).skip(skip).lean().catch(() => null);
}

async function sendRepostRoulette(client, guildId) {
  if (isRepostDisabledInGuild(guildId)) return false;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return false;

  const doc = await pickRandomRepostForGuild(guildId);
  if (!doc) return false;

  const boardChannel = await resolveQuotePostChannel(guild);
  if (!boardChannel?.isTextBased?.()) return false;

  const sourceUrl = messageJumpUrl(guildId, doc.sourceChannelId, doc.sourceMessageId);
  const imageUrl = String(doc.attachmentUrl || "").trim();
  const text = String(doc.content || "").trim();

  const embed = buildRouletteEmbed({ sourceUrl, text, imageUrl });
  const repostId = String(doc._id);

  await boardChannel
    .send({
      embeds: [embed],
      components: [buildRepostaButtonRow(repostId)],
    })
    .catch(() => null);

  return true;
}

async function listRepostsByUser(guildId, userId, opts = {}) {
  const limit = Math.min(25, Math.max(1, Number(opts.limit) || 10));
  const skip = Math.max(0, Number(opts.skip) || 0);
  const filter = { guildId: String(guildId), reposterUserId: String(userId) };
  const [rows, total] = await Promise.all([
    GuildRepost.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    GuildRepost.countDocuments(filter).catch(() => 0),
  ]);
  return { rows: rows || [], total: Number(total) || 0 };
}

module.exports = {
  REPOST_BTN_PREFIX,
  REPOST_SRC_PREFIX,
  REPOST_COLOR,
  REPOST_DISABLED_MESSAGE,
  isRepostDisabledInGuild,
  createRepostFromMessage,
  handleRepostaButton,
  sendRepostRoulette,
  listRepostsByUser,
  messageJumpUrl,
  buildRepostaButtonRow,
};