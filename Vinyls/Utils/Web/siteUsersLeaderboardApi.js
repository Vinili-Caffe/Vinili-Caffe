const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getLevelInfo, getGlobalMultiplier, getGuildExpSettings, getRoleMultiplier } = require("../../Services/Community/expService");
const {
  computeLeaderboardRows,
  getRomeDayKey,
} = require("../../Prefix/Level/classifica");

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

/** Intero non negativo da Mongo (Number, string, Decimal128, ecc.) */
function nInt(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "object" && v !== null && typeof v.toString === "function") {
    const x = Number(String(v.toString()).trim().replace(/[.,\s]/g, ""));
    return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
  }
  const x = Number(String(v).trim().replace(/[.,\s]/g, ""));
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
}

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function parseBoard(raw) {
  const b = String(raw || "level").trim().toLowerCase();
  if (b === "weekly" || b === "messages" || b === "voice") return b;
  return "level";
}

/** Handle account Discord (`User.username`). Non usare `User.displayName` (global name) né `GuildMember.displayName` (include nickname server). */
function accountUsernameFromUser(user) {
  if (!user) return "";
  return String(user.username || "").trim();
}

async function fetchDiscordUserForIdentity(client, guild, userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  let u = await client.users.fetch(id, { force: true }).catch(() => null);
  if (!u && guild?.members?.fetch) {
    const m = await guild.members.fetch({ user: id, force: true }).catch(() => null);
    if (m?.user) u = m.user;
  }
  return u;
}

function boardQuery(board, guildId) {
  const g = { guildId };
  if (board === "level") return { ...g, "profile.totals.exp.totalExp": { $gt: 0 } };
  if (board === "weekly") return { ...g, "profile.totals.exp.weeklyExp": { $gt: 0 } };
  if (board === "messages") return { ...g, "profile.totals.messagesTotal": { $gt: 0 } };
  if (board === "voice") return { ...g, "profile.totals.voiceTotalSeconds": { $gt: 0 } };
  return { ...g, "profile.totals.exp.totalExp": { $gt: 0 } };
}

function boardSort(board) {
  if (board === "level") return { "profile.totals.exp.totalExp": -1 };
  if (board === "weekly") return { "profile.totals.exp.weeklyExp": -1 };
  if (board === "messages") return { "profile.totals.messagesTotal": -1 };
  if (board === "voice") return { "profile.totals.voiceTotalSeconds": -1 };
  return { "profile.totals.exp.totalExp": -1 };
}

function boardSelect() {
  return "userId profile.totals";
}

function numericSortExpr(board) {
  const sanitizeToLong = (fieldPath) => ({
    $convert: {
      input: {
        $replaceAll: {
          input: {
            $replaceAll: {
              input: {
                $replaceAll: {
                  input: { $toString: fieldPath },
                  find: ".",
                  replacement: "",
                },
              },
              find: ",",
              replacement: "",
            },
          },
          find: " ",
          replacement: "",
        },
      },
      to: "long",
      onError: 0,
      onNull: 0,
    },
  });
  if (board === "messages") {
    return sanitizeToLong("$profile.totals.messagesTotal");
  }
  if (board === "voice") {
    return sanitizeToLong("$profile.totals.voiceTotalSeconds");
  }
  return null;
}

async function fetchUserIdentity(client, guild, userId) {
  const out = {
    displayName: "",
    username: "",
    avatar: "",
    avatarUrl: "",
    discriminator: "0",
  };
  if (!userId) return out;
  const u = await fetchDiscordUserForIdentity(client, guild, userId);
  if (!u) return out;
  out.username = accountUsernameFromUser(u);
  out.displayName = out.username;
  out.avatar = u.avatar ? String(u.avatar) : "";
  out.discriminator = String(u.discriminator || "0");
  if (typeof u.displayAvatarURL === "function") {
    out.avatarUrl = u.displayAvatarURL({ size: 256, dynamic: true });
  } else {
    out.avatarUrl = "";
  }
  if (!out.avatarUrl && u.id) {
    const h = u.avatar;
    if (h) {
      const ext = String(h).indexOf("a_") === 0 ? "gif" : "png";
      out.avatarUrl = `https://cdn.discordapp.com/avatars/${u.id}/${h}.${ext}?size=256`;
    } else {
      let idx = 0;
      if (/^\d{5,22}$/.test(String(u.id)))
        try {
          idx = Number((BigInt(u.id) >> 22n) % 6n);
        } catch {
          idx = 0;
        }
      out.avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    }
  }
  return out;
}

