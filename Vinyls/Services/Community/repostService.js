const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { GuildRepost } = require("../../Schemas/Community/repostSchema");
const { RepostPrivacy } = require("../../Schemas/Community/communitySchemas");
const { normalizeQuoteMessageText } = require("../../Utils/Quote/normalizeQuoteMessageText");
const { resolveQuotePostChannel } = require("../../Utils/Quote/quotePostChannel");
const { resolveRoulettePostChannel } = require("../../Utils/Quote/repostRoulettePostChannel");
const { nextRepostCount } = require("../../Utils/Quote/quoteCounter");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { ensureMongoReady, withMongoTimeout } = require("../../Utils/Database/mongoConnect");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { DEFAULT_FOOTER_TEXT } = require("../../Utils/Embeds/defaultFooter");
const { pickRepostAckPhrase } = require("../../Data/Community/repostAckPhrases");

const REPOST_COLOR = 0xeb6ea5;
const REPOST_BTN_PREFIX = "repost_btn:";
const REPOST_SRC_PREFIX = "repost_src:";
const REPOST_EMOJI = "<a:reddiamond:1443652837346377841>";
const EPHEMERAL_FLAG = 1 << 6;
const MAX_EMBED_BODY_CHARS = 3600;
const REPOST_DISABLED_MESSAGE = "I repost sono disattivati su questo server per ora.";
const ROULETTE_RECENT_LIMIT = Math.max(
  15,
  Math.min(80, Number(process.env.VC_REPOST_ROULETTE_RECENT_LIMIT || 40)),
);
const ROULETTE_PICK_ATTEMPTS = 12;
const REPOST_DB_MS = 7000;
const REPOST_DB_READY_MS = 2500;
const MIN_AUDIO_ATTACHMENT_BYTES = 4096;

async function ensureRepostDbReady() {
  return ensureMongoReady({ maxWaitMs: REPOST_DB_READY_MS });
}

function timedRepostQuery(queryPromise, label) {
  const q = queryPromise?.maxTimeMS?.(REPOST_DB_MS) || queryPromise;
  return withMongoTimeout(q, REPOST_DB_MS + 500, label);
}

const recentRouletteSourceKeysByGuild = new Map();

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

function isImageAttachment(att) {
  const ct = String(att?.contentType || "").toLowerCase();
  if (ct.startsWith("image/") || ct === "image/gif") return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(att?.name || ""));
}

function pickImageUrlFromMessage(targetMessage) {
  if (!targetMessage) return "";
  for (const att of targetMessage.attachments.values()) {
    if (!isImageAttachment(att)) continue;
    return String(att.url || "");
  }
  const embeds = Array.isArray(targetMessage.embeds) ? targetMessage.embeds : [];
  for (const emb of embeds) {
    if (emb?.image?.url) return String(emb.image.url);
    if (emb?.thumbnail?.url) return String(emb.thumbnail.url);
  }
  return "";
}

function extractRepostMediaFiles(targetMessage, embedImageUrl = "") {
  const files = [];
  const embedUrl = String(embedImageUrl || "").trim();
  for (const att of targetMessage.attachments?.values() || []) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    if (embedUrl && url === embedUrl) continue;
    files.push({
      attachment: url,
      name: String(att.name || "").trim() || `file-${files.length + 1}`,
    });
    if (files.length >= 10) break;
  }
  return files;
}

function serializableMediaFiles(files) {
  return (files || [])
    .slice(0, 10)
    .map((entry) => ({
      url: String(entry?.attachment || entry?.url || "").trim(),
      name: String(entry?.name || "").trim(),
    }))
    .filter((entry) => entry.url);
}

function discordFilesFromStored(stored) {
  return serializableMediaFiles(stored).map((entry, index) => ({
    attachment: entry.url,
    name: entry.name || `file-${index + 1}`,
  }));
}

