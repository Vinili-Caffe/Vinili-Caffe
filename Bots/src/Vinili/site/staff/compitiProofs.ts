/** Compiti staff: prove caricate (salvataggio e link firmati). */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const crypto = require("node:crypto") as typeof import("node:crypto");
const { resolveSiteUploadRoot } = require("../../site/http/siteUploadRoots") as typeof import("../../site/http/siteUploadRoots");

const MAX_PROOFS = 4;
const MAX_PROOF_BYTES = 3 * 1024 * 1024;
const ALLOWED_PROOF_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
]);
const UPLOAD_ROOT = resolveSiteUploadRoot("staff-compiti");
const FILE_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

function fileAccessSecret() {
  return String(process.env.VC_SITE_UPLOAD_FILE_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function createFileToken(weekKey?, userId?, fileName?) {
  const wk = String(weekKey || "").trim();
  const uid = String(userId || "").trim();
  const name = String(fileName || "").trim();
  if (!wk || !uid || !name) return "";
  const exp = Date.now() + FILE_TOKEN_TTL_MS;
  const payload = `${wk}:${uid}:${name}:${exp}`;
  const sig = crypto.createHmac("sha256", fileAccessSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyFileToken(st?, weekKey?, userId?, fileName?) {
  try {
    const raw = Buffer.from(String(st || ""), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 5) return false;
    const [wk, uid, name, expStr, sig] = parts;
    if (wk !== String(weekKey) || uid !== String(userId) || name !== String(fileName)) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const payload = `${wk}:${uid}:${name}:${expStr}`;
    const expect = crypto.createHmac("sha256", fileAccessSecret()).update(payload).digest("base64url");
    return sig === expect;
  } catch (_) {
    return false;
  }
}

function ensureUploadDir(weekKey?, userId?) {
  const dir = path.join(UPLOAD_ROOT, String(weekKey), String(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parseDataUrl(raw?) {
  const s = String(raw || "").trim();
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(s);
  if (!m) return null;
  const mime = String(m[1] || "").toLowerCase();
  if (!ALLOWED_PROOF_MIME.has(mime)) return null;
  let buf;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch (_) {
    return null;
  }
  if (!buf.length || buf.length > MAX_PROOF_BYTES) return null;
  return { mime, buffer: buf };
}

function extForMime(mime?) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/plain") return "txt";
  return "jpg";
}

async function saveProofs(weekKey?, userId?, imagesInput?) {
  const { savePublicSiteMedia } = require("../../site/http/siteCdnMedia") as typeof import("../../site/http/siteCdnMedia");
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const out = [];
  const dir = ensureUploadDir(weekKey, userId);
  for (let i = 0; i < list.length && out.length < MAX_PROOFS; i++) {
    const item = list[i];
    if (item && typeof item === "object" && item.url && !String(item.url).startsWith("data:")) {
      out.push({
        id: String(item.id || crypto.randomBytes(6).toString("hex")),
        name: String(item.name || "prova").slice(0, 80),
        mime: String(item.mime || "application/octet-stream").slice(0, 80),
        url: String(item.url),
      });
      continue;
    }
    const parsed = parseDataUrl(typeof item === "string" ? item : item?.dataUrl || item?.url || "");
    if (!parsed) continue;
    const id = crypto.randomBytes(6).toString("hex");
    const name = `${id}.${extForMime(parsed.mime)}`;
    const fallbackUrl = `/webhooks/site-staff-compiti/files/${encodeURIComponent(weekKey)}/${encodeURIComponent(userId)}/${encodeURIComponent(name)}`;
    const saved = await savePublicSiteMedia({
      diskPath: path.join(dir, name),
      buffer: parsed.buffer,
      cdnKey: `uploads/staff-compiti/${weekKey}/${userId}/${name}`,
      contentType: parsed.mime,
      fallbackUrl,
    });
    out.push({ id, name, mime: parsed.mime, url: saved.url });
  }
  return out;
}

function withProofTokens(weekKey?, userId?, proofs?) {
  const { isCdnMediaUrl } = require("../../site/http/siteCdnMedia") as typeof import("../../site/http/siteCdnMedia");
  return (proofs || []).map((p?) => {
    const name = String(p.name || "").trim() || String(p.url || "").split("?")[0].split("/").pop() || "";
    const baseUrl = String(p.url || "").split("?")[0];
    if (isCdnMediaUrl(baseUrl)) return { ...p, name: name || p.name, url: baseUrl };
    const st = createFileToken(weekKey, userId, name);
    const url = st && baseUrl ? `${baseUrl}?st=${encodeURIComponent(st)}` : baseUrl || p.url;
    return { ...p, name: name || p.name, url };
  });
}

export = { MAX_PROOFS, UPLOAD_ROOT, verifyFileToken, saveProofs, withProofTokens };
