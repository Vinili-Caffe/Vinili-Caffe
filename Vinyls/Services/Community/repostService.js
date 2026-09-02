const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { GuildRepost } = require("../../Schemas/Community/repostSchema");
const { RepostPrivacy } = require("../../Schemas/Community/communitySchemas");
const { normalizeQuoteMessageText } = require("../../Utils/Quote/normalizeQuoteMessageText");
const { resolveQuoteChannelId, resolveBoardPostChannel } = require("../../Utils/Quote/quotePostChannel");
const { resolveRoulettePostChannel } = require("../../Utils/Quote/repostRoulettePostChannel");
const { nextRepostCount } = require("../../Utils/Quote/quoteCounter");
const { decrementRepostCount, decrementClipCount } = require("../../Utils/Global/globalSettingsBucket");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { ensureMongoReady, withMongoTimeout } = require("../../Utils/Database/mongoConnect");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { DEFAULT_FOOTER_TEXT } = require("../../Utils/Embeds/defaultFooter");
const { pickRepostAckPhrase } = require("../../Data/Community/repostAckPhrases");
const IDs = require("../../Utils/Config/ids");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");

const REPOST_COLOR = TENANT_EMBED_COLOR;
const REPOST_BTN_PREFIX = "repost_btn:";
const REPOST_SRC_PREFIX = "repost_src:";
const REPOST_REMOVE_PREFIX = "repost_remove:";
const MYREPOST_DEL_PREFIX = "myrepost_del:";
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

function isRepostDisabledInGuild(guildId) {
  try {
    const { isTenantBoardFeatureEnabledSync } = require("../../MultiGuild/core/tenantGuildSettings");
    return !isTenantBoardFeatureEnabledSync(guildId, "repost");
  } catch {
    return false;
  }
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
    const desc = String(emb?.description || "");
    const descMatch = desc.match(/Autore del messaggio:\s*<@!?(\d{16,20})>/i);
    if (descMatch?.[1]) return descMatch[1];
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
  if (!authorId && targetMessage.author) {
    authorId = String(targetMessage.author.id || "");
  }
  const row = buildRepostaSourceButtonRow(targetMessage.channel.id, targetMessage.id, authorId);
  return row ? [row] : [];
}

function buildRepostaButton(repostId) {
  return new ButtonBuilder()
    .setCustomId(`${REPOST_BTN_PREFIX}${repostId}`)
    .setLabel("Reposta")
    .setEmoji("1443652837346377841")
    .setStyle(ButtonStyle.Secondary);
}

function buildRepostaButtonRow(repostId) {
  return new ActionRowBuilder().addComponents(buildRepostaButton(repostId));
}

function isClipRepostDoc(doc) {
  if (!doc) return false;
  if (String(doc.boardKind || doc.kind || "").trim().toLowerCase() === "clip") return true;
  const sc = String(doc.sourceChannelId || "").trim();
  const sm = String(doc.sourceMessageId || "").trim();
  const bc = String(doc.boardChannelId || "").trim();
  const bm = String(doc.boardMessageId || "").trim();
    if (sc && sc === sm && bc === bm && sc === bc) return true;
    if (sc && bc && sc === bc && sm && (sm === "pending" || (bm && sm === bm))) {
    return true;
  }
  const files = Array.isArray(doc.mediaFiles) ? doc.mediaFiles : [];
  for (const entry of files) {
    const name = String(entry?.name || "").trim().toLowerCase();
    if (name === "clip.mp3") return true;
  }
  return false;
}

function buildRepostRemoveButton(repostId, doc = null) {
  const rid = String(repostId || "").trim();
  if (!rid) return null;
  const isClip = isClipRepostDoc(doc);
  return new ButtonBuilder()
    .setCustomId(`${REPOST_REMOVE_PREFIX}${rid}`)
    .setLabel(isClip ? "Rimuovi clip" : "Rimuovi repost")
    .setEmoji("🗑️")
    .setStyle(ButtonStyle.Danger);
}

function buildBoardMessageComponents(primaryRepostId, doc) {
  const rid = String(primaryRepostId || doc?._id || "").trim();
  if (!rid) return [];
  const buttons = [buildRepostaButton(rid)];
  if (doc) {
    const removeBtn = buildRepostRemoveButton(rid, doc);
    if (removeBtn) buttons.push(removeBtn);
  }
  return [new ActionRowBuilder().addComponents(...buttons.slice(0, 5))];
}

