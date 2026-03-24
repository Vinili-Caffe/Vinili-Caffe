"use strict";

const http = require("http");

const PORT = Number(process.env.DISBOARD_PROXY_PORT || 8787);
const HOST = String(process.env.DISBOARD_PROXY_HOST || "0.0.0.0");
const API_KEY = String(process.env.DISBOARD_PROXY_API_KEY || "");
const REVIEW_URL = String(process.env.DISBOARD_REVIEW_URL || "https://disboard.org/it/server/reviews/1329080093599076474");
const CLOUDFLARE_COOKIE = String(process.env.DISBOARD_CF_COOKIE || "");
const REQUEST_TIMEOUT_MS = Math.max(3000, Number(process.env.DISBOARD_PROXY_TIMEOUT_MS || 15000));

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function getCookieHeader() {
  const raw = CLOUDFLARE_COOKIE.trim();
  if (!raw) return "";
  if (/cf_clearance=/i.test(raw)) return raw;
  return `cf_clearance=${raw}`;
}

function checkApiKey(req) {
  if (!API_KEY) return true;
  const provided = String(req.headers["x-api-key"] || "");
  return provided && provided === API_KEY;
}

async function fetchDisboardHtml() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const cookie = getCookieHeader();
    const res = await fetch(REVIEW_URL, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://disboard.org/",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html };
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const method = String(req.method || "GET").toUpperCase();
    const url = String(req.url || "");

    if (method === "GET" && url === "/health") {
      return json(res, 200, { ok: true, service: "disboard-reviews-proxy" });
    }

    if (method !== "GET" || !url.startsWith("/disboard/reviews")) {
      return json(res, 404, { ok: false, error: "Not found" });
    }

    if (!checkApiKey(req)) {
      return json(res, 401, { ok: false, error: "Unauthorized" });
    }

    const out = await fetchDisboardHtml();
    if (!out.ok) {
      return json(res, out.status, {
        ok: false,
        error: `Upstream returned ${out.status}`,
        sample: String(out.html || "").replace(/\s+/g, " ").slice(0, 200),
      });
    }

    return json(res, 200, { ok: true, html: out.html });
  } catch (err) {
    const msg = String(err?.message || err || "Unknown error");
    return json(res, 500, { ok: false, error: msg.slice(0, 300) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[DISBOARD PROXY] Listening on http://${HOST}:${PORT}`);
  if (!API_KEY) {
    console.warn("[DISBOARD PROXY] DISBOARD_PROXY_API_KEY non impostata: endpoint senza auth.");
  }
});