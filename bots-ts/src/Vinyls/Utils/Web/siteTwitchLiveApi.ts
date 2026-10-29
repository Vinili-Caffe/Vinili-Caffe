const {
  resolveConfig,
  normalizeLogin,
  getAppAccessToken,
  fetchLiveStreams,
  buildStreamThumbnailUrl,
} = require("../../Services/Community/twitchLiveAlertService") as typeof import("../../Services/Community/twitchLiveAlertService");
const { sendJsonWithEtag, weakEtagFromParts } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

const CACHE_TTL_MS = 25_000;
const STALE_KEEP_MS = 12 * 60_000;
const HELIX_UA = "ViniliECaffe-SiteTwitchLive/1.0";
/* twitchTokenFailBackoff1: warm 22s non deve spammare warn su fail token */
const WARN_LOG_COOLDOWN_MS = 10 * 60_000;

let cache = { at: 0, payload: null };
let lastWarnAt = 0;
let lastWarnMsg = "";

function warnTwitchLive(label?, err?) {
  /* backoff silenzioso: failUntil non deve riempire i log ogni warm */
  if (err?.code === "TWITCH_TOKEN_BACKOFF") return;
  const msg = String(err?.message || err || "").trim();
  const now = Date.now();
  const same = msg === lastWarnMsg;
  if (same && now - lastWarnAt < WARN_LOG_COOLDOWN_MS) return;
  lastWarnAt = now;
  lastWarnMsg = msg;
  global.logger?.warn?.(`[site-twitch-live] ${label}:`, msg || err);
}

function parentHosts() {
  // Twitch embed: parent = hostname della pagina (www, beta, apex, locale).
  return [
    "www.viniliecaffe.it",
    "viniliecaffe.it",
    "beta.viniliecaffe.it",
    "localhost",
    "127.0.0.1",
  ];
}

function twitchEmbedUrl({ login, videoId, kind }) {
  const params = new URLSearchParams();
  // Twitch richiede player >= 400px per autoplay: il PIP scala un iframe 400x225.
  params.set("muted", "true");
  params.set("autoplay", "false");
  params.set("controls", "true");
  params.set("layout", "video");
  params.set("time", "0h0m0s");
  for (const p of parentHosts()) params.append("parent", p);
  if (kind === "vod" && videoId) {
    params.set("video", String(videoId).replace(/^v/i, ""));
  } else if (login) {
    params.set("channel", login);
  } else {
    return null;
  }
  return `https://player.twitch.tv/?${params.toString()}`;
}

function parseTwitchDurationMs(raw?) {
  const s = String(raw || "").trim();
  if (!s) return 0;
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const sec = Number(m[3] || 0);
  return Math.max(0, ((h * 60 + min) * 60 + sec) * 1000);
}

function normalizeTwitchThumbUrl(raw?, width = 640, height = 360) {
  let url = String(raw || "").trim();
  if (!url) return null;
  if (url.startsWith("//")) url = `https:${url}`;
  const w = Math.max(160, Math.min(1280, Number(width) || 640));
  const h = Math.max(90, Math.min(720, Number(height) || 360));
  url = url
    .replace(/%\{width\}/gi, String(w))
    .replace(/%\{height\}/gi, String(h))
    .replace(/\{width\}/gi, String(w))
    .replace(/\{height\}/gi, String(h));
  // Non collassare // nel path: Twitch VOD thumbs a volte lo usano di proposito.
  try {
    const u = new URL(url);
    return u.toString();
  } catch (_) {
    return url || null;
  }
}