function isAudioAttachmentMeta(name, contentType = "") {
  const n = String(name || "").toLowerCase();
  const ct = String(contentType || "").toLowerCase();
  if (n === "clip.mp3" || ct.startsWith("audio/")) return true;
  return /\.(mp3|ogg|wav|m4a|opus|webm|flac)$/i.test(n);
}

function isImageAttachmentMeta(name, contentType = "") {
  const ct = String(contentType || "").toLowerCase();
  if (ct.startsWith("image/") || ct === "image/gif") return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(name || ""));
}

function attachmentBuilderName(file) {
  return String(file?.name || "").trim();
}

function prepareRepostSendMedia({ imageUrl, files }) {
  const url = String(imageUrl || "").trim();
  const allFiles = Array.isArray(files) ? files : [];
  const imageFiles = allFiles.filter((file) => isImageAttachmentMeta(attachmentBuilderName(file)));
  const otherFiles = allFiles.filter((file) => !isImageAttachmentMeta(attachmentBuilderName(file)));
  if (imageFiles.length > 0) {
    const primary = imageFiles[0];
    const name = attachmentBuilderName(primary) || "image.png";
    if (!primary.name) primary.name = name;
    return {
      embedImageUrl: `attachment://${name}`,
      files: [...otherFiles, primary],
    };
  }
  return {
    embedImageUrl: url,
    files: otherFiles,
  };
}

async function fetchAttachmentBuilderFromUrl(url, name, minBytes = 0) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(trimmed, { redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || (minBytes > 0 && buf.length < minBytes)) return null;
    const safeName = String(name || "clip.mp3").trim() || "clip.mp3";
    return new AttachmentBuilder(buf, { name: safeName });
  } catch {
    return null;
  }
}

async function collectAttachmentBuildersFromMessage(message) {
  const out = [];
  for (const att of message?.attachments?.values() || []) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    const name = String(att?.name || "").trim() || "file";
    const ct = String(att?.contentType || "").toLowerCase();
    const minBytes = isAudioAttachmentMeta(name, ct) ? MIN_AUDIO_ATTACHMENT_BYTES : 0;
    const built = await fetchAttachmentBuilderFromUrl(url, name, minBytes);
    if (built) out.push(built);
    if (out.length >= 10) break;
  }
  return out;
}

async function resolveRepostMediaFilesForSend(guild, doc) {
  if (!guild || !doc) return [];
  const candidates = [
    [doc.boardChannelId, doc.boardMessageId],
    [doc.sourceChannelId, doc.sourceMessageId],
  ];
  for (const [channelId, messageId] of candidates) {
    const cid = String(channelId || "").trim();
    const mid = String(messageId || "").trim();
    if (!cid || !mid) continue;
    const channel = guild.channels.cache.get(cid) || (await guild.channels.fetch(cid).catch(() => null));
    if (!channel?.messages?.fetch) continue;
    const message = await channel.messages.fetch(mid).catch(() => null);
    if (!message) continue;
    const files = await collectAttachmentBuildersFromMessage(message);
    if (files.length) return files;
  }
  const out = [];
  for (const entry of serializableMediaFiles(doc.mediaFiles)) {
    const minBytes = isAudioAttachmentMeta(entry.name) ? MIN_AUDIO_ATTACHMENT_BYTES : 0;
    const built = await fetchAttachmentBuilderFromUrl(entry.url, entry.name, minBytes);
    if (built) out.push(built);
    if (out.length >= 10) break;
  }
  return out;
}

async function resolvePayloadFilesForSend(targetMessage, storedMediaFiles) {
  const fromMessage = await collectAttachmentBuildersFromMessage(targetMessage);
  if (fromMessage.length) return fromMessage;
  const out = [];
  for (const entry of serializableMediaFiles(storedMediaFiles)) {
    const minBytes = isAudioAttachmentMeta(entry.name) ? MIN_AUDIO_ATTACHMENT_BYTES : 0;
    const built = await fetchAttachmentBuilderFromUrl(entry.url, entry.name, minBytes);
    if (built) out.push(built);
    if (out.length >= 10) break;
  }
  return out;
}

