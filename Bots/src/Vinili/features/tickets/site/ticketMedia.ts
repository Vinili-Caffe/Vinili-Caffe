/** Ticket dal sito: immagini e video allegati, salvataggio su disco e link firmati per scaricarli. */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const { viniliPath } = require("../../../core/paths") as typeof import("../../../core/paths");
const crypto = require("node:crypto") as typeof import("node:crypto");

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_MEDIA_MIME = new Set([...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]);
const UPLOAD_ROOT = viniliPath("Data", "uploads", "web-tickets");

function extForMime(mime?) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "video/mp4") return "mp4";
  if (m === "video/webm") return "webm";
  if (m === "video/quicktime") return "mov";
  return "jpg";
}

function parseDataUrlMedia(raw?) {
  const s = String(raw || "").trim();
  const m = /^data:((?:image\/(?:png|jpeg|jpg|webp|gif)|video\/(?:mp4|webm|quicktime)));base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  let mime = String(m[1] || "").toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!ALLOWED_MEDIA_MIME.has(mime) && mime !== "image/jpeg") return null;
  let buf;
  try {
    buf = Buffer.from(String(m[2] || "").replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  return { mime, buffer: buf };
}

function ensureUploadDir(ticketId?) {
  const dir = path.join(UPLOAD_ROOT, String(ticketId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const TICKET_FILE_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

function ticketFileAccessSecret() {
  return String(process.env.VC_SITE_UPLOAD_FILE_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function createTicketFileAccessToken(ticketId?, fileName?) {
  const tid = String(ticketId || "").trim();
  const name = String(fileName || "").trim();
  if (!tid || !name) return "";
  const exp = Date.now() + TICKET_FILE_TOKEN_TTL_MS;
  const payload = `${tid}:${name}:${exp}`;
  const sig = crypto.createHmac("sha256", ticketFileAccessSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyTicketFileAccessToken(st?, ticketId?, fileName?) {
  try {
    const tid = String(ticketId || "").trim();
    const name = String(fileName || "").trim();
    const raw = Buffer.from(String(st || ""), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 4) return false;
    const [tokenTid, tokenName, expStr, sig] = parts;
    if (tokenTid !== tid || tokenName !== name) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const payload = `${tokenTid}:${tokenName}:${expStr}`;
    const expect = crypto.createHmac("sha256", ticketFileAccessSecret()).update(payload).digest("base64url");
    return sig === expect;
  } catch (_) {
    return false;
  }
}

function withTicketFileAccessToken(ticketId?, rawUrl?) {
  const url = String(rawUrl || "").trim();
  const { isCdnMediaUrl } = require("../../../Web/siteCdnMedia") as typeof import("../../../Web/siteCdnMedia");
  if (isCdnMediaUrl(url.split("?")[0])) return url.split("?")[0];
  if (!url || !url.includes("/webhooks/site-web-tickets/files/")) return url;
  const m = /\/files\/[^/]+\/([^/?#]+)/.exec(url);
  if (!m) return url;
  let fileName = "";
  try {
    fileName = decodeURIComponent(m[1]);
  } catch (_) {
    fileName = m[1];
  }
  const st = createTicketFileAccessToken(ticketId, fileName);
  if (!st) return url;
  const base = url.split("?")[0];
  return `${base}?st=${encodeURIComponent(st)}`;
}

async function saveTicketImages(ticketId?, imagesInput?) {
  const { savePublicSiteMedia } = require("../../../Web/siteCdnMedia") as typeof import("../../../Web/siteCdnMedia");
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const urls = [];
  const dir = ensureUploadDir(ticketId);
  let idx = 0;
  for (const item of list.slice(0, MAX_IMAGES)) {
    const parsed = parseDataUrlMedia(item);
    if (!parsed) continue;
    idx += 1;
    const name = `${String(idx).padStart(2, "0")}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
    const fallbackUrl = `/webhooks/site-web-tickets/files/${encodeURIComponent(String(ticketId))}/${encodeURIComponent(name)}`;
    const saved = await savePublicSiteMedia({
      diskPath: path.join(dir, name),
      buffer: parsed.buffer,
      cdnKey: `uploads/web-tickets/${ticketId}/${name}`,
      contentType: parsed.mime,
      fallbackUrl,
    });
    urls.push(saved.url);
  }
  return urls;
}

function parseDiscordContentUrl(raw?) {
  const s = String(raw || "").trim();
  const m = s.match(/discord(?:app)?\.com\/channels\/(\d{5,32})\/(\d{5,32})(?:\/(\d{5,32}))?/i);
  if (!m) return null;
  return {
    guildId: String(m[1]),
    channelId: String(m[2]),
    messageId: m[3] ? String(m[3]) : null,
  };
}

function isPublicImageUrl(raw?) {
  let s = String(raw || "").trim();
  if (/^\/\//.test(s)) s = `https:${s}`;
  if (!/^https?:\/\//i.test(s)) return false;
  if (/\.(gif|png|jpe?g|webp)(\?|$)/i.test(s)) return true;
  if (/cdn\.discordapp\.com\/attachments|media\.discordapp\.net\/attachments|media\.tenor\.com|tenor\.com\/.*\.gif|giphy\.com\/media/i.test(s)) {
    return true;
  }
  return false;
}

export = { MAX_IMAGES, UPLOAD_ROOT, verifyTicketFileAccessToken, withTicketFileAccessToken, saveTicketImages, parseDiscordContentUrl, isPublicImageUrl };
