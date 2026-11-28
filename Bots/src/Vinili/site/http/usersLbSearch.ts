/** Classifiche utenti: ricerca di un utente e sue statistiche. */
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { getLevelInfo, getGlobalMultiplier, getGuildExpSettings, getResolvedWeeklyExpMultiplier } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { computeWeeklyExpFromProfileDoc, getRomeDayKey } = require("../../Community/utils/leaderboardHelpers") as typeof import("../../Community/utils/leaderboardHelpers");
const { discordRoleIconUrl } = require("../utils/discordRoleIconUrl") as typeof import("../utils/discordRoleIconUrl");
const { fetchWebsiteGuildMember, readCachedWebsiteMember } = require("./websiteGuildMemberFetch") as typeof import("./websiteGuildMemberFetch");
const { getRomeDateParts } = require("../../Community/services/birthdayService") as typeof import("../../Community/services/birthdayService");
const { listCache } = require("./usersLbCache") as typeof import("./usersLbCache");
const { nInt, parsePeriod, numericSortExpr, minigameValue } = require("./usersLbParams") as typeof import("./usersLbParams");
const { PROFILE_MEMBER_SOFT_TIMEOUT_MS, siteSafeRankCard, siteSafeResolvedWallpaper, siteMemberAvatarUrl, publicDisplayNameFromMemberOrUser, resolveMemberForProfileFast, fetchUserIdentity, pickMembersFromGuild } = require("./usersLbIdentity") as typeof import("./usersLbIdentity");
const { buildPublicBirthdayPayload } = require("./usersLbBirthdays") as typeof import("./usersLbBirthdays");
const { buildCustomProfileData } = require("./usersLbCustomProfile") as typeof import("./usersLbCustomProfile");
const { pctBar, siteRomeDayOverridesFromDoc, buildWeeklyMultiplierSources, peekCachedWeeklyHourlySorted } = require("./usersLbMultipliers") as typeof import("./usersLbMultipliers");

const PROFILE_CACHE_VER = 14;

/** Payload pubblico per il calcolatore livelli sul profilo (tassi + curva + catalogo bonus). */
function buildLevelsSimPayload(guildId?, guildExpSettings?) {
  const catalogDefs = [
    ["ServerBooster", "booster", "Booster", 2, "boost"],
    ["DoubleBooster", "double", "Double Booster", 3, "boost"],
    ["MVP", "mvp", "MVP", 2, "status"],
    ["Donator", "donator", "Donator", 4, "donor"],
    ["VIP", "vip", "VIP", 5, "donor"],
    ["VIPplus", "vipplus", "VIP+", 6, "donor"],
  ];
  let messageExp = 2;
  let voiceExpPerMinute = 5;
  let messageCooldownSec = 0;
  let maxCombinedMultiplier = 8;
  let globalMultiplier = 1;
  let levelCurve = {
    firstThreshold: 100,
    roundTo: 50,
    minStepAdd: 110,
    segments: [
      { upTo: 10, base: 120, from: 1, perLevel: 25 },
      { upTo: 30, base: 380, from: 10, perLevel: 55 },
      { upTo: 60, base: 1600, from: 30, perLevel: 120 },
      { upTo: 10000, base: 5200, from: 60, perLevel: 210 },
    ],
  };
  const roleMultMap =
    guildExpSettings?.roleMultipliersMerged instanceof Map ? guildExpSettings.roleMultipliersMerged : new Map();
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
    const cfg = LVL.getConfigSync(String(guildId || IDs.guilds?.main || ""));
    const curve = LVL.getLevelCurveSync(String(guildId || IDs.guilds?.main || ""));
    if (curve && typeof curve === "object") levelCurve = curve;
    if (cfg) {
      if (cfg.messageEnabled === false) messageExp = 0;
      else messageExp = Math.max(0, Math.floor(Number(cfg.messageExp) || 2));
      if (cfg.voiceEnabled === false) voiceExpPerMinute = 0;
      else voiceExpPerMinute = Math.max(0, Math.floor(Number(cfg.voiceExpPerMinute) || 5));
      messageCooldownSec = Math.max(0, Math.floor(Number(cfg.messageCooldownSec) || 0));
      const cap = Number(cfg.maxCombinedMultiplier);
      if (Number.isFinite(cap) && cap >= 1) maxCombinedMultiplier = cap;
      const g = Number(cfg.globalMultiplier);
      if (Number.isFinite(g) && g > 0) globalMultiplier = g;
    }
    const eff = Number(guildExpSettings?.effectiveMultiplier);
    if (Number.isFinite(eff) && eff > 0) globalMultiplier = eff;
    else {
      const base = Number(guildExpSettings?.baseMultiplier);
      const ev = Number(guildExpSettings?.eventMultiplier);
      if (Number.isFinite(base) && base > 0) {
        globalMultiplier = base * (Number.isFinite(ev) && ev > 0 ? ev : 1);
      }
    }
    const settingsCap = Number(guildExpSettings?.maxCombinedMultiplier);
    if (Number.isFinite(settingsCap) && settingsCap >= 1) maxCombinedMultiplier = settingsCap;

    const catalog = [];
    for (const [roleKey, key, label, fallbackMult, kind] of catalogDefs) {
      const roleId = String((IDs as any)?.roles?.[roleKey] || "").trim();
      if (!/^\d{16,20}$/.test(roleId)) continue;
      const fromMap = Number(roleMultMap.get(roleId));
      const multiplier =
        Number.isFinite(fromMap) && fromMap > 0 ? fromMap : Math.max(1, Number(fallbackMult) || 1);
      catalog.push({ key, roleId, label, multiplier: Number(multiplier.toFixed(2)), kind });
    }
    return {
      messageExp,
      voiceExpPerMinute,
      messageCooldownSec,
      maxCombinedMultiplier,
      globalMultiplier: Number(Math.max(0.1, globalMultiplier).toFixed(2)),
      levelCurve,
      catalog,
    };
  } catch {
    return {
      messageExp,
      voiceExpPerMinute,
      messageCooldownSec,
      maxCombinedMultiplier,
      globalMultiplier: 1,
      levelCurve,
      catalog: catalogDefs
        .map(([, key, label, multiplier, kind]) => {
          const ids = {
            booster: "1329497467481493607",
            double: "1544830850552823849",
            mvp: "1544830832227782699",
            donator: "1544830864565735515",
            vip: "1544830866616754257",
            vipplus: "1544830868575625276",
          };
          const roleId = ids[key];
          if (!roleId) return null;
          return { key, roleId, label, multiplier, kind };
        })
        .filter(Boolean),
    };
  }
}

