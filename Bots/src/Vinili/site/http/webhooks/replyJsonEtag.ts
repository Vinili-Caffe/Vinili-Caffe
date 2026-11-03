/* pageTune1: ETag/304 su GET pubblici boards/wiki/reviews/suggestions */
const { sendJsonWithEtag, weakEtagFromJson } = require("../siteHttpEtag") as typeof import("../siteHttpEtag");

function replyJsonEtag(req?, res?, out?, opts: Record<string, any> = {}) {
  const status = Number(out && out.status) || Number(opts.status) || 200;
  if (!out || out.ok === false) {
    return res.status(status).json(out);
  }
  if (opts.cacheControl) res.setHeader("Cache-Control", opts.cacheControl);
  if (opts.extraHeaders && typeof opts.extraHeaders === "object") {
    for (const [k, v] of Object.entries(opts.extraHeaders)) {
      if (v != null) res.setHeader(k, String(v));
    }
  }
  return sendJsonWithEtag(req, res, out, {
    status,
    cacheControl: opts.cacheControl,
    etag: weakEtagFromJson(out),
  });
}

export = { replyJsonEtag };