function pctBar(value, pageMax) {
  const v = Math.max(0, Number(value) || 0);
  const m = Math.max(1, Number(pageMax) || 1);
  return Math.max(0, Math.min(100, Math.round((v / m) * 100)));
}

function firstQueryString(val) {
  if (val == null) return "";
  if (Array.isArray(val)) return String(val[0] ?? "").trim();
  return String(val).trim();
}

function parseSearchUserId(raw) {
  const s = firstQueryString(raw).replace(/\D/g, "");
  if (!/^\d{17,20}$/.test(s)) return "";
  return s;
}

/** Solo sito: messaggi/ore del giorno solare Europa/Roma (00:00–24:00) dai bucket `daily` (lettura), non modifica il bot. */
function siteRomeDayOverridesFromDoc(doc, board, romeDateKey) {
  if (!doc || (board !== "messages" && board !== "voice")) return {};
  const dayRow = doc?.profile?.totals?.daily?.[String(romeDateKey || "")] || {};
  const dayText = nInt(dayRow?.textCount);
  const dayVoice = nInt(dayRow?.voiceSeconds);
  if (board === "messages") {
    return { messagesDaily: dayText };
  }
  return { voiceDailySeconds: dayVoice };
}

function sortHourlyBreakdownForBoard(breakdown, board) {
  const base = Array.isArray(breakdown) ? breakdown : [];
  if (board === "weekly") return base.slice();
  if (board === "messages") {
    return base.filter((r) => nInt(r?.textCount) > 0).sort((a, b) => nInt(b.textCount) - nInt(a.textCount));
  }
  if (board === "voice") {
    return base.filter((r) => nInt(r?.voiceSeconds) > 0).sort((a, b) => nInt(b.voiceSeconds) - nInt(a.voiceSeconds));
  }
  return base.slice();
}

const SEARCH_SELECT =
  "userId profile.totals.exp profile.totals.messagesTotal profile.totals.messagesWeekly profile.totals.messagesDaily profile.totals.voiceTotalSeconds profile.totals.voiceWeeklySeconds profile.totals.voiceDailySeconds";

function combineWeeklyMultiplier(globalExpMultiplier, roleMultiplier) {
  const globalMulti = Number(globalExpMultiplier);
  const roleMulti = Number(roleMultiplier);
  const safeGlobal = Number.isFinite(globalMulti) && globalMulti > 0 ? globalMulti : 1;
  const safeRole = Number.isFinite(roleMulti) && roleMulti > 0 ? roleMulti : 1;
  const roleBonus = Math.max(0, safeRole - 1);
  return Math.min(8, Math.max(1, safeGlobal + roleBonus));
}

async function resolveWeeklyMultiplierForUser(guild, userId, settings, fallbackGlobalExpMultiplier) {
  if (!guild || !userId) return combineWeeklyMultiplier(fallbackGlobalExpMultiplier, 1);
  let member = guild.members?.cache?.get?.(String(userId)) || null;
  if (!member && guild.members?.fetch) {
    member = await guild.members.fetch({ user: String(userId), force: true }).catch(() => null);
  }
  if (!member) return combineWeeklyMultiplier(fallbackGlobalExpMultiplier, 1);
  const roleMultiplier = getRoleMultiplier(member, settings);
  return combineWeeklyMultiplier(fallbackGlobalExpMultiplier, roleMultiplier);
}

async function buildRowFromDoc(client, guild, board, d, rank, pageMaxSecondary, globalExpMultiplier, overrides, weeklyEffectiveMultiplier) {
  const ov = overrides && typeof overrides === "object" ? overrides : null;
  const userId = String(d.userId || "");
  const id = await fetchUserIdentity(client, guild, userId);
  if (board === "level") {
    const totalExp = nInt(d.profile?.totals?.exp?.totalExp);
    const li = getLevelInfo(totalExp);
    let level = Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.level || 0)));
    if (level < li.level) level = li.level;
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      avatarUrl: id.avatarUrl,
      level,
      exp: totalExp,
      progressPercent: Math.max(0, Math.min(100, Math.round(Number(li.progressPercent || 0)))),
    };
  }
  if (board === "weekly") {
    const weeklyExp = ov && ov.weeklyExp != null ? nInt(ov.weeklyExp) : nInt(d.profile?.totals?.exp?.weeklyExp);
    const totalExp = nInt(d.profile?.totals?.exp?.totalExp);
    const li = getLevelInfo(totalExp);
    let level = Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.level || 0)));
    if (level < li.level) level = li.level;
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      avatarUrl: id.avatarUrl,
      level,
      exp: totalExp,
      weeklyExp,
      weeklyBarPct: pctBar(weeklyExp, pageMaxSecondary),
      progressPercent: Math.max(0, Math.min(100, Math.round(Number(li.progressPercent || 0)))),
      expMultiplier:
        weeklyEffectiveMultiplier != null
          ? Number(weeklyEffectiveMultiplier)
          : Number(globalExpMultiplier),
    };
  }
  if (board === "messages") {
    const messagesTotal =
      ov && ov.messagesTotal != null ? nInt(ov.messagesTotal) : nInt(d.profile?.totals?.messagesTotal);
    const messagesWeekly =
      ov && ov.messagesWeekly != null ? nInt(ov.messagesWeekly) : nInt(d.profile?.totals?.messagesWeekly);
    const messagesDaily =
      ov && ov.messagesDaily != null ? nInt(ov.messagesDaily) : nInt(d.profile?.totals?.messagesDaily);
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      avatarUrl: id.avatarUrl,
      messagesTotal,
      messagesWeekly,
      messagesDaily,
      messagesWeeklyBarPct: pctBar(messagesTotal, pageMaxSecondary),
    };
  }
  if (board === "voice") {
    const voiceTotalSeconds =
      ov && ov.voiceTotalSeconds != null ? nInt(ov.voiceTotalSeconds) : nInt(d.profile?.totals?.voiceTotalSeconds);
    const voiceWeeklySeconds =
      ov && ov.voiceWeeklySeconds != null
        ? nInt(ov.voiceWeeklySeconds)
        : nInt(d.profile?.totals?.voiceWeeklySeconds);
    const voiceDailySeconds =
      ov && ov.voiceDailySeconds != null ? nInt(ov.voiceDailySeconds) : nInt(d.profile?.totals?.voiceDailySeconds);
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      avatarUrl: id.avatarUrl,
      voiceTotalSeconds,
      voiceWeeklySeconds,
      voiceDailySeconds,
      voiceWeeklyBarPct: pctBar(voiceTotalSeconds, pageMaxSecondary),
    };
  }
  return { rank, userId, username: id.username, displayName: id.displayName };
}

