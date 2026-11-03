const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { userAvatarUrlDynamic, sitePreferredAvatarUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { voteCountMonthKeyRome } = require("../../Community/utils/romeVoteMonthKey") as typeof import("../../Community/utils/romeVoteMonthKey");
const { sendJsonWithEtag, weakEtagFromJson } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

/* voteFastConfirm1: chi ha appena votato deve vedersi subito il voto. Classifica pubblica 20 s,
   dati personali (contatori e "puoi votare") quasi in tempo reale e mai in cache nel browser. */
const CACHE_TTL_MS = 20_000;
const PERSONAL_TTL_MS = 3_000;
const cache = new Map();

function cacheGet(key?) {
  const row = cache.get(key);
  if (row && row.expiresAt > Date.now()) return row.payload;
  return null;
}

function cacheSet(key?, payload?, ttlMs = CACHE_TTL_MS) {
  cache.set(key, { payload, expiresAt: Date.now() + ttlMs });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, row] of cache) if (row.expiresAt <= now) cache.delete(k);
  }
}

/** Dopo un voto: sparisce cache board + personale così /vote/ vede subito i contatori. */
function invalidateSiteVoteCache(guildId?, userId = "") {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").replace(/\D/g, "");
  if (gid) {
    cache.delete(`vote:v3:${gid}:-`);
    if (/^\d{17,20}$/.test(uid)) cache.delete(`vote:v3:${gid}:${uid}`);
  }
  // sicurezza: se guild sconosciuta, pulisci chiavi personali dell’utente
  if (/^\d{17,20}$/.test(uid)) {
    for (const k of cache.keys()) {
      if (k.endsWith(`:${uid}`)) cache.delete(k);
    }
  }
}

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function parseSearchUserId(raw?) {
  const s = String(raw == null ? "" : raw).replace(/\D/g, "");
  return /^\d{17,20}$/.test(s) ? s : "";
}

function nInt(v?) {
  if (v == null || v === "") return 0;
  const x = Number(String(v).trim().replace(/[,\s]/g, ""));
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
}

function voteLeaf(doc?) {
  return doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
}

function combinedVotesFromLeaf(leaf?, now = new Date()) {
  const currentMonthKey = voteCountMonthKeyRome(now);
  const storedMonthKey = String(leaf?.voteCountMonthKey || "").trim();
  const prevMonthKey = String(leaf?.prevVoteCountMonthKey || "").trim();
  let topgg = nInt(leaf?.voteCountTopgg);
  let discadia = nInt(leaf?.voteCountDiscadia);
  const legacy = nInt(leaf?.voteCount);
  if (storedMonthKey && storedMonthKey !== currentMonthKey) {
    if (prevMonthKey === currentMonthKey) {
      topgg = nInt(leaf?.prevVoteCountTopgg);
      discadia = nInt(leaf?.prevVoteCountDiscadia);
    } else {
      return { total: 0, topgg: 0, discadia: 0 };
    }
  }
  if (!storedMonthKey && legacy > 0 && topgg + discadia === 0) {
    discadia = legacy;
  }
  if (topgg > 0 || discadia > 0) {
    return {
      total: topgg + discadia,
      topgg,
      discadia,
    };
  }
  return { total: 0, topgg: 0, discadia: 0 };
}

function voteCooldownMs(client?, platform?) {
  const key = platform === "topgg" ? "topgg" : "discadia";
  if (key === "topgg") {
    const hours = Number(client?.config?.topgg?.voteReminderCooldownHours);
    return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 60 * 60 * 1000;
  }
  const hours = Number(client?.config?.discadiaVoteReminder?.cooldownHours);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

function platformVoteState(client?, leaf?, platform?) {
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

/* voteIdentityFetch1: cache first; if missing, fetch Discord user (top board only).
   After reboot cache is cold → everyone was "Utente". */
async function fetchUserIdentity(client?, guild?, userId?, { allowFetch = false } = {}) {
  const out = {
    userId: String(userId || ""),
    username: "",
    displayName: "",
    avatarUrl: "",
  };
  if (!out.userId) return out;
  let member = guild?.members?.cache?.get?.(out.userId) || null;
  let user = member?.user || null;
  if (!user && client?.users?.cache?.get) {
    user = client.users.cache.get(out.userId) || null;
  }
  if (!user && allowFetch && client?.users?.fetch) {
    try {
      user = await Promise.race([
        client.users.fetch(out.userId),
        new Promise((_?, rej?) => setTimeout(() => rej(new Error("timeout")), 2200)),
      ]);
    } catch (eFetch) {
      user = null;
    }
  }
  if (!member && allowFetch && guild?.members?.fetch && user) {
    try {
      member = await Promise.race([
        guild.members.fetch(out.userId),
        new Promise((_?, rej?) => setTimeout(() => rej(new Error("timeout")), 1800)),
      ]);
    } catch (eMem) {
      member = null;
    }
  }
  out.username = String(user?.username || "").trim();
  out.displayName =
    String(
      member?.displayName || user?.globalName || user?.username || ""
    ).trim() || "Utente";
  out.avatarUrl =
    sitePreferredAvatarUrl(member, { size: 256, preferAnimated: true, allowDefault: false }) ||
    sitePreferredAvatarUrl(user, { size: 256, preferAnimated: true, allowDefault: false }) ||
    (member && (userAvatarUrlDynamic(member, { size: 256, allowDefault: false }) || "")) ||
    userAvatarUrlDynamic(user, { size: 256, allowDefault: false }) ||
    "";
  return out;
}

async function buildVoteBoardPayload(client?, { searchUserId = "" } = {}) {
  const guildId = resolveGuildId(client);
  if (!guildId) {
    const err: any = new Error("no_guild");
    err.code = "no_guild";
    throw err;
  }
  const guild =
    client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    const err: any = new Error("guild_unavailable");
    err.code = "guild_unavailable";
    throw err;
  }

  const docs = await ActivityUserProfile.find({
    guildId,
    $or: [
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCount": { $gt: 0 } },
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountTopgg": { $gt: 0 } },
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountDiscadia": { $gt: 0 } },
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.prevVoteCountTopgg": { $gt: 0 } },
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.prevVoteCountDiscadia": { $gt: 0 } },
    ],
  })
    .select("userId profile.totals.exp.bumpVoteRewards.discadia_vote")
    .lean()
    .catch(() => []);

  const now = new Date();
  const rowsBase = docs
    .map((doc?) => {
      const counts = combinedVotesFromLeaf(voteLeaf(doc), now);
      return {
        userId: String(doc?.userId || ""),
        votes: counts.total,
        topggVotes: counts.topgg,
        discadiaVotes: counts.discadia,
      };
    })
    .filter((row?) => row.userId && row.votes > 0)
    .sort((a?, b?) => b.votes - a.votes || a.userId.localeCompare(b.userId));

  // Do not filter by partial guild.members.cache — incomplete cache hid voters / empty board on phones.
  const activeRowsBase = rowsBase.sort(
    (a?, b?) => b.votes - a.votes || a.userId.localeCompare(b.userId),
  );

  const totalVotes = activeRowsBase.reduce((sum?, row?) => sum + row.votes, 0);
  const topRowsBase = activeRowsBase.slice(0, 50);
  /* voteIdentityFetch1: cache-only for deep ranks; Discord fetch for top 20 missing names. */
  const identities = await Promise.all(
    topRowsBase.map(async (base?, i?) => {
      const cachedOnly = await fetchUserIdentity(client, guild, base.userId, {
        allowFetch: false,
      });
      const needFetch =
        i < 20 &&
        (!cachedOnly.displayName ||
          cachedOnly.displayName === "Utente" ||
          !cachedOnly.username);
      if (!needFetch) return cachedOnly;
      return fetchUserIdentity(client, guild, base.userId, { allowFetch: true });
    }),
  );
  const rows = topRowsBase.map((base?, i?) => {
    const identity = identities[i] || {
      username: "",
      displayName: "Utente",
      avatarUrl: "",
    };
    return {
      rank: i + 1,
      userId: base.userId,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      votes: base.votes,
      topggVotes: base.topggVotes,
      discadiaVotes: base.discadiaVotes,
    };
  });

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
    const idx = activeRowsBase.findIndex((row?) => row.userId === searchUserId);
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
      const c = combinedVotesFromLeaf(personalLeaf, now);
      personal.votes = c.total;
      personal.topggVotes = c.topgg;
      personal.discadiaVotes = c.discadia;
      personal.topgg = platformVoteState(client, personalLeaf, "topgg");
      personal.discadia = platformVoteState(client, personalLeaf, "discadia");
    }
  }

  return {
    ok: true,
    stats: {
      totalVotes,
      totalVoters: activeRowsBase.length,
      goal: 1000,
    },
    personal,
    rows,
  };
}

async function handleSiteVoteGet(client?, req?, res?) {
  try {
    const guildId = resolveGuildId(client);
    if (!guildId) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }

    const q = req.query || {};
    const searchUserId = parseSearchUserId(q.userId ?? q.id ?? q.uid);
    const cacheKey = `vote:v3:${guildId}:${searchUserId || "-"}`;
    const cacheControl = searchUserId ? "private, no-cache" : "public, max-age=10";
    const cached = cacheGet(cacheKey);
    if (cached) {
      /* siteApiW6: ETag/304 on vote poll */
      return sendJsonWithEtag(req, res, cached, {
        cacheControl,
        etag: weakEtagFromJson(cached),
      });
    }

    const payload = await buildVoteBoardPayload(client, { searchUserId });
    cacheSet(cacheKey, payload, searchUserId ? PERSONAL_TTL_MS : CACHE_TTL_MS);
    return sendJsonWithEtag(req, res, payload, {
      cacheControl,
      etag: weakEtagFromJson(payload),
    });
  } catch (err) {
    if (err?.code === "no_guild") {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }
    if (err?.code === "guild_unavailable") {
      return res
        .status(503)
        .json({ ok: false, error: "guild_unavailable", message: "Guild non disponibile." });
    }
    global.logger?.error?.("[WEBHOOK] site-vote:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

/* apiWarmSwr2: board anonima (no userId) — evita cold Discord identity su /vota */
async function warmSiteVoteBoardCache(client?) {
  try {
    const guildId = resolveGuildId(client);
    if (!guildId) return null;
    const cacheKey = `vote:v3:${guildId}:-`;
    const hit = cacheGet(cacheKey);
    if (hit) return hit;
    const payload = await buildVoteBoardPayload(client, { searchUserId: "" });
    cacheSet(cacheKey, payload);
    return payload;
  } catch (err) {
    global.logger?.warn?.("[site-vote] warm:", err?.message || err);
    return null;
  }
}

export = { handleSiteVoteGet, warmSiteVoteBoardCache, invalidateSiteVoteCache };