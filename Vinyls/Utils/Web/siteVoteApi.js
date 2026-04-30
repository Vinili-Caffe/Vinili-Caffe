const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { voteCountMonthKeyRome, romeMonthStartMs } = require("../romeVoteMonthKey");

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

function combinedVotesFromLeaf(leaf, now = new Date()) {
  const currentMonthKey = voteCountMonthKeyRome(now);
  const storedMonthKey = String(leaf?.voteCountMonthKey || "").trim();
  const monthChanged = Boolean(storedMonthKey) && storedMonthKey !== currentMonthKey;
  if (monthChanged) {
    return { total: 0, topgg: 0, discadia: 0 };
  }
  if (!storedMonthKey) {
    return { total: 0, topgg: 0, discadia: 0 };
  }
  const topgg = nInt(leaf?.voteCountTopgg);
  const discadia = nInt(leaf?.voteCountDiscadia);
  if (topgg > 0 || discadia > 0) {
    return {
      total: topgg + discadia,
      topgg,
      discadia,
    };
  }
  return { total: 0, topgg: 0, discadia: 0 };
}

function voteCooldownMs(client, platform) {
  const key = platform === "topgg" ? "topgg" : "discadia";
  if (key === "topgg") {
    const hours = Number(client?.config?.topgg?.voteReminderCooldownHours);
    return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 60 * 60 * 1000;
  }
  const hours = Number(client?.config?.discadiaVoteReminder?.cooldownHours);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

function platformVoteState(client, leaf, platform) {
  const key = platform === "topgg" ? "topgg" : "discadia";
  const lastRaw =
    key === "topgg"
      ? leaf?.lastVoteAtTopgg || (leaf?.lastVoteListing === "topgg" ? leaf?.lastVoteAt : null)
      : leaf?.lastVoteAtDiscadia || (leaf?.lastVoteListing === "discadia" ? leaf?.lastVoteAt : null);
  const lastAt = lastRaw ? new Date(lastRaw) : null;
  const lastMs = lastAt && Number.isFinite(lastAt.getTime()) ? lastAt.getTime() : 0;
  const cooldown = voteCooldownMs(client, key);
  const nextMs = lastMs ? lastMs + cooldown : 0;
  return {
    lastVoteAt: lastMs ? lastAt.toISOString() : null,
    nextVoteAt: nextMs ? new Date(nextMs).toISOString() : null,
    canVote: !nextMs || Date.now() >= nextMs,
    cooldownHours: Math.round(cooldown / (60 * 60 * 1000)),
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
  out.displayName = String(user?.username || "Utente").trim() || "Utente";
  out.avatarUrl = userAvatarUrlDynamic(user, { size: 256 }) || "";
  return out;
}

async function isCurrentGuildMember(guild, userId) {
  const id = String(userId || "").trim();
  if (!id || !guild) return false;
  const cached = guild.members?.cache?.get?.(id) || null;
  if (cached) return true;
  if (!guild.members?.fetch) return false;
  const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
  return Boolean(member);
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
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Guild non disponibile." });
    }

    const docs = await ActivityUserProfile.find({
      guildId,
      $or: [
        { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountTopgg": { $gt: 0 } },
        { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountDiscadia": { $gt: 0 } },
      ],
    })
      .select(
        "userId profile.totals.exp.bumpVoteRewards.discadia_vote",
      )
      .lean()
      .catch(() => []);

    const now = new Date();
    const voteCd = { topggCdMs: voteCooldownMs(client, "topgg"), discadiaCdMs: voteCooldownMs(client, "discadia") };
    const rowsBase = docs
      .map((doc) => {
        const counts = combinedVotesFromLeaf(voteLeaf(doc), now, voteCd);
        return {
          userId: String(doc?.userId || ""),
          votes: counts.total,
          topggVotes: counts.topgg,
          discadiaVotes: counts.discadia,
        };
      })
      .filter((row) => row.userId && row.votes > 0)
      .sort((a, b) => b.votes - a.votes || a.userId.localeCompare(b.userId));

    const activeMembership = await Promise.all(
      rowsBase.map(async (row) => ({
        row,
        isMember: await isCurrentGuildMember(guild, row.userId),
      })),
    );
    const activeRowsBase = activeMembership
      .filter((entry) => entry.isMember)
      .map((entry) => entry.row)
      .sort((a, b) => b.votes - a.votes || a.userId.localeCompare(b.userId));

    const totalVotes = activeRowsBase.reduce((sum, row) => sum + row.votes, 0);
    const topRowsBase = activeRowsBase.slice(0, 50);
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
      topgg: platformVoteState(client, {}, "topgg"),
      discadia: platformVoteState(client, {}, "discadia"),
    };
    if (searchUserId) {
      const idx = activeRowsBase.findIndex((row) => row.userId === searchUserId);
      const personalDoc = await ActivityUserProfile.findOne({ guildId, userId: searchUserId })
        .select("profile.totals.exp.bumpVoteRewards.discadia_vote")
        .lean()
        .catch(() => null);
      const personalLeaf = voteLeaf(personalDoc);
      if (idx >= 0) {
        personal = {
          userId: searchUserId,
          votes: activeRowsBase[idx].votes,
          topggVotes: activeRowsBase[idx].topggVotes,
          discadiaVotes: activeRowsBase[idx].discadiaVotes,
          rank: idx + 1,
          topgg: platformVoteState(client, personalLeaf, "topgg"),
          discadia: platformVoteState(client, personalLeaf, "discadia"),
        };
      } else {
        const c = combinedVotesFromLeaf(personalLeaf, now, voteCd);
        personal.votes = c.total;
        personal.topggVotes = c.topgg;
        personal.discadiaVotes = c.discadia;
        personal.topgg = platformVoteState(client, personalLeaf, "topgg");
        personal.discadia = platformVoteState(client, personalLeaf, "discadia");
      }
    }

    const payload = {
      ok: true,
      stats: {
        totalVotes,
        totalVoters: activeRowsBase.length,
        goal: 1000,
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