const axios = require("axios");
let _canvas = null;
const warnDedupe = new Map();
const WARN_TTL_MS = 10 * 60 * 1000;

function getCanvas() {
  if (!_canvas) _canvas = require("canvas");
  return _canvas;
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

function rewriteDiscordCdnUrl(url) {
  const raw = String(url || "");
  if (!/^https?:\/\//i.test(raw)) return raw;
  let next = raw;
  try {
    const u = new URL(raw);
    if (!isDiscordCdnRewritableHost(u.host)) return raw;
    let path = String(u.pathname || "");
    const animated = discordCdnPathLooksAnimatedAsset(path);
    const isGifPath = /\.gif$/i.test(path);

    if (path.endsWith(".webp")) {
      u.pathname = animated ? path.replace(/\.webp$/i, ".gif") : path.replace(/\.webp$/i, ".png");
      path = u.pathname;
    } else if (animated && /\.png$/i.test(path)) {
      u.pathname = path.replace(/\.png$/i, ".gif");
      path = u.pathname;
    } else {
      const last = path.split("/").pop() || "";
      if (last && !last.includes(".")) {
        u.pathname = animated ? `${path}.gif` : isGifPath ? path : `${path}.png`;
        path = u.pathname;
      }
    }

    const gifFinal = /\.gif$/i.test(String(u.pathname || ""));
    if (!gifFinal && !animated) {
      if (u.searchParams.get("format")) u.searchParams.set("format", "png");
      else u.searchParams.append("format", "png");
    } else {
      u.searchParams.delete("format");
    }
    if (!u.searchParams.get("size")) u.searchParams.append("size", "256");
    next = u.toString();
  } catch {
  }
  return next;
}

function shouldWarnOnce(key) {
  const now = Date.now();
  const last = Number(warnDedupe.get(key) || 0);
  if (now - last <= WARN_TTL_MS) return false;
  warnDedupe.set(key, now);
  return true;
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
      return await loadImage(source);
    }

    const src = String(source);
    if (/^data:/i.test(src)) {
      const dataBuf = decodeDataUrlToBuffer(src);
      if (!dataBuf || !dataBuf.length) return null;
      return await loadImage(dataBuf);
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
          Accept: "image/*,*/*;q=0.8",
        },
        maxRedirects: 3,
      });

    const host = safeHost(src);
    const candidates = [src];
    if (isDiscordCdnRewritableHost(host)) {
      const rewritten = rewriteDiscordCdnUrl(src);
      if (rewritten && rewritten !== src) candidates.push(rewritten);
    }

    let res = null;
    let lastErr = null;
    for (const url of candidates) {
      try {
        res = await fetchImage(url);
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
    if (!buf.length) return null;
    return await loadImage(buf);
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
  const candidates = [src];
  if (isDiscordCdnRewritableHost(host)) {
    const rewritten = rewriteDiscordCdnUrl(src);
    if (rewritten && rewritten !== src) candidates.push(rewritten);
  }
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

module.exports = { safeLoadImage, fetchHttpImageBuffer };