const IDs = require("../Config/ids");
const { ActivityUserProfile, CustomRole } = require("../../Schemas/Community/communitySchemas");
const { getLevelInfo, getGlobalMultiplier, getGuildExpSettings, getRoleMultiplier, getResolvedWeeklyExpMultiplier } = require("../../Services/Community/expService");
const {
  computeLeaderboardRows,
  getRomeDayKey,
} = require("../../Prefix/Level/classifica");
const { findCustomVoiceByRole } = require("../Interaction/customRoleUtils");
const { getRankCardThemeFromDoc, resolveRankCardWallpaper } = require("../Render/rankCardTheme");

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

async function buildCustomProfileData(guild, userId) {
  if (!guild || !userId) return null;
  const doc = await CustomRole.findOne({ guildId: guild.id, userId: String(userId) }).lean().catch(() => null);
  if (!doc || (!doc.roleId && !doc.customVocChannelId)) return null;

  const role =
    doc.roleId
      ? guild.roles.cache.get(String(doc.roleId)) || (await guild.roles.fetch(String(doc.roleId)).catch(() => null))
      : null;
  const channelId = String(doc.customVocChannelId || "").trim();
  const voice =
    channelId
      ? guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null))
      : role
        ? findCustomVoiceByRole(guild, role.id)
        : null;

  let roleMembers = role?.members ? Array.from(role.members.values()).filter((m) => !m.user?.bot) : [];
  if (role && roleMembers.length === 0) {
    await guild.members.fetch().catch(() => null);
    roleMembers = role.members ? Array.from(role.members.values()).filter((m) => !m.user?.bot) : [];
  }
  const roleMemberCount = roleMembers.length;
  const roleSharedMembers = roleMembers
    .sort((a, b) =>
      String(a.displayName || a.user?.username || "").localeCompare(String(b.displayName || b.user?.username || ""), "it"),
    )
    .slice(0, 60)
    .map((member) => ({
      id: String(member.id || member.user?.id || ""),
      username: String(member.user?.username || "").trim(),
      displayName: String(member.displayName || member.user?.username || "Utente").trim(),
      avatarUrl:
        member.displayAvatarURL?.({ extension: "png", size: 128 }) ||
        member.user?.displayAvatarURL?.({ extension: "png", size: 128 }) ||
        "",
    }))
    .filter((member) => member.id);
  let voiceSharedCount = 0;
  if (voice?.permissionOverwrites?.cache) {
    voice.permissionOverwrites.cache.forEach((overwrite) => {
      if (String(overwrite.id || "") === String(guild.id || "")) return;
      if (overwrite.type !== 1 && overwrite.type !== 0) return;
      if (!overwrite.allow?.has?.("ViewChannel")) return;
      voiceSharedCount += 1;
    });
  }

  return {
    expiresAt: doc?.expiresAt ? new Date(doc.expiresAt).toISOString() : "",
    role: role
      ? {
          id: String(role.id),
          name: String(role.name || "Ruolo personalizzato"),
          color:
            String(role.hexColor || "").trim() && String(role.hexColor || "").trim() !== "#000000"
              ? String(role.hexColor || "").trim()
              : "",
          emoji: String(role.unicodeEmoji || "").trim(),
          iconUrl: typeof role.iconURL === "function" ? String(role.iconURL({ extension: "png", size: 128 }) || "") : "",
          createdAt: role.createdAt ? new Date(role.createdAt).toISOString() : "",
          memberCount: roleMemberCount,
          sharedMembers: roleSharedMembers,
        }
      : null,
    voice: voice
      ? {
          id: String(voice.id || ""),
          name: String(voice.name || "Canale vocale privato"),
          emoji: String(doc?.customVocEmoji || "").trim(),
          createdAt: voice.createdAt ? new Date(voice.createdAt).toISOString() : "",
          memberCount: voiceSharedCount,
        }
      : null,
  };
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
  const totals = doc?.profile?.totals || {};
  const dateKey = String(romeDateKey || "").trim();
  const dailyMap = totals?.daily && typeof totals.daily === "object" ? totals.daily : {};
  const hasDayRow = Object.prototype.hasOwnProperty.call(dailyMap, dateKey);
  const dayRow = hasDayRow ? dailyMap[dateKey] || {} : {};
  const dayText = nInt(dayRow?.textCount);
  const dayVoice = nInt(dayRow?.voiceSeconds);
  const fallbackMessagesDaily =
    String(totals?.messagesDailyKey || "").trim() === dateKey ? nInt(totals?.messagesDaily) : 0;
  const fallbackVoiceDaily =
    String(totals?.voiceDailyKey || "").trim() === dateKey ? nInt(totals?.voiceDailySeconds) : 0;
  let liveVoiceSeconds = 0;
  const startedAt = totals?.sessionStartedAt ? new Date(totals.sessionStartedAt).getTime() : NaN;
  if (Number.isFinite(startedAt)) {
    liveVoiceSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }
  if (board === "messages") {
    return { messagesDaily: Math.max(hasDayRow ? dayText : 0, fallbackMessagesDaily) };
  }
  return {
    voiceDailySeconds: Math.max(hasDayRow ? dayVoice : 0, fallbackVoiceDaily) + liveVoiceSeconds,
  };
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
  "userId profile.totals.exp profile.totals.daily profile.totals.messagesTotal profile.totals.messagesWeekly profile.totals.messagesDaily profile.totals.messagesDailyKey profile.totals.voiceTotalSeconds profile.totals.voiceWeeklySeconds profile.totals.voiceDailySeconds profile.totals.voiceDailyKey profile.totals.sessionStartedAt";

function buildWeeklyMultiplierSources(member, settings, fallbackGlobalExpMultiplier) {
  const sources = [];
  const baseMultiplier = 1;
  const globalBase = Number(settings?.baseMultiplier);
  const globalEvent = Number(settings?.eventMultiplier);
  const effectiveGlobal =
    Number.isFinite(globalBase) && globalBase > 0
      ? globalBase * (Number.isFinite(globalEvent) && globalEvent > 0 ? globalEvent : 1)
      : Number(fallbackGlobalExpMultiplier) > 0
        ? Number(fallbackGlobalExpMultiplier)
        : 1;
  const map = settings?.roleMultipliersMerged instanceof Map ? settings.roleMultipliersMerged : new Map();
  const veteranoRoleId = String(IDs.roles?.Veterano || "").trim();
  let chosenRole = null;
  let chosenRoleMultiplier = 1;
  let chosenRoleSpecific = false;

  sources.push({
    key: "base",
    label: "Base",
    type: "base",
    multiplier: 1,
    contribution: 1,
  });

  if (effectiveGlobal > 1) {
    sources.push({
      key: "server",
      label:
        Number.isFinite(globalEvent) && globalEvent > 1
          ? "Server + evento"
          : "Server",
      type: "global",
      multiplier: Number(effectiveGlobal.toFixed(2)),
      contribution: Number((effectiveGlobal - 1).toFixed(2)),
    });
  }

  if (member?.roles?.cache && map.size) {
    for (const [roleId, value] of map.entries()) {
      if (!member.roles.cache.has(roleId)) continue;
      const parsed = Math.max(1, Number(value) || 1);
      const roleObj = member.roles.cache.get(roleId);
      if (veteranoRoleId && String(roleId) === veteranoRoleId) {
        if (!chosenRoleSpecific && parsed > chosenRoleMultiplier) {
          chosenRole = roleObj;
          chosenRoleMultiplier = parsed;
        }
        continue;
      }
      if (parsed > chosenRoleMultiplier || !chosenRoleSpecific) {
        chosenRole = roleObj;
        chosenRoleMultiplier = parsed;
        chosenRoleSpecific = true;
      }
    }
  }

  if (chosenRole && chosenRoleMultiplier > 1) {
    sources.push({
      key: "role:" + String(chosenRole.id || ""),
      label: String(chosenRole.name || "Ruolo bonus"),
      type: "role",
      multiplier: Number(chosenRoleMultiplier.toFixed(2)),
      contribution: Number((chosenRoleMultiplier - 1).toFixed(2)),
      color:
        String(chosenRole.hexColor || "").trim() && String(chosenRole.hexColor || "").trim() !== "#000000"
          ? String(chosenRole.hexColor || "").trim()
          : "",
    });
  }

  return sources;
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
      currentLevelExp: Number(li.currentLevelExp || 0),
      nextLevelExp: Number(li.nextLevelExp || 0),
      remainingToNext: Number(li.remainingToNext || 0),
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
      currentLevelExp: Number(li.currentLevelExp || 0),
      nextLevelExp: Number(li.nextLevelExp || 0),
      remainingToNext: Number(li.remainingToNext || 0),
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
      const expMultiplierResolved =
        guild && searchId ? await getResolvedWeeklyExpMultiplier(guild, searchId, guildExpSettings).catch(() => null) : null;
      const weeklyEffectiveMultiplier = board === "weekly" ? expMultiplierResolved : null;
      const row = await buildRowFromDoc(client, guild, board, doc, searchRank, pageMaxSecondary, globalExpMultiplier, overrides, weeklyEffectiveMultiplier);
      const stats = buildSearchStats(guild, board, doc, row.username, globalExpMultiplier, hourlySingular, null);
      const member =
        guild?.members?.cache?.get?.(searchId) || (guild ? await guild.members.fetch({ user: searchId, force: true }).catch(() => null) : null);
      const profileRoles = member?.roles?.cache
        ? [...member.roles.cache.values()]
            .filter((role) => String(role?.id || "") && String(role.id) !== String(guild?.id || ""))
            .sort((a, b) => Number(b?.position || 0) - Number(a?.position || 0))
            .map((role) => ({
              id: String(role.id),
              name: String(role.name || "Ruolo"),
              color:
                String(role.hexColor || "").trim() && String(role.hexColor || "").trim() !== "#000000"
                  ? String(role.hexColor || "").trim()
                  : "",
            }))
        : [];
      const weeklyMultiplierSources =
        board === "weekly" ? buildWeeklyMultiplierSources(member, guildExpSettings, globalExpMultiplier) : null;
      const customProfile = await buildCustomProfileData(guild, searchId);
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
        profile: {
          userId: String(row.userId || searchId),
          username: String(row.username || "").trim(),
          displayName:
            String((member && (member.displayName || member.nickname)) || row.displayName || row.username || "").trim(),
          avatarUrl: String(row.avatarUrl || "").trim(),
          joinedAt: member?.joinedAt ? new Date(member.joinedAt).toISOString() : "",
          rankCard: getRankCardThemeFromDoc(doc),
          rankCardResolvedWallpaper: resolveRankCardWallpaper(doc?.profile?.rankCard || {}),
          roles: profileRoles,
          ...(customProfile ? { customProfile } : {}),
          ...(Array.isArray(weeklyMultiplierSources) ? { weeklyMultiplierSources } : {}),
          ...(Number.isFinite(Number(expMultiplierResolved)) ? { expMultiplierResolved: Number(expMultiplierResolved) } : {}),
        },
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
        const weeklyEffectiveMultiplier = await getResolvedWeeklyExpMultiplier(
          guild,
          String(d.userId || ""),
          guildExpSettings,
        ).catch(() => null);
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
            ? await getResolvedWeeklyExpMultiplier(guild, String(d.userId || ""), guildExpSettings).catch(() => null)
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