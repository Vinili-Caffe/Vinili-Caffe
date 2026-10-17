#!/usr/bin/env node
/**
 * spotifyTokener1 — thin cache/retry in front of ghcr.io/topi314/spotify-tokener
 * Lavalink LavaSrc customTokenEndpoint → http://127.0.0.1:8003/api/token
 */
"use strict";

const http = require("http");
const UPSTREAM = process.env.SPOTIFY_TOKEN_UPSTREAM || "http://127.0.0.1:8002/api/token";
const PORT = Number(process.env.SPOTIFY_TOKEN_CACHE_PORT || 8003);
const SKEW_MS = 60_000;
const MAX_TRIES = 6;

let cache = null; // { body, expiresAtMs, fetchedAt }

function fetchUpstreamOnce(timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(UPSTREAM, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          reject(new Error(`upstream ${res.statusCode}: ${buf.toString("utf8").slice(0, 160)}`));
          return;
        }
        resolve(buf);
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("upstream timeout"));
    });
    req.on("error", reject);
  });
}

async function getTokenBody() {
  const now = Date.now();
  if (cache && cache.expiresAtMs - SKEW_MS > now) {
    return cache.body;
  }
  let lastErr = null;
  for (let i = 0; i < MAX_TRIES; i += 1) {
    try {
      const body = await fetchUpstreamOnce(55_000);
      const parsed = JSON.parse(body.toString("utf8"));
      const exp = Number(parsed.accessTokenExpirationTimestampMs || 0);
      cache = {
        body,
        expiresAtMs: exp > now ? exp : now + 30 * 60_000,
        fetchedAt: now,
      };
      return body;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 + i * 700));
    }
  }
  if (cache && cache.body) {
    // serve stale rather than 500 (Partner API still needs *a* token)
    return cache.body;
  }
  throw lastErr || new Error("token fetch failed");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/api/token" || req.url === "/api/token/")) {
    try {
      const body = await getTokenBody();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("token cache failed: " + msg);
    }
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        cached: Boolean(cache),
        expiresAtMs: cache ? cache.expiresAtMs : null,
      })
    );
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[spotify-token-cache] :${PORT} → ${UPSTREAM}`);
});
