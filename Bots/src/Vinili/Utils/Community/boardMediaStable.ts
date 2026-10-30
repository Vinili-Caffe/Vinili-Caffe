/**
 * Quote/repost/clip: i media in Mongo erano URL Discord firmati (scadono).
 * Qui: refresh dal messaggio bacheca + migrazione su CDN R2 (cdn.viniliecaffe.it) quando possibile.
 */
"use strict";

const path = require("node:path") as typeof import("node:path");
const {
  GuildQuoteBoard,
  GuildRepost,
} = require("../../Schemas/Community/guildBoardPostSchema") as typeof import("../../Schemas/Community/guildBoardPostSchema");
const {
  getClientGuildCached,
  getGuildChannelCached,
} = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const {
  isCdnMediaUrl,
  isSiteCdnConfigured,
  savePublicSiteMedia,
  guessContentType,
} = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");

function isDiscordMediaUrl(url?) {
  const s = String(url || "").trim();
  if (!s) return false;
  return /(?:cdn\.discordapp\.com|media\.discordapp\.net|discord\.com)\/(?:attachments|ephemeral-attachments)\//i.test(
    s,
  );
}

function needsStableMedia(url?) {
  const s = String(url || "").trim();
  if (!s) return true;
  if (isCdnMediaUrl(s)) return false;
  return isDiscordMediaUrl(s);
}

function extFromUrlOrName(url?, name?) {
  const fromName = path.extname(String(name || "")).toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  try {
    const p = new URL(String(url || "")).pathname;
    const e = path.extname(p).toLowerCase();
    if (e && e.length <= 5) return e;
  } catch (_) {}
  return "";
}

function isImageNameOrUrl(url?, name?) {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(`${url || ""} ${name || ""}`);
}

async function downloadUrlBuffer(url?, timeoutMs = 12000) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => {
    try {
      ctrl.abort();
    } catch (_) {}
  }, Math.max(2000, timeoutMs));
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "*/*",
        "User-Agent": "ViniliECaffeBoardMedia/1.0",
      },
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!buf.length || buf.length > 25 * 1024 * 1024) return null;
    return buf;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function migrateUrlToCdn(url?, cdnKey?, fileName?) {
  if (!isSiteCdnConfigured()) return "";
  const src = String(url || "").trim();
  const key = String(cdnKey || "").trim();
  if (!src || !key || isCdnMediaUrl(src)) return isCdnMediaUrl(src) ? src : "";
  const buf = await downloadUrlBuffer(src);
  if (!buf) return "";
  const ct = guessContentType(fileName || key || src);
  const saved = await savePublicSiteMedia({
    diskPath: path.join("/tmp", "vc-board-media", path.basename(key)),
    buffer: buf,
    cdnKey: key,
    contentType: ct,
    fallbackUrl: src,
  });
  if (saved?.cdn && saved.url) return String(saved.url);
  return "";
}

async function fetchBoardMessageMedia(client?, guildId?, channelId?, messageId?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  const mid = String(messageId || "").trim();
  if (!client || !gid || !cid || !mid || mid === "pending" || mid === "0") {
    return { imageUrl: "", files: [] as { url: string; name: string }[] };
  }
  try {
    const guild = await getClientGuildCached(client, gid);
    if (!guild) return { imageUrl: "", files: [] };
    const channel = await getGuildChannelCached(guild, cid);
    if (!channel || typeof (channel as any).messages?.fetch !== "function") {
      return { imageUrl: "", files: [] };
    }
    const msg = await (channel as any).messages.fetch(mid).catch(() => null);
    if (!msg) return { imageUrl: "", files: [] };

    const rawAtts =
      typeof msg.attachments?.values === "function"
        ? [...msg.attachments.values()]
        : Array.isArray(msg.attachments)
          ? msg.attachments
          : [];
    const files = rawAtts
      .map((att?) => ({
        url: String(att?.url || att?.proxyURL || "").trim(),
        name: String(att?.name || att?.filename || "").trim(),
      }))
      .filter((f?) => f.url);

    /* Preferisci allegati: le URL dell'embed Discord scadono e non si rinnovano al fetch. */
    const attImg = files.find((f?) => isImageNameOrUrl(f.url, f.name))?.url || "";
    const embedImg =
      String(msg.embeds?.[0]?.image?.url || msg.embeds?.[0]?.thumbnail?.url || "").trim();
    return { imageUrl: attImg || embedImg || "", files };
  } catch (err: any) {
    global.logger?.warn?.("[board-media] fetch message failed:", err?.message || err);
    return { imageUrl: "", files: [] };
  }
}

