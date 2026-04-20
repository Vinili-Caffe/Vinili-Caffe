const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getLevelInfo } = require("../../Services/Community/expService");

const LIST_CACHE_TTL_MS = 30_000;
const listCache = new Map();

function cacheGet(key) {
  const row = listCache.get(key);
  if (row && row.expiresAt > Date.now()) return row.payload;
  return null;
}

function cacheSet(key, payload) {
  listCache.set(key, { payload, expiresAt: Date.now() + LIST_CACHE_TTL_MS });
}

function parseIntSafe(v, min, max, def) {
  const n = parseInt(String(v || ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

/**
 * GET JSON per il sito: classifica utenti per EXP totale (stesso criterio “livello” del bot).
 * Query: page (default 1), perPage (default 12, max 24).
 */
async function handleSiteUsersLeaderboardGet(client, req, res) {
  try {
    const guildId = resolveGuildId(client);
    if (!guildId) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }
    const q = req.query || {};
    const page = parseIntSafe(q.page, 1, 100000, 1);
    const perPage = parseIntSafe(q.perPage, 1, 24, 12);
    const cacheKey = `${guildId}:p${page}:n${perPage}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=15");
      return res.json(cached);
    }

    const filter = { guildId, "profile.totals.exp.totalExp": { $gt: 0 } };
    const skip = (page - 1) * perPage;

    const [total, docs, topDoc, guild] = await Promise.all([
      ActivityUserProfile.countDocuments(filter).catch(() => 0),
      ActivityUserProfile.find(filter)
        .select("userId profile.totals.exp.totalExp profile.totals.exp.level")
        .sort({ "profile.totals.exp.totalExp": -1 })
        .skip(skip)
        .limit(perPage)
        .lean()
        .catch(() => []),
      ActivityUserProfile.findOne(filter)
        .select("userId profile.totals.exp.totalExp profile.totals.exp.level")
        .sort({ "profile.totals.exp.totalExp": -1 })
        .lean()
        .catch(() => null),
      client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null),
    ]);

    let topLevel = 0;
    let topDisplayName = "";
    if (topDoc) {
      const te = Math.max(0, Math.floor(Number(topDoc.profile?.totals?.exp?.totalExp || 0)));
      const li = getLevelInfo(te);
      const lv = Math.max(Math.floor(Number(topDoc.profile?.totals?.exp?.level || 0)), li.level);
      topLevel = lv;
      const uid = String(topDoc.userId || "");
      if (uid) {
        const u = await client.users.fetch(uid).catch(() => null);
        if (u) topDisplayName = String(u.globalName || u.username || "").trim();
      }
    }

    const rows = await Promise.all(
      docs.map(async (d, i) => {
        const userId = String(d.userId || "");
        const totalExp = Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.totalExp || 0)));
        const li = getLevelInfo(totalExp);
        let level = Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.level || 0)));
        if (level < li.level) level = li.level;
        let displayName = "";
        let username = "";
        let avatar = "";
        let discriminator = "0";
        if (userId) {
          const u = await client.users.fetch(userId).catch(() => null);
          if (u) {
            username = String(u.username || "");
            displayName = String(u.globalName || u.username || "").trim();
            avatar = u.avatar ? String(u.avatar) : "";
            discriminator = String(u.discriminator || "0");
          }
        }
        return {
          rank: skip + i + 1,
          userId,
          username,
          displayName,
          discriminator,
          avatar,
          level,
          exp: totalExp,
          progressPercent: Math.max(0, Math.min(100, Math.round(Number(li.progressPercent || 0)))),
        };
      }),
    );

    const payload = {
      ok: true,
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      stats: {
        rankedUsers: total,
        membersApprox: guild?.memberCount ?? null,
        topLevel,
        topDisplayName,
      },
      rows,
    };
    cacheSet(cacheKey, payload);
    res.setHeader("Cache-Control", "public, max-age=20");
    return res.json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-users:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = { handleSiteUsersLeaderboardGet };