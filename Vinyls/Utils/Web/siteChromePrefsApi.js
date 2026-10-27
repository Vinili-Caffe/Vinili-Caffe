const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const IDs = require("../Config/ids");
const { tryNotModified } = require("./siteHttpEtag");

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
    if (typeof src.kickPip.userClosed === "boolean") kick.userClosed = src.kickPip.userClosed;
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
  /* twitchPipPrefs1: open/closed + pos synced across devices like kickPip */
  if (src.twitchPip && typeof src.twitchPip === "object") {
    const tw = {};
    if (typeof src.twitchPip.userClosed === "boolean") tw.userClosed = src.twitchPip.userClosed;
    if (src.twitchPip.dismiss && typeof src.twitchPip.dismiss === "object") {
      const until = Number(src.twitchPip.dismiss.until) || 0;
      const id = String(src.twitchPip.dismiss.id || "").trim().slice(0, 120);
      if (id || until > 0) {
        tw.dismiss = { id, until: until > 0 ? until : Date.now() + 18 * 60 * 60 * 1000 };
      }
    }
    if (src.twitchPip.pos && typeof src.twitchPip.pos === "object") {
      const corner = String(src.twitchPip.pos.corner || "").trim();
      if (/^(tl|tr|bl|br)$/.test(corner)) tw.pos = { corner };
      else if (Number.isFinite(Number(src.twitchPip.pos.left)) && Number.isFinite(Number(src.twitchPip.pos.top))) {
        tw.pos = {
          left: Math.max(0, Math.min(10000, Number(src.twitchPip.pos.left))),
          top: Math.max(0, Math.min(10000, Number(src.twitchPip.pos.top))),
        };
      }
    }
    if (Object.keys(tw).length) out.twitchPip = tw;
  }
  /* navFeatSeenSync1: map path -> ts visite badge Nuovo/Aggiornato */
  if (src.navFeatSeen && typeof src.navFeatSeen === "object") {
    const map = {};
    Object.keys(src.navFeatSeen)
      .slice(0, 220)
      .forEach((k) => {
        const key = String(k || "").replace(/\/+$/, "") || "";
        if (!key || key === "/" || key.length > 140) return;
        if (!/^\/[a-z0-9/_-]*$/i.test(key)) return;
        const ts = Number(src.navFeatSeen[k]);
        if (Number.isFinite(ts) && ts > 0) map[key] = Math.floor(ts);
      });
    if (Object.keys(map).length) out.navFeatSeen = map;
  }
  /* themeSync1: light|dark|auto synced across devices via chrome prefs */
  if (typeof src.theme === "string") {
    const theme = String(src.theme || "").trim().toLowerCase();
    if (theme === "light" || theme === "dark" || theme === "auto") out.theme = theme;
  }
  /* eventoSwBgm1: mute/vol/seek BGM Star Wars cross-device */
  if (src.eventoBgm && typeof src.eventoBgm === "object") {
    const bgm = {};
    if (typeof src.eventoBgm.enabled === "boolean") bgm.enabled = src.eventoBgm.enabled;
    const vol = Number(src.eventoBgm.volume);
    if (Number.isFinite(vol)) bgm.volume = Math.min(1, Math.max(0, vol));
    const seek = Number(src.eventoBgm.seek);
    if (Number.isFinite(seek) && seek >= 0) bgm.seek = Math.min(seek, 86400);
    const trackIdx = Number(src.eventoBgm.trackIdx);
    if (Number.isFinite(trackIdx) && trackIdx >= 0) bgm.trackIdx = Math.min(Math.floor(trackIdx), 20);
    const at = Number(src.eventoBgm.at);
    if (Number.isFinite(at) && at > 0) bgm.at = at;
    if (Object.keys(bgm).length) out.eventoBgm = bgm;
  }
  out.updatedAt = Number(src.updatedAt) || Date.now();
  return out;
}

