/**
 * Asset brand in `Vinili/Photos` (anche su R2).
 * - CDN URL: ok per embed classici `setImage(https://…)`
 * - Components V2 MediaGallery: Discord spesso lascia barra grigia con URL esterni
 *   non ancora in cache → allegare il file locale (`attachment://`).
 */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");

const CDN_ORIGIN = String(process.env.VC_PHOTOS_CDN_ORIGIN || "https://cdn.viniliecaffe.it")
  .trim()
  .replace(/\/+$/, "");

const PHOTOS_DIR = path.join(__dirname, "../../Photos");

function normalizePhotoName(fileName?) {
  return String(fileName || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
}

function botPhotoCdnUrl(fileName?) {
  const name = normalizePhotoName(fileName);
  if (!name || name.includes("..")) return "";
  const encoded = name
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${CDN_ORIGIN || "https://cdn.viniliecaffe.it"}/Photos/${encoded}`;
}

function botPhotoLocalPath(fileName?) {
  const name = normalizePhotoName(fileName);
  if (!name || name.includes("..")) return "";
  return path.join(PHOTOS_DIR, ...name.split("/").filter(Boolean));
}

/**
 * Media per pannelli Components V2: attachment locale + `attachment://`.
 * Fallback URL CDN se il file non c’è sul disco.
 */
function resolveBotPhotoMedia(fileName?) {
  const name = normalizePhotoName(fileName);
  if (!name) return { mediaName: "", mediaUrl: "", files: [] as any[] };
  const local = botPhotoLocalPath(name);
  if (local && fs.existsSync(local)) {
    return {
      mediaName: path.basename(name),
      mediaUrl: `attachment://${path.basename(name)}`,
      files: [new AttachmentBuilder(local, { name: path.basename(name) })],
    };
  }
  const url = botPhotoCdnUrl(name);
  return { mediaName: path.basename(name), mediaUrl: url, files: [] as any[] };
}

export = { botPhotoCdnUrl, resolveBotPhotoMedia, CDN_ORIGIN };
