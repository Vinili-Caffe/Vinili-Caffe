/** Classifiche utenti: ricerca di un utente e sue statistiche. */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getLevelInfo, getGlobalMultiplier, getGuildExpSettings, getResolvedWeeklyExpMultiplier } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { computeWeeklyExpFromProfileDoc, getRomeDayKey } = require("../../Utils/Community/leaderboardHelpers") as typeof import("../../Utils/Community/leaderboardHelpers");
const { discordRoleIconUrl } = require("../../Utils/Discord/discordRoleIconUrl") as typeof import("../../Utils/Discord/discordRoleIconUrl");
const { fetchWebsiteGuildMember, readCachedWebsiteMember } = require("./websiteGuildMemberFetch") as typeof import("./websiteGuildMemberFetch");
const { getRomeDateParts } = require("../../Services/Community/birthdayService") as typeof import("../../Services/Community/birthdayService");
const { listCache } = require("./usersLbCache") as typeof import("./usersLbCache");
const { nInt, parsePeriod, numericSortExpr } = require("./usersLbParams") as typeof import("./usersLbParams");
const { PROFILE_MEMBER_SOFT_TIMEOUT_MS, siteSafeRankCard, siteSafeResolvedWallpaper, siteMemberAvatarUrl, publicDisplayNameFromMemberOrUser, resolveMemberForProfileFast, fetchUserIdentity, pickMembersFromGuild } = require("./usersLbIdentity") as typeof import("./usersLbIdentity");
const { buildPublicBirthdayPayload } = require("./usersLbBirthdays") as typeof import("./usersLbBirthdays");
const { buildCustomProfileData } = require("./usersLbCustomProfile") as typeof import("./usersLbCustomProfile");
const { pctBar, siteRomeDayOverridesFromDoc, buildWeeklyMultiplierSources, peekCachedWeeklyHourlySorted } = require("./usersLbMultipliers") as typeof import("./usersLbMultipliers");

const PROFILE_CACHE_VER = 11;

const SEARCH_SELECT =
  "userId profile.totals.exp profile.totals.hourly profile.totals.daily profile.totals.messagesTotal profile.totals.messagesWeekly profile.totals.messagesDaily profile.totals.messagesDailyKey profile.totals.voiceTotalSeconds profile.totals.voiceWeeklySeconds profile.totals.voiceDailySeconds profile.totals.voiceDailyKey profile.totals.sessionStartedAt profile.rankCard profile.birthday";

