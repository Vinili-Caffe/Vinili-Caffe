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

function safeHost(url) {
  try {
    return new URL(String(url)).host || "unknown";
  } catch {
    return "unknown";
  }
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
  const canvas = getCanvas();
  const loadImage = canvas?.loadImage;
  if (typeof loadImage !== "function") return null;

  try {
    if (Buffer.isBuffer(source)) {
      return await loadImage(source);
    }

    const src = String(source);
    if (!isHttpUrl(src)) {
      return await loadImage(src);
    }

    const res = await axios.get(src, {
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

    const ct = String(res?.headers?.["content-type"] || "").toLowerCase();
    if (ct && !ct.startsWith("image/")) return null;

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
    if (global.logger?.warn && shouldWarnOnce(warnKey)) {
      global.logger.warn("[canvas] safeLoadImage failed:", {
        host,
        status,
        contentType: ct || null,
        message: String(msg || ""),
      });
    }
    return null;
  }
}

module.exports = { safeLoadImage };