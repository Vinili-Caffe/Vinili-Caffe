/**
 * Media pubblici → Cloudflare R2 (cdn.viniliecaffe.it).
 * Env (da /opt/bot/.env o processo):
 *   VC_R2_ACCOUNT_ID, VC_R2_ACCESS_KEY_ID, VC_R2_SECRET_ACCESS_KEY
 *   VC_R2_BUCKET=vc-media  VC_PHOTOS_CDN_ORIGIN=https://cdn.viniliecaffe.it
 * Se le chiavi mancano: no-op (resta solo disco / webhook).
 */
const crypto = require("node:crypto") as typeof import("node:crypto");
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const https = require("node:https") as typeof import("node:https");

const DEFAULT_ORIGIN = "https://cdn.viniliecaffe.it";
const DEFAULT_BUCKET = "vc-media";

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function cdnOrigin() {
  return (env("VC_PHOTOS_CDN_ORIGIN") || env("VC_CDN_ORIGIN") || DEFAULT_ORIGIN).replace(/\/+$/, "");
}

function r2Config() {
  const accountId = env("VC_R2_ACCOUNT_ID") || env("R2_ACCOUNT_ID") || env("CF_ACCOUNT_ID");
  const accessKeyId = env("VC_R2_ACCESS_KEY_ID") || env("R2_ACCESS_KEY_ID") || env("AWS_ACCESS_KEY_ID");
  const secretAccessKey =
    env("VC_R2_SECRET_ACCESS_KEY") || env("R2_SECRET_ACCESS_KEY") || env("AWS_SECRET_ACCESS_KEY");
  const bucket = env("VC_R2_BUCKET") || env("R2_BUCKET") || DEFAULT_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    host: `${accountId}.r2.cloudflarestorage.com`,
  };
}

function isSiteCdnConfigured() {
  return Boolean(r2Config());
}

function normalizeKey(key: string) {
  return String(key || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

function cdnUrlForKey(key: string) {
  const k = normalizeKey(key);
  if (!k) return "";
  return `${cdnOrigin()}/${k.split("/").map(encodeURIComponent).join("/")}`;
}

function guessContentType(filePathOrKey: string) {
  const ext = path.extname(String(filePathOrKey || "")).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
  };
  return map[ext] || "application/octet-stream";
}

function sha256Hex(buf: Buffer | string) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDate(d = new Date()) {
  const iso = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return { amz: iso, day: iso.slice(0, 8) };
}

function signR2Request(opts: {
  method: string;
  key: string;
  body: Buffer;
  contentType: string;
  cfg: NonNullable<ReturnType<typeof r2Config>>;
}) {
  const { method, key, body, contentType, cfg } = opts;
  const { amz, day } = amzDate();
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${cfg.bucket}/${normalizeKey(key).split("/").map(encodeURIComponent).join("/")}`;
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${cfg.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amz}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${day}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, day);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    path: canonicalUri,
    headers: {
      "content-type": contentType,
      host: cfg.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz,
      authorization,
      "content-length": String(body.length),
    },
  };
}

function httpsRequest(
  host: string,
  method: string,
  reqPath: string,
  headers: Record<string, string>,
  body?: Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        method,
        path: reqPath,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          resolve({
            status: Number(res.statusCode) || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (body?.length) req.write(body);
    req.end();
  });
}

async function putSiteCdnObject(key: string, body: Buffer, contentType?: string) {
  const cfg = r2Config();
  if (!cfg) return { ok: false as const, skipped: true as const, reason: "not_configured" };
  const k = normalizeKey(key);
  if (!k || !Buffer.isBuffer(body)) return { ok: false as const, reason: "bad_input" };
  const ct = contentType || guessContentType(k);
  const signed = signR2Request({ method: "PUT", key: k, body, contentType: ct, cfg });
  try {
    const res = await httpsRequest(cfg.host, "PUT", signed.path, signed.headers, body);
    if (res.status >= 200 && res.status < 300) {
      return { ok: true as const, key: k, url: cdnUrlForKey(k), status: res.status };
    }
    return {
      ok: false as const,
      reason: "http_error",
      status: res.status,
      body: String(res.body || "").slice(0, 300),
    };
  } catch (err: any) {
    return { ok: false as const, reason: "network", error: String(err?.message || err) };
  }
}

async function putSiteCdnFile(localPath: string, key: string, contentType?: string) {
  const full = path.resolve(String(localPath || ""));
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return { ok: false as const, reason: "missing_file" };
  }
  const buf = fs.readFileSync(full);
  return putSiteCdnObject(key, buf, contentType || guessContentType(key || full));
}

/**
 * Preferisce solo CDN (niente copia su VPS). Se R2 fallisce → fallback su disco + fallbackUrl.
 */
async function savePublicSiteMedia(opts: {
  diskPath: string;
  buffer: Buffer;
  cdnKey: string;
  contentType?: string;
  fallbackUrl: string;
}) {
  const put = await putSiteCdnObject(opts.cdnKey, opts.buffer, opts.contentType);
  if (put.ok && put.url) {
    return { ok: true as const, url: put.url, diskPath: "", cdn: true as const, key: put.key };
  }
  const diskPath = path.resolve(String(opts.diskPath || ""));
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });
  fs.writeFileSync(diskPath, opts.buffer);
  return {
    ok: true as const,
    url: opts.fallbackUrl,
    diskPath,
    cdn: false as const,
    cdnError: (put as any).reason || "cdn_failed",
  };
}

/** Se il file non c’è su disco: 301 verso CDN (key tipo uploads/staff-compiti/...). */
function redirectToCdnIfConfigured(res?, cdnKey?) {
  const url = cdnUrlForKey(String(cdnKey || ""));
  if (!url || !res?.redirect) return false;
  try {
    res.setHeader?.("Cache-Control", "public, max-age=86400");
    res.redirect(301, url);
    return true;
  } catch (_) {
    return false;
  }
}

function isCdnMediaUrl(url?) {
  const s = String(url || "").trim();
  if (!s) return false;
  const origin = cdnOrigin();
  return Boolean(origin && s.startsWith(`${origin}/`));
}

export = {
  isSiteCdnConfigured,
  cdnOrigin,
  cdnUrlForKey,
  guessContentType,
  putSiteCdnObject,
  putSiteCdnFile,
  savePublicSiteMedia,
  redirectToCdnIfConfigured,
  isCdnMediaUrl,
};