async function computeUserSearchRankMeta({
  guild,
  guildId,
  board,
  doc,
  searchId,
  weeklySorted,
  romeDayKey,
  weeklyHourlyExp,
  profileFast,
}) {
  let pageMaxSecondary = 1;
  let hourlySingular = null;
  let searchRank = 1;
  const useHourlyBoard = Boolean(guild) && board === "weekly";
  if (useHourlyBoard) {
    const sorted = Array.isArray(weeklySorted) ? weeklySorted : [];
    const expFromDoc = weeklyHourlyExp != null ? nInt(weeklyHourlyExp) : null;
    if (sorted.length) {
      const idx = sorted.findIndex((r?) => String(r.userId) === searchId);
      const agg = idx >= 0 ? sorted[idx] : null;
      searchRank = idx >= 0 ? idx + 1 : 0;
      const exp = expFromDoc != null ? expFromDoc : nInt(agg?.exp ?? 0);
      pageMaxSecondary = Math.max(1, exp);
      hourlySingular = { weeklyExp: exp };
    } else if (expFromDoc != null && expFromDoc > 0) {
      hourlySingular = { weeklyExp: expFromDoc };
      pageMaxSecondary = Math.max(1, expFromDoc);
      searchRank = 0;
    } else {
      searchRank = 0;
      pageMaxSecondary = 1;
      hourlySingular = { weeklyExp: 0 };
    }
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
    if (profileFast) {
      const higher = mt > 0
        ? await ActivityUserProfile.countDocuments({
            guildId,
            "profile.totals.exp.totalExp": { $gt: 0 },
            "profile.totals.messagesTotal": { $gt: mt },
          }).catch(() => 0)
        : 0;
      searchRank = mt > 0 ? higher + 1 : 0;
    } else {
      const higherAgg = await ActivityUserProfile.aggregate([
        { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
        { $addFields: { __sortVal: numericSortExpr("messages") } },
        { $match: { __sortVal: { $gt: mt } } },
        { $count: "n" },
      ]).catch(() => []);
      const higher = nInt(higherAgg?.[0]?.n);
      searchRank = higher + 1;
    }
  } else if (board === "voice") {
    const vs = nInt(doc.profile?.totals?.voiceTotalSeconds);
    pageMaxSecondary = Math.max(1, vs);
    if (profileFast) {
      const higher = vs > 0
        ? await ActivityUserProfile.countDocuments({
            guildId,
            "profile.totals.exp.totalExp": { $gt: 0 },
            "profile.totals.voiceTotalSeconds": { $gt: vs },
          }).catch(() => 0)
        : 0;
      searchRank = vs > 0 ? higher + 1 : 0;
    } else {
      const higherAgg = await ActivityUserProfile.aggregate([
        { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
        { $addFields: { __sortVal: numericSortExpr("voice") } },
        { $match: { __sortVal: { $gt: vs } } },
        { $count: "n" },
      ]).catch(() => []);
      const higher = nInt(higherAgg?.[0]?.n);
      searchRank = higher + 1;
    }
  } else if (board === "minigames") {
    const mt = nInt(doc.profile?.totals?.exp?.minigame?.totalExp);
    pageMaxSecondary = Math.max(1, mt);
    const higher =
      mt > 0
        ? await ActivityUserProfile.countDocuments({
            guildId,
            "profile.totals.exp.minigame.totalExp": { $gt: mt },
          }).catch(() => 0)
        : 0;
    searchRank = mt > 0 ? higher + 1 : 0;
  } else if (board === "level") {
    const te = nInt(doc.profile?.totals?.exp?.totalExp);
    const higher = await ActivityUserProfile.countDocuments({
      guildId,
      "profile.totals.exp.totalExp": { $gt: te },
    }).catch(() => 0);
    searchRank = higher + 1;
  }
  let overrides: any =
    useHourlyBoard && hourlySingular && board === "weekly" ? { weeklyExp: hourlySingular.weeklyExp } : null;
  let dayOvr: Record<string, any> = {};
  if (guild && (board === "messages" || board === "voice")) {
    dayOvr = siteRomeDayOverridesFromDoc(doc, board, romeDayKey);
  }
  overrides = { ...(overrides || {}), ...dayOvr };
  return { searchRank, pageMaxSecondary, overrides };
}

async function buildProfileSearchPayload(client?, guildId?, searchId?) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const doc = await ActivityUserProfile.findOne({ guildId, userId: searchId }).select(SEARCH_SELECT).lean().catch(() => null);
  if (!doc) {
    return {
      ok: true,
      search: true,
      notFound: true,
      board: "profile",
      page: 1,
      perPage: 1,
      total: 0,
      totalPages: 1,
      profile: null,
      rows: {},
    };
  }

  const boards = ["level", "weekly", "messages", "voice", "minigames"];
  const romeDayKey = getRomeDayKey(new Date());
  const weeklySortedPeek = peekCachedWeeklyHourlySorted(guild);
  const weeklyHourlyExp = computeWeeklyExpFromProfileDoc(doc);

      const memberCached =
    (guild && (readCachedWebsiteMember(searchId) || guild.members?.cache?.get?.(searchId))) || null;
  const memberFetchPromise =
    !memberCached && guild
      ? resolveMemberForProfileFast(guild, searchId)
      : null;

  const [member, customProfile, globalExpMultiplierRaw, guildExpSettings] = await Promise.all([
    memberCached
      ? Promise.resolve(memberCached)
      : memberFetchPromise
        ? Promise.race([
            memberFetchPromise,
            new Promise((resolve?) => setTimeout(() => resolve(null), PROFILE_MEMBER_SOFT_TIMEOUT_MS)),
          ])
        : Promise.resolve(null),
    buildCustomProfileData(guild, searchId, { lite: true }),
    getGlobalMultiplier(guildId).catch(() => 1),
    getGuildExpSettings(guildId).catch(() => null),
  ]);

  if (!member && guild) {
        fetchWebsiteGuildMember(guild, searchId, { timeoutMs: 10_000, retry: false })
      .then((m?) => {
        if (!m) return;
        try {
          listCache.delete(`profile:v${PROFILE_CACHE_VER}:${guildId}:${searchId}`);
        } catch {
                  }
      })
      .catch(() => null);
  }

  let globalExpMultiplier = Number(globalExpMultiplierRaw);
  if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;

  const [identity, expMultiplierResolved, ...rankMetas] = await Promise.all([
        fetchUserIdentity(client, guild, searchId, {
      member,
      skipUserFetch: !member,
    }),
    guild && searchId
      ? Promise.race([
          getResolvedWeeklyExpMultiplier(guild, searchId, guildExpSettings).catch(() => null),
          new Promise((resolve?) => setTimeout(() => resolve(null), PROFILE_MEMBER_SOFT_TIMEOUT_MS)),
        ])
      : null,
    ...boards.map((board?) =>
      computeUserSearchRankMeta({
        guild,
        guildId,
        board,
        doc,
        searchId,
        weeklySorted: weeklySortedPeek,
        romeDayKey,
        weeklyHourlyExp: board === "weekly" ? weeklyHourlyExp : undefined,
        profileFast: true,
      }),
    ),
  ]);

  const rows: Record<string, any> = {};
  await Promise.all(
    boards.map(async (board?, i?) => {
      const meta = rankMetas[i];
      rows[board] = await buildRowFromDoc(
        client,
        guild,
        board,
        doc,
        meta.searchRank,
        meta.pageMaxSecondary,
        globalExpMultiplier,
        meta.overrides,
        board === "weekly" ? expMultiplierResolved : null,
        identity,
      );
    }),
  );

  const levelRow = rows.level || {};
  const profileRoles = member?.roles?.cache
    ? [...member.roles.cache.values()]
        .filter((role?) => String(role?.id || "") && String(role.id) !== String(guild?.id || ""))
        .sort((a?, b?) => Number(b?.position || 0) - Number(a?.position || 0))
        .map((role?) => {
          const ic = discordRoleIconUrl(role, { size: 64 });
          return {
            id: String(role.id),
            name: String(role.name || "Ruolo"),
            color:
              String(role.hexColor || "").trim() && String(role.hexColor || "").trim() !== "#000000"
                ? String(role.hexColor || "").trim()
                : "",
            emoji: String(role.unicodeEmoji || "").trim(),
            iconUrl: ic.iconUrl,
            iconAnimated: ic.iconAnimated,
          };
        })
    : [];
  const profileAvatarUrl =
    (member && siteMemberAvatarUrl(member, 256)) || String(levelRow.avatarUrl || "").trim();
  const weeklyMultiplierSources = buildWeeklyMultiplierSources(member, guildExpSettings, globalExpMultiplier);
  const effectiveJoined = null;
  const romeToday = getRomeDateParts();
  const publicBirthday = buildPublicBirthdayPayload(doc?.profile?.birthday, romeToday);
  return {
    ok: true,
    search: true,
    notFound: false,
    board: "profile",
    page: 1,
    perPage: 1,
    total: 1,
    totalPages: 1,
        _memberResolved: Boolean(member),
    profile: {
      userId: String(levelRow.userId || searchId),
      username: String(levelRow.username || "").trim(),
      displayName: String(
        publicDisplayNameFromMemberOrUser(member, member?.user) ||
          levelRow.displayName ||
          levelRow.username ||
          ""
      ).trim(),
      avatarUrl: String(profileAvatarUrl || "").trim(),
      joinedAt: effectiveJoined
        ? effectiveJoined.toISOString()
        : member?.joinedAt
          ? new Date(member.joinedAt).toISOString()
          : "",
      rankCard: siteSafeRankCard(doc),
      rankCardResolvedWallpaper: siteSafeResolvedWallpaper(doc),
      roles: profileRoles,
      ...(customProfile ? { customProfile } : {}),
      ...(publicBirthday ? { birthday: publicBirthday } : {}),
      ...(Array.isArray(weeklyMultiplierSources) ? { weeklyMultiplierSources } : {}),
      ...(Number.isFinite(Number(expMultiplierResolved)) ? { expMultiplierResolved: Number(expMultiplierResolved) } : {}),
    },
    rows,
  };
}

async function buildRowFromDoc(
  client?,
  guild?,
  board?,
  d?,
  rank?,
  pageMaxSecondary?,
  globalExpMultiplier?,
  overrides?,
  weeklyEffectiveMultiplier?,
  identityPreload?,
  period?,
) {
  const ov = overrides && typeof overrides === "object" ? overrides : null;
  const periodNorm = parsePeriod(period);
  const userId = String(d.userId || "");
  const id = identityPreload || (await fetchUserIdentity(client, guild, userId));
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
      memberAvatar: id.memberAvatar || "",
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
      memberAvatar: id.memberAvatar || "",
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
  if (board === "monthly") {
    const monthlyExp = ov && ov.monthlyExp != null ? nInt(ov.monthlyExp) : 0;
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
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      level,
      exp: totalExp,
      monthlyExp,
      monthlyBarPct: pctBar(monthlyExp, pageMaxSecondary),
      currentLevelExp: Number(li.currentLevelExp || 0),
      nextLevelExp: Number(li.nextLevelExp || 0),
      remainingToNext: Number(li.remainingToNext || 0),
      progressPercent: Math.max(0, Math.min(100, Math.round(Number(li.progressPercent || 0)))),
    };
  }
  if (board === "messages") {
    const messagesTotal =
      ov && ov.messagesTotal != null ? nInt(ov.messagesTotal) : nInt(d.profile?.totals?.messagesTotal);
    const messagesWeekly =
      ov && ov.messagesWeekly != null ? nInt(ov.messagesWeekly) : nInt(d.profile?.totals?.messagesWeekly);
    const messagesMonthly =
      ov && ov.messagesMonthly != null ? nInt(ov.messagesMonthly) : 0;
    const messagesDaily =
      ov && ov.messagesDaily != null ? nInt(ov.messagesDaily) : nInt(d.profile?.totals?.messagesDaily);
    const primary =
      periodNorm === "weekly" ? messagesWeekly : periodNorm === "monthly" ? messagesMonthly : messagesTotal;
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      messagesTotal,
      messagesWeekly,
      messagesMonthly,
      messagesDaily,
      messagesWeeklyBarPct: pctBar(primary, pageMaxSecondary),
    };
  }
  if (board === "voice") {
    const voiceTotalSeconds =
      ov && ov.voiceTotalSeconds != null ? nInt(ov.voiceTotalSeconds) : nInt(d.profile?.totals?.voiceTotalSeconds);
    const voiceWeeklySeconds =
      ov && ov.voiceWeeklySeconds != null
        ? nInt(ov.voiceWeeklySeconds)
        : nInt(d.profile?.totals?.voiceWeeklySeconds);
    const voiceMonthlySeconds =
      ov && ov.voiceMonthlySeconds != null ? nInt(ov.voiceMonthlySeconds) : 0;
    const voiceDailySeconds =
      ov && ov.voiceDailySeconds != null ? nInt(ov.voiceDailySeconds) : nInt(d.profile?.totals?.voiceDailySeconds);
    const primary =
      periodNorm === "weekly"
        ? voiceWeeklySeconds
        : periodNorm === "monthly"
          ? voiceMonthlySeconds
          : voiceTotalSeconds;
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      voiceTotalSeconds,
      voiceWeeklySeconds,
      voiceMonthlySeconds,
      voiceDailySeconds,
      voiceWeeklyBarPct: pctBar(primary, pageMaxSecondary),
    };
  }
  if (board === "minigames") {
    const mg = d.profile?.totals?.exp?.minigame || {};
    const minigameTotalExp =
      ov && ov.minigameTotalExp != null ? nInt(ov.minigameTotalExp) : nInt(mg.totalExp);
    const minigameWeeklyExp =
      ov && ov.minigameWeeklyExp != null ? nInt(ov.minigameWeeklyExp) : nInt(mg.weeklyExp);
    const currentStreak =
      ov && ov.currentStreak != null ? nInt(ov.currentStreak) : nInt(mg.currentStreak);
    const bestStreak = ov && ov.bestStreak != null ? nInt(ov.bestStreak) : nInt(mg.bestStreak);
    const primary = periodNorm === "weekly" ? minigameWeeklyExp : minigameTotalExp;
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      minigameTotalExp,
      minigameWeeklyExp,
      currentStreak,
      bestStreak,
      minigameBarPct: pctBar(primary, pageMaxSecondary),
    };
  }
  return { rank, userId, username: id.username, displayName: id.displayName };
}

