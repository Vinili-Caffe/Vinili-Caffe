/** Repost: immagini, audio e allegati da ripubblicare. */
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { normalizeQuoteMessageText } = require("../../Utils/Quote/normalizeQuoteMessageText") as typeof import("../../Utils/Quote/normalizeQuoteMessageText");

const MIN_AUDIO_ATTACHMENT_BYTES = 4096;

function isImageAttachment(att?) {
  const ct = String(att?.contentType || "").toLowerCase();
  if (ct.startsWith("image/") || ct === "image/gif") return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(att?.name || ""));
}

function pickImageUrlFromMessage(targetMessage?) {
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

function extractRepostMediaFiles(targetMessage?, embedImageUrl = "") {
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

function serializableMediaFiles(files?) {
  return (files || [])
    .slice(0, 10)
    .map((entry?) => ({
      url: String(entry?.attachment || entry?.url || "").trim(),
      name: String(entry?.name || "").trim(),
    }))
    .filter((entry?) => entry.url);
}

function isAudioAttachmentMeta(name?, contentType = "") {
  const n = String(name || "").toLowerCase();
  const ct = String(contentType || "").toLowerCase();
  if (n === "clip.mp3" || ct.startsWith("audio/")) return true;
  return /\.(mp3|ogg|wav|m4a|opus|webm|flac)$/i.test(n);
}

function isImageAttachmentMeta(name?, contentType = "") {
  const ct = String(contentType || "").toLowerCase();
  if (ct.startsWith("image/") || ct === "image/gif") return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(name || ""));
}

function attachmentBuilderName(file?) {
  return String(file?.name || "").trim();
}

function prepareRepostSendMedia({ imageUrl, files }) {
  const url = String(imageUrl || "").trim();
  const allFiles = Array.isArray(files) ? files : [];
  const imageFiles = allFiles.filter((file?) => isImageAttachmentMeta(attachmentBuilderName(file)));
  const otherFiles = allFiles.filter((file?) => !isImageAttachmentMeta(attachmentBuilderName(file)));
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

async function fetchAttachmentBuilderFromUrl(url?, name?, minBytes = 0) {
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

async function collectAttachmentBuildersFromMessage(message?) {
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

async function resolveRepostMediaFilesForSend(guild?, doc?) {
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

async function resolvePayloadFilesForSend(targetMessage?, storedMediaFiles?) {
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

function extractStickerMediaFiles(targetMessage?) {
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

function extractRepostPayload(targetMessage?) {
  const text = normalizeQuoteMessageText(targetMessage).trim();
  const imageUrl = pickImageUrlFromMessage(targetMessage);
  const files = extractRepostMediaFiles(targetMessage, imageUrl);
  for (const stickerFile of extractStickerMediaFiles(targetMessage)) {
    if (files.length >= 10) break;
    files.push(stickerFile);
  }
  return { text, imageUrl, files, hasContent: Boolean(text || imageUrl || files.length) };
}

export = { pickImageUrlFromMessage, serializableMediaFiles, isAudioAttachmentMeta, isImageAttachmentMeta, prepareRepostSendMedia, resolveRepostMediaFilesForSend, resolvePayloadFilesForSend, extractRepostPayload };