function buildSearchStats(guild, board, d, topAccountUsername, globalExpMult, hourlySingular, activityOverride) {
  const ao = activityOverride && typeof activityOverride === "object" ? activityOverride : null;
  let topLevel = 0;
  let topWeeklyExp = 0;
  let topMessagesTotal = 0;
  let topVoiceSeconds = 0;
  if (board === "level") {
    const te = Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.totalExp || 0)));
    const li = getLevelInfo(te);
    topLevel = Math.max(Math.floor(Number(d.profile?.totals?.exp?.level || 0)), li.level);
  } else if (board === "weekly") {
    topWeeklyExp =
      hourlySingular && hourlySingular.weeklyExp != null
        ? nInt(hourlySingular.weeklyExp)
        : Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.weeklyExp || 0)));
  } else if (board === "messages") {
    topMessagesTotal =
      ao && ao.messagesTotal != null
        ? nInt(ao.messagesTotal)
        : Math.max(0, Math.floor(Number(d.profile?.totals?.messagesTotal || 0)));
  } else if (board === "voice") {
    topVoiceSeconds =
      ao && ao.voiceSeconds != null
        ? nInt(ao.voiceSeconds)
        : Math.max(0, Math.floor(Number(d.profile?.totals?.voiceTotalSeconds || 0)));
  }
  const gm =
    board === "weekly" && globalExpMult != null && Number.isFinite(Number(globalExpMult)) && Number(globalExpMult) > 0
      ? Number(globalExpMult)
      : null;
  return {
    rankedUsers: 1,
    membersApprox: guild?.memberCount ?? null,
    topDisplayName: String(topAccountUsername || "").trim() || "—",
    topPlayerUsername: String(topAccountUsername || "").trim() || "—",
    topLevel: board === "level" ? topLevel : null,
    topWeeklyExp: board === "weekly" ? topWeeklyExp : null,
    topMessagesTotal: board === "messages" ? topMessagesTotal : null,
    topVoiceSeconds: board === "voice" ? topVoiceSeconds : null,
    globalExpMultiplier: gm,
  };
}

/**
 * GET JSON classifica utenti.
 * Query: board=level|weekly|messages|voice, page, perPage, userId (ricerca singolo profilo).
 */