function buildSearchStats(guild?, board?, d?, topAccountUsername?, globalExpMult?, hourlySingular?, activityOverride?, membersApprox?) {
  const ao = activityOverride && typeof activityOverride === "object" ? activityOverride : null;
  let topLevel = 0;
  let topWeeklyExp = 0;
  let topMessagesTotal = 0;
  let topVoiceSeconds = 0;
  let topMinigameTotal = 0;
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
  } else if (board === "minigames") {
    topMinigameTotal =
      ao && ao.minigameTotalExp != null
        ? nInt(ao.minigameTotalExp)
        : Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.minigame?.totalExp || 0)));
  }
  const gm =
    board === "weekly" && globalExpMult != null && Number.isFinite(Number(globalExpMult)) && Number(globalExpMult) > 0
      ? Number(globalExpMult)
      : null;
  const mem =
    membersApprox != null && Number.isFinite(Number(membersApprox)) && Number(membersApprox) > 0
      ? Math.floor(Number(membersApprox))
      : pickMembersFromGuild(guild);
  return {
    rankedUsers: 1,
    membersApprox: mem,
    topDisplayName: String(topAccountUsername || "").trim() || "—",
    topPlayerUsername: String(topAccountUsername || "").trim() || "—",
    topLevel: board === "level" ? topLevel : null,
    topWeeklyExp: board === "weekly" ? topWeeklyExp : null,
    topMessagesTotal: board === "messages" ? topMessagesTotal : null,
    topVoiceSeconds: board === "voice" ? topVoiceSeconds : null,
    topMinigameTotal: board === "minigames" ? topMinigameTotal : null,
    globalExpMultiplier: gm,
  };
}

export = { PROFILE_CACHE_VER, SEARCH_SELECT, buildProfileSearchPayload, buildRowFromDoc, buildSearchStats };
