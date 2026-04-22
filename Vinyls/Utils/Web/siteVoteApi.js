const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

const CACHE_TTL_MS = 30_000;
const cache = new Map();

function cacheGet(key) {
  const row = cache.get(key);
  if (row && row.expiresAt > Date.now()) return row.payload;
  return null;
}

function cacheSet(key, payload) {
  cache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
}

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function parseSearchUserId(raw) {
  const s = String(raw == null ? "" : raw).replace(/\D/g, "");
  return /^\d{17,20}$/.test(s) ? s : "";
}

function nInt(v) {
  if (v == null || v === "") return 0;
  const x = Number(String(v).trim().replace(/[,\s]/g, ""));
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
}

function voteLeaf(doc) {
  return doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
}

function combinedVotesFromLeaf(leaf) {
  const legacy = nInt(leaf?.voteCount);
  const topgg = nInt(leaf?.voteCountTopgg);
  const discadia = nInt(leaf?.voteCountDiscadia);
  if (topgg > 0 || discadia > 0) {
    return {
      total: topgg + discadia,
      topgg,
      discadia,
    };
  }
  return {
    total: legacy,
    topgg: 0,
    discadia: legacy,
  };
}

async function fetchUserIdentity(client, guild, userId) {
  const out = {
    userId: String(userId || ""),
    username: "",
    displayName: "",
    avatarUrl: "",
  };
  if (!out.userId) return out;
  let member = guild?.members?.cache?.get?.(out.userId) || null;
  if (!member && guild?.members?.fetch) {
    member = await guild.members.fetch({ user: out.userId, force: true }).catch(() => null);
  }
  let user = member?.user || null;
  if (!user && client?.users?.fetch) {
    user = await client.users.fetch(out.userId, { force: true }).catch(() => null);
  }
  out.username = String(user?.username || "").trim();
  out.displayName = String(member?.displayName || user?.globalName || user?.username || "Utente").trim() || "Utente";
  out.avatarUrl =
    (typeof user?.displayAvatarURL === "function" ? user.displayAvatarURL({ size: 256, dynamic: true }) : "") || "";
  return out;
}

async function handleSiteVoteGet(client, req, res) {
  try {
    const guildId = resolveGuildId(client);
    if (!guildId) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }

    const q = req.query || {};
    const searchUserId = parseSearchUserId(q.userId ?? q.id ?? q.uid);
    const cacheKey = `vote:v1:${guildId}:${searchUserId || "-"}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=20");
      return res.json(cached);
    }

    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));

    const docs = await ActivityUserProfile.find({
      guildId,
      $or: [
        { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountTopgg": { $gt: 0 } },
        { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountDiscadia": { $gt: 0 } },
        { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCount": { $gt: 0 } },
      ],
    })
      .select(
        "userId profile.totals.exp.bumpVoteRewards.discadia_vote",
      )
      .lean()
      .catch(() => []);

    const rowsBase = docs
      .map((doc) => {
        const counts = combinedVotesFromLeaf(voteLeaf(doc));
        return {
          userId: String(doc?.userId || ""),
          votes: counts.total,
          topggVotes: counts.topgg,
          discadiaVotes: counts.discadia,
        };
      })
      .filter((row) => row.userId && row.votes > 0)
      .sort((a, b) => b.votes - a.votes || a.userId.localeCompare(b.userId));

    const totalVotes = rowsBase.reduce((sum, row) => sum + row.votes, 0);
    const topRowsBase = rowsBase.slice(0, 50);
    const rows = [];
    for (let i = 0; i < topRowsBase.length; i += 1) {
      const base = topRowsBase[i];
      const identity = await fetchUserIdentity(client, guild, base.userId);
      rows.push({
        rank: i + 1,
        userId: base.userId,
        username: identity.username,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        votes: base.votes,
        topggVotes: base.topggVotes,
        discadiaVotes: base.discadiaVotes,
      });
    }

    let personal = {
      userId: searchUserId,
      votes: 0,
      topggVotes: 0,
      discadiaVotes: 0,
      rank: null,
    };
    if (searchUserId) {
      const idx = rowsBase.findIndex((row) => row.userId === searchUserId);
      if (idx >= 0) {
        personal = {
          userId: searchUserId,
          votes: rowsBase[idx].votes,
          topggVotes: rowsBase[idx].topggVotes,
          discadiaVotes: rowsBase[idx].discadiaVotes,
          rank: idx + 1,
        };
      }
    }

    const payload = {
      ok: true,
      stats: {
        totalVotes,
        totalVoters: rowsBase.length,
        goal: 10000,
      },
      personal,
      rows,
    };
    cacheSet(cacheKey, payload);
    res.setHeader("Cache-Control", "public, max-age=20");
    return res.json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-vote:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

module.exports = { handleSiteVoteGet };