async function stabilizeQuoteMedia(client?, doc?) {
  const id = String(doc?._id || "").trim();
  let imageUrl = String(doc?.imageUrl || "").trim();
  if (!needsStableMedia(imageUrl) && imageUrl) return imageUrl;

  const fresh = await fetchBoardMessageMedia(client, doc?.guildId, doc?.boardChannelId, doc?.boardMessageId);
  if (fresh.imageUrl) imageUrl = fresh.imageUrl;
  if (!imageUrl) return "";

  if (isCdnMediaUrl(imageUrl)) return imageUrl;

  const ext = extFromUrlOrName(imageUrl, "") || ".png";
  const cdn = await migrateUrlToCdn(imageUrl, `boards/quotes/${id || "tmp"}/quote${ext}`, `quote${ext}`);
  if (cdn && id) {
    await GuildQuoteBoard.updateOne({ _id: id }, { $set: { imageUrl: cdn } }).catch(() => null);
    return cdn;
  }
  if (fresh.imageUrl && id && fresh.imageUrl !== String(doc?.imageUrl || "")) {
    await GuildQuoteBoard.updateOne({ _id: id }, { $set: { imageUrl: fresh.imageUrl } }).catch(() => null);
  }
  return imageUrl;
}

async function stabilizeRepostMedia(client?, doc?) {
  const id = String(doc?._id || "").trim();
  let attachmentUrl = String(doc?.attachmentUrl || "").trim();
  let mediaFiles = Array.isArray(doc?.mediaFiles)
    ? doc.mediaFiles.map((f?) => ({
        url: String(f?.url || "").trim(),
        name: String(f?.name || "").trim(),
      }))
    : [];

  const anyNeeds =
    needsStableMedia(attachmentUrl) || mediaFiles.some((f?) => needsStableMedia(f.url));
  if (!anyNeeds) {
    return { attachmentUrl, mediaFiles };
  }

  const fresh = await fetchBoardMessageMedia(client, doc?.guildId, doc?.boardChannelId, doc?.boardMessageId);
  if (fresh.imageUrl && (needsStableMedia(attachmentUrl) || !attachmentUrl)) {
    attachmentUrl = fresh.imageUrl;
  }
  if (fresh.files.length) {
    const byName = new Map(fresh.files.map((f?) => [String(f.name || "").toLowerCase(), f]));
    if (!mediaFiles.length) {
      mediaFiles = fresh.files;
    } else {
      mediaFiles = mediaFiles.map((f?) => {
        if (!needsStableMedia(f.url)) return f;
        const hit = byName.get(String(f.name || "").toLowerCase());
        if (hit?.url) return { url: hit.url, name: f.name || hit.name };
        if (fresh.files.length === 1) return { url: fresh.files[0].url, name: f.name || fresh.files[0].name };
        return f;
      });
    }
  }

  if (attachmentUrl && !isCdnMediaUrl(attachmentUrl) && isSiteCdnConfigured()) {
    const ext = extFromUrlOrName(attachmentUrl, "") || ".png";
    const cdn = await migrateUrlToCdn(
      attachmentUrl,
      `boards/reposts/${id || "tmp"}/preview${ext}`,
      `preview${ext}`,
    );
    if (cdn) attachmentUrl = cdn;
  }

  if (isSiteCdnConfigured() && mediaFiles.length) {
    const next = [];
    for (let i = 0; i < mediaFiles.length; i++) {
      const f = mediaFiles[i];
      if (!f.url || isCdnMediaUrl(f.url)) {
        next.push(f);
        continue;
      }
      const ext = extFromUrlOrName(f.url, f.name) || ".bin";
      const safeName = String(f.name || `file${i}${ext}`).replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const cdn = await migrateUrlToCdn(f.url, `boards/reposts/${id || "tmp"}/${i}-${safeName}`, safeName);
      next.push({ url: cdn || f.url, name: f.name });
    }
    mediaFiles = next;
  }

  if (id) {
    const $set: Record<string, any> = {};
    if (attachmentUrl && attachmentUrl !== String(doc?.attachmentUrl || "")) $set.attachmentUrl = attachmentUrl;
    if (mediaFiles.length) $set.mediaFiles = mediaFiles;
    if (Object.keys($set).length) {
      await GuildRepost.updateOne({ _id: id }, { $set }).catch(() => null);
    }
  }

  return { attachmentUrl, mediaFiles };
}

export = {
  isDiscordMediaUrl,
  needsStableMedia,
  stabilizeQuoteMedia,
  stabilizeRepostMedia,
  fetchBoardMessageMedia,
  migrateUrlToCdn,
};
