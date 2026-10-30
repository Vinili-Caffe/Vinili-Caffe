const {
  fetchLiveStreams,
  fetchLiveStreamPublic,
  fetchLatestVodPublic,
  normalizeSlug,
  resolveConfig,
} = require("../Services/Community/kickLiveAlertService") as typeof import("../Services/Community/kickLiveAlertService");
const { sendJsonWithEtag, weakEtagFromParts } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

const CACHE_TTL_MS = 25_000;
const STALE_KEEP_MS = 12 * 60_000;
const PLAYBACK_RESOLVE_TIMEOUT_MS = 8_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let cache = { at: 0, payload: null, bySlug: new Map() };

/** URL mintati dalle playlist Kick — il proxy accetta solo questi (anti open-proxy). */
const mintedProxyUrls = new Map();
const MINTED_TTL_MS = 15 * 60_000;
const MINTED_MAX = 4000;

function rememberMintedProxyUrl(absUrl?) {
  const u = String(absUrl || "").trim();
  if (!u) return;
  mintedProxyUrls.set(u, Date.now() + MINTED_TTL_MS);
  if (mintedProxyUrls.size > MINTED_MAX) {
    const now = Date.now();
    for (const [k, exp] of mintedProxyUrls) {
      if (exp < now) mintedProxyUrls.delete(k);
      if (mintedProxyUrls.size <= MINTED_MAX * 0.8) break;
    }
  }
}

function isMintedProxyUrl(absUrl?) {
  const u = String(absUrl || "").trim();
  const exp = mintedProxyUrls.get(u);
  if (!exp) return false;
  if (exp < Date.now()) {
    mintedProxyUrls.delete(u);
    return false;
  }
  return true;
}

function isAllowedKickMediaHost(hostname?) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return false;
  // CloudFront serve i segmenti Kick; i redirect sono ri-validati in fetchBinary (no SSRF off-allowlist).
  return (
    h === "live-video.net" ||
    h.endsWith(".live-video.net") ||
    h.endsWith(".cloudfront.net") ||
    h.endsWith(".kick.com") ||
    h === "kick.com" ||
    h === "stream.kick.com"
  );
}

function publicStreamPayload(streamer?, stream?) {
  const slug = normalizeSlug(streamer?.slug || stream?.slug);
  const kind = String(stream?.kind || "live").trim().toLowerCase() === "vod" ? "vod" : "live";
  const thumb = String(stream?.thumbnail_url || "").trim() || null;
  const hasHls = Boolean(String(stream?.playback_url_low || stream?.playback_url || "").trim());
  const vodSlug = String(stream?.vod_slug || "").trim();
  const pageUrl =
    String(stream?.url || "").trim() ||
    (kind === "vod" && slug && vodSlug
      ? `https://kick.com/${slug}/videos/${encodeURIComponent(vodSlug)}`
      : slug
        ? `https://kick.com/${slug}`
        : "https://kick.com/");
  const thumbUrl =
    thumb && slug ? `/webhooks/site-kick-live/thumb?slug=${encodeURIComponent(slug)}` : thumb;
  return {
    id: String(stream?.id || "").trim(),
    slug,
    kind,
    displayName: String(streamer?.displayName || slug).trim() || slug,
    title:
      String(stream?.title || (kind === "vod" ? "Ultimo VOD" : "Diretta in corso")).trim() ||
      (kind === "vod" ? "Ultimo VOD" : "Diretta in corso"),
    category: String(stream?.category || "").trim(),
    viewerCount: Math.max(0, Math.floor(Number(stream?.viewer_count) || 0)),
    durationMs: Math.max(0, Math.floor(Number(stream?.duration_ms) || 0)),
    thumbnailUrl: thumbUrl,
    url: pageUrl,
    startedAt: stream?.started_at || null,
        playbackUrl: hasHls && slug ? `/webhooks/site-kick-live/stream.m3u8?slug=${encodeURIComponent(slug)}` : null,
        previewMp4Url: hasHls && slug ? `/webhooks/site-kick-live/preview.mp4?slug=${encodeURIComponent(slug)}` : null,
    embedUrl:
      kind === "live" && slug
        ? `https://player.kick.com/${encodeURIComponent(slug)}?autoplay=true&muted=true&parent=www.viniliecaffe.it&parent=viniliecaffe.it`
        : null,
  };
}

