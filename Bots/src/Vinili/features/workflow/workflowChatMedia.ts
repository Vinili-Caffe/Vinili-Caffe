/** Chat del workflow: immagini allegate (lettura e salvataggio). */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const crypto = require("crypto") as typeof import("crypto");
const { viniliPath } = require("../../core/paths") as typeof import("../../core/paths");

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]);
const UPLOAD_ROOT = viniliPath("Data", "uploads", "workflow-chat");

function uploadFolderKey(dedupeKey?) {
  return crypto.createHash("sha256").update(String(dedupeKey || "")).digest("hex").slice(0, 32);
}

function extForMime(mime?) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
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

function ensureUploadDir(dedupeKey?) {
  const dir = path.join(UPLOAD_ROOT, uploadFolderKey(dedupeKey));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function saveWorkflowImages(dedupeKey?, imagesInput?) {
  const { savePublicSiteMedia } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const urls = [];
  const folder = uploadFolderKey(dedupeKey);
  const dir = ensureUploadDir(dedupeKey);
  let idx = 0;
  for (const item of list.slice(0, MAX_IMAGES)) {
    const parsed = parseDataUrlMedia(item);
    if (!parsed) continue;
    idx += 1;
    const name = `${String(idx).padStart(2, "0")}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
    const fallbackUrl = `/webhooks/site-staff-workflow-chat/files/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
    const saved = await savePublicSiteMedia({
      diskPath: path.join(dir, name),
      buffer: parsed.buffer,
      cdnKey: `uploads/workflow-chat/${folder}/${name}`,
      contentType: parsed.mime,
      fallbackUrl,
    });
    urls.push(saved.url);
  }
  return urls;
}

export = { MAX_IMAGES, UPLOAD_ROOT, uploadFolderKey, saveWorkflowImages };