function publicStreamPayload(streamer?, stream?) {
  const login = normalizeLogin(streamer?.login || stream?.user_login || stream?.login);
  const kind = String(stream?.kind || "live").trim().toLowerCase() === "vod" ? "vod" : "live";
  const videoId = String(stream?.id || "").trim();
  const thumbRaw =
    normalizeTwitchThumbUrl(stream?.thumbnail_url) ||
    buildStreamThumbnailUrl(stream?.thumbnail_url) ||
    String(stream?.thumbnail_url || "").trim() ||
    null;
  const pageUrl =
    String(stream?.url || "").trim() ||
    (kind === "vod" && videoId
      ? `https://www.twitch.tv/videos/${encodeURIComponent(videoId.replace(/^v/i, ""))}`
      : login
        ? `https://www.twitch.tv/${login}`
        : "https://www.twitch.tv/");
  const thumbProxied =
    thumbRaw && kind
      ? `/webhooks/site-twitch-live/thumb?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(videoId || login)}&u=${encodeURIComponent(thumbRaw)}`
      : null;
  return {
    id: videoId || `${kind}:${login}`,
    slug: login,
    login,
    kind,
    displayName: String(streamer?.displayName || stream?.user_name || login).trim() || login,
    title:
      String(stream?.title || (kind === "vod" ? "Ultimo VOD" : "Diretta in corso")).trim() ||
      (kind === "vod" ? "Ultimo VOD" : "Diretta in corso"),
    category: String(stream?.game_name || stream?.category || "").trim(),
    viewerCount: Math.max(0, Math.floor(Number(stream?.viewer_count || stream?.view_count) || 0)),
    durationMs: Math.max(
      0,
      Math.floor(Number(stream?.duration_ms) || parseTwitchDurationMs(stream?.duration) || 0),
    ),
    thumbnailUrl: thumbProxied || thumbRaw,
    thumbnailUrlDirect: thumbRaw,
    url: pageUrl,
    startedAt: stream?.started_at || stream?.created_at || null,
    playbackUrl: null,
    previewMp4Url: null,
    embedUrl: twitchEmbedUrl({
      login,
      videoId: kind === "vod" ? videoId : "",
      kind,
    }),
  };
}

async function helixGet(clientId?, accessToken?, path?, query?) {
  const url = new URL(`https://api.twitch.tv/helix/${path}`);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v)) v.forEach((item?) => url.searchParams.append(k, String(item)));
      else url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": HELIX_UA,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twitch ${path} HTTP ${res.status} ${String(text || "").slice(0, 180)}`);
  }
  return res.json().catch(() => ({}));
}

async function fetchUserIdByLogin(clientId?, accessToken?, login?) {
  const data = await helixGet(clientId, accessToken, "users", { login });
  const row = Array.isArray(data?.data) ? data.data[0] : null;
  return String(row?.id || "").trim() || null;
}

async function fetchLatestVod(clientId?, accessToken?, userId?) {
  const data = await helixGet(clientId, accessToken, "videos", {
    user_id: userId,
    type: "archive",
    first: "1",
  });
  const row = Array.isArray(data?.data) ? data.data[0] : null;
  if (!row?.id) return null;
  return {
    kind: "vod",
    id: String(row.id),
    title: row.title,
    thumbnail_url: normalizeTwitchThumbUrl(row.thumbnail_url) || String(row.thumbnail_url || ""),
    url: row.url,
    created_at: row.created_at,
    duration: row.duration,
    view_count: row.view_count,
    user_login: row.user_login,
    user_name: row.user_name,
  };
}