async function fetchBinary(url?, timeoutMs = PLAYBACK_RESOLVE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => {
    try {
      ctrl.abort();
    } catch (_) {}
  }, timeoutMs);
  try {
    let current = String(url || "").trim();
    let res = null;
    for (let hop = 0; hop < 5; hop++) {
      let parsed;
      try {
        parsed = new URL(current);
      } catch {
        throw new Error("bad_url");
      }
      if (parsed.protocol !== "https:" || !isAllowedKickMediaHost(parsed.hostname)) {
        throw new Error("host_denied");
      }
      res = await fetch(current, {
        signal: ctrl.signal,
        headers: {
          Accept: "*/*",
          "User-Agent": UA,
          Referer: "https://kick.com/",
          Origin: "https://kick.com",
        },
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = String(res.headers.get("location") || "").trim();
        if (!loc) throw new Error(`HTTP ${res.status}`);
        current = new URL(loc, current).toString();
        continue;
      }
      break;
    }
    if (!res || !res.ok) throw new Error(`HTTP ${res?.status || 0}`);
    let finalHost = "";
    try {
      finalHost = new URL(current).hostname;
    } catch {
      finalHost = "";
    }
    if (!isAllowedKickMediaHost(finalHost)) throw new Error("host_denied");
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = String(res.headers.get("content-type") || "application/octet-stream");
    return { buf, contentType };
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url?, timeoutMs = PLAYBACK_RESOLVE_TIMEOUT_MS) {
  const out = await fetchBinary(url, timeoutMs);
  return out.buf.toString("utf8");
}

function pickLowestBandwidthVariant(masterText?, masterUrl?) {
  const lines = String(masterText || "").split(/\r?\n/);
  let pendingBw = null;
  let best = null;
  for (const raw of lines) {
    const line = String(raw || "").trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const m = line.match(/BANDWIDTH=(\d+)/i);
      pendingBw = m ? Number(m[1]) : null;
      continue;
    }
    if (line.startsWith("#")) continue;
    if (pendingBw == null || !Number.isFinite(pendingBw)) continue;
    let abs = line;
    try {
      abs = new URL(line, masterUrl).toString();
    } catch (_) {}
    if (!best || pendingBw < best.bw) best = { bw: pendingBw, url: abs };
    pendingBw = null;
  }
  return best?.url || null;
}

const playbackFailLogAt = new Map();

function notePlaybackFail(slug?, detail?) {
  const key = String(slug || "_") || "_";
    const now = Date.now();
  const prev = playbackFailLogAt.get(key) || 0;
  if (now - prev < 60_000) return;
  playbackFailLogAt.set(key, now);
  global.logger?.warn?.("[site-kick-live] playback unavailable:", key, detail || "");
}

async function resolveLowPlaybackUrl(masterUrl?) {
  const master = String(masterUrl || "").trim();
  if (!master) return { ok: false, reason: "missing" };
  try {
    const text = await fetchText(master);
    if (!String(text).includes("#EXTM3U")) {
      return { ok: false, reason: "not_m3u8" };
    }
    return { ok: true, url: pickLowestBandwidthVariant(text, master) || master };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err || "fetch_failed") };
  }
}

async function attachResolvedPlayback(stream?) {
  if (!stream) return stream;
  const slug = normalizeSlug(stream.slug);
  const playback = String(stream.playback_url || "").trim();
  if (!playback) {
    return { ...stream, playback_url: null, playback_url_low: null };
  }
  const resolved = await resolveLowPlaybackUrl(playback);
  if (!resolved.ok) {
    notePlaybackFail(slug, resolved.reason);
    return { ...stream, playback_url: null, playback_url_low: null };
  }
  return {
    ...stream,
    playback_url: playback,
    playback_url_low: resolved.url || playback,
  };
}

