"use strict";

const http = require("http");
const { spawnSync } = require("child_process");

const PORT = Number(process.env.DISBOARD_PROXY_PORT || 8787);
const HOST = String(process.env.DISBOARD_PROXY_HOST || "0.0.0.0");
const API_KEY = String(process.env.DISBOARD_PROXY_API_KEY || "");
const REVIEW_URL = String(process.env.DISBOARD_REVIEW_URL || "https://disboard.org/it/server/reviews/1329080093599076474");
const CLOUDFLARE_COOKIE = String(process.env.DISBOARD_CF_COOKIE || "");
const COOKIE_HEADER_OVERRIDE = String(process.env.DISBOARD_COOKIE_HEADER || "");
const DEBUG = String(process.env.DISBOARD_PROXY_DEBUG || "").trim() === "1";
const REQUEST_TIMEOUT_MS = Math.max(3000, Number(process.env.DISBOARD_PROXY_TIMEOUT_MS || 15000));

function browserLikeHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    Referer: "https://disboard.org/",
  };
}

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
  const override = COOKIE_HEADER_OVERRIDE.trim();
  if (override) return override;
  const raw = CLOUDFLARE_COOKIE.trim();
  if (!raw) return "";
  if (/cf_clearance=/i.test(raw)) return raw;
  return `cf_clearance=${raw}`;
}

function looksLikeCloudflareChallenge(html) {
  const h = String(html || "");
  return /just a moment|cf_chl_opt|challenge-platform|enable javascript and cookies/i.test(h);
}

function checkApiKey(req) {
  if (!API_KEY) return true;
  const provided = String(req.headers["x-api-key"] || "");
  return provided && provided === API_KEY;
}

async function fetchWithNode() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const cookie = getCookieHeader();
    const res = await fetch(REVIEW_URL, {
      method: "GET",
      signal: controller.signal,
      headers: {
        ...browserLikeHeaders(),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const html = await res.text();
    if (looksLikeCloudflareChallenge(html)) {
      return { ok: false, status: 403, html };
    }
    return { ok: res.ok, status: res.status, html };
  } finally {
    clearTimeout(timer);
  }
}

function fetchWithCurl() {
  if (String(process.env.DISBOARD_DISABLE_CURL || "").trim() === "1") return null;
  const curlBin = process.platform === "win32" ? "curl.exe" : "curl";
  const cookie = getCookieHeader().replace(/\r|\n/g, "");
  const maxSec = String(Math.ceil(REQUEST_TIMEOUT_MS / 1000));
  const args = [
    "-sS",
    "-L",
    "--connect-timeout",
    "10",
    "--max-time",
    maxSec,
  ];
  const h = browserLikeHeaders();
  for (const [k, v] of Object.entries(h)) {
    args.push("-H", `${k}: ${v}`);
  }
  if (cookie) {
    args.push("-b", cookie);
  }
  args.push(REVIEW_URL);
  const r = spawnSync(curlBin, args, {
    encoding: "utf8",
    maxBuffer: 15 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error) {
    console.warn("[DISBOARD PROXY] curl fallito:", r.error.message);
    return null;
  }
  const html = r.stdout || "";
  if (!html) {
    return null;
  }
  if (looksLikeCloudflareChallenge(html)) {
    return { ok: false, status: 403, html };
  }
  return { ok: true, status: 200, html };
}

async function fetchDisboardHtml() {
  const first = await fetchWithNode();
  if (first.ok && !looksLikeCloudflareChallenge(first.html)) {
    return first;
  }
  console.warn("[DISBOARD PROXY] Node fetch bloccato/challenge, provo curl (spesso passa dove fetch no)...");
  const second = fetchWithCurl();
  if (second && second.ok) {
    return second;
  }
  return first;
}

const server = http.createServer(async (req, res) => {
  try {
    const method = String(req.method || "GET").toUpperCase();
    const url = String(req.url || "");

    if (method === "GET" && url === "/health") {
      return json(res, 200, { ok: true, service: "disboard-reviews-proxy" });
    }

    if (DEBUG && method === "GET" && url === "/debug/disboard") {
      if (!checkApiKey(req)) {
        return json(res, 401, { ok: false, error: "Unauthorized" });
      }
      const cookie = getCookieHeader();
      const mode = COOKIE_HEADER_OVERRIDE.trim()
        ? "DISBOARD_COOKIE_HEADER"
        : CLOUDFLARE_COOKIE.trim()
          ? "DISBOARD_CF_COOKIE"
          : "none";
      return json(res, 200, {
        ok: true,
        reviewUrl: REVIEW_URL,
        cookieMode: mode,
        cookieChars: cookie.length,
        hasCfClearance: /cf_clearance=/i.test(cookie),
      });
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
  const ck = getCookieHeader();
  if (!ck) {
    console.warn("[DISBOARD PROXY] Nessun cookie: imposta DISBOARD_CF_COOKIE oppure DISBOARD_COOKIE_HEADER nel .env, altrimenti DISBOARD risponde challenge/403.");
  } else {
    console.log(`[DISBOARD PROXY] Cookie caricato (${ck.length} caratteri). Se ancora 403: cookie scaduto, IP diverso dal browser, o serve anche __cf_bm in DISBOARD_COOKIE_HEADER.`);
  }
  if (DEBUG) {
    console.log("[DISBOARD PROXY] Debug attivo: GET /debug/disboard con x-api-key");
  }
});