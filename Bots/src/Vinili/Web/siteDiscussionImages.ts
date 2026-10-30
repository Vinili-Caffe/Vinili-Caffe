/* discussionImages1: foto nei commenti delle discussioni del sito (Feedback, Confessionale).
   I file stanno su disco in Data/uploads/site-discussion/<scope>/<docId>/; gli indirizzi che escono
   verso il sito hanno una firma a tempo (?st=), così le discussioni dello staff restano private. */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");

const { resolveSiteUploadRoot } = require("./siteUploadRoots") as typeof import("./siteUploadRoots");
const UPLOAD_ROOT = resolveSiteUploadRoot("site-discussion");
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const MAX_PER_COMMENT = 3;
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const SCOPES = new Set(["feedback", "confessionale"]);
const URL_PREFIX = "/webhooks/site-discussion-images";

function secret() {
  return String(process.env.VC_SITE_UPLOAD_FILE_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function parseDataUrlImage(raw?) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(String(raw || "").trim());
  if (!m) return null;
  const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  let buffer;
  try {
    buffer = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return { mime, buffer };
}

const EXT = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/jpeg": "jpg" };
const MIME = { ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

function validIds(scope?, docId?) {
  return SCOPES.has(scope) && mongoose.isValidObjectId(String(docId || ""));
}

/** Salva fino a 3 immagini (data URL) e ritorna gli indirizzi da mettere nel commento (senza firma). */
function saveDiscussionImages(scope?, docId?, images?) {
  const list = Array.isArray(images) ? images.slice(0, MAX_PER_COMMENT) : [];
  if (!list.length || !validIds(scope, docId)) return [];
  const dir = path.join(UPLOAD_ROOT, scope, String(docId));
  fs.mkdirSync(dir, { recursive: true });
  const urls = [];
  for (const item of list) {
    const parsed = parseDataUrlImage(item);
    if (!parsed) continue;
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}.${EXT[parsed.mime] || "jpg"}`;
    fs.writeFileSync(path.join(dir, name), parsed.buffer);
    urls.push(`${URL_PREFIX}/${scope}/${String(docId)}/${name}`);
  }
  return urls;
}

function sign(scope?, docId?, name?, exp?) {
  return crypto.createHmac("sha256", secret()).update(`${scope}:${docId}:${name}:${exp}`).digest("base64url");
}

/** Aggiunge la firma a tempo agli indirizzi salvati. */
function signDiscussionImageUrls(urls?) {
  return (Array.isArray(urls) ? urls : [])
    .map((u?) => {
      const m = new RegExp(`^${URL_PREFIX}/([a-z]+)/([a-f0-9]{24})/([a-z0-9._-]+)$`, "i").exec(String(u || ""));
      if (!m) return "";
      const exp = Date.now() + TOKEN_TTL_MS;
      return `${m[0]}?exp=${exp}&st=${sign(m[1], m[2], m[3], exp)}`;
    })
    .filter(Boolean);
}

/** GET /webhooks/site-discussion-images/:scope/:docId/:fileName */
function serveDiscussionImage(req?, res?) {
  const scope = String(req.params?.scope || "");
  const docId = String(req.params?.docId || "");
  const name = String(req.params?.fileName || "");
  const exp = Number(req.query?.exp);
  const st = String(req.query?.st || "");
  if (!validIds(scope, docId) || !/^[a-z0-9._-]+$/i.test(name)) return res.status(404).end();
  const expect = sign(scope, docId, name, exp);
  const ok =
    Number.isFinite(exp) &&
    Date.now() <= exp &&
    st.length === expect.length &&
    crypto.timingSafeEqual(Buffer.from(st), Buffer.from(expect));
  if (!ok) return res.status(403).end();
  const full = path.join(UPLOAD_ROOT, scope, docId, name);
  if (!full.startsWith(path.join(UPLOAD_ROOT, scope, docId)) || !fs.existsSync(full)) return res.status(404).end();
  res.setHeader("Content-Type", MIME[path.extname(name).toLowerCase()] || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return fs.createReadStream(full).pipe(res);
}

export = { saveDiscussionImages, signDiscussionImageUrls, serveDiscussionImage, MAX_PER_COMMENT };
