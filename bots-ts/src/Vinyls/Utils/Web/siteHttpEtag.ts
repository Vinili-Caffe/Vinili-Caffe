/**
 * siteApiW6 + siteApiDeviceEverywhere1: shared ETag / 304 helpers for site webhooks.
 */
const crypto = require("node:crypto") as typeof import("node:crypto");

function weakEtagFromString(raw?) {
  const h = crypto.createHash("sha1").update(String(raw || ""), "utf8").digest("base64url").slice(0, 22);
  return `W/"${h}"`;
}

function weakEtagFromParts(parts?) {
  return weakEtagFromString((Array.isArray(parts) ? parts : [parts]).map((p?) => String(p ?? "")).join("|"));
}

function weakEtagFromJson(body?) {
  return weakEtagFromString(typeof body === "string" ? body : JSON.stringify(body ?? null));
}

function normalizeEtagToken(raw?) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (/^W\//i.test(s)) s = s.slice(2).trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1);
  return s;
}

/** RFC 9110-ish: match any validator in If-None-Match (weak≡strong for our use). */
function ifNoneMatchContains(inmRaw?, etag?) {
  const want = normalizeEtagToken(etag);
  if (!want) return false;
  const inm = String(inmRaw || "").trim();
  if (!inm || inm === "*") return Boolean(inm);
  const parts = inm.split(",");
  for (const part of parts) {
    if (normalizeEtagToken(part) === want) return true;
  }
  return false;
}

/**
 * @returns {boolean} true if 304 was sent
 */
function tryNotModified(req?, res?, etag?) {
  const tag = String(etag || "").trim();
  if (!tag) return false;
  res.setHeader("ETag", tag);
  const inm = String(req?.headers?.["if-none-match"] || "").trim();
  if (inm && ifNoneMatchContains(inm, tag)) {
    res.status(304).end();
    return true;
  }
  return false;
}

function sendJsonWithEtag(req?, res?, body?, opts: Record<string, any> = {}) {
  const status = Number(opts.status) || 200;
  const cacheControl = opts.cacheControl;
  const etag = opts.etag || weakEtagFromJson(body);
  if (cacheControl) res.setHeader("Cache-Control", cacheControl);
  if (opts.extraHeaders && typeof opts.extraHeaders === "object") {
    for (const [k, v] of Object.entries(opts.extraHeaders)) {
      if (v != null) res.setHeader(k, String(v));
    }
  }
  if (tryNotModified(req, res, etag)) return res;
  return res.status(status).json(body);
}

export = {
  weakEtagFromString,
  weakEtagFromParts,
  weakEtagFromJson,
  normalizeEtagToken,
  ifNoneMatchContains,
  tryNotModified,
  sendJsonWithEtag,
};
