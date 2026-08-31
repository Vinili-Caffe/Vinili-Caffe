const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const IDs = require("../Config/ids");

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function sanitizeChromePrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  if (src.hogwartsBgm && typeof src.hogwartsBgm === "object") {
    out.hogwartsBgm = {
      enabled: src.hogwartsBgm.enabled !== false,
      volume: Math.min(1, Math.max(0, Number(src.hogwartsBgm.volume))),
    };
    if (!Number.isFinite(out.hogwartsBgm.volume)) delete out.hogwartsBgm.volume;
    if (typeof src.hogwartsBgm.playing === "boolean") out.hogwartsBgm.playing = src.hogwartsBgm.playing;
    const seek = Number(src.hogwartsBgm.seek);
    if (Number.isFinite(seek) && seek >= 0) out.hogwartsBgm.seek = Math.min(seek, 86400);
    const videoIdx = Number(src.hogwartsBgm.videoIdx);
    if (Number.isFinite(videoIdx) && videoIdx >= 0) out.hogwartsBgm.videoIdx = Math.min(Math.floor(videoIdx), 50);
    const at = Number(src.hogwartsBgm.at);
    if (Number.isFinite(at) && at > 0) out.hogwartsBgm.at = at;
  }
  if (src.seratafilmBgm && typeof src.seratafilmBgm === "object") {
    out.seratafilmBgm = {
      volume: Math.min(1, Math.max(0, Number(src.seratafilmBgm.volume))),
    };
    if (!Number.isFinite(out.seratafilmBgm.volume)) delete out.seratafilmBgm.volume;
  }
  if (src.typeSfx && typeof src.typeSfx === "object") {
    out.typeSfx = {
      enabled: src.typeSfx.enabled !== false,
      volume: Math.min(1, Math.max(0, Number(src.typeSfx.volume))),
    };
    if (!Number.isFinite(out.typeSfx.volume)) delete out.typeSfx.volume;
  }
  if (src.kickPip && typeof src.kickPip === "object") {
    const kick = {};
    if (src.kickPip.dismiss && typeof src.kickPip.dismiss === "object") {
      const ids = Array.isArray(src.kickPip.dismiss.ids)
        ? src.kickPip.dismiss.ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20)
        : [];
      if (src.kickPip.dismiss.id) ids.push(String(src.kickPip.dismiss.id).trim());
      kick.dismiss = {
        ids,
        id: String(src.kickPip.dismiss.id || ids[0] || "").slice(0, 120),
        slug: String(src.kickPip.dismiss.slug || "").slice(0, 120),
        at: Number(src.kickPip.dismiss.at) || Date.now(),
      };
    }
    if (src.kickPip.pos && typeof src.kickPip.pos === "object") {
      const corner = String(src.kickPip.pos.corner || "").trim();
      if (/^(tl|tr|bl|br)$/.test(corner)) kick.pos = { corner };
      else if (Number.isFinite(Number(src.kickPip.pos.left)) && Number.isFinite(Number(src.kickPip.pos.top))) {
        kick.pos = {
          left: Math.max(0, Math.min(10000, Number(src.kickPip.pos.left))),
          top: Math.max(0, Math.min(10000, Number(src.kickPip.pos.top))),
        };
      }
    }
    if (src.kickPip.resume && typeof src.kickPip.resume === "object") {
      const rt = Number(src.kickPip.resume.t);
      const rid = String(src.kickPip.resume.id || "").trim().slice(0, 120);
      if (rid && Number.isFinite(rt) && rt > 0.2) {
        kick.resume = { id: rid, t: Math.min(rt, 86400), at: Number(src.kickPip.resume.at) || Date.now() };
      }
    }
    if (Object.keys(kick).length) out.kickPip = kick;
  }
  out.updatedAt = Number(src.updatedAt) || Date.now();
  return out;
}

function deepMergeChrome(base, patch) {
  const a = sanitizeChromePrefs(base);
  const b = sanitizeChromePrefs(patch);
  const out = { ...a, ...b, updatedAt: Math.max(Number(a.updatedAt) || 0, Number(b.updatedAt) || 0, Date.now()) };
  if (a.hogwartsBgm || b.hogwartsBgm) out.hogwartsBgm = { ...(a.hogwartsBgm || {}), ...(b.hogwartsBgm || {}) };
  if (a.seratafilmBgm || b.seratafilmBgm) out.seratafilmBgm = { ...(a.seratafilmBgm || {}), ...(b.seratafilmBgm || {}) };
  if (a.typeSfx || b.typeSfx) out.typeSfx = { ...(a.typeSfx || {}), ...(b.typeSfx || {}) };
  if (a.kickPip || b.kickPip) {
    out.kickPip = { ...(a.kickPip || {}), ...(b.kickPip || {}) };
    if (b.kickPip?.dismiss === null) delete out.kickPip.dismiss;
  }
  return sanitizeChromePrefs(out);
}

async function handleSiteChromePrefsGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Authorization Bearer richiesto." });
    }
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (!resolved.ok) return res.status(Number(resolved.status) || 401).json(resolved);
    const guildId = resolveGuildId(client) || resolved.guild?.id;
    const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: resolved.userId })
      .select("profile.siteChromePrefs")
      .lean()
      .catch(() => null);
    const prefs = sanitizeChromePrefs(doc?.profile?.siteChromePrefs || {});
    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(200).json({ ok: true, prefs });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-chrome-prefs get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteChromePrefsPost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json({ ok: false, error: "missing_token", message: "Authorization Bearer richiesto." });
    }
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (!resolved.ok) return res.status(Number(resolved.status) || 401).json(resolved);
    const guildId = resolveGuildId(client) || resolved.guild?.id;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch = body.prefs && typeof body.prefs === "object" ? body.prefs : body;
    const existing = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: resolved.userId })
      .select("profile.siteChromePrefs")
      .lean()
      .catch(() => null);
    const next = deepMergeChrome(existing?.profile?.siteChromePrefs || {}, patch);
    await ActivityUserProfile.updateOne(
      { guildId: String(guildId || ""), userId: resolved.userId },
      {
        $setOnInsert: { guildId: String(guildId || ""), userId: resolved.userId },
        $set: { "profile.siteChromePrefs": next },
      },
      { upsert: true },
    ).catch(() => null);
    return res.status(200).json({ ok: true, prefs: next });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-chrome-prefs post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteChromePrefsGet,
  handleSiteChromePrefsPost,
  sanitizeChromePrefs,
};
