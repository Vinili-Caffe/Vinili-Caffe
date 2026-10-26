// Anteprima locale dell'export statico (out/), come lo serve nginx sulla beta.
// /webhooks/ + /ticket-transcript/ → proxy a www (tutti i metodi).
// File mancanti (immagini/css del sito vecchio) → GET proxy a www.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../out/", import.meta.url));
const PORT = Number(process.env.PORT || 4310);
const ORIGIN = "https://www.viniliecaffe.it";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function fileFor(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  for (const cand of [clean, join(clean, "index.html"), `${clean}.html`]) {
    const p = join(ROOT, cand);
    try {
      if ((await stat(p)).isFile()) return p;
    } catch {}
  }
  return null;
}

function isApiPath(pathname) {
  return pathname.startsWith("/webhooks/") || pathname.startsWith("/ticket-transcript/");
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function proxy(req, res, url) {
  const method = (req.method || "GET").toUpperCase();
  const headers = {};
  for (const key of ["authorization", "content-type", "accept", "x-vc-view-as", "if-none-match"]) {
    const v = req.headers[key];
    if (v) headers[key] = Array.isArray(v) ? v.join(",") : v;
  }
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    const body = await readBody(req);
    if (body.length) init.body = body;
  }
  const r = await fetch(ORIGIN + url.pathname + url.search, init);
  const outHeaders = { "content-type": r.headers.get("content-type") || "application/octet-stream" };
  const etag = r.headers.get("etag");
  if (etag) outHeaders.etag = etag;
  res.writeHead(r.status, outHeaders);
  res.end(Buffer.from(await r.arrayBuffer()));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (isApiPath(url.pathname)) {
      await proxy(req, res, url);
      return;
    }
    const method = (req.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") {
      const file = await fileFor(url.pathname);
      if (file) {
        res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
        res.end(method === "HEAD" ? undefined : await readFile(file));
        return;
      }
      await proxy(req, res, url);
      return;
    }
    res.writeHead(405);
    res.end("method not allowed");
  } catch {
    res.writeHead(502);
    res.end("proxy error");
  }
}).listen(PORT, () => console.log(`anteprima su http://localhost:${PORT} (API → ${ORIGIN})`));