async function refreshLiveCache(client?) {
  const now = Date.now();
  if (cache.payload && now - Number(cache.at || 0) < CACHE_TTL_MS) return cache;

  const prevGood =
    cache.payload && cache.payload.active
      ? { at: cache.at, payload: cache.payload }
      : null;
  const keepStale = () => {
    if (prevGood && now - Number(prevGood.at || 0) < STALE_KEEP_MS) {
      cache = { ...prevGood, at: now };
      return cache;
    }
    return null;
  };

  const cfg = resolveConfig(client);
  if (!cfg.enabled || !cfg.streamers.length || !cfg.clientId || !cfg.clientSecret) {
    cache = {
      at: now,
      payload: { ok: true, active: false, streams: [], primary: null },
    };
    return cache;
  }

  let token = "";
  try {
    token = await getAppAccessToken(cfg.clientId, cfg.clientSecret);
  } catch (err) {
    warnTwitchLive("token", err);
    const stale = keepStale();
    if (stale) return stale;
    cache = {
      at: now,
      payload: { ok: true, active: false, streams: [], primary: null },
    };
    return cache;
  }

  let liveRows = [];
  let liveFetchFailed = false;
  try {
    liveRows = await fetchLiveStreams(
      cfg.clientId,
      token,
      cfg.streamers.map((s?) => s.login),
    );
  } catch (err) {
    liveFetchFailed = true;
    warnTwitchLive("live fetch", err);
    /* Non bloccare sui VOD: se Helix live fallisce, prova comunque gli archive. */
  }
  const liveByLogin = new Map(
    (Array.isArray(liveRows) ? liveRows : []).map((row?) => [
      normalizeLogin(row?.user_login || row?.user_name),
      row,
    ]),
  );

  const streams = [];
  for (const streamer of cfg.streamers) {
    const login = normalizeLogin(streamer.login);
    const live = liveByLogin.get(login);
    if (live?.id) {
      streams.push(
        publicStreamPayload(streamer, {
          ...live,
          kind: "live",
          id: String(live.id),
          thumbnail_url: live.thumbnail_url,
        }),
      );
      continue;
    }
    try {
      const userId = await fetchUserIdByLogin(cfg.clientId, token, login);
      if (!userId) continue;
      const vod = await fetchLatestVod(cfg.clientId, token, userId);
      if (!vod?.id) continue;
      streams.push(publicStreamPayload(streamer, vod));
    } catch (err) {
      warnTwitchLive(`vod ${login}`, err);
    }
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
  };
  return cache;
}

async function handleSiteTwitchLiveGet(client?, req?, res?) {
  try {
    const pack = await refreshLiveCache(client);
    /* siteApiW7: ETag/304 on twitch live poll */
    const payload = pack.payload;
    const etag = weakEtagFromParts([
      "twitch",
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
    global.logger?.error?.("[WEBHOOK] site-twitch-live:", err);
    return res.status(500).json({ ok: false, active: false, error: "internal" });
  }
}

function isAllowedTwitchThumbHost(hostname?) {
  const h = String(hostname || "").toLowerCase();
  return (
    h === "static-cdn.jtvnw.net" ||
    h.endsWith(".jtvnw.net") ||
    h === "twitch.tv" ||
    h.endsWith(".twitch.tv")
  );
}

async function handleSiteTwitchLiveThumb(client?, req?, res?) {
  try {
    const raw = String(req.query?.u || "").trim();
    if (!raw) return res.status(400).type("text/plain").send("missing_url");
    let target = normalizeTwitchThumbUrl(raw) || raw;
    let host = "";
    try {
      host = new URL(target).hostname;
    } catch (_) {
      return res.status(400).type("text/plain").send("bad_url");
    }
    if (!isAllowedTwitchThumbHost(host)) return res.status(400).type("text/plain").send("host_denied");

    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      try {
        ctrl.abort();
      } catch (_) {}
    }, 10000);
    let upstream;
    try {
      upstream = await fetch(target, {
        signal: ctrl.signal,
        headers: {
          Accept: "image/*,*/*",
          "User-Agent": HELIX_UA,
          Referer: "https://www.twitch.tv/",
        },
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok) return res.status(502).type("text/plain").send("upstream");
    const buf = Buffer.from(await upstream.arrayBuffer());
    const ctype = String(upstream.headers.get("content-type") || "image/jpeg");
    res.setHeader("Content-Type", ctype);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(buf);
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-twitch-live thumb:", err?.message || err);
    return res.status(502).type("text/plain").send("thumb_failed");
  }
}

/* apiWarmSwr2: Helix cold ~500ms — refresh periodico */
function warmSiteTwitchLiveCache(client?) {
  return refreshLiveCache(client).catch((err?) => {
    global.logger?.warn?.("[site-twitch-live] warm:", err?.message || err);
    return null;
  });
}

export = {
  handleSiteTwitchLiveGet,
  handleSiteTwitchLiveThumb,
  refreshLiveCache,
  warmSiteTwitchLiveCache,
};