function extractStickerMediaFiles(targetMessage) {
  const files = [];
  for (const sticker of targetMessage?.stickers?.values() || []) {
    const url = String(sticker?.url || "").trim();
    if (!url) continue;
    const safeName = String(sticker?.name || "sticker")
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 80);
    files.push({
      attachment: url,
      name: `${safeName || "sticker"}.png`,
    });
    if (files.length >= 10) break;
  }
  return files;
}

function extractRepostPayload(targetMessage) {
  const text = normalizeQuoteMessageText(targetMessage).trim();
  const imageUrl = pickImageUrlFromMessage(targetMessage);
  const files = extractRepostMediaFiles(targetMessage, imageUrl);
  for (const stickerFile of extractStickerMediaFiles(targetMessage)) {
    if (files.length >= 10) break;
    files.push(stickerFile);
  }
  return { text, imageUrl, files, hasContent: Boolean(text || imageUrl || files.length) };
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

function isClipBoardMessage(targetMessage) {
  const title = String(targetMessage?.embeds?.[0]?.title || "");
  return title.includes("Clip vocale");
}

function resolveClipAuthorIdFromMessage(targetMessage) {
  const embeds = Array.isArray(targetMessage?.embeds) ? targetMessage.embeds : [];
  for (const emb of embeds) {
    const fields = Array.isArray(emb?.fields) ? emb.fields : [];
    for (const field of fields) {
      if (!/clip di/i.test(String(field?.name || ""))) continue;
      const match = String(field?.value || "").match(/<@!?(\d{16,20})>/);
      if (match?.[1]) return match[1];
    }
  }
  if (targetMessage?.mentions?.users?.size === 1) {
    return String(targetMessage.mentions.users.first()?.id || "");
  }
  return null;
}

function extractClipRepostPayload(targetMessage) {
  const embed = targetMessage?.embeds?.[0];
  let text = "";
  const desc = String(embed?.description || "");
  const transMatch = desc.match(/\*\*Trascrizione\*\*\s*\n([\s\S]*)/i);
  if (transMatch) {
    text = String(transMatch[1] || "")
      .replace(/^»\s*/, "")
      .replace(/^\*|\*$/g, "")
      .replace(/^_|_$/g, "")
      .trim();
  }
  const files = [];
  for (const att of targetMessage.attachments?.values() || []) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    const name = String(att?.name || "").trim();
    const ct = String(att?.contentType || "").toLowerCase();
    if (name.toLowerCase() === "clip.mp3" || ct.startsWith("audio/")) {
      files.push({ attachment: url, name: name || "clip.mp3" });
      break;
    }
  }
  return { text, imageUrl: "", files, hasContent: files.length > 0 };
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
  const ackPhrase = pickRepostAckPhrase();
  const lines = [
    `${REPOST_EMOJI} * . ˊ <@${reposterId}> ${ackPhrase}`,
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

function buildRepostaSourceButtonRow(sourceChannelId, sourceMessageId, quotedAuthorId = "") {
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!sc || !sm) return null;
  const qa = String(quotedAuthorId || "").trim();
  const customId = `${REPOST_SRC_PREFIX}${sc}:${sm}${qa ? `:${qa}` : ""}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel("Reposta")
      .setEmoji("1443652837346377841")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildAckRepostaComponents({ repostId, targetMessage, sourceAuthorId = "" }) {
  const rid = String(repostId || "").trim();
  if (rid) return [buildRepostaButtonRow(rid)];
  if (!targetMessage?.channel?.id || !targetMessage?.id) return [];
  let authorId = String(sourceAuthorId || "").trim();
  if (!authorId && targetMessage.author?.bot) {
    authorId = resolveQuotedAuthorIdFromQuoteMessage(targetMessage) || "";
  }
  if (!authorId && targetMessage.author && !targetMessage.author.bot) {
    authorId = String(targetMessage.author.id || "");
  }
  const row = buildRepostaSourceButtonRow(targetMessage.channel.id, targetMessage.id, authorId);
  return row ? [row] : [];
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

async function ensureBoardRepostaButton(guild, boardChannelId, boardMessageId, repostId) {
  const cid = String(boardChannelId || "").trim();
  const mid = String(boardMessageId || "").trim();
  const rid = String(repostId || "").trim();
  if (!guild || !cid || !mid || !rid) return;
  const channel =
    guild.channels.cache.get(cid) ||
    (await guild.channels.fetch(cid).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const boardMsg = await channel.messages.fetch(mid).catch(() => null);
  if (!boardMsg) return;
  const hasButton = boardMsg.components?.some((row) =>
    row.components?.some((comp) => String(comp.customId || "").startsWith(REPOST_BTN_PREFIX)),
  );
  if (hasButton) return;
  await boardMsg.edit({ components: [buildRepostaButtonRow(rid)] }).catch(() => {});
}

async function checkRepostPrivacyBlocked(guildId, authorId) {
  try {
    const privacy = await timedRepostQuery(
      RepostPrivacy.findOne({ guildId, userId: authorId }).lean(),
      "repost privacy",
    );
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
  return timedRepostQuery(
    GuildRepost.findOne({
      guildId: gid,
      sourceChannelId: sc,
      sourceMessageId: sm,
      boardChannelId: { $ne: "" },
      boardMessageId: { $ne: "" },
    })
      .sort({ createdAt: -1 })
      .lean(),
    "repost find board",
  ).catch(() => null);
}

async function hasUserAlreadySavedRepost(guildId, reposterUserId, sourceChannelId, sourceMessageId) {
  const gid = String(guildId || "").trim();
  const uid = String(reposterUserId || "").trim();
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!gid || !uid || !sc || !sm) return false;
  const found = await timedRepostQuery(
    GuildRepost.findOne({
      guildId: gid,
      reposterUserId: uid,
      sourceChannelId: sc,
      sourceMessageId: sm,
    })
      .select("_id")
      .lean(),
    "repost duplicate check",
  ).catch(() => null);
  return Boolean(found?._id);
}

async function createRepostFromMessage(ctx) {
  const { guild, reposter, targetMessage, replyChannel: replyChannelRaw, preferBoardChannel, quotedAuthorId } = ctx;
  const reposterId = String(reposter?.id || reposter?.user?.id || "");
  const guildId = String(guild?.id || "");
  if (isRepostDisabledInGuild(guildId)) {
    return { ok: false, message: REPOST_DISABLED_MESSAGE };
  }
  if (!(await ensureRepostDbReady())) {
    return {
      ok: false,
      message: "Database temporaneamente non disponibile. Riprova tra qualche secondo.",
    };
  }
  if (!isValidGuildUserId(guildId, reposterId)) {
    return { ok: false, message: "Contesto non valido." };
  }

  let quoteAuthorId = String(quotedAuthorId || "").trim();
  const author = targetMessage?.author;
  const fromClipBoard = isClipBoardMessage(targetMessage);
  if (!quoteAuthorId && fromClipBoard) {
    quoteAuthorId = resolveClipAuthorIdFromMessage(targetMessage) || "";
  }
  if (!quoteAuthorId && author?.bot) {
    quoteAuthorId = resolveQuotedAuthorIdFromQuoteMessage(targetMessage) || "";
  }
  const imageUrlFromMessage = pickImageUrlFromMessage(targetMessage);
  const fromQuoteCanvas = Boolean(
    quoteAuthorId && /^\d{16,20}$/.test(quoteAuthorId) && imageUrlFromMessage,
  );
  if (fromClipBoard) {
    if (!quoteAuthorId || !/^\d{16,20}$/.test(quoteAuthorId)) {
      return { ok: false, message: "Impossibile identificare l'autore del clip." };
    }
  } else if (!fromQuoteCanvas && (!author || author.bot)) {
    return { ok: false, message: "Non puoi repostare messaggi di bot." };
  }

  const sourceAuthorId = fromClipBoard || fromQuoteCanvas ? quoteAuthorId : String(author.id);
  let payload;
  if (fromClipBoard) {
    payload = extractClipRepostPayload(targetMessage);
    if (!payload.hasContent) {
      return { ok: false, message: "Impossibile repostare questo clip vocale." };
    }
  } else if (fromQuoteCanvas) {
    const imageUrl = imageUrlFromMessage;
    if (!imageUrl) {
      return {
        ok: false,
        message: "Impossibile trovare l'immagine della quote da repostare.",
      };
    }
    payload = { text: "", imageUrl, files: [], hasContent: true };
  } else {
    payload = extractRepostPayload(targetMessage);
    if (!payload.hasContent) {
      return {
        ok: false,
        message: "Il messaggio deve avere testo, un'immagine o un allegato multimediale da repostare.",
      };
    }
  }

  if (await checkRepostPrivacyBlocked(guildId, sourceAuthorId)) {
    const blockedMember = await getGuildMemberCached(guild, sourceAuthorId).catch(() => null);
    const authorLabel = accountUsername(blockedMember) || accountUsername(author) || "Utente";
    return {
      ok: false,
      message: `**${authorLabel}** ha bloccato i repost dei propri messaggi.`,
      privacyBlocked: true,
    };
  }

  let totalPosts;
  try {
    totalPosts = await withMongoTimeout(nextRepostCount(guildId), REPOST_DB_MS, "repost count");
  } catch (err) {
    global.logger?.warn?.("[repost] counter failed:", err?.message || err);
    return { ok: false, message: "Contatore repost non disponibile. Riprova tra poco." };
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
    return {
      ok: true,
      alreadySaved: true,
      fromQuoteCanvas,
      ackEmbed: buildShareAckEmbed({ reposterId, boardUrl, prefix }),
      repostId: existingBoard?._id ? String(existingBoard._id) : "",
      ackComponents: buildAckRepostaComponents({
        repostId: existingBoard?._id ? String(existingBoard._id) : "",
        targetMessage,
        sourceAuthorId: existingBoard?.sourceAuthorId || "",
      }),
      components: [],
    };
  }

  const sourceUrl = messageJumpUrl(guildId, targetMessage.channel.id, targetMessage.id);
  const commandPrefix = String(guild?.client?.config?.prefix || "+").trim() || "+";
  const boardFiles = await resolvePayloadFilesForSend(targetMessage, serializableMediaFiles(payload.files));
  const boardSendMedia = prepareRepostSendMedia({ imageUrl: payload.imageUrl, files: boardFiles });
  const boardEmbed = buildBoardEmbed({
    reposter,
    reposterId,
    sourceAuthorId,
    sourceUrl,
    totalPosts,
    text: payload.text,
    imageUrl: boardSendMedia.embedImageUrl,
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

  const storedMediaFiles = serializableMediaFiles(payload.files);
  const docPayload = {
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
  };
  if (storedMediaFiles.length) docPayload.mediaFiles = storedMediaFiles;

  const doc = await timedRepostQuery(GuildRepost.create(docPayload), "repost create").catch(() => null);

  if (!doc?._id) {
    return { ok: false, message: "Impossibile salvare il repost (database lento o non disponibile)." };
  }

  const repostId = String(doc._id);
  let boardMessage = null;
  let boardUrl = "";
  if (existingBoardChannelId && existingBoardMessageId) {
    boardUrl = messageJumpUrl(guildId, existingBoardChannelId, existingBoardMessageId);
    await ensureBoardRepostaButton(
      guild,
      existingBoardChannelId,
      existingBoardMessageId,
      existingBoard?._id ? String(existingBoard._id) : repostId,
    );
  } else {
    const boardSendPayload = {
      embeds: [boardEmbed],
      components: [buildRepostaButtonRow(repostId)],
    };
    if (boardSendMedia.files.length) boardSendPayload.files = boardSendMedia.files;

    const boardMsg = await boardChannel.send(boardSendPayload).catch(() => null);

    if (!boardMsg?.id) {
      await GuildRepost.deleteOne({ _id: doc._id }).catch(() => {});
      return { ok: false, message: "Impossibile pubblicare sulla bacheca." };
    }

    boardMessage = boardMsg;
    await timedRepostQuery(
      GuildRepost.updateOne(
        { _id: doc._id },
        { $set: { boardMessageId: String(boardMsg.id), boardChannelId: String(boardChannel.id) } },
      ),
      "repost board update",
    ).catch(() => {});

    boardUrl = messageJumpUrl(guildId, boardChannel.id, boardMsg.id);
  }
  const prefix = String(guild?.client?.config?.prefix || "+").trim() || "+";
  const ackEmbed = buildShareAckEmbed({ reposterId, boardUrl, prefix });

  return {
    ok: true,
    alreadySaved: false,
    fromQuoteCanvas,
    ackEmbed,
    boardMessage,
    repostId,
    ackComponents: buildAckRepostaComponents({ repostId, targetMessage, sourceAuthorId }),
    components: [],
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
      .reply({ content: REPOST_DISABLED_MESSAGE, flags: EPHEMERAL_FLAG })
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
      await interaction.reply({ content: "Repost non valido.", flags: EPHEMERAL_FLAG }).catch(() => {});
      return { handled: true };
    }
    const doc = await GuildRepost.findById(repostId).lean().catch(() => null);
    if (!doc || String(doc.guildId) !== String(interaction.guild.id)) {
      await interaction.reply({ content: "Repost non trovato.", flags: EPHEMERAL_FLAG }).catch(() => {});
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
      flags: EPHEMERAL_FLAG,
    }).catch(() => {});
    return { handled: true };
  }

  const isQuoteRepost = raw.startsWith(REPOST_SRC_PREFIX);
  const reposterId = String(interaction.user?.id || interaction.member?.id || "");
  let quoteAlreadySaved = false;
  if (isQuoteRepost && reposterId) {
    quoteAlreadySaved = await hasUserAlreadySavedRepost(
      interaction.guild.id,
      reposterId,
      sourceChannelId,
      sourceMessageId,
    );
  }
  const usePublicAck = isQuoteRepost && !quoteAlreadySaved;

  await interaction.deferReply({ flags: usePublicAck ? undefined : EPHEMERAL_FLAG }).catch(() => {});

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
      components: usePublicAck && Array.isArray(result.ackComponents) ? result.ackComponents : [],
      allowedMentions: usePublicAck && reposterId ? { users: [reposterId] } : { parse: [] },
    })
    .catch(() => {});

  return { handled: true };
}

function repostSourceKey(doc) {
  const sc = String(doc?.sourceChannelId || "").trim();
  const sm = String(doc?.sourceMessageId || "").trim();
  if (!sc || !sm) return "";
  return `${sc}:${sm}`;
}

function pushRouletteSourceKey(guildId, sourceKey) {
  const gid = String(guildId || "").trim();
  const key = String(sourceKey || "").trim();
  if (!gid || !key) return;
  const prev = recentRouletteSourceKeysByGuild.get(gid) || [];
  const next = prev.filter((entry) => entry !== key);
  next.push(key);
  while (next.length > ROULETTE_RECENT_LIMIT) next.shift();
  recentRouletteSourceKeysByGuild.set(gid, next);
}

async function aggregateRandomUniqueRepost(guildId, excludeKeys = null) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;

  const pipeline = [
    { $match: { guildId: gid } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { sc: "$sourceChannelId", sm: "$sourceMessageId" },
        doc: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$doc" } },
  ];

  if (excludeKeys instanceof Set && excludeKeys.size) {
    pipeline.push({
      $match: {
        $expr: {
          $not: {
            $in: [{ $concat: ["$sourceChannelId", ":", "$sourceMessageId"] }, Array.from(excludeKeys)],
          },
        },
      },
    });
  }

  pipeline.push({ $sample: { size: 1 } });

  const rows = await GuildRepost.aggregate(pipeline).catch(() => []);
  return rows?.[0] || null;
}

async function pickRandomRepostForGuild(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;

  const recent = new Set(recentRouletteSourceKeysByGuild.get(gid) || []);
  let doc = null;

  for (let attempt = 0; attempt < ROULETTE_PICK_ATTEMPTS; attempt += 1) {
    doc = await aggregateRandomUniqueRepost(gid, recent);
    if (!doc) break;
    const sourceKey = repostSourceKey(doc);
    if (!sourceKey || !recent.has(sourceKey)) break;
  }

  if (!doc) {
    doc = await aggregateRandomUniqueRepost(gid);
  }

  const sourceKey = repostSourceKey(doc);
  if (sourceKey) pushRouletteSourceKey(gid, sourceKey);
  return doc;
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
  const rouletteFiles = await resolveRepostMediaFilesForSend(guild, doc);
  const rouletteSendMedia = prepareRepostSendMedia({ imageUrl, files: rouletteFiles });

  const embed = buildRouletteEmbed({ sourceUrl, text, imageUrl: rouletteSendMedia.embedImageUrl });
  const repostId = String(doc._id);

  const roulettePayload = {
    embeds: [embed],
    components: [buildRepostaButtonRow(repostId)],
  };
  if (rouletteSendMedia.files.length) roulettePayload.files = rouletteSendMedia.files;

  await rouletteChannel.send(roulettePayload).catch(() => null);

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

async function registerClipBoardPost(ctx) {
  const {
    guild,
    guildId,
    requesterId,
    requester,
    boardChannelId,
    boardMessage,
    transcription,
    totalPosts,
  } = ctx;
  const gid = String(guildId || guild?.id || "").trim();
  const uid = String(requesterId || "").trim();
  const cid = String(boardChannelId || "").trim();
  const mid = String(boardMessage?.id || "").trim();
  if (isRepostDisabledInGuild(gid) || !gid || !uid || !cid || !mid || !boardMessage) {
    return { ok: false };
  }

  let mp3Url = "";
  let mp3Name = "clip.mp3";
  for (const att of boardMessage.attachments?.values() || []) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    const name = String(att?.name || "").trim();
    const ct = String(att?.contentType || "").toLowerCase();
    if (name.toLowerCase() === "clip.mp3" || ct.startsWith("audio/")) {
      mp3Url = url;
      mp3Name = name || "clip.mp3";
      break;
    }
  }
  if (!mp3Url) return { ok: false };

  const authorLabel = accountUsername(requester) || "Utente";
  const doc = await GuildRepost.create({
    guildId: gid,
    reposterUserId: uid,
    sourceAuthorId: uid,
    sourceChannelId: cid,
    sourceMessageId: mid,
    content: String(transcription || "").trim(),
    attachmentUrl: "",
    mediaFiles: [{ url: mp3Url, name: mp3Name }],
    authorUsername: authorLabel,
    authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(requester, { size: 512 }) || "",
    boardChannelId: cid,
    boardMessageId: mid,
    totalPosts: Number(totalPosts) || 0,
  }).catch(() => null);

  if (!doc?._id) return { ok: false };
  const repostId = String(doc._id);
  await boardMessage.edit({ components: [buildRepostaButtonRow(repostId)] }).catch(() => null);
  return { ok: true, repostId };
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
  buildRepostaSourceButtonRow,
  buildAckRepostaComponents,
  extractRepostPayload,
  registerClipBoardPost,
  serializableMediaFiles,
  discordFilesFromStored,
  resolveRepostMediaFilesForSend,
  prepareRepostSendMedia,
  fetchAttachmentBuilderFromUrl,
  MIN_AUDIO_ATTACHMENT_BYTES,
};