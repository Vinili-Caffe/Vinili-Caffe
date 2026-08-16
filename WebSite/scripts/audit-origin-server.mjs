/**
 * Local audit origin on the VPS: static site + webhook proxy (no Cloudflare / TLS issues).
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VC_SITE_ROOT || "/var/www/viniliecaffe";
const PORT = Number(process.env.VC_AUDIT_PORT || 8765);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".map": "application/json",
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, headers);
  res.end(body);
}

function pickWebhookTarget(urlPath) {
  if (urlPath.startsWith("/webhooks/site-")) {
    return process.env.VC_SITE_API || "http://127.0.0.1:3020";
  }
  if (urlPath.startsWith("/webhooks/discadia")) {
    return process.env.VC_DISCADIA || "http://127.0.0.1:3010";
  }
  if (urlPath.startsWith("/webhooks/topgg")) {
    return process.env.VC_TOPGG || "http://127.0.0.1:3014";
  }
  return process.env.VC_BOTS_HTTP || "http://127.0.0.1:3000";
}

function proxy(req, res, targetBase) {
  const u = new URL(req.url, "http://local");
  const target = new URL(u.pathname + u.search, targetBase);
  const lib = target.protocol === "https:" ? https : http;
  const headers = { ...req.headers, host: target.host };
  delete headers["accept-encoding"];
  const p = lib.request(
    target,
    { method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  p.on("error", (e) => send(res, 502, String(e.message || e)));
  req.pipe(p);
}

function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (rel.includes("\0")) return null;
  if (rel.endsWith("/")) rel += "index.html";
  const fp = path.normalize(path.join(ROOT, rel));
  if (!fp.startsWith(ROOT)) return null;
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) return fp;
  const asIndex = path.normalize(path.join(ROOT, rel, "index.html"));
  if (asIndex.startsWith(ROOT) && fs.existsSync(asIndex)) return asIndex;
  return null;
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/webhooks/")) {
    return proxy(req, res, pickWebhookTarget(url.split("?")[0]));
  }

  const fp = resolveFile(url);
  if (!fp) return send(res, 404, "Not Found");
  const ext = path.extname(fp).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(fp).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`audit origin http://127.0.0.1:${PORT} root=${ROOT}`);
});