function deepMergeChrome(base, patch) {
  const rawPatch = patch && typeof patch === "object" ? patch : {};
  const a = sanitizeChromePrefs(base);
  const b = sanitizeChromePrefs(patch);
  const out = { ...a, ...b, updatedAt: Math.max(Number(a.updatedAt) || 0, Number(b.updatedAt) || 0, Date.now()) };
  if (a.hogwartsBgm || b.hogwartsBgm) out.hogwartsBgm = { ...(a.hogwartsBgm || {}), ...(b.hogwartsBgm || {}) };
  if (a.seratafilmBgm || b.seratafilmBgm) out.seratafilmBgm = { ...(a.seratafilmBgm || {}), ...(b.seratafilmBgm || {}) };
  if (a.eventoBgm || b.eventoBgm) {
    const ea = a.eventoBgm || {};
    const eb = b.eventoBgm || {};
    /* remote più recente vince su seek/enabled se ha `at` maggiore */
    const aAt = Number(ea.at) || 0;
    const bAt = Number(eb.at) || 0;
    out.eventoBgm = bAt >= aAt ? { ...ea, ...eb } : { ...eb, ...ea };
  }
  if (a.typeSfx || b.typeSfx) out.typeSfx = { ...(a.typeSfx || {}), ...(b.typeSfx || {}) };
  if (a.kickPip || b.kickPip || rawPatch.kickPip) {
    out.kickPip = { ...(a.kickPip || {}), ...(b.kickPip || {}) };
    if (
      rawPatch.kickPip &&
      Object.prototype.hasOwnProperty.call(rawPatch.kickPip, "dismiss") &&
      rawPatch.kickPip.dismiss === null
    ) {
      delete out.kickPip.dismiss;
    }
    if (typeof rawPatch.kickPip?.userClosed === "boolean") {
      out.kickPip.userClosed = rawPatch.kickPip.userClosed;
    }
  }
  if (a.twitchPip || b.twitchPip || rawPatch.twitchPip) {
    out.twitchPip = { ...(a.twitchPip || {}), ...(b.twitchPip || {}) };
    if (
      rawPatch.twitchPip &&
      Object.prototype.hasOwnProperty.call(rawPatch.twitchPip, "dismiss") &&
      rawPatch.twitchPip.dismiss === null
    ) {
      delete out.twitchPip.dismiss;
    }
    if (typeof rawPatch.twitchPip?.userClosed === "boolean") {
      out.twitchPip.userClosed = rawPatch.twitchPip.userClosed;
    }
  }
  if (a.navFeatSeen || b.navFeatSeen) {
    const map = { ...(a.navFeatSeen || {}) };
    Object.keys(b.navFeatSeen || {}).forEach((k) => {
      map[k] = Math.max(Number(map[k]) || 0, Number(b.navFeatSeen[k]) || 0);
    });
    out.navFeatSeen = map;
  }
  return sanitizeChromePrefs(out);
}

/* chromePrefs401Soft1: prefs UI non-critiche — missing/invalid token → 200 anonymous
   (niente Failed to load 401 in console su guest / sessione scaduta). */
function anonymousChromePrefsPayload(extra = {}) {
  return {
    ok: true,
    prefs: {},
    anonymous: true,
    ...extra,
  };
}

async function handleSiteChromePrefsGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    if (!accessToken) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(anonymousChromePrefsPayload({ error: "missing_token" }));
    }
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (!resolved.ok) {
      const st = Number(resolved.status) || 401;
      /* solo auth: soft 200; 5xx restano errori veri */
      if (st === 401 || st === 403 || resolved.error === "missing_token" || resolved.error === "invalid_token") {
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json(
          anonymousChromePrefsPayload({
            error: resolved.error || "auth",
            message: resolved.message || "",
          }),
        );
      }
      return res.status(st).json(resolved);
    }
    const guildId = resolveGuildId(client) || resolved.guild?.id;
    const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: resolved.userId })
      .select("profile.siteChromePrefs")
      .lean()
      .catch(() => null);
    const prefs = sanitizeChromePrefs(doc?.profile?.siteChromePrefs || {});
    const etag = `W/"chrome-${resolved.userId}-${Number(prefs.updatedAt) || 0}"`;
    res.setHeader("Cache-Control", "private, max-age=120, stale-while-revalidate=60");
    if (tryNotModified(req, res, etag)) return res;
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
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: false, skipped: true, anonymous: true, error: "missing_token" });
    }
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (!resolved.ok) {
      const st = Number(resolved.status) || 401;
      if (st === 401 || st === 403 || resolved.error === "missing_token" || resolved.error === "invalid_token") {
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json({
          ok: false,
          skipped: true,
          anonymous: true,
          error: resolved.error || "auth",
          message: resolved.message || "",
        });
      }
      return res.status(st).json(resolved);
    }
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