async function ensurePlaybackOnStream(stream?) {
  if (!stream) return stream;
  const slug = normalizeSlug(stream.slug);
  let next = { ...stream, kind: stream.kind || "live" };

    try {
    const pub = await fetchLiveStreamPublic(slug);
    if (pub) {
      next = {
        ...next,
        ...pub,
        kind: "live",
        id: next.id || pub.id,
        title: next.title || pub.title,
        category: next.category || pub.category,
        viewer_count: next.viewer_count || pub.viewer_count,
        thumbnail_url: pub.thumbnail_url || next.thumbnail_url || null,
        playback_url: pub.playback_url || next.playback_url || null,
      };
    } else {
      next = { ...next, playback_url: null, playback_url_low: null };
      return next;
    }
  } catch (_) {}

  return attachResolvedPlayback(next);
}

function rewritePlaylistUrls(playlistText?, playlistUrl?) {
  const lines = String(playlistText || "").split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const line = String(raw || "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      if (trimmed.includes('URI="')) {
        out.push(
          line.replace(/URI="([^"]+)"/g, (_m?, uri?) => {
            try {
              const abs = new URL(uri, playlistUrl).toString();
              rememberMintedProxyUrl(abs);
              return `URI="/webhooks/site-kick-live/proxy?u=${encodeURIComponent(abs)}"`;
            } catch (_) {
              return `URI="${uri}"`;
            }
          }),
        );
      } else {
        out.push(line);
      }
      continue;
    }
    try {
      const abs = new URL(trimmed, playlistUrl).toString();
      rememberMintedProxyUrl(abs);
      out.push(`/webhooks/site-kick-live/proxy?u=${encodeURIComponent(abs)}`);
    } catch (_) {
      out.push(trimmed);
    }
  }
  return out.join("\n");
}

