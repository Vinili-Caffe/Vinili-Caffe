const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { GuildRepost } = require("../../Schemas/Community/repostSchema");
const { QuotePrivacy } = require("../../Schemas/Community/communitySchemas");
const { normalizeQuoteMessageText } = require("../../Utils/Quote/normalizeQuoteMessageText");
const { resolveQuotePostChannel } = require("../../Utils/Quote/quotePostChannel");
const { resolveRoulettePostChannel } = require("../../Utils/Quote/repostRoulettePostChannel");
const { nextQuoteCount } = require("../../Utils/Quote/quoteCounter");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { DEFAULT_FOOTER_TEXT } = require("../../Utils/Embeds/defaultFooter");

const REPOST_COLOR = 0xeb6ea5;
const REPOST_BTN_PREFIX = "repost_btn:";
const REPOST_SRC_PREFIX = "repost_src:";
const REPOST_EMOJI = "<a:reddiamond:1443652837346377841>";
const MAX_EMBED_BODY_CHARS = 3600;
const REPOST_DISABLED_MESSAGE = "I repost sono disattivati su questo server per ora.";

function isRepostDisabledInGuild(_guildId) {
  return false;
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

function resolveQuotedAuthorIdFromQuoteMessage(targetMessage) {
  const embeds = Array.isArray(targetMessage?.embeds) ? targetMessage.embeds : [];
  for (const emb of embeds) {
    const fields = Array.isArray(emb?.fields) ? emb.fields : [];
    for (const field of fields) {
      if (!/messaggio di/i.test(String(field?.name || ""))) continue;
      const match = String(field?.value || "").match(/<@!?(\d{16,20})>/);
      if (match?.[1]) return match[1];
    }
  }
  return null;
}

function resolveReposterProfile(reposter) {
  const name = accountUsername(reposter);
  let iconURL = null;
  try {
    iconURL = guildMemberDisplayAvatarUrlDynamic(reposter, { size: 128 }) || null;
  } catch {
    iconURL = null;
  }
  return { name: String(name).slice(0, 256), iconURL };
}

function buildShareAckEmbed({ reposterId, boardUrl, prefix }) {
  const safePrefix = String(prefix || "").trim() || "+";
  const linkLine = boardUrl ? `» [Clicca qui per vedere il repost](${boardUrl})` : "» Repost salvato.";
  const lines = [
    `${REPOST_EMOJI} * . ˊ <@${reposterId}> ha repostato questo messaggio.`,
    "",
    linkLine,
  ];
  const footerHint = `✧ * . ˊ ${safePrefix}repost`;
  const footerText = DEFAULT_FOOTER_TEXT ? `${footerHint} · ${DEFAULT_FOOTER_TEXT}` : footerHint;
  return new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setDescription(lines.join("\n"))
    .setFooter({ text: footerText });
}

function buildBoardEmbed({
  reposter,
  reposterId,
  sourceAuthorId,
  sourceUrl,
  totalPosts,
  text,
  imageUrl,
  commandPrefix,
  imageOnly,
}) {
  const profile = resolveReposterProfile(reposter);
  const safePrefix = String(commandPrefix || "").trim() || "+";
  const parts = [`di <@${reposterId}> 🎀`];
  if (!imageOnly) {
    const body = formatRepostBody(text);
    if (body) parts.push("", body);
  }
  parts.push("", `• [Clicca qui per andare al messaggio](${sourceUrl})`, "", `ɤ⌒➴ Autore del messaggio: <@${sourceAuthorId}>`);

  const embed = new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setAuthor({ name: profile.name, iconURL: profile.iconURL || undefined })
    .setTitle(`🆕 * . ˊ Nuovo repost!`)
    .setDescription(parts.join("\n"))
    .setFooter({
      text: `† · ৎ Aggiungi un messaggio alla bacheca ⭐ usando il comando ${safePrefix}repost · Post #${totalPosts}`,
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

async function resolveBoardChannel(guild, replyChannel, preferBoardChannel = true) {
  const prefersBoard = preferBoardChannel !== false;
  if (!prefersBoard && replyChannel?.isTextBased?.()) return replyChannel;
  const dedicated = await resolveQuotePostChannel(guild);
  if (prefersBoard && dedicated?.isTextBased?.()) return dedicated;
  if (replyChannel?.isTextBased?.()) return replyChannel;
  return null;
}

async function findExistingBoardPost(guildId, sourceChannelId, sourceMessageId) {
  const gid = String(guildId || "").trim();
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!gid || !sc || !sm) return null;
  return GuildRepost.findOne({
    guildId: gid,
    sourceChannelId: sc,
    sourceMessageId: sm,
    boardChannelId: { $ne: "" },
    boardMessageId: { $ne: "" },
  })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);
}

async function hasUserAlreadySavedRepost(guildId, reposterUserId, sourceChannelId, sourceMessageId) {
  const gid = String(guildId || "").trim();
  const uid = String(reposterUserId || "").trim();
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!gid || !uid || !sc || !sm) return false;
  const found = await GuildRepost.findOne({
    guildId: gid,
    reposterUserId: uid,
    sourceChannelId: sc,
    sourceMessageId: sm,
  })
    .select("_id")
    .lean()
    .catch(() => null);
  return Boolean(found?._id);
}

async function createRepostFromMessage(ctx) {
  const { guild, reposter, targetMessage, replyChannel: replyChannelRaw, preferBoardChannel, quotedAuthorId } = ctx;
  const reposterId = String(reposter?.id || reposter?.user?.id || "");
  const guildId = String(guild?.id || "");
  if (isRepostDisabledInGuild(guildId)) {
    return { ok: false, message: REPOST_DISABLED_MESSAGE };
  }
  if (!isValidGuildUserId(guildId, reposterId)) {
    return { ok: false, message: "Contesto non valido." };
  }

  let quoteAuthorId = String(quotedAuthorId || "").trim();
  const author = targetMessage?.author;
  if (!quoteAuthorId && author?.bot) {
    quoteAuthorId = resolveQuotedAuthorIdFromQuoteMessage(targetMessage) || "";
  }
  const imageUrlFromMessage = pickImageUrlFromMessage(targetMessage);
  const fromQuoteCanvas = Boolean(
    quoteAuthorId && /^\d{16,20}$/.test(quoteAuthorId) && imageUrlFromMessage,
  );
  if (!fromQuoteCanvas && (!author || author.bot)) {
    return { ok: false, message: "Non puoi repostare messaggi di bot." };
  }

  const sourceAuthorId = fromQuoteCanvas ? quoteAuthorId : String(author.id);
  let payload;
  if (fromQuoteCanvas) {
    const imageUrl = imageUrlFromMessage;
    if (!imageUrl) {
      return {
        ok: false,
        message: "Impossibile trovare l'immagine della quote da repostare.",
      };
    }
    payload = { text: "", imageUrl, hasContent: true };
  } else {
    payload = extractRepostPayload(targetMessage);
    if (!payload.hasContent) {
      return {
        ok: false,
        message: "Il messaggio deve avere testo o un'immagine da repostare.",
      };
    }
  }

  if (await checkQuotePrivacyBlocked(guildId, sourceAuthorId)) {
    const blockedMember = await getGuildMemberCached(guild, sourceAuthorId).catch(() => null);
    const authorLabel = accountUsername(blockedMember) || accountUsername(author) || "Utente";
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
  const boardChannel = await resolveBoardChannel(guild, replyChannel, preferBoardChannel);
  if (!boardChannel?.isTextBased?.()) {
    return { ok: false, message: "Impossibile pubblicare il repost in questo canale." };
  }

  if (await hasUserAlreadySavedRepost(guildId, reposterId, targetMessage.channel.id, targetMessage.id)) {
    const existingBoard = await findExistingBoardPost(guildId, targetMessage.channel.id, targetMessage.id);
    const boardUrl = existingBoard?.boardChannelId && existingBoard?.boardMessageId
      ? messageJumpUrl(guildId, existingBoard.boardChannelId, existingBoard.boardMessageId)
      : "";
    const prefix = String(guild?.client?.config?.prefix || "+").trim() || "+";
    return { ok: true, ackEmbed: buildShareAckEmbed({ reposterId, boardUrl, prefix }), repostId: "", components: [] };
  }

  const sourceUrl = messageJumpUrl(guildId, targetMessage.channel.id, targetMessage.id);
  const commandPrefix = String(guild?.client?.config?.prefix || "+").trim() || "+";
  const boardEmbed = buildBoardEmbed({
    reposter,
    reposterId,
    sourceAuthorId,
    sourceUrl,
    totalPosts,
    text: payload.text,
    imageUrl: payload.imageUrl,
    commandPrefix,
    imageOnly: fromQuoteCanvas,
  });

  const sourceMember = fromQuoteCanvas
    ? await getGuildMemberCached(guild, sourceAuthorId).catch(() => null)
    : targetMessage.member;
  const authorLabel =
    accountUsername(sourceMember) ||
    accountUsername(author) ||
    targetMessage.member?.displayName ||
    author?.username ||
    "Utente";

  const existingBoard = await findExistingBoardPost(guildId, targetMessage.channel.id, targetMessage.id);
  const existingBoardChannelId = String(existingBoard?.boardChannelId || "").trim();
  const existingBoardMessageId = String(existingBoard?.boardMessageId || "").trim();

  const doc = await GuildRepost.create({
    guildId,
    reposterUserId: reposterId,
    sourceAuthorId,
    sourceChannelId: String(targetMessage.channel.id),
    sourceMessageId: String(targetMessage.id),
    content: payload.text,
    attachmentUrl: payload.imageUrl || "",
    authorUsername: authorLabel,
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlDynamic(sourceMember || targetMessage.member || author, { size: 512 }) || "",
    boardChannelId: existingBoardChannelId || String(boardChannel.id),
    totalPosts,
    boardMessageId: existingBoardMessageId || "",
  }).catch(() => null);

  if (!doc?._id) {
    return { ok: false, message: "Impossibile salvare il repost." };
  }

  const repostId = String(doc._id);
  let boardMessage = null;
  let boardUrl = "";
  if (existingBoardChannelId && existingBoardMessageId) {
    boardUrl = messageJumpUrl(guildId, existingBoardChannelId, existingBoardMessageId);
  } else {
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

    boardMessage = boardMsg;
    await GuildRepost.updateOne(
      { _id: doc._id },
      { $set: { boardMessageId: String(boardMsg.id), boardChannelId: String(boardChannel.id) } },
    ).catch(() => {});

    boardUrl = messageJumpUrl(guildId, boardChannel.id, boardMsg.id);
  }
  const prefix = String(guild?.client?.config?.prefix || "+").trim() || "+";
  const ackEmbed = buildShareAckEmbed({ reposterId, boardUrl, prefix });

  return {
    ok: true,
    ackEmbed,
    boardMessage,
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
  let quotedAuthorId = "";

  if (raw.startsWith(REPOST_SRC_PREFIX)) {
    const parts = raw.slice(REPOST_SRC_PREFIX.length).split(":");
    sourceChannelId = String(parts[0] || "").trim();
    sourceMessageId = String(parts[1] || "").trim();
    quotedAuthorId = String(parts[2] || "").trim();
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
    preferBoardChannel: true,
    quotedAuthorId,
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

  const rouletteChannel = await resolveRoulettePostChannel(guild);
  if (!rouletteChannel?.isTextBased?.()) return false;

  const sourceUrl = messageJumpUrl(guildId, doc.sourceChannelId, doc.sourceMessageId);
  const imageUrl = String(doc.attachmentUrl || "").trim();
  const text = String(doc.content || "").trim();

  const embed = buildRouletteEmbed({ sourceUrl, text, imageUrl });
  const repostId = String(doc._id);

  await rouletteChannel
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