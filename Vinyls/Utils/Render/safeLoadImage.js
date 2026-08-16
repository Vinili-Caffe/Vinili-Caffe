const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
let _canvas = null;
let _ffmpegPath = undefined;
const warnDedupe = new Map();
const WARN_TTL_MS = 10 * 60 * 1000;

function getCanvas() {
  if (!_canvas) _canvas = require("canvas");
  return _canvas;
}

function resolveFfmpegPath() {
  if (_ffmpegPath !== undefined) return _ffmpegPath;
  try {
    _ffmpegPath = require("ffmpeg-static") || null;
  } catch {
    _ffmpegPath = null;
  }
  if (!_ffmpegPath) {
    try {
      const which = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true });
      if (Number(which?.status) === 0) _ffmpegPath = "ffmpeg";
    } catch {
      /* ignore */
    }
  }
  return _ffmpegPath;
}

function isWebpImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  return (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

/** node-canvas non decodifica WebP: primo frame → PNG via ffmpeg. */
function convertWebpBufferToPng(buf) {
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin || !isWebpImageBuffer(buf)) return null;
  let tmpIn = "";
  let tmpOut = "";
  try {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tmpIn = path.join(os.tmpdir(), `vc-webp-${stamp}.webp`);
    tmpOut = path.join(os.tmpdir(), `vc-webp-${stamp}.png`);
    fs.writeFileSync(tmpIn, buf);
    const out = spawnSync(
      ffmpegBin,
      ["-y", "-i", tmpIn, "-frames:v", "1", tmpOut],
      { stdio: "ignore", windowsHide: true },
    );
    if (Number(out?.status) !== 0 || !fs.existsSync(tmpOut)) return null;
    const png = fs.readFileSync(tmpOut);
    return png?.length ? png : null;
  } catch {
    return null;
  } finally {
    for (const p of [tmpIn, tmpOut]) {
      if (!p) continue;
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

async function loadImageFromBuffer(loadImage, buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) return null;
  try {
    return await loadImage(buf);
  } catch (err) {
    if (!isLoadImageDecodeError(err) || !isWebpImageBuffer(buf)) throw err;
    const png = convertWebpBufferToPng(buf);
    if (!png) throw err;
    return await loadImage(png);
  }
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function decodeDataUrlToBuffer(value) {
  const raw = String(value || "");
  if (!/^data:/i.test(raw)) return null;
  const comma = raw.indexOf(",");
  if (comma < 0) return null;
  const header = raw.slice(0, comma).toLowerCase();
  const payload = raw.slice(comma + 1);
  try {
    if (header.includes(";base64")) {
      return Buffer.from(payload.replace(/\s/g, ""), "base64");
    }
    return Buffer.from(decodeURIComponent(payload), "utf8");
  } catch {
    return null;
  }
}

function safeHost(url) {
  try {
    return new URL(String(url)).host || "unknown";
  } catch {
    return "unknown";
  }
}

function isDiscordCdnRewritableHost(host) {
  const h = String(host || "").toLowerCase();
  return h === "cdn.discordapp.com" || h === "media.discordapp.net";
}

/** Hash animato Discord (`a_…`) in path avatar/guild/emoji. */
function discordCdnPathLooksAnimatedAsset(pathname) {
  return /\/a_[a-f0-9]+/i.test(String(pathname || ""));
}

function buildDiscordCdnImageCandidates(url) {
  const raw = String(url || "");
  if (!/^https?:\/\//i.test(raw)) return [raw];
  let u;
  try {
    u = new URL(raw);
  } catch {
    return [raw];
  }
  if (!isDiscordCdnRewritableHost(u.host)) return [raw];

  const path = String(u.pathname || "");
  const animated = discordCdnPathLooksAnimatedAsset(path);
  const size = u.searchParams.get("size") || "256";
  const seen = new Set();
  const candidates = [];

  const add = (pathname, { format = null, dropLossless = false } = {}) => {
    const c = new URL(u.toString());
    c.pathname = pathname;
    c.searchParams.delete("format");
    if (dropLossless || String(pathname).toLowerCase().endsWith(".gif")) {
      c.searchParams.delete("quality");
    }
    if (format) c.searchParams.set("format", format);
    if (!c.searchParams.get("size")) c.searchParams.set("size", size);
    const s = c.toString();
    if (!seen.has(s)) {
      seen.add(s);
      candidates.push(s);
    }
  };

  const extMatch = path.match(/^(.*)\.(gif|webp|png|jpe?g)$/i);
  const basePath = extMatch ? extMatch[1] : path;
  const ext = extMatch ? extMatch[2].toLowerCase() : "";
  const isEmojiAsset = /\/emojis\/\d+/i.test(path);

  if (animated || ext === "gif" || isEmojiAsset) {
    // Discord ora serve spesso solo WebP per hash `a_…` (PNG/GIF → 404).
    // WebP viene convertito a PNG via ffmpeg in loadImageFromBuffer.
    add(`${basePath}.webp`, { dropLossless: true });
    add(`${basePath}.png`, { format: "png", dropLossless: true });
    add(`${basePath}.gif`, { dropLossless: true });
    add(path, { dropLossless: true });
  } else {
    if (ext === "webp") add(`${basePath}.png`, { format: "png" });
    else if (!ext) add(`${path}.png`, { format: "png" });
    add(path);
  }

  return candidates.length ? candidates : [raw];
}

function rewriteDiscordCdnUrl(url) {
  const candidates = buildDiscordCdnImageCandidates(url);
  const raw = String(url || "");
  return candidates.find((candidate) => candidate !== raw) || raw;
}

function shouldWarnOnce(key) {
  const now = Date.now();
  const last = Number(warnDedupe.get(key) || 0);
  if (now - last <= WARN_TTL_MS) return false;
  warnDedupe.set(key, now);
  return true;
}

function isLoadImageDecodeError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("unsupported image") ||
    msg.includes("invalid image") ||
    msg.includes("error while reading") ||
    msg.includes("could not decode")
  );
}

function buildDiscordCdnFetchCandidates(url, opts = {}) {
  const raw = String(url || "");
  if (!/^https?:\/\//i.test(raw)) return [raw];
  let pathname = "";
  try {
    pathname = new URL(raw).pathname || "";
  } catch {
    return [raw];
  }
  const host = safeHost(raw);
  if (!isDiscordCdnRewritableHost(host)) return [raw];
  if (opts.preferAnimated) return buildDiscordCdnAnimatedCandidates(raw);
  if (discordCdnPathLooksAnimatedAsset(pathname)) {
    const staticList = buildDiscordCdnStaticCandidates(raw);
    const seen = new Set(staticList);
    const merged = [...staticList];
    for (const u of buildDiscordCdnImageCandidates(raw)) {
      if (!seen.has(u)) {
        seen.add(u);
        merged.push(u);
      }
    }
    return merged;
  }
  return buildDiscordCdnImageCandidates(raw);
}

async function safeLoadImage(source, opts = {}) {
  if (!source) return null;
  const timeoutMs = Math.max(1000, Math.min(15_000, Number(opts.timeoutMs || 8000)));
  const suppressWarning = Boolean(opts.suppressWarning);
  const canvas = getCanvas();
  const loadImage = canvas?.loadImage;
  if (typeof loadImage !== "function") return null;

  try {
    if (Buffer.isBuffer(source)) {
      return await loadImageFromBuffer(loadImage, source);
    }

    const src = String(source);
    if (/^data:/i.test(src)) {
      const dataBuf = decodeDataUrlToBuffer(src);
      if (!dataBuf || !dataBuf.length) return null;
      return await loadImageFromBuffer(loadImage, dataBuf);
    }
    if (!isHttpUrl(src)) {
      return await loadImage(src);
    }

    const fetchImage = async (url) =>
      axios.get(url, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        validateStatus: (s) => s >= 200 && s < 300,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "image/webp,image/png,image/*,*/*;q=0.8",
        },
        maxRedirects: 3,
      });

    const host = safeHost(src);
    const candidates = buildDiscordCdnFetchCandidates(src, opts);

    let lastErr = null;
    let lastDecodeErr = null;
    for (const url of candidates) {
      try {
        const res = await fetchImage(url);
        const ct = String(res?.headers?.["content-type"] || "").toLowerCase();
        if (ct && !ct.startsWith("image/")) continue;
        const buf = Buffer.from(res.data);
        if (!buf.length) continue;
        try {
          return await loadImageFromBuffer(loadImage, buf);
        } catch (loadErr) {
          if (isLoadImageDecodeError(loadErr)) {
            lastDecodeErr = loadErr;
            continue;
          }
          throw loadErr;
        }
      } catch (e) {
        const status = e?.response?.status || null;
        const ct = String(e?.response?.headers?.["content-type"] || "").toLowerCase();
        lastErr = e;
        if (isDiscordCdnRewritableHost(host) && (Number(status) === 415 || Number(status) === 404 || (ct && !ct.startsWith("image/")))) {
          continue;
        }
        if (isLoadImageDecodeError(e)) {
          lastDecodeErr = e;
          continue;
        }
        throw e;
      }
    }

    if (lastDecodeErr) throw lastDecodeErr;
    if (lastErr) throw lastErr;
    return null;
  } catch (err) {
    const src = String(source || "");
    const status = err?.response?.status || null;
    const ct = String(err?.response?.headers?.["content-type"] || "");
    const msg = err?.message || err?.code || err;
    const host = isHttpUrl(src) ? safeHost(src) : "non-http";
    const warnKey = `${host}:${String(status || msg)}`;
    if (!suppressWarning && global.logger?.warn && shouldWarnOnce(warnKey)) {
      const rewritten = isHttpUrl(src) && isDiscordCdnRewritableHost(host) ? rewriteDiscordCdnUrl(src) : null;
      global.logger.warn("[canvas] safeLoadImage failed:", {
        host,
        status,
        contentType: ct || null,
        message: String(msg || ""),
        url: isHttpUrl(src) ? src : null,
        rewrittenUrl: rewritten && rewritten !== src ? rewritten : null,
      });
    }
    return null;
  }
}

/**
 * Scarica un’immagine HTTP(S) come buffer (stessi URL candidati di `safeLoadImage` per CDN Discord).
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<Buffer|null>}
 */
async function fetchHttpImageBuffer(url, opts = {}) {
  const src = String(url || "").trim();
  if (!isHttpUrl(src)) return null;
  const timeoutMs = Math.max(1000, Math.min(15_000, Number(opts.timeoutMs || 8000)));
  const fetchImage = async (u) =>
    axios.get(u, {
      responseType: "arraybuffer",
      timeout: timeoutMs,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      maxRedirects: 3,
    });
  const host = safeHost(src);
  const candidates = isDiscordCdnRewritableHost(host) ? buildDiscordCdnImageCandidates(src) : [src];
  let res = null;
  let lastErr = null;
  for (const u of candidates) {
    try {
      res = await fetchImage(u);
      const ct = String(res?.headers?.["content-type"] || "").toLowerCase();
      if (ct && !ct.startsWith("image/")) {
        res = null;
        continue;
      }
      break;
    } catch (e) {
      const status = e?.response?.status || null;
      const ct = String(e?.response?.headers?.["content-type"] || "").toLowerCase();
      lastErr = e;
      if (isDiscordCdnRewritableHost(host) && (Number(status) === 415 || (ct && !ct.startsWith("image/")))) {
        continue;
      }
      throw e;
    }
  }
  if (!res) {
    if (lastErr) throw lastErr;
    return null;
  }
  const buf = Buffer.from(res.data);
  return buf?.length ? buf : null;
}

/** Per ship/canvas animati: evita il PNG statico come prima scelta su avatar `a_`. */
function buildDiscordCdnAnimatedCandidates(url) {
  const raw = String(url || "");
  if (!/^https?:\/\//i.test(raw)) return [raw];
  let u;
  try {
    u = new URL(raw);
  } catch {
    return [raw];
  }
  if (!isDiscordCdnRewritableHost(u.host)) return [raw];
  const path = String(u.pathname || "");
  if (!discordCdnPathLooksAnimatedAsset(path)) return buildDiscordCdnImageCandidates(raw);
  const size = u.searchParams.get("size") || "256";
  const seen = new Set();
  const candidates = [];
  const add = (pathname, { format = null, dropLossless = false } = {}) => {
    const c = new URL(u.toString());
    c.pathname = pathname;
    c.searchParams.delete("format");
    if (dropLossless || String(pathname).toLowerCase().endsWith(".gif")) {
      c.searchParams.delete("quality");
    }
    if (format) c.searchParams.set("format", format);
    if (!c.searchParams.get("size")) c.searchParams.set("size", size);
    const s = c.toString();
    if (!seen.has(s)) {
      seen.add(s);
      candidates.push(s);
    }
  };
  const extMatch = path.match(/^(.*)\.(gif|webp|png|jpe?g)$/i);
  const basePath = extMatch ? extMatch[1] : path;
  // GIF prima: Discord WebP su `a_` è spesso un singolo frame → quote “gif” ferma.
  add(`${basePath}.gif`, { dropLossless: true });
  add(`${basePath}.webp`, { dropLossless: true });
  add(path, { dropLossless: true });
  add(`${basePath}.png`, { format: "png", dropLossless: true });
  return candidates.length ? candidates : [raw];
}

/** Solo PNG / static: per garantire un frame su canvas prima di tentare WebP/GIF animati. */
function buildDiscordCdnStaticCandidates(url) {
  const raw = String(url || "");
  if (!/^https?:\/\//i.test(raw)) return [raw];
  let u;
  try {
    u = new URL(raw);
  } catch {
    return [raw];
  }
  if (!isDiscordCdnRewritableHost(u.host)) return [raw];
  const path = String(u.pathname || "");
  const size = u.searchParams.get("size") || "256";
  const seen = new Set();
  const candidates = [];
  const add = (pathname, { format = null } = {}) => {
    const c = new URL(u.toString());
    c.pathname = pathname;
    c.searchParams.delete("format");
    if (format) c.searchParams.set("format", format);
    if (!c.searchParams.get("size")) c.searchParams.set("size", size);
    const s = c.toString();
    if (!seen.has(s)) {
      seen.add(s);
      candidates.push(s);
    }
  };
  const extMatch = path.match(/^(.*)\.(gif|webp|png|jpe?g)$/i);
  const basePath = extMatch ? extMatch[1] : path;
  // PNG statico spesso 404 su hash animati: prova anche WebP (convertito in safeLoadImage).
  add(`${basePath}.png`, { format: "png" });
  add(`${basePath}.webp`);
  if (extMatch && extMatch[2].toLowerCase() !== "png") add(path);
  if (!extMatch) add(`${path}.png`, { format: "png" });
  return candidates.length ? candidates : [raw];
}

async function fetchHttpImageBufferStaticFirst(url, opts = {}) {
  const src = String(url || "").trim();
  if (!isHttpUrl(src)) return null;
  const timeoutMs = Math.max(1000, Math.min(15_000, Number(opts.timeoutMs || 12_000)));
  const fetchImage = async (u) =>
    axios.get(u, {
      responseType: "arraybuffer",
      timeout: timeoutMs,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/png,image/*,*/*;q=0.8",
      },
      maxRedirects: 3,
    });
  const host = safeHost(src);
  const candidates = isDiscordCdnRewritableHost(host)
    ? buildDiscordCdnStaticCandidates(src)
    : [src];
  let res = null;
  let lastErr = null;
  for (const u of candidates) {
    try {
      res = await fetchImage(u);
      const ct = String(res?.headers?.["content-type"] || "").toLowerCase();
      if (ct && !ct.startsWith("image/")) {
        res = null;
        continue;
      }
      break;
    } catch (e) {
      const status = e?.response?.status || null;
      const ct = String(e?.response?.headers?.["content-type"] || "").toLowerCase();
      lastErr = e;
      if (isDiscordCdnRewritableHost(host) && (Number(status) === 415 || (ct && !ct.startsWith("image/")))) {
        continue;
      }
      throw e;
    }
  }
  if (!res) {
    if (lastErr) throw lastErr;
    return null;
  }
  const buf = Buffer.from(res.data);
  return buf?.length ? buf : null;
}

function discordCdnStaticAvatarUrl(url) {
  const raw = String(url || "").trim();
  if (!/^https?:\/\//i.test(raw)) return raw;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (!isDiscordCdnRewritableHost(u.host)) return raw;
  const path = String(u.pathname || "");
  const size = u.searchParams.get("size") || "256";
  const extMatch = path.match(/^(.*)\.(gif|webp|png|jpe?g)$/i);
  const basePath = extMatch ? extMatch[1] : path;
  const animated = discordCdnPathLooksAnimatedAsset(path);
  const c = new URL(u.toString());
  // Hash `a_…`: Discord espone spesso solo WebP; PNG → 404.
  c.pathname = animated ? `${basePath}.webp` : `${basePath}.png`;
  c.searchParams.delete("format");
  if (!animated) c.searchParams.set("format", "png");
  if (!c.searchParams.get("size")) c.searchParams.set("size", size);
  return c.toString();
}

async function fetchHttpImageBufferAnimatedFirst(url, opts = {}) {
  const src = String(url || "").trim();
  if (!isHttpUrl(src)) return null;
  const timeoutMs = Math.max(1000, Math.min(15_000, Number(opts.timeoutMs || 12_000)));
  const fetchImage = async (u) =>
    axios.get(u, {
      responseType: "arraybuffer",
      timeout: timeoutMs,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      maxRedirects: 3,
    });
  const host = safeHost(src);
  const candidates = isDiscordCdnRewritableHost(host)
    ? buildDiscordCdnAnimatedCandidates(src)
    : [src];
  let res = null;
  let lastErr = null;
  for (const u of candidates) {
    try {
      res = await fetchImage(u);
      const ct = String(res?.headers?.["content-type"] || "").toLowerCase();
      if (ct && !ct.startsWith("image/")) {
        res = null;
        continue;
      }
      break;
    } catch (e) {
      const status = e?.response?.status || null;
      const ct = String(e?.response?.headers?.["content-type"] || "").toLowerCase();
      lastErr = e;
      if (isDiscordCdnRewritableHost(host) && (Number(status) === 415 || (ct && !ct.startsWith("image/")))) {
        continue;
      }
      throw e;
    }
  }
  if (!res) {
    if (lastErr) throw lastErr;
    return null;
  }
  const buf = Buffer.from(res.data);
  return buf?.length ? buf : null;
}

module.exports = {
  safeLoadImage,
  fetchHttpImageBuffer,
  fetchHttpImageBufferAnimatedFirst,
  fetchHttpImageBufferStaticFirst,
  buildDiscordCdnFetchCandidates,
  buildDiscordCdnStaticCandidates,
  discordCdnPathLooksAnimatedAsset,
  discordCdnStaticAvatarUrl,
};