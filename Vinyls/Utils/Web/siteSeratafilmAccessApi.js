const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { resolveWebsiteCandidatureMember } = require("../../Events/interaction/candidatureApplicationHandlers");
const { memberHasHogwartsPreviewStaffRole } = require("./hogwartsEventParticipation");
const ACCESS_CACHE_TTL_MS = 90_000;
const ACCESS_CACHE_MAX = 400;
const FILM_STREAM_TTL_MS = 4 * 60 * 60 * 1000;
const accessCache = new Map();

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function filmStreamSecret() {
  return String(process.env.VC_SERATAFILM_FILM_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function accessCacheKey(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex").slice(0, 40);
}

function pruneAccessCache() {
  const now = Date.now();
  for (const [key, entry] of accessCache) {
    if (!entry || Number(entry.exp || 0) <= now) accessCache.delete(key);
  }
  if (accessCache.size <= ACCESS_CACHE_MAX) return;
  const keys = [...accessCache.keys()];
  for (let i = 0; i < keys.length - ACCESS_CACHE_MAX; i += 1) {
    accessCache.delete(keys[i]);
  }
}

function readCachedAccess(token) {
  const key = accessCacheKey(token);
  const entry = accessCache.get(key);
  if (!entry || Number(entry.exp || 0) <= Date.now()) {
    accessCache.delete(key);
    return null;
  }
  return entry;
}

function writeCachedAccess(token, payload) {
  pruneAccessCache();
  accessCache.set(accessCacheKey(token), {
    ...payload,
    exp: Date.now() + ACCESS_CACHE_TTL_MS,
  });
}

function createFilmStreamToken(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return "";
  const exp = Date.now() + FILM_STREAM_TTL_MS;
  const payload = `${uid}:${exp}`;
  const sig = crypto.createHmac("sha256", filmStreamSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyFilmStreamToken(st) {
  try {
    const raw = Buffer.from(String(st || ""), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 3) return null;
    const [userId, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
    const payload = `${userId}:${expStr}`;
    const expect = crypto.createHmac("sha256", filmStreamSecret()).update(payload).digest("base64url");
    if (sig !== expect) return null;
    return { userId, exp };
  } catch (_) {
    return null;
  }
}

function buildFilmStreamUrl(userId) {
  const st = createFilmStreamToken(userId);
  if (!st) return "";
  return `/webhooks/site-seratafilm-film?st=${encodeURIComponent(st)}`;
}

function resolveSeratafilmFilmPath() {
  const envPath = String(process.env.VC_SERATAFILM_FILM_FILE || "").trim();
  if (envPath && fs.existsSync(envPath)) return envPath;
  const cfgPaths = [
    "/opt/bot/Vinyls/Config/site.config.json",
    path.join(__dirname, "../../Config/site.config.json"),
    path.join(__dirname, "../../../Vinyls/Config/site.config.json"),
  ];
  const wwwRoot = String(process.env.VC_WWW_ROOT || "/var/www/viniliecaffe").trim() || "/var/www/viniliecaffe";
  for (const cfgPath of cfgPaths) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      const link = String(cfg?.seratafilmEvent?.linkFilm || "").trim();
      if (link.startsWith("/")) {
        const full = path.join(wwwRoot, link.replace(/^\//, ""));
        if (fs.existsSync(full)) return full;
      }
    } catch (_) {}
  }
  const fallback = path.join(wwwRoot, "images/evento-hogwarts/streamingcommunityz-web.mp4");
  return fallback;
}

function pipeVideoRange(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat || !stat.isFile()) {
      return res.status(404).type("text/plain").send("not_found");
    }
    const total = stat.size;
    const range = String(req.headers.range || "").trim();
    const commonHeaders = {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    };
    const m = range.match(/^bytes=(\d*)-(\d*)$/i);
    if (m) {
      let start = m[1] === "" ? 0 : Number(m[1]);
      let end = m[2] === "" ? total - 1 : Number(m[2]);
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        res.writeHead(416, { ...commonHeaders, "Content-Range": `bytes */${total}` });
        return res.end();
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        ...commonHeaders,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": chunkSize,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      ...commonHeaders,
      "Content-Length": total,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function verifySeratafilmHighStaffAccess(client, accessToken) {
  const cached = readCachedAccess(accessToken);
  if (cached) {
    if (cached.ok) {
      return {
        ok: true,
        userId: cached.userId || "",
        cached: true,
      };
    }
    return {
      ok: false,
      status: Number(cached.status) || 403,
      error: cached.error || "forbidden",
      message: cached.message || "Accesso negato.",
      cached: true,
    };
  }

  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) {
    const st = Number(resolved.status) || 403;
    writeCachedAccess(accessToken, {
      ok: false,
      status: st,
      error: resolved.error,
      message: resolved.message,
    });
    return {
      ok: false,
      status: st,
      error: resolved.error,
      message: resolved.message,
    };
  }
  const member = resolved.member;
  if (!memberHasHogwartsPreviewStaffRole(member)) {
    writeCachedAccess(accessToken, {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Questa pagina è riservata all'High Staff del server.",
    });
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Questa pagina è riservata all'High Staff del server.",
    };
  }
  const userId = String(member.user?.id || member.id || "").trim();
  writeCachedAccess(accessToken, { ok: true, status: 200, userId });
  return { ok: true, userId };
}

async function handleSiteSeratafilmAccessGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Header Authorization: Bearer <token> richiesto.",
      });
    }

    const verified = await verifySeratafilmHighStaffAccess(client, accessToken);
    res.setHeader("Cache-Control", "private, no-store");
    if (!verified.ok) {
      return res.status(Number(verified.status) || 403).json({
        ok: false,
        error: verified.error || "forbidden",
        message: verified.message || "Accesso negato.",
        cached: Boolean(verified.cached),
      });
    }
    const filmStreamUrl = buildFilmStreamUrl(verified.userId);
    return res.status(200).json({
      ok: true,
      allowed: true,
      isHighStaff: true,
      canManage: true,
      filmStreamUrl,
      cached: Boolean(verified.cached),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-seratafilm-access:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteSeratafilmFilmGet(client, req, res) {
  try {
    const st = String(req.query?.st || "").trim();
    let allowed = Boolean(verifyFilmStreamToken(st));
    if (!allowed) {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (accessToken) {
        const verified = await verifySeratafilmHighStaffAccess(client, accessToken);
        allowed = Boolean(verified.ok);
      }
    }
    if (!allowed) {
      return res.status(401).type("text/plain").send("unauthorized");
    }
    const filePath = resolveSeratafilmFilmPath();
    return pipeVideoRange(req, res, filePath);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-seratafilm-film:", err);
    return res.status(500).type("text/plain").send("internal");
  }
}

module.exports = {
  handleSiteSeratafilmAccessGet,
  handleSiteSeratafilmFilmGet,
};