async function handleSiteUsersLeaderboardGet(client, req, res) {
  try {
    const guildId = resolveGuildId(client);
    if (!guildId) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }
    const q = req.query || {};
    const board = parseBoard(q.board);
    const searchId = parseSearchUserId(q.userId ?? q.user_id ?? q.id ?? q.searchUserId ?? q.uid);

    if (searchId) {
      const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      const doc = await ActivityUserProfile.findOne({ guildId, userId: searchId }).select(SEARCH_SELECT).lean().catch(() => null);
      if (!doc) {
        res.setHeader("Cache-Control", "no-store");
        return res.json({
          ok: true,
          search: true,
          notFound: true,
          board,
          page: 1,
          perPage: 1,
          total: 0,
          totalPages: 1,
          stats: {
            rankedUsers: 0,
            membersApprox: guild?.memberCount ?? null,
            topDisplayName: "",
            topPlayerUsername: "",
            topLevel: null,
            topWeeklyExp: null,
            topMessagesTotal: null,
            topVoiceSeconds: null,
            globalExpMultiplier: null,
          },
          rows: [],
        });
      }
      let pageMaxSecondary = 1;
      let hourlySingular = null;
      let searchRank = 1;
      const useHourlyBoard = Boolean(guild) && board === "weekly";
      if (useHourlyBoard) {
        const cap = 8000;
        const breakdown = await computeLeaderboardRows(guild, "weekly", cap).catch(() => []);
        const sorted = sortHourlyBreakdownForBoard(breakdown, "weekly");
        const idx = sorted.findIndex((r) => String(r.userId) === searchId);
        const agg = idx >= 0 ? sorted[idx] : null;
        searchRank = idx >= 0 ? idx + 1 : 0;
        pageMaxSecondary = Math.max(1, nInt(agg?.exp ?? 0));
        hourlySingular = { weeklyExp: nInt(agg?.exp ?? 0) };
      } else if (board === "weekly") {
        const we = nInt(doc.profile?.totals?.exp?.weeklyExp);
        pageMaxSecondary = Math.max(1, we);
        const higher = await ActivityUserProfile.countDocuments({
          guildId,
          "profile.totals.exp.weeklyExp": { $gt: we },
        }).catch(() => 0);
        searchRank = higher + 1;
      } else if (board === "messages") {
        const mt = nInt(doc.profile?.totals?.messagesTotal);
        pageMaxSecondary = Math.max(1, mt);
        const higherAgg = await ActivityUserProfile.aggregate([
          { $match: { guildId } },
          { $addFields: { __sortVal: numericSortExpr("messages") } },
          { $match: { __sortVal: { $gt: mt } } },
          { $count: "n" },
        ]).catch(() => []);
        const higher = nInt(higherAgg?.[0]?.n);
        searchRank = higher + 1;
      } else if (board === "voice") {
        const vs = nInt(doc.profile?.totals?.voiceTotalSeconds);
        pageMaxSecondary = Math.max(1, vs);
        const higherAgg = await ActivityUserProfile.aggregate([
          { $match: { guildId } },
          { $addFields: { __sortVal: numericSortExpr("voice") } },
          { $match: { __sortVal: { $gt: vs } } },
          { $count: "n" },
        ]).catch(() => []);
        const higher = nInt(higherAgg?.[0]?.n);
        searchRank = higher + 1;
      } else if (board === "level") {
        const te = nInt(doc.profile?.totals?.exp?.totalExp);
        const higher = await ActivityUserProfile.countDocuments({
          guildId,
          "profile.totals.exp.totalExp": { $gt: te },
        }).catch(() => 0);
        searchRank = higher + 1;
      }
      let globalExpMultiplier = 1;
      let guildExpSettings = null;
      if (board === "weekly") {
        globalExpMultiplier = Number(await getGlobalMultiplier(guildId).catch(() => 1));
        if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;
        guildExpSettings = await getGuildExpSettings(guildId).catch(() => null);
      }
      let overrides =
        useHourlyBoard && hourlySingular && board === "weekly"
          ? { weeklyExp: hourlySingular.weeklyExp }
          : null;
      let dayOvr = {};
      if (guild && (board === "messages" || board === "voice")) {
        const rk = getRomeDayKey(new Date());
        dayOvr = siteRomeDayOverridesFromDoc(doc, board, rk);
      }
      overrides = { ...(overrides || {}), ...dayOvr };
      const weeklyEffectiveMultiplier =
        board === "weekly"
          ? await resolveWeeklyMultiplierForUser(guild, searchId, guildExpSettings, globalExpMultiplier)
          : null;
      const row = await buildRowFromDoc(client, guild, board, doc, searchRank, pageMaxSecondary, globalExpMultiplier, overrides, weeklyEffectiveMultiplier);
      const stats = buildSearchStats(guild, board, doc, row.username, globalExpMultiplier, hourlySingular, null);
      if (guild && (board === "messages" || board === "voice")) {
        stats.siteRomeCalendarDay = getRomeDayKey(new Date());
      }
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        ok: true,
        search: true,
        notFound: false,
        board,
        page: 1,
        perPage: 1,
        total: 1,
        totalPages: 1,
        stats,
        rows: [row],
      });
    }

    const page = parseIntSafe(q.page, 1, 100000, 1);
    const perPage = parseIntSafe(q.perPage, 1, 24, 12);
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    const hourlyBoard = Boolean(guild) && board === "weekly";
    const romeDayKey = board === "messages" || board === "voice" ? getRomeDayKey(new Date()) : "";
    const cacheKey = hourlyBoard
      ? `v4:${guildId}:${board}:hourly:p${page}:n${perPage}`
      : `v3:${guildId}:${board}:p${page}:n${perPage}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=15");
      return res.json(cached);
    }

    const skip = (page - 1) * perPage;

    if (hourlyBoard) {
      const cap = Math.min(8000, Math.max(1200, page * perPage + 800));
      const breakdown = await computeLeaderboardRows(guild, "weekly", cap).catch(() => []);
      const sorted = sortHourlyBreakdownForBoard(breakdown, "weekly");
      const total = sorted.length;
      const slice = sorted.slice(skip, skip + perPage);
      let pageMaxSecondary = 1;
      for (const agg of slice) {
        pageMaxSecondary = Math.max(pageMaxSecondary, nInt(agg.exp));
      }
      if (pageMaxSecondary < 1) pageMaxSecondary = 1;
      let globalExpMultiplier = 1;
      let guildExpSettings = null;
      globalExpMultiplier = Number(await getGlobalMultiplier(guildId).catch(() => 1));
      if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;
      guildExpSettings = await getGuildExpSettings(guildId).catch(() => null);
      const userIds = slice.map((r) => String(r.userId || "")).filter(Boolean);
      const profileDocs = userIds.length
        ? await ActivityUserProfile.find({ guildId, userId: { $in: userIds } })
            .select(SEARCH_SELECT)
            .lean()
            .catch(() => [])
        : [];
      const docMap = new Map(profileDocs.map((d) => [String(d.userId), d]));
      const rows = [];
      for (let i = 0; i < slice.length; i += 1) {
        const agg = slice[i];
        const d = docMap.get(String(agg.userId));
        if (!d) continue;
        const rank = skip + i + 1;
        const overrides = { weeklyExp: nInt(agg.exp) };
        const weeklyEffectiveMultiplier = await resolveWeeklyMultiplierForUser(
          guild,
          String(d.userId || ""),
          guildExpSettings,
          globalExpMultiplier,
        );
        rows.push(
          await buildRowFromDoc(client, guild, board, d, rank, pageMaxSecondary, globalExpMultiplier, overrides, weeklyEffectiveMultiplier),
        );
      }
      const first = sorted[0];
      let topDisplayName = "";
      let topWeeklyExp = 0;
      if (first) {
        const uid = String(first.userId || "");
        if (uid) {
          const u = await fetchDiscordUserForIdentity(client, guild, uid);
          if (u) topDisplayName = accountUsernameFromUser(u);
        }
        topWeeklyExp = nInt(first.exp);
      }
      if (!String(topDisplayName || "").trim() && rows.length && skip === 0) {
        const fb = String(rows[0].username || "").trim();
        if (fb) topDisplayName = fb;
      }
      const stats = {
        rankedUsers: total,
        membersApprox: guild?.memberCount ?? null,
        topDisplayName,
        topPlayerUsername: topDisplayName,
        topLevel: null,
        topWeeklyExp,
        topMessagesTotal: null,
        topVoiceSeconds: null,
        globalExpMultiplier,
      };
      const payload = {
        ok: true,
        board,
        page,
        perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
        stats,
        rows,
      };
      cacheSet(cacheKey, payload);
      res.setHeader("Cache-Control", "public, max-age=20");
      return res.json(payload);
    }

    const filter = boardQuery(board, guildId);
    const sort = boardSort(board);
    const select = boardSelect();

    let total = 0;
    let docs = [];
    let topDoc = null;
    if (board === "messages" || board === "voice") {
      const sortExpr = numericSortExpr(board);
      const agg = await ActivityUserProfile.aggregate([
        { $match: { guildId } },
        { $addFields: { __sortVal: sortExpr } },
        { $match: { __sortVal: { $gt: 0 } } },
        { $sort: { __sortVal: -1 } },
        {
          $facet: {
            total: [{ $count: "n" }],
            docs: [
              { $skip: skip },
              { $limit: perPage },
              { $project: { userId: 1, profile: 1, __sortVal: 1 } },
            ],
            top: [{ $limit: 1 }, { $project: { userId: 1, profile: 1, __sortVal: 1 } }],
          },
        },
      ]).catch(() => []);
      const row = Array.isArray(agg) && agg.length ? agg[0] : {};
      total = nInt(row?.total?.[0]?.n);
      docs = Array.isArray(row?.docs) ? row.docs : [];
      topDoc = Array.isArray(row?.top) && row.top.length ? row.top[0] : null;
    } else {
      [total, docs, topDoc] = await Promise.all([
        ActivityUserProfile.countDocuments(filter).catch(() => 0),
        ActivityUserProfile.find(filter)
          .select(select)
          .sort(sort)
          .skip(skip)
          .limit(perPage)
          .lean()
          .catch(() => []),
        ActivityUserProfile.findOne(filter).select(select).sort(sort).lean().catch(() => null),
      ]);
    }

    let topDisplayName = "";
    let topLevel = 0;
    let topWeeklyExp = 0;
    let topMessagesTotal = 0;
    let topVoiceSeconds = 0;

    if (topDoc) {
      const uid = String(topDoc.userId || "");
      if (uid) {
        const u = await fetchDiscordUserForIdentity(client, guild, uid);
        if (u) topDisplayName = accountUsernameFromUser(u);
      }
      if (board === "level") {
        const te = nInt(topDoc.profile?.totals?.exp?.totalExp);
        const li = getLevelInfo(te);
        topLevel = Math.max(nInt(topDoc.profile?.totals?.exp?.level), li.level);
      } else if (board === "weekly") {
        topWeeklyExp = nInt(topDoc.profile?.totals?.exp?.weeklyExp);
      } else if (board === "messages") {
        topMessagesTotal = nInt(topDoc.__sortVal ?? topDoc.profile?.totals?.messagesTotal);
      } else if (board === "voice") {
        topVoiceSeconds = nInt(topDoc.__sortVal ?? topDoc.profile?.totals?.voiceTotalSeconds);
      }
    }

    let pageMaxSecondary = 1;
    if (board === "weekly") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(pageMaxSecondary, nInt(d.profile?.totals?.exp?.weeklyExp));
      }
    } else if (board === "messages") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(pageMaxSecondary, nInt(d.profile?.totals?.messagesTotal));
      }
    } else if (board === "voice") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(pageMaxSecondary, nInt(d.profile?.totals?.voiceTotalSeconds));
      }
    }

    let globalExpMultiplier = 1;
    let guildExpSettings = null;
    if (board === "weekly") {
      globalExpMultiplier = Number(await getGlobalMultiplier(guildId).catch(() => 1));
      if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;
      guildExpSettings = await getGuildExpSettings(guildId).catch(() => null);
    }
    const rows = await Promise.all(
      docs.map(async (d, i) => {
        const dayOvr = siteRomeDayOverridesFromDoc(d, board, romeDayKey);
        const totalOvr =
          board === "messages"
            ? { messagesTotal: nInt(d.__sortVal ?? d.profile?.totals?.messagesTotal) }
            : board === "voice"
              ? { voiceTotalSeconds: nInt(d.__sortVal ?? d.profile?.totals?.voiceTotalSeconds) }
              : {};
        const weeklyEffectiveMultiplier =
          board === "weekly"
            ? await resolveWeeklyMultiplierForUser(
                guild,
                String(d.userId || ""),
                guildExpSettings,
                globalExpMultiplier,
              )
            : null;
        return buildRowFromDoc(
          client,
          guild,
          board,
          d,
          skip + i + 1,
          pageMaxSecondary,
          globalExpMultiplier,
          { ...totalOvr, ...dayOvr },
          weeklyEffectiveMultiplier,
        );
      }),
    );

    if (!String(topDisplayName || "").trim() && rows.length && skip === 0) {
      const fb = String(rows[0].username || "").trim();
      if (fb) topDisplayName = fb;
    }

    const stats = {
      rankedUsers: total,
      membersApprox: guild?.memberCount ?? null,
      topDisplayName,
      topPlayerUsername: topDisplayName,
      topLevel: board === "level" ? topLevel : null,
      topWeeklyExp: board === "weekly" ? topWeeklyExp : null,
      topMessagesTotal: board === "messages" ? topMessagesTotal : null,
      topVoiceSeconds: board === "voice" ? topVoiceSeconds : null,
      globalExpMultiplier: board === "weekly" ? globalExpMultiplier : null,
      siteRomeCalendarDay: board === "messages" || board === "voice" ? romeDayKey : null,
    };

    const payload = {
      ok: true,
      board,
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      stats,
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
