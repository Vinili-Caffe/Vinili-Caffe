/** Suggerimenti: immagini allegate e link firmati. */
const mongoose = require("mongoose") as typeof import("mongoose");
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const crypto = require("node:crypto") as typeof import("node:crypto");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { suggestionBoardOf } = require("./suggestionFields") as typeof import("./suggestionFields");
const { resolveWebsiteGuildMember } = require("../../Web/siteRoleRequestApi") as typeof import("../../Web/siteRoleRequestApi");
const { normalizeHeaderSecret } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { resolveSiteUploadRoot } = require("../../Web/siteUploadRoots") as typeof import("../../Web/siteUploadRoots");
const { memberCanAccessStaffFeedbackBoard } = require("../../Utils/Staff/staffGuideAccess") as typeof import("../../Utils/Staff/staffGuideAccess");

const SG = SITE_DOCUMENT_TYPE.SUGGESTION;

const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const MAX_IMAGES = 4;
 // suggestionsKindPhoto1
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const UPLOAD_ROOT = resolveSiteUploadRoot("site-suggestions");
const SUGGESTION_FILE_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

function memberCanModerateSuggestions(member?) {
  if (!member || member.user?.bot) return false;
  return Boolean(HIGH_STAFF_ROLE_ID && member.roles?.cache?.has?.(HIGH_STAFF_ROLE_ID));
}

function denyStaffBoardIfNeeded(member?, doc?) {
  if (suggestionBoardOf(doc) !== "staff") return null;
  if (memberCanAccessStaffFeedbackBoard(member)) return null;
  return {
    ok: false,
    status: 403,
    error: "forbidden",
    message: "La bacheca Staff è riservata allo staff (Partner Manager esclusi).",
  };
}

