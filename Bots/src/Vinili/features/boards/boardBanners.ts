/** Bacheche: banner caricati dagli utenti (salvataggio e lettura). */
const crypto = require("crypto") as typeof import("crypto");
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const { fetchDiscordOAuthMe } = require("../../Web/discordOauthMe") as typeof import("../../Web/discordOauthMe");
const { resolveSiteUploadRoot } = require("../../Web/siteUploadRoots") as typeof import("../../Web/siteUploadRoots");
const { savePublicSiteMedia, cdnOrigin } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");
const { snowflakeOk } = require("./boardSanitize") as typeof import("./boardSanitize");

const BOARD_BANNER_UPLOAD_ROOT = resolveSiteUploadRoot("site-boards");
const BOARD_BANNER_MAX_BYTES = 2.5 * 1024 * 1024;
const BOARD_BANNER_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

function isUploadedBoardBannerUrl(url?) {
  const s = String(url || "");
  if (/\/webhooks\/site-boards\/files\/\d+\//i.test(s)) return true;
  try {
    const origin = cdnOrigin();
    return Boolean(origin && s.startsWith(`${origin}/uploads/site-boards/`));
  } catch (_) {
    return false;
  }
}

function boardBannerExtForMime(mime?) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "jpg";
}

function parseBoardBannerDataUrl(raw?) {
  const s = String(raw || "").trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  let mime = String(m[1] || "").toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!BOARD_BANNER_MIME.has(mime) && mime !== "image/jpeg") return null;
  let buf;
  try {
    buf = Buffer.from(String(m[2] || "").replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > BOARD_BANNER_MAX_BYTES) return null;
  return { mime, buffer: buf };
}

async function uploadBoardBanner(client?, payload: Record<string, any> = {}) {
  /* boardsBannerAuthFix1: fetchDiscordOAuthMe → {ok,me}; usa resolveBoardsUser */
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) {
    return {
      ok: false,
      status: Number(auth.status) || 401,
      error: auth.error || "unauthorized",
      message: auth.message || "Accedi con Discord.",
    };
  }
  const userId = String(auth.userId || "").trim();
  const parsed = parseBoardBannerDataUrl(payload.image || payload.dataUrl || payload.bannerImage);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: "invalid_image",
      message: "Carica un’immagine PNG, JPG, WEBP o GIF (max 2,5 MB).",
    };
  }
  const dir = path.join(BOARD_BANNER_UPLOAD_ROOT, userId);
  const name = `banner-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${boardBannerExtForMime(parsed.mime)}`;
  const fallbackUrl = `/webhooks/site-boards/files/${encodeURIComponent(userId)}/${encodeURIComponent(name)}`;
  const saved = await savePublicSiteMedia({
    diskPath: path.join(dir, name),
    buffer: parsed.buffer,
    cdnKey: `uploads/site-boards/${userId}/${name}`,
    contentType: parsed.mime,
    fallbackUrl,
  });
  const url = saved.url;
  return { ok: true, status: 200, url, bannerUrl: url, message: "Banner caricato." };
}

function resolveStoredBoardBannerFile(userId?, fileName?) {
  const uid = String(userId || "").trim();
  const name = String(fileName || "").trim();
  if (!/^\d{5,32}$/.test(uid) || !/^[a-z0-9._-]+$/i.test(name)) return null;
  const full = path.join(BOARD_BANNER_UPLOAD_ROOT, uid, name);
  if (!full.startsWith(path.join(BOARD_BANNER_UPLOAD_ROOT, uid))) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function mimeFromBoardBannerFileName(fileName?) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function serveBoardBannerFile(req?, res?) {
  const userId = String(req.params?.userId || "");
  const fileName = String(req.params?.fileName || "");
  const full = resolveStoredBoardBannerFile(userId, fileName);
  if (full) {
    res.setHeader("Content-Type", mimeFromBoardBannerFileName(fileName));
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(fs.readFileSync(full));
  }
  const { cdnUrlForKey } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");
  const cdn = cdnUrlForKey(
    `uploads/site-boards/${decodeURIComponent(userId)}/${decodeURIComponent(fileName)}`,
  );
  if (cdn) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.redirect(301, cdn);
  }
  return res.status(404).json({ ok: false, error: "not_found", message: "File non trovato." });
}

async function resolveBoardsUser(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Sessione Discord mancante: effettua il login." };
  }
  const meRes = await fetchDiscordOAuthMe(token);
  if (!meRes?.ok || !meRes.me) {
    return {
      ok: false,
      status: Number(meRes?.status) || 401,
      error: meRes?.error || "invalid_token",
      message: meRes?.message || "Sessione Discord non valida o scaduta.",
    };
  }
  const me = meRes.me;
  const userId = String(me.id || "").trim();
  if (!snowflakeOk(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }
  return {
    ok: true,
    userId,
    username: String(me.username || "").trim(),
    globalName: String(me.global_name || "").trim(),
    avatar: me.avatar || null,
  };
}

export = { BOARD_BANNER_UPLOAD_ROOT, isUploadedBoardBannerUrl, uploadBoardBanner, serveBoardBannerFile, resolveBoardsUser };