function clipMediaPlaylistForPreview(playlistText?, maxSeconds = 180) {
  const text = String(playlistText || "");
  if (!text.includes("#EXTM3U")) return text;
    if (/#EXT-X-STREAM-INF:/i.test(text)) return text;

  const lines = text.split(/\r?\n/);
  const out = [];
  let elapsed = 0;
  const maxSec = Math.max(30, Math.min(600, Number(maxSeconds) || 180));
  let pendingDur = 0;
  let sawMedia = false;
  let wrotePlaylistType = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (/^#EXT-X-ENDLIST/i.test(trimmed)) continue;
        if (/^#EXT-X-PLAYLIST-TYPE:/i.test(trimmed)) {
      out.push("#EXT-X-PLAYLIST-TYPE:VOD");
      wrotePlaylistType = true;
      continue;
    }
        if (
      /^#EXT-X-TWITCH-/i.test(trimmed) ||
      /^#ID3-EQUIV-TDTG:/i.test(trimmed) ||
      /^#EXT-X-PROGRAM-DATE-TIME:/i.test(trimmed) ||
      /^#EXT-X-DISCONTINUITY-SEQUENCE:/i.test(trimmed)
    ) {
      continue;
    }

    if (trimmed.startsWith("#EXTINF:")) {
      if (elapsed >= maxSec) break;
      const m = trimmed.match(/#EXTINF:([\d.]+)/i);
      pendingDur = m && Number.isFinite(Number(m[1])) ? Number(m[1]) : 0;
      out.push(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }

        if (elapsed >= maxSec) break;
    out.push(line);
    sawMedia = true;
    elapsed += pendingDur;
    pendingDur = 0;
    if (elapsed >= maxSec) break;
  }

  if (sawMedia) {
    if (!wrotePlaylistType) {
            const insertAt = out.findIndex((l?) => String(l || "").trim() === "#EXTM3U");
      if (insertAt >= 0) out.splice(insertAt + 1, 0, "#EXT-X-PLAYLIST-TYPE:VOD");
      else out.unshift("#EXT-X-PLAYLIST-TYPE:VOD");
    }
    out.push("#EXT-X-ENDLIST");
  }
  return out.join("\n");
}

async function resolveStreamerRow(streamer?, liveBySlug?) {
  const slug = normalizeSlug(streamer.slug);
  let stream = liveBySlug.get(slug);
  if (stream?.id) {
    stream = await ensurePlaybackOnStream(stream);
        if (stream?.id) return stream;
  }

    try {
    const vod = await fetchLatestVodPublic(slug);
    if (!vod?.id) return null;
    return await attachResolvedPlayback(vod);
  } catch (err) {
    global.logger?.warn?.("[site-kick-live] vod lookup failed:", slug, err?.message || err);
    return null;
  }
}

async function refreshLiveCache(client?) {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_TTL_MS) return cache;

  const prevGood =
    cache.payload && cache.payload.active && cache.payload.primary?.id
      ? { at: cache.at, payload: cache.payload, bySlug: cache.bySlug }
      : null;

  const keepStale = () => {
    if (prevGood && now - Number(prevGood.at || 0) < STALE_KEEP_MS) {
            cache = { ...prevGood, at: now };
      return cache;
    }
    return null;
  };

    const cfg = resolveConfig(client);
    if (!cfg.enabled || !cfg.streamers.length) {
    cache = {
      at: now,
      payload: { ok: true, active: false, streams: [], primary: null },
      bySlug: new Map(),
    };
    return cache;
  }

  let liveRows = [];
  try {
    liveRows = await fetchLiveStreams(cfg);
  } catch (err) {
    global.logger?.warn?.("[site-kick-live] live fetch failed:", err?.message || err);
    const stale = keepStale();
    if (stale) return stale;
  }
  const liveBySlug = new Map(
    (Array.isArray(liveRows) ? liveRows : []).map((row?) => [normalizeSlug(row?.slug), row]),
  );
    const streams = [];
  const bySlug = new Map();
    for (const streamer of cfg.streamers) {
      const slug = normalizeSlug(streamer.slug);
    let stream = null;
    try {
      stream = await resolveStreamerRow(streamer, liveBySlug);
    } catch (err) {
      global.logger?.warn?.("[site-kick-live] resolve failed:", slug, err?.message || err);
    }
    if (!stream?.id) continue;
    const pub = publicStreamPayload(streamer, stream);
    streams.push(pub);
    bySlug.set(slug, {
      ...pub,
      _playbackLow: String(stream.playback_url_low || stream.playback_url || "").trim() || null,
      _playbackMaster: String(stream.playback_url || "").trim() || null,
      _thumbSrc: String(stream.thumbnail_url || "").trim() || null,
    });
  }

    const primary = streams.find((s?) => s.kind === "live") || streams[0] || null;

  if (!primary?.id) {
    const stale = keepStale();
    if (stale) return stale;
  }

  cache = {
    at: now,
    payload: {
      ok: true,
      active: streams.length > 0,
      streams,
      primary,
    },
    bySlug,
  };
  return cache;
}

async function handleSiteKickLiveGet(client?, req?, res?) {
  try {
    const pack = await refreshLiveCache(client);
    /* siteApiW7: ETag/304 on kick live poll */
    const payload = pack.payload;
    const etag = weakEtagFromParts([
      "kick",
      pack.at || cache.at || 0,
      payload?.active ? "1" : "0",
      payload?.primary?.id || "",
      Array.isArray(payload?.streams) ? payload.streams.length : 0,
    ]);
    return sendJsonWithEtag(req, res, payload, {
      cacheControl: "public, max-age=15",
      etag,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-kick-live:", err);
    return res.status(500).json({ ok: false, active: false, error: "internal" });
  }
}

async function handleSiteKickLiveStreamPlaylist(client?, req?, res?) {
  try {
    const slug = normalizeSlug(req.query?.slug || "");
    if (!slug) return res.status(400).type("text/plain").send("missing_slug");
    const pack = await refreshLiveCache(client);
    const row = pack.bySlug.get(slug);
    const src = String(row?._playbackLow || row?._playbackMaster || "").trim();
    if (!src) return res.status(404).type("text/plain").send("offline");
    let text = await fetchText(src);
        if (String(row?.kind || "").toLowerCase() === "vod") {
      text = clipMediaPlaylistForPreview(text, 180);
    }
    const rewritten = rewritePlaylistUrls(text, src);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(rewritten);
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-kick-live stream:", err?.message || err);
    return res.status(502).type("text/plain").send("upstream_error");
  }
}

async function handleSiteKickLiveProxy(client?, req?, res?) {
  try {
    const raw = String(req.query?.u || "").trim();
    if (!raw) return res.status(400).type("text/plain").send("missing_u");
    let parsed = null;
    try {
      parsed = new URL(raw);
    } catch (_) {
      return res.status(400).type("text/plain").send("bad_url");
    }
    if (parsed.protocol !== "https:" || !isAllowedKickMediaHost(parsed.hostname)) {
      return res.status(403).type("text/plain").send("host_denied");
    }
    const abs = parsed.toString();
    if (!isMintedProxyUrl(abs)) {
      return res.status(403).type("text/plain").send("url_not_minted");
    }
    const { buf, contentType } = await fetchBinary(abs, 12_000);
    let body = buf;
    let type = contentType;
    if (/mpegurl|m3u8|application\/vnd\.apple/i.test(type) || parsed.pathname.endsWith(".m3u8")) {
      const rewritten = rewritePlaylistUrls(buf.toString("utf8"), parsed.toString());
      body = Buffer.from(rewritten, "utf8");
      type = "application/vnd.apple.mpegurl; charset=utf-8";
    }
    res.setHeader("Content-Type", type || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(body);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg === "host_denied" || msg === "bad_url") {
      return res.status(403).type("text/plain").send(msg);
    }
    global.logger?.warn?.("[WEBHOOK] site-kick-live proxy:", msg);
    return res.status(502).type("text/plain").send("upstream_error");
  }
}

const previewMp4Jobs = new Map();

function previewCachePath(slug?, kind?, src?) {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const os = require("node:os") as typeof import("node:os");
  const path = require("node:path") as typeof import("node:path");
  const key = crypto
    .createHash("sha1")
    .update(`x264v2|${slug}|${kind}|${src}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `vc-kick-prev2-${slug}-${key}.mp4`);
}

async function buildPreviewMp4File(srcUrl?, outPath?, seconds = 40) {
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  const fs = require("node:fs") as typeof import("node:fs");
  const sec = Math.max(12, Math.min(90, Number(seconds) || 40));
  await fs.promises.mkdir(require("node:path").dirname(outPath), { recursive: true }).catch(() => {});
  const tmp = `${outPath}.part`;
  try {
    await fs.promises.unlink(tmp);
  } catch (_) {}
  await new Promise((resolve?, reject?) => {
            const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-user_agent",
      UA,
      "-headers",
      "Referer: https://kick.com/\r\nOrigin: https://kick.com\r\n",
      "-i",
      String(srcUrl),
      "-t",
      String(sec),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-g",
      "30",
      "-keyint_min",
      "30",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      tmp,
    ];
    const child = spawn("ffmpeg", args, { windowsHide: true });
    let errBuf = "";
    child.stderr.on("data", (d?) => {
      errBuf += String(d || "");
      if (errBuf.length > 2000) errBuf = errBuf.slice(-1500);
    });
    const killer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_) {}
    }, 90_000);
    child.on("error", (err?) => {
      clearTimeout(killer);
      reject(err);
    });
    child.on("close", (code?) => {
      clearTimeout(killer);
      if (code === 0) ((resolve as any)() as any);
      else reject(new Error(`ffmpeg_exit_${code}: ${errBuf.slice(0, 240)}`));
    });
  });
  await fs.promises.rename(tmp, outPath);
  return outPath;
}

async function handleSiteKickLivePreviewMp4(client?, req?, res?) {
  const fs = require("node:fs") as typeof import("node:fs");
  try {
    const slug = normalizeSlug(req.query?.slug || "");
    if (!slug) return res.status(400).type("text/plain").send("missing_slug");
    const pack = await refreshLiveCache(client);
    const row = pack.bySlug.get(slug);
    const src = String(row?._playbackLow || row?._playbackMaster || "").trim();
    if (!src) return res.status(404).type("text/plain").send("offline");
    const kind = String(row?.kind || "live").toLowerCase() === "vod" ? "vod" : "live";
    const outPath = previewCachePath(slug, kind, src);
    const ttlMs = kind === "live" ? 45_000 : 10 * 60_000;
    let st = null;
    try {
      st = await fs.promises.stat(outPath);
    } catch (_) {}
    const fresh = st && Date.now() - st.mtimeMs < ttlMs && st.size > 50_000;
    if (!fresh) {
      let job = previewMp4Jobs.get(outPath);
      if (!job) {
        job = buildPreviewMp4File(src, outPath, kind === "live" ? 25 : 45)
          .catch((err?) => {
            global.logger?.warn?.("[site-kick-live] preview mp4:", slug, err?.message || err);
            throw err;
          })
          .finally(() => {
            previewMp4Jobs.delete(outPath);
          });
        previewMp4Jobs.set(outPath, job);
      }
      await job;
    }
    const buf = await fs.promises.readFile(outPath);
    const total = buf.length;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", kind === "live" ? "public, max-age=20" : "public, max-age=120");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const range = String(req.headers.range || "").trim();
    const m = range.match(/^bytes=(\d*)-(\d*)$/i);
    if (m) {
      let start = m[1] === "" ? 0 : Number(m[1]);
      let end = m[2] === "" ? total - 1 : Number(m[2]);
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        res.setHeader("Content-Range", `bytes */${total}`);
        return res.status(416).end();
      }
      const chunk = buf.subarray(start, end + 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", String(chunk.length));
      return res.send(chunk);
    }

    res.setHeader("Content-Length", String(total));
    return res.status(200).send(buf);
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-kick-live preview:", err?.message || err);
    return res.status(502).type("text/plain").send("preview_error");
  }
}

async function handleSiteKickLiveThumb(client?, req?, res?) {
  try {
    const slug = normalizeSlug(req.query?.slug || "");
    if (!slug) return res.status(400).type("text/plain").send("missing_slug");
    const pack = await refreshLiveCache(client);
    const row = pack.bySlug.get(slug);
    const thumb = String(row?._thumbSrc || "").trim();
    if (!thumb) return res.status(404).type("text/plain").send("no_thumb");
    const { buf, contentType } = await fetchBinary(thumb, 10_000);
    res.setHeader("Content-Type", contentType || "image/webp");
    res.setHeader("Cache-Control", "public, max-age=120");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(buf);
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-kick-live thumb:", err?.message || err);
    return res.status(502).type("text/plain").send("thumb_error");
  }
}

/* apiWarmSwr2: tieni cache calda per PIP site-wide */
function warmSiteKickLiveCache(client?) {
  return refreshLiveCache(client).catch((err?) => {
    global.logger?.warn?.("[site-kick-live] warm:", err?.message || err);
    return null;
  });
}

export = {
  handleSiteKickLiveGet,
  handleSiteKickLiveStreamPlaylist,
  handleSiteKickLiveProxy,
  handleSiteKickLivePreviewMp4,
  handleSiteKickLiveThumb,
  warmSiteKickLiveCache,
  refreshLiveCache,
};