const SEARCH_SELECT =
  "userId profile.totals.exp profile.totals.hourly profile.totals.daily profile.totals.messagesTotal profile.totals.messagesWeekly profile.totals.messagesDaily profile.totals.messagesDailyKey profile.totals.voiceTotalSeconds profile.totals.voiceWeeklySeconds profile.totals.voiceDailySeconds profile.totals.voiceDailyKey profile.totals.sessionStartedAt profile.rankCard profile.birthday profile.events.starwars.deckReliquie profile.events.starwars.deckPG profile.events.starwars.eventKey";

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
    const storedWeekly = nInt(doc?.profile?.totals?.exp?.weeklyExp);
    const expFromDoc = weeklyHourlyExp != null ? nInt(weeklyHourlyExp) : null;
    if (sorted.length) {
      const idx = sorted.findIndex((r?) => String(r.userId) === searchId);
      const agg = idx >= 0 ? sorted[idx] : null;
      searchRank = idx >= 0 ? idx + 1 : 0;
      let exp = expFromDoc != null ? expFromDoc : nInt(agg?.exp ?? 0);
      /* compact hourly vuoto: non azzerare l’EXP realmente assegnato */
      if (exp <= 0 && storedWeekly > 0) exp = storedWeekly;
      pageMaxSecondary = Math.max(1, exp);
      hourlySingular = { weeklyExp: exp };
      if (searchRank <= 0 && exp > 0 && exp === storedWeekly) {
        const higher = await ActivityUserProfile.countDocuments({
          guildId,
          "profile.totals.exp.weeklyExp": { $gt: exp },
        }).catch(() => 0);
        searchRank = higher + 1;
      }
    } else if (expFromDoc != null && expFromDoc > 0) {
      hourlySingular = { weeklyExp: expFromDoc };
      pageMaxSecondary = Math.max(1, expFromDoc);
      searchRank = 0;
    } else if (storedWeekly > 0) {
      hourlySingular = { weeklyExp: storedWeekly };
      pageMaxSecondary = Math.max(1, storedWeekly);
      const higher = await ActivityUserProfile.countDocuments({
        guildId,
        "profile.totals.exp.weeklyExp": { $gt: storedWeekly },
      }).catch(() => 0);
      searchRank = higher + 1;
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
    /* mai stato nel principale ma è un utente Discord vero: profilo base (il compleanno vale ovunque) */
    const u: any = await client.users.fetch(searchId).catch(() => null);
    if (u && !u.bot) {
      return {
        ok: true,
        search: true,
        notFound: false,
        inGuild: false,
        board: "profile",
        page: 1,
        perPage: 1,
        total: 1,
        totalPages: 1,
        profile: {
          userId: String(u.id),
          username: String(u.username || ""),
          displayName: String(u.globalName || u.username || "").trim(),
          avatarUrl: String(u.displayAvatarURL?.({ size: 256 }) || ""),
          inGuild: false,
          roles: [],
        },
        rows: {},
      };
    }
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
  const weeklyHourlyExp = await computeWeeklyExpFromProfileDoc(doc, new Date(), guildId);

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
  const levelsSim = buildLevelsSimPayload(guildId, guildExpSettings);
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
      levelsSim,
    },
    rows,
  };
}

/** Collezioni PG/Reliquie solo su /evento/ — mai sul profilo normale. */
async function maybeAttachStarWarsDecksForHighStaff(_client?, _req?, payload?, _guildId?) {
  if (!payload?.profile || payload.notFound) return payload;
  try {
    if (payload.profile.starWarsDecks) delete payload.profile.starWarsDecks;
  } catch (_) {}
  return payload;
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
    const minigameMonthlyExp = ov && ov.minigameMonthlyExp != null ? nInt(ov.minigameMonthlyExp) : minigameValue(d, "monthly");
    const primary =
      periodNorm === "weekly" ? minigameWeeklyExp : periodNorm === "monthly" ? minigameMonthlyExp : minigameTotalExp;
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
      minigameMonthlyExp,
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

export = {
  PROFILE_CACHE_VER,
  SEARCH_SELECT,
  buildProfileSearchPayload,
  buildRowFromDoc,
  buildSearchStats,
  maybeAttachStarWarsDecksForHighStaff,
};