function suggestionFileAccessSecret() {
  return String(process.env.VC_SITE_UPLOAD_FILE_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function createSuggestionFileAccessToken(suggestionId?, fileName?) {
  const sid = String(suggestionId || "").trim();
  const name = String(fileName || "").trim();
  if (!sid || !name) return "";
  const exp = Date.now() + SUGGESTION_FILE_TOKEN_TTL_MS;
  const payload = `${sid}:${name}:${exp}`;
  const sig = crypto.createHmac("sha256", suggestionFileAccessSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifySuggestionFileAccessToken(st?, suggestionId?, fileName?) {
  try {
    const sid = String(suggestionId || "").trim();
    const name = String(fileName || "").trim();
    const raw = Buffer.from(String(st || ""), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 4) return false;
    const [tokenSid, tokenName, expStr, sig] = parts;
    if (tokenSid !== sid || tokenName !== name) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const payload = `${tokenSid}:${tokenName}:${expStr}`;
    const expect = crypto.createHmac("sha256", suggestionFileAccessSecret()).update(payload).digest("base64url");
    return sig === expect;
  } catch (_) {
    return false;
  }
}

function withSuggestionFileAccessToken(suggestionId?, rawUrl?) {
  const url = String(rawUrl || "").trim();
  const { isCdnMediaUrl } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");
  if (isCdnMediaUrl(url.split("?")[0])) return url.split("?")[0];
  if (!url || !url.includes("/webhooks/site-suggestions/files/")) return url;
  const m = /\/files\/[^/]+\/([^/?#]+)/.exec(url);
  if (!m) return url;
  let fileName = "";
  try {
    fileName = decodeURIComponent(m[1]);
  } catch (_) {
    fileName = m[1];
  }
  const st = createSuggestionFileAccessToken(suggestionId, fileName);
  if (!st) return url;
  const base = url.split("?")[0];
  return `${base}?st=${encodeURIComponent(st)}`;
}

function ensureSuggestionUploadDir(suggestionId?) {
  const dir = path.join(UPLOAD_ROOT, String(suggestionId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extForMime(mime?) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "jpg";
}

function parseDataUrlImage(raw?) {
  const s = String(raw || "").trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  let mime = String(m[1] || "").toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!ALLOWED_IMAGE_MIME.has(mime) && mime !== "image/jpeg") return null;
  let buf;
  try {
    buf = Buffer.from(String(m[2] || "").replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  return { mime, buffer: buf };
}

async function saveSuggestionImages(suggestionId?, imagesInput?) {
  const { savePublicSiteMedia } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const urls = [];
  const dir = ensureSuggestionUploadDir(suggestionId);
  let idx = 0;
  for (const item of list.slice(0, MAX_IMAGES)) {
    const parsed = parseDataUrlImage(item);
    if (!parsed) continue;
    idx += 1;
    const name = `${String(idx).padStart(2, "0")}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
    const fallbackUrl = `/webhooks/site-suggestions/files/${encodeURIComponent(String(suggestionId))}/${encodeURIComponent(name)}`;
    const saved = await savePublicSiteMedia({
      diskPath: path.join(dir, name),
      buffer: parsed.buffer,
      cdnKey: `uploads/site-suggestions/${suggestionId}/${name}`,
      contentType: parsed.mime,
      fallbackUrl,
    });
    urls.push(saved.url);
  }
  return urls;
}

function deleteSuggestionFiles(suggestionId?) {
  const dir = path.join(UPLOAD_ROOT, String(suggestionId || "").trim());
  if (!dir.startsWith(UPLOAD_ROOT)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function resolveStoredSuggestionFile(suggestionId?, fileName?) {
  const id = String(suggestionId || "").trim();
  const name = String(fileName || "").trim();
  if (!id || !mongoose.isValidObjectId(id) || !/^[a-z0-9._-]+$/i.test(name)) return null;
  const full = path.join(UPLOAD_ROOT, id, name);
  if (!full.startsWith(path.join(UPLOAD_ROOT, id))) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function mimeFromFileName(fileName?) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function serveSiteSuggestionFile(client?, req?, res?) {
  const suggestionId = String(req.params?.suggestionId || "").trim();
  const fileName = String(req.params?.fileName || "").trim();
  const st = String(req.query?.st || "").trim();
  let allowed = verifySuggestionFileAccessToken(st, suggestionId, fileName);
  if (!allowed) {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (!resolved.ok) {
      res.status(Number(resolved.status) || 401).json({
        ok: false,
        error: resolved.error || "unauthorized",
        message: resolved.message || "Accesso negato.",
      });
      return;
    }
    const doc: any = await SiteDocument.findOne({
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
    })
      .select({ userId: 1, suggestionBoard: 1 })
      .lean();
    if (!doc) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    const denied = denyStaffBoardIfNeeded(resolved.member, doc);
    if (denied) {
      res.status(denied.status).json(denied);
      return;
    }
    const isOwner = String(doc.userId || "") === String(resolved.userId || "");
    const isStaff = memberCanModerateSuggestions(resolved.member);
    const canStaffBoard = suggestionBoardOf(doc) === "staff" && memberCanAccessStaffFeedbackBoard(resolved.member);
    if (!isOwner && !isStaff && !canStaffBoard) {
      res.status(403).json({ ok: false, error: "forbidden", message: "Accesso negato." });
      return;
    }
    allowed = true;
  }
  if (!allowed) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const full = resolveStoredSuggestionFile(suggestionId, fileName);
  if (full) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", mimeFromFileName(req.params?.fileName));
    fs.createReadStream(full).pipe(res);
    return;
  }
  const { redirectToCdnIfConfigured } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");
  if (redirectToCdnIfConfigured(res, `uploads/site-suggestions/${suggestionId}/${fileName}`)) return;
  res.status(404).json({ ok: false, error: "not_found" });
}

export = { SG, HIGH_STAFF_ROLE_ID, MAX_IMAGES, memberCanModerateSuggestions, denyStaffBoardIfNeeded, withSuggestionFileAccessToken, saveSuggestionImages, deleteSuggestionFiles, serveSiteSuggestionFile };