function flattenBoardCustomIds(rows) {
  return (rows || [])
    .flatMap((row) => row.components || [])
    .map((comp) => String(comp.customId || "").trim())
    .filter(Boolean);
}

function boardCustomIdSet(rows) {
  return new Set(flattenBoardCustomIds(rows));
}

function componentsMatchBoardState(existingComponents, expectedComponents) {
  const a = flattenBoardCustomIds(existingComponents).sort().join("|");
  const b = flattenBoardCustomIds(expectedComponents).sort().join("|");
  return a === b;
}

function boardNeedsRemoveButtonRefresh(existingComponents, expectedComponents) {
  const existing = boardCustomIdSet(existingComponents);
  const expected = boardCustomIdSet(expectedComponents);
  for (const id of expected) {
    if (!existing.has(id)) return true;
  }
  for (const id of existing) {
    if (id.startsWith(REPOST_REMOVE_PREFIX) && !expected.has(id)) return true;
  }
  const hasModernRemove = [...existing].some((id) => /^repost_remove:[a-f0-9]{24}$/i.test(id));
  const expectsRemove = [...expected].some((id) => id.startsWith(REPOST_REMOVE_PREFIX));
  if (expectsRemove && !hasModernRemove) return true;
    const existingLabels = new Set(
    (existingComponents || [])
      .flatMap((row) => row.components || [])
      .filter((comp) => String(comp.customId || "").startsWith(REPOST_REMOVE_PREFIX))
      .map((comp) => String(comp.label || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const expectedLabels = new Set(
    (expectedComponents || [])
      .flatMap((row) => row.components || [])
      .filter((comp) => String(comp.customId || "").startsWith(REPOST_REMOVE_PREFIX))
      .map((comp) => String(comp.label || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (expectedLabels.size) {
    for (const label of expectedLabels) {
      if (!existingLabels.has(label)) return true;
    }
  }
  return !componentsMatchBoardState(existingComponents, expectedComponents);
}

async function resolveBoardMessageComponents(guild, boardChannelId, boardMessageId) {
  const gid = String(guild?.id || "").trim();
  const bc = String(boardChannelId || "").trim();
  const bm = String(boardMessageId || "").trim();
  if (!gid || !bc || !bm) return [];
  const docs = await timedRepostQuery(
    GuildRepost.find({ guildId: gid, boardChannelId: bc, boardMessageId: bm }).sort({ createdAt: -1 }).lean(),
    "repost board docs",
  ).catch(() => []);
  if (!docs?.length) return [];
  const primary = docs[0];
  return buildBoardMessageComponents(String(primary._id), primary);
}

function isUnknownDiscordResourceError(err) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
    return code === 10003 || code === 10008;
}

async function clearOrphanBoardPointers(guildId, boardChannelId, boardMessageId) {
  const gid = String(guildId || "").trim();
  const bc = String(boardChannelId || "").trim();
  const bm = String(boardMessageId || "").trim();
  if (!gid || !bc || !bm) return 0;
  const res = await timedRepostQuery(
    GuildRepost.updateMany(
      { guildId: gid, boardChannelId: bc, boardMessageId: bm },
      { $set: { boardChannelId: "", boardMessageId: "" } },
    ),
    "repost clear orphan board pointers",
  ).catch(() => null);
  return Number(res?.modifiedCount || res?.nModified || 0);
}

function attachmentKeepRefs(message) {
  const list =
    typeof message?.attachments?.values === "function"
      ? [...message.attachments.values()]
      : Array.isArray(message?.attachments)
        ? message.attachments
        : [];
  return list
    .map((att) => String(att?.id || "").trim())
    .filter((id) => /^\d{17,22}$/.test(id))
    .map((id) => ({ id }));
}

async function editBoardMessageKeepAttachments(boardMsg, patch) {
  if (!boardMsg?.edit) return false;
  const keep = attachmentKeepRefs(boardMsg);
  const payload = { ...(patch || {}) };
    if (keep.length) payload.attachments = keep;
  const edited = await boardMsg.edit(payload).then(() => true).catch(() => false);
  return edited;
}

async function syncBoardMessageComponentsDetailed(guild, boardChannelId, boardMessageId) {
  const cid = String(boardChannelId || "").trim();
  const mid = String(boardMessageId || "").trim();
  if (!guild || !cid || !mid) return { ok: false, reason: "bad_args" };

  let channelErr = null;
  const channel =
    guild.channels.cache.get(cid) ||
    (await guild.channels.fetch(cid).catch((err) => {
      channelErr = err;
      return null;
    }));
  if (!channel?.isTextBased?.()) {
    if (channelErr && isUnknownDiscordResourceError(channelErr)) {
      return { ok: false, reason: "channel_missing", orphan: true, code: Number(channelErr.code || 0) };
    }
    return { ok: false, reason: channelErr ? "channel_fetch_failed" : "channel_not_text", code: Number(channelErr?.code || 0) || undefined };
  }

  let messageErr = null;
  const boardMsg = await channel.messages.fetch(mid).catch((err) => {
    messageErr = err;
    return null;
  });
  if (!boardMsg) {
    if (messageErr && isUnknownDiscordResourceError(messageErr)) {
      return { ok: false, reason: "message_missing", orphan: true, code: Number(messageErr.code || 0) };
    }
    return { ok: false, reason: "message_fetch_failed", code: Number(messageErr?.code || 0) || undefined };
  }

  const components = await resolveBoardMessageComponents(guild, cid, mid);
  if (!components.length) return { ok: false, reason: "empty_components" };
  if (!boardNeedsRemoveButtonRefresh(boardMsg.components, components)) return { ok: true, reason: "already_current" };

  let editErr = null;
  const edited = await editBoardMessageKeepAttachments(boardMsg, { components })
    .then((ok) => ok)
    .catch((err) => {
      editErr = err;
      return false;
    });
  if (edited) return { ok: true, reason: "edited" };
  return { ok: false, reason: "edit_failed", code: Number(editErr?.code || 0) || undefined };
}

async function syncBoardMessageComponents(guild, boardChannelId, boardMessageId) {
  const result = await syncBoardMessageComponentsDetailed(guild, boardChannelId, boardMessageId);
  return Boolean(result?.ok);
}

async function ensureBoardRepostaButton(guild, boardChannelId, boardMessageId, repostId) {
  await syncBoardMessageComponents(guild, boardChannelId, boardMessageId);
}

function buildRepostRemovedEmbed({ userId, isClip = false }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("it-IT");
  const timeStr = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setTitle(isClip ? "🗑️ Clip rimossa" : "🗑️ Repost rimosso")
    .setDescription(
      isClip
        ? "Questa clip vocale è stata rimossa dal database."
        : "Questo repost è stato rimosso dalla bacheca.",
    )
    .addFields(
      { name: "Rimosso da", value: `<@${userId}>`, inline: true },
      { name: "Data rimozione", value: `${dateStr} ${timeStr}`, inline: true },
    )
    .setFooter({ text: `Gestisci i tuoi repost con \`+myrepost\` · Oggi alle ${timeStr}` });
}

async function applyBoardMessageRemovedState(guild, boardChannelId, boardMessageId, userId, isClip) {
  const cid = String(boardChannelId || "").trim();
  const mid = String(boardMessageId || "").trim();
  if (!guild || !cid || !mid) return;
  const channel =
    guild.channels.cache.get(cid) ||
    (await guild.channels.fetch(cid).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const boardMsg = await channel.messages.fetch(mid).catch(() => null);
  if (!boardMsg) return;
  const removedEmbed = buildRepostRemovedEmbed({ userId, isClip });
  await boardMsg
    .edit({ embeds: [removedEmbed], components: [], files: [], attachments: [] })
    .catch(() => boardMsg.delete().catch(() => null));
}

function memberCanForceDeleteClip(member) {
  if (!member?.roles?.cache) return false;
  const highStaffId = String(IDs.roles?.HighStaff || "").trim();
  const directorId = String(IDs.roles?.Director || "").trim();
  return Boolean(
    (highStaffId && member.roles.cache.has(highStaffId)) ||
      (directorId && member.roles.cache.has(directorId)),
  );
}

async function deleteClipCompletely(guild, boardChannelId, boardMessageId, userId, options = {}) {
  const gid = String(guild?.id || "").trim();
  const bc = String(boardChannelId || "").trim();
  const bm = String(boardMessageId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !bc || !bm || !uid) return { ok: false, message: "Clip non trovata." };

  const forceStaff = options.forceStaff === true;
  const clipQuery = forceStaff
    ? { guildId: gid, boardChannelId: bc, boardMessageId: bm }
    : { guildId: gid, boardChannelId: bc, boardMessageId: bm, reposterUserId: uid };

  const clipDoc = await timedRepostQuery(
    GuildRepost.findOne(clipQuery).lean(),
    "repost clip find",
  ).catch(() => null);

  if (!clipDoc?._id || !isClipRepostDoc(clipDoc)) {
    return {
      ok: false,
      message: forceStaff
        ? "Clip non trovata."
        : "Solo l'autore della clip (o High Staff) può rimuoverla.",
    };
  }

  if (!forceStaff && String(clipDoc.reposterUserId || "") !== uid) {
    return { ok: false, message: "Solo l'autore della clip (o High Staff) può rimuoverla." };
  }

  const deleteResult = await timedRepostQuery(
    GuildRepost.deleteMany({
      guildId: gid,
      $or: [
        { boardChannelId: bc, boardMessageId: bm },
        { sourceChannelId: bc, sourceMessageId: bm },
      ],
    }),
    "repost clip delete",
  ).catch(() => null);

  await applyBoardMessageRemovedState(guild, bc, bm, uid, true);
  if (Number(deleteResult?.deletedCount) > 0) {
    await decrementClipCount(gid).catch(() => null);
  }
  return { ok: true, isClip: true, deletedCount: Number(deleteResult?.deletedCount) || 0 };
}

async function deleteUserRepostEntry({ guild, client, repostId, userId }) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  const rid = String(repostId || "").trim();
  if (!gid || !uid || !rid) return { ok: false, message: "Repost non valido." };

  const doc = await timedRepostQuery(GuildRepost.findById(rid).lean(), "repost find by id").catch(() => null);
  if (!doc?._id || String(doc.guildId) !== gid) {
    return { ok: false, message: "Repost non trovato." };
  }
  if (String(doc.reposterUserId) !== uid) {
    return { ok: false, message: "Puoi rimuovere solo i tuoi repost." };
  }

  if (isClipRepostDoc(doc)) {
    return deleteClipCompletely(guild, doc.boardChannelId, doc.boardMessageId, uid);
  }

  const bc = String(doc.boardChannelId || "").trim();
  const bm = String(doc.boardMessageId || "").trim();

  await timedRepostQuery(GuildRepost.deleteOne({ _id: doc._id }), "repost delete one").catch(() => null);

  if (!bc || !bm) return { ok: true, isClip: false };

  const remainingOnBoard = await timedRepostQuery(
    GuildRepost.countDocuments({ guildId: gid, boardChannelId: bc, boardMessageId: bm }),
    "repost board remaining",
  ).catch(() => 0);

  if (remainingOnBoard <= 0) {
    await applyBoardMessageRemovedState(guild, bc, bm, uid, false);
    await decrementRepostCount(gid).catch(() => null);
    return { ok: true, isClip: false, boardRemoved: true };
  }

  await syncBoardMessageComponents(guild, bc, bm);
  return { ok: true, isClip: false, boardRemoved: false };
}

function parseRepostRemoveButton(customId) {
  const id = String(customId || "");
  const modern = id.match(/^repost_remove:([a-f0-9]{24})$/i);
  if (modern) return { repostId: modern[1] };
    const legacy = id.match(/^repost_remove:(\d{16,20}):([a-f0-9]{24})$/i);
  if (!legacy) return null;
  return { ownerUserId: legacy[1], repostId: legacy[2] };
}

function isRepostRemoveButton(customId) {
  return String(customId || "").startsWith(REPOST_REMOVE_PREFIX);
}

async function findClickerRepostForBoardAnchor(guildId, anchorDoc, clickerUserId) {
  const gid = String(guildId || "").trim();
  const uid = String(clickerUserId || "").trim();
  if (!gid || !uid || !anchorDoc) return null;

  const bc = String(anchorDoc.boardChannelId || "").trim();
  const bm = String(anchorDoc.boardMessageId || "").trim();
  if (bc && bm) {
    const onBoard = await timedRepostQuery(
      GuildRepost.findOne({
        guildId: gid,
        boardChannelId: bc,
        boardMessageId: bm,
        reposterUserId: uid,
      }).lean(),
      "repost clicker on board",
    ).catch(() => null);
    if (onBoard?._id) return onBoard;
  }

  const sc = String(anchorDoc.sourceChannelId || "").trim();
  const sm = String(anchorDoc.sourceMessageId || "").trim();
  if (!sc || !sm) return null;
  return timedRepostQuery(
    GuildRepost.findOne({
      guildId: gid,
      sourceChannelId: sc,
      sourceMessageId: sm,
      reposterUserId: uid,
    }).lean(),
    "repost clicker on source",
  ).catch(() => null);
}

function parseMyRepostDeleteButton(customId) {
  const id = String(customId || "");
  const match = id.match(/^myrepost_del:([a-f0-9]{24}):(\d{16,20}):(\d{16,20}):(\d+):(\d+)$/i);
  if (!match) return null;
  return {
    repostId: match[1],
    requesterId: match[2],
    targetUserId: match[3],
    page: Math.max(1, Number(match[4]) || 1),
    totalPages: Math.max(1, Number(match[5]) || 1),
  };
}

function isMyRepostDeleteButton(customId) {
  return String(customId || "").startsWith(MYREPOST_DEL_PREFIX);
}

async function handleRepostRemoveButton(interaction) {
  const parsed = parseRepostRemoveButton(interaction.customId);
  if (!parsed || !interaction.guild) return;

  const clickerId = String(interaction.user?.id || "").trim();
  if (!clickerId) return;

  await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => null);

  const anchor = await timedRepostQuery(
    GuildRepost.findById(parsed.repostId).lean(),
    "repost remove anchor",
  ).catch(() => null);

  if (!anchor?._id || String(anchor.guildId) !== String(interaction.guild.id)) {
    return interaction.editReply({
      content: "<:vegax:1443934876440068179> Repost non trovato.",
    }).catch(() => null);
  }

  const isClip = isClipRepostDoc(anchor);
  const staffForce = isClip && memberCanForceDeleteClip(interaction.member);

  if (isClip) {
    const isAuthor = String(anchor.reposterUserId || "") === clickerId;
    if (!isAuthor && !staffForce) {
      return interaction.editReply({
        content: "<:vegax:1443934876440068179> Solo l'autore della clip (o High Staff) può rimuoverla.",
      }).catch(() => null);
    }

    const result = await deleteClipCompletely(
      interaction.guild,
      anchor.boardChannelId,
      anchor.boardMessageId,
      clickerId,
      { forceStaff: staffForce && !isAuthor },
    );

    if (!result.ok) {
      return interaction.editReply({
        content: `<:vegax:1443934876440068179> ${result.message || "Impossibile rimuovere."}`,
      }).catch(() => null);
    }
    return interaction.editReply({
      content: "<a:VC_Verified:1482532479637127188> Clip rimossa.",
    }).catch(() => null);
  }

  const own = await findClickerRepostForBoardAnchor(interaction.guild.id, anchor, clickerId);
  if (!own?._id) {
    return interaction.editReply({
      content: "<:vegax:1443934876440068179> Non hai repostato questo messaggio.",
    }).catch(() => null);
  }

  const result = await deleteUserRepostEntry({
    guild: interaction.guild,
    client: interaction.client,
    repostId: String(own._id),
    userId: clickerId,
  });

  if (!result.ok) {
    return interaction.editReply({
      content: `<:vegax:1443934876440068179> ${result.message || "Impossibile rimuovere."}`,
    }).catch(() => null);
  }

  return interaction.editReply({
    content: "<a:VC_Verified:1482532479637127188> Repost rimosso dai tuoi (`+myrepost`).",
  }).catch(() => null);
}

async function syncAllBoardRepostButtons(client, options = {}) {
  const limit = Math.max(50, Math.min(8000, Number(options.limit) || 2500));
  const delayMs = Math.max(0, Math.min(2000, Number(options.delayMs) || 250));
  await ensureRepostDbReady().catch(() => null);

  const groups = await timedRepostQuery(
    GuildRepost.aggregate([
      {
        $match: {
          boardChannelId: { $nin: ["", null] },
          boardMessageId: { $nin: ["", null] },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { guildId: "$guildId", boardChannelId: "$boardChannelId", boardMessageId: "$boardMessageId" },
          repostId: { $first: "$_id" },
          lastAt: { $first: "$createdAt" },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: limit },
    ]),
    "repost board sync groups",
  ).catch(() => []);

  let updated = 0;
  let failed = 0;
  let scanned = 0;
  let skipped = 0;
  let orphaned = 0;
  let orphanDocsCleared = 0;

  for (const row of groups || []) {
    scanned += 1;
    const gid = String(row?._id?.guildId || "").trim();
    const bc = String(row?._id?.boardChannelId || "").trim();
    const bm = String(row?._id?.boardMessageId || "").trim();
    if (!gid || !bc || !bm) {
      skipped += 1;
      continue;
    }
    const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
    if (!guild) {
      failed += 1;
      continue;
    }
    const result = await syncBoardMessageComponentsDetailed(guild, bc, bm).catch((err) => ({
      ok: false,
      reason: "sync_threw",
      detail: err?.message || String(err),
    }));
    if (result?.ok) {
      updated += 1;
    } else if (result?.orphan) {
      const cleared = await clearOrphanBoardPointers(gid, bc, bm);
      orphaned += 1;
      orphanDocsCleared += cleared;
      skipped += 1;
    } else {
      failed += 1;
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return { scanned, updated, failed, skipped, orphaned, orphanDocsCleared };
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
  const dedicated = await resolveBoardPostChannel(guild, "repost");
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
  } else if (!fromQuoteCanvas && !author) {
    return { ok: false, message: "Messaggio non valido." };
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
      components: buildBoardMessageComponents(repostId, {
        _id: repostId,
        reposterUserId: reposterId,
        sourceChannelId: String(targetMessage.channel.id),
        sourceMessageId: String(targetMessage.id),
        boardChannelId: String(boardChannel.id),
        boardMessageId: "",
        mediaFiles: storedMediaFiles,
      }),
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
    quotedAuthorId = String(doc.sourceAuthorId || "").trim();
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
      const quoteBoardChannelId = resolveQuoteChannelId(interaction.guild.id);
  const interactionChannelId = String(interaction.channelId || interaction.channel?.id || "").trim();
  const clickedInQuoteBoard =
    Boolean(quoteBoardChannelId) && interactionChannelId === quoteBoardChannelId;

  let usePublicAck = false;
  if (!clickedInQuoteBoard && isQuoteRepost && !quoteAlreadySaved) {
    const existingBoard = await findExistingBoardPost(
      interaction.guild.id,
      sourceChannelId,
      sourceMessageId,
    );
    usePublicAck = !String(existingBoard?.boardMessageId || "").trim();
  }

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

    if (usePublicAck && !result.boardMessage) {
    await interaction.deleteReply().catch(() => {});
    await interaction
      .followUp({
        embeds: [result.ackEmbed],
        components: [],
        flags: EPHEMERAL_FLAG,
        allowedMentions: { parse: [] },
      })
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
  const clipFilter = {
    $or: [
      {
        $expr: {
          $and: [
            { $eq: ["$sourceChannelId", "$sourceMessageId"] },
            { $eq: ["$boardChannelId", "$boardMessageId"] },
            { $eq: ["$sourceChannelId", "$boardChannelId"] },
          ],
        },
      },
      {
        $expr: {
          $and: [
            { $eq: ["$sourceChannelId", "$boardChannelId"] },
            { $eq: ["$sourceMessageId", "$boardMessageId"] },
            { $ne: ["$sourceMessageId", ""] },
          ],
        },
      },
      { sourceMessageId: "pending" },
      { "mediaFiles.name": { $regex: /^clip\.mp3$/i } },
    ],
  };
  if (opts.clipsOnly) {
    Object.assign(filter, clipFilter);
  } else if (opts.excludeClips) {
    filter.$nor = [clipFilter];
  }
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
    boardEmbed,
    mp3Path,
    postChannel,
  } = ctx;
  const gid = String(guildId || guild?.id || "").trim();
  const uid = String(requesterId || "").trim();
    if (mp3Path && postChannel?.send && boardEmbed) {
    if (isRepostDisabledInGuild(gid) || !gid || !uid) {
      return { ok: false };
    }
    const authorLabel = accountUsername(requester) || "Utente";
    const doc = await GuildRepost.create({
      guildId: gid,
      reposterUserId: uid,
      sourceAuthorId: uid,
      sourceChannelId: String(postChannel.id),
      sourceMessageId: "pending",
      content: String(transcription || "").trim(),
      attachmentUrl: "",
      mediaFiles: [],
      authorUsername: authorLabel,
      authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(requester, { size: 512 }) || "",
      boardChannelId: String(postChannel.id),
      boardMessageId: "",
      totalPosts: Number(totalPosts) || 0,
    }).catch(() => null);
    if (!doc?._id) return { ok: false };

    const repostId = String(doc._id);
    const components = buildBoardMessageComponents(repostId, {
      _id: repostId,
      boardKind: "clip",
      reposterUserId: uid,
      sourceChannelId: String(postChannel.id),
      sourceMessageId: "pending",
      boardChannelId: String(postChannel.id),
      boardMessageId: "",
      mediaFiles: [{ url: "", name: "clip.mp3" }],
    });

    const attachment = new AttachmentBuilder(mp3Path, { name: "clip.mp3" });
    const boardMsg = await postChannel
      .send({
        files: [attachment],
        embeds: [boardEmbed],
        components,
        allowedMentions: { users: [uid] },
      })
      .catch((err) => {
        global.logger?.warn?.("[clip] board send:", err?.message || err);
        return null;
      });

    if (!boardMsg?.id) {
      await GuildRepost.deleteOne({ _id: doc._id }).catch(() => null);
      return { ok: false };
    }

    let mp3Url = "";
    let mp3Name = "clip.mp3";
    for (const att of boardMsg.attachments?.values() || []) {
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

    await timedRepostQuery(
      GuildRepost.updateOne(
        { _id: doc._id },
        {
          $set: {
            sourceChannelId: String(postChannel.id),
            sourceMessageId: String(boardMsg.id),
            boardChannelId: String(postChannel.id),
            boardMessageId: String(boardMsg.id),
            mediaFiles: mp3Url ? [{ url: mp3Url, name: mp3Name }] : [],
          },
        },
      ),
      "clip board update",
    ).catch(() => null);

    return { ok: true, repostId, boardMessage: boardMsg };
  }

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
  const components = buildBoardMessageComponents(repostId, {
    _id: repostId,
    boardKind: "clip",
    reposterUserId: uid,
    sourceChannelId: cid,
    sourceMessageId: mid,
    boardChannelId: cid,
    boardMessageId: mid,
    mediaFiles: [{ url: mp3Url, name: mp3Name }],
  });
  await editBoardMessageKeepAttachments(boardMessage, { components });
  return { ok: true, repostId, boardMessage };
}

function resolveRepostPreviewImageUrl(row) {
  const direct = String(row?.attachmentUrl || "").trim();
  if (direct && !direct.startsWith("attachment://")) return direct;
  for (const file of serializableMediaFiles(row?.mediaFiles)) {
    if (isImageAttachmentMeta(file.name)) return file.url;
  }
  return "";
}

function formatMyRepostPreview(row, boardUrl = "") {
  const text = String(row?.content || "").trim();
  if (text) {
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  }
  const jump = String(boardUrl || "").trim();
  const link = (label) => (jump ? `[${label}](${jump})` : label);
  const imageUrl = resolveRepostPreviewImageUrl(row);
  if (imageUrl) {
    const isGif = /\.gif(\?|$)/i.test(imageUrl);
    return `🖼️ ${link(isGif ? "GIF" : "Immagine")}`;
  }
  const files = serializableMediaFiles(row?.mediaFiles);
  if (files.some((file) => isAudioAttachmentMeta(file.name))) {
    return `🎵 ${link("Clip audio")}`;
  }
  if (files.length) {
    const name = files[0].name || "Allegato";
    return `📎 ${link(name)}`;
  }
  return "";
}

module.exports = {
  REPOST_BTN_PREFIX,
  REPOST_SRC_PREFIX,
  REPOST_REMOVE_PREFIX,
  MYREPOST_DEL_PREFIX,
  REPOST_COLOR,
  REPOST_DISABLED_MESSAGE,
  isRepostDisabledInGuild,
  createRepostFromMessage,
  handleRepostaButton,
  handleRepostRemoveButton,
  sendRepostRoulette,
  listRepostsByUser,
  messageJumpUrl,
  buildRepostaButtonRow,
  buildBoardMessageComponents,
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
  resolveRepostPreviewImageUrl,
  formatMyRepostPreview,
  isClipRepostDoc,
  deleteUserRepostEntry,
  syncBoardMessageComponents,
  syncBoardMessageComponentsDetailed,
  syncAllBoardRepostButtons,
  clearOrphanBoardPointers,
  parseRepostRemoveButton,
  isRepostRemoveButton,
  parseMyRepostDeleteButton,
  isMyRepostDeleteButton,
};