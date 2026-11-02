
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getLevelInfo, getGlobalMultiplier, getGuildExpSettings, getResolvedWeeklyExpMultiplier } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const {
  getRomeDayKey,
} = require("../../Utils/Community/leaderboardHelpers") as typeof import("../../Utils/Community/leaderboardHelpers");
const { discordRoleIconUrl } = require("../../Utils/Discord/discordRoleIconUrl") as typeof import("../../Utils/Discord/discordRoleIconUrl");
const { getEffectiveJoinedAt } = require("../../Services/Community/effectiveMemberJoinService") as typeof import("../../Services/Community/effectiveMemberJoinService");
const { isLitePerf, resolveSitePerfTier } = require("./sitePerfHints") as typeof import("./sitePerfHints");
const { getRomeDateParts } = require("../../Services/Community/birthdayService") as typeof import("../../Services/Community/birthdayService");
const { LIST_CACHE_TTL_MS, LIST_STALE_KEEP_MS, listCache, listCacheInflight, cacheGet, cacheSet, startCacheBuild, cacheGetOrBuild, cacheLookupMeta } = require("./usersLbCache") as typeof import("./usersLbCache");
const { parseIntSafe, nInt, resolveGuildId, parseBoard, parsePeriod, resolveRankBoardPeriod, isComputedListBoard, parseCalendarMonth, parseCalendarYear, boardQuery, boardSort, boardSelect, numericSortExpr, parseSearchUserId } = require("./usersLbParams") as typeof import("./usersLbParams");
const { replyUsers, siteSafeRankCard, siteSafeResolvedWallpaper, siteMemberAvatarUrl, resolveIdentitiesForList, resolveMembersApprox, publicDisplayNameFromMemberOrUser, identityFromCacheOnly } = require("./usersLbIdentity") as typeof import("./usersLbIdentity");
const { buildBirthdaysMonthPayload } = require("./usersLbBirthdays") as typeof import("./usersLbBirthdays");
const { buildCustomProfileData } = require("./usersLbCustomProfile") as typeof import("./usersLbCustomProfile");
const { siteRomeDayOverridesFromDoc, buildWeeklyMultiplierSources, getComputedSortedForBoard, computedMetricFromAgg, computedOverridesFromAgg } = require("./usersLbMultipliers") as typeof import("./usersLbMultipliers");
const { PROFILE_CACHE_VER, SEARCH_SELECT, buildProfileSearchPayload, buildRowFromDoc, buildSearchStats } = require("./usersLbSearch") as typeof import("./usersLbSearch");





const PROFILE_CACHE_TTL_MS = 90_000;
const PROFILE_STALE_KEEP_MS = 10 * 60 * 1000;
const BIRTHDAYS_CACHE_TTL_MS = 120_000;

async function handleSiteUsersLeaderboardGet(client?, req?, res?) {
  try {
    const guildId = resolveGuildId(client);
    if (!guildId) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }
    const q = req.query || {};
    const perfTier = resolveSitePerfTier(req);
    const lite = isLitePerf(req);
    const board = parseBoard(q.board);
    const periodRaw = parsePeriod(q.period);
    const rankResolved = resolveRankBoardPeriod(board, periodRaw);
    const rankBoard = rankResolved.board;
    const rankPeriod = rankResolved.period;
    const rowBoard = rankResolved.rowBoard;
    const responsePeriod = board === "weekly" ? "weekly" : periodRaw;
    const searchId = parseSearchUserId(q.userId ?? q.user_id ?? q.id ?? q.searchUserId ?? q.uid);

    if (board === "birthdays") {
      const romeToday = getRomeDateParts();
      const month = parseCalendarMonth(q.month, romeToday.month);
      const year = parseCalendarYear(q.year, romeToday.year);
      const birthdaysCacheKey = `birthdays:v1:${guildId}:${year}:${month}`;
      const cachedBirthdays = cacheGet(birthdaysCacheKey);
      if (cachedBirthdays) {
        return replyUsers(req, res, cachedBirthdays, "public, max-age=60");
      }
      const payload = await buildBirthdaysMonthPayload(client, guildId, month, year);
      cacheSet(birthdaysCacheKey, payload, BIRTHDAYS_CACHE_TTL_MS);
      return replyUsers(req, res, payload, "public, max-age=60");
    }

    if (searchId && board === "profile") {
      const profileCacheKey = `profile:v${PROFILE_CACHE_VER}:${guildId}:${searchId}`;
      /* leaveProfileLive1: never serve cached in-guild snapshot after leave/negative */
      const { isOnNegativeCache } = require("./websiteGuildMemberFetch") as typeof import("./websiteGuildMemberFetch");
      if (isOnNegativeCache(searchId)) {
        try {
          listCache.delete(profileCacheKey);
        } catch (_) {}
        const gone = {
          ok: true,
          search: true,
          notFound: true,
          leftGuild: true,
          inGuild: false,
          board: "profile",
          page: 1,
          perPage: 1,
          total: 0,
          totalPages: 1,
          profile: null,
          rows: {},
        };
        res.setHeader("Cache-Control", "no-store");
        return res.json(gone);
      }
      const profileMeta = cacheLookupMeta(profileCacheKey, PROFILE_STALE_KEEP_MS);
      if (profileMeta.hit && !profileMeta.stale) {
        return replyUsers(req, res, profileMeta.hit, "public, max-age=15");
      }
      if (profileMeta.hit && profileMeta.stale) {
        startCacheBuild(profileCacheKey, async () => {
          const rebuilt: any = await buildProfileSearchPayload(client, guildId, searchId);
          const memberResolved = Boolean(rebuilt && rebuilt._memberResolved);
          if (rebuilt && Object.prototype.hasOwnProperty.call(rebuilt, "_memberResolved")) {
            delete rebuilt._memberResolved;
          }
          if (rebuilt && !rebuilt.notFound) {
            rebuilt.inGuild = memberResolved;
            if (rebuilt.profile && typeof rebuilt.profile === "object") {
              rebuilt.profile.inGuild = memberResolved;
            }
          }
          if (!rebuilt.notFound && memberResolved) return rebuilt;
          return profileMeta.hit;
        }, PROFILE_CACHE_TTL_MS).catch((err?) => {
          global.logger?.warn?.("[WEBHOOK] site-users profile swr:", err?.message || err);
        });
        return replyUsers(req, res, profileMeta.hit, "public, max-age=5, stale-while-revalidate=120", {
          "X-VC-Users-Stale": "1",
        });
      }
      const payload: any = await buildProfileSearchPayload(client, guildId, searchId);
      const memberResolved = Boolean(payload && payload._memberResolved);
      if (payload && Object.prototype.hasOwnProperty.call(payload, "_memberResolved")) {
        delete payload._memberResolved;
      }
      if (payload && !payload.notFound) {
        payload.inGuild = memberResolved;
        if (payload.profile && typeof payload.profile === "object") {
          payload.profile.inGuild = memberResolved;
        }
      }
      if (!payload.notFound && memberResolved) {
        cacheSet(profileCacheKey, payload, PROFILE_CACHE_TTL_MS);
      }
      res.setHeader("Cache-Control", payload.notFound ? "no-store" : "public, max-age=45");
      if (payload.notFound) return res.json(payload);
      return replyUsers(req, res, payload, "public, max-age=45");
    }

    if (searchId) {
      const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      const membersApprox = await resolveMembersApprox(client, guild, guildId);
      if (rankBoard === "minigames" && rankPeriod === "monthly") {
        res.setHeader("Cache-Control", "no-store");
        return res.json({
          ok: true,
          search: true,
          notFound: true,
          board,
          period: responsePeriod,
          page: 1,
          perPage: 1,
          total: 0,
          totalPages: 1,
          stats: {
            rankedUsers: 0,
            membersApprox,
            topDisplayName: "",
            topPlayerUsername: "",
            topLevel: null,
            topWeeklyExp: null,
            topMessagesTotal: null,
            topVoiceSeconds: null,
            topMinigameTotal: null,
            globalExpMultiplier: null,
          },
          rows: [],
        });
      }
      const doc = await ActivityUserProfile.findOne({ guildId, userId: searchId }).select(SEARCH_SELECT).lean().catch(() => null);
      if (!doc) {
        res.setHeader("Cache-Control", "no-store");
        return res.json({
          ok: true,
          search: true,
          notFound: true,
          board,
          period: responsePeriod,
          page: 1,
          perPage: 1,
          total: 0,
          totalPages: 1,
          stats: {
            rankedUsers: 0,
            membersApprox,
            topDisplayName: "",
            topPlayerUsername: "",
            topLevel: null,
            topWeeklyExp: null,
            topMessagesTotal: null,
            topVoiceSeconds: null,
            topMinigameTotal: null,
            globalExpMultiplier: null,
          },
          rows: [],
        });
      }
      let pageMaxSecondary = 1;
      let hourlySingular = null;
      let searchRank = 1;
      let overrides: any = null;
      const useComputed = Boolean(guild) && isComputedListBoard(rankBoard, rankPeriod);
      if (useComputed) {
        const sorted = await getComputedSortedForBoard(guild, rankBoard, rankPeriod);
        const idx = sorted.findIndex((r?) => String(r.userId) === searchId);
        const agg = idx >= 0 ? sorted[idx] : null;
        searchRank = idx >= 0 ? idx + 1 : 0;
        const metricVal = computedMetricFromAgg(rankBoard, rankPeriod, agg);
        pageMaxSecondary = Math.max(1, metricVal);
        overrides = computedOverridesFromAgg(rankBoard, rankPeriod, agg || {});
        if (rankBoard === "level" && rankPeriod === "weekly") {
          hourlySingular = { weeklyExp: metricVal };
        }
      } else if (rowBoard === "weekly" || (rankBoard === "level" && rankPeriod === "weekly")) {
        const we = nInt(doc.profile?.totals?.exp?.weeklyExp);
        pageMaxSecondary = Math.max(1, we);
        const higher = await ActivityUserProfile.countDocuments({
          guildId,
          "profile.totals.exp.weeklyExp": { $gt: we },
        }).catch(() => 0);
        searchRank = higher + 1;
      } else if (rankBoard === "messages") {
        const mt =
          rankPeriod === "weekly"
            ? nInt(doc.profile?.totals?.messagesWeekly)
            : nInt(doc.profile?.totals?.messagesTotal);
        pageMaxSecondary = Math.max(1, mt);
        const higherAgg = await ActivityUserProfile.aggregate([
          { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
          { $addFields: { __sortVal: numericSortExpr("messages", rankPeriod) } },
          { $match: { __sortVal: { $gt: mt } } },
          { $count: "n" },
        ]).catch(() => []);
        const higher = nInt(higherAgg?.[0]?.n);
        searchRank = mt > 0 ? higher + 1 : 0;
      } else if (rankBoard === "voice") {
        const vs =
          rankPeriod === "weekly"
            ? nInt(doc.profile?.totals?.voiceWeeklySeconds)
            : nInt(doc.profile?.totals?.voiceTotalSeconds);
        pageMaxSecondary = Math.max(1, vs);
        const higherAgg = await ActivityUserProfile.aggregate([
          { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
          { $addFields: { __sortVal: numericSortExpr("voice", rankPeriod) } },
          { $match: { __sortVal: { $gt: vs } } },
          { $count: "n" },
        ]).catch(() => []);
        const higher = nInt(higherAgg?.[0]?.n);
        searchRank = vs > 0 ? higher + 1 : 0;
      } else if (rankBoard === "minigames") {
        const mt =
          rankPeriod === "weekly"
            ? nInt(doc.profile?.totals?.exp?.minigame?.weeklyExp)
            : nInt(doc.profile?.totals?.exp?.minigame?.totalExp);
        pageMaxSecondary = Math.max(1, mt);
        const field =
          rankPeriod === "weekly"
            ? "profile.totals.exp.minigame.weeklyExp"
            : "profile.totals.exp.minigame.totalExp";
        const higher =
          mt > 0
            ? await ActivityUserProfile.countDocuments({
                guildId,
                [field]: { $gt: mt },
              }).catch(() => 0)
            : 0;
        searchRank = mt > 0 ? higher + 1 : 0;
      } else if (rankBoard === "level") {
        const te = nInt(doc.profile?.totals?.exp?.totalExp);
        const higher = await ActivityUserProfile.countDocuments({
          guildId,
          "profile.totals.exp.totalExp": { $gt: te },
        }).catch(() => 0);
        searchRank = higher + 1;
      }
      let globalExpMultiplier = 1;
      let guildExpSettings = null;
      const needsWeeklyMult = rowBoard === "weekly" || (rankBoard === "level" && rankPeriod === "weekly");
      if (needsWeeklyMult) {
        globalExpMultiplier = Number(await getGlobalMultiplier(guildId).catch(() => 1));
        if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;
        guildExpSettings = await getGuildExpSettings(guildId).catch(() => null);
      }
      let dayOvr: Record<string, any> = {};
      if (guild && (rankBoard === "messages" || rankBoard === "voice") && rankPeriod === "alltime") {
        const rk = getRomeDayKey(new Date());
        dayOvr = siteRomeDayOverridesFromDoc(doc, rankBoard, rk);
      }
      overrides = { ...(overrides || {}), ...dayOvr };
      const expMultiplierResolved =
        guild && searchId && needsWeeklyMult
          ? await getResolvedWeeklyExpMultiplier(guild, searchId, guildExpSettings).catch(() => null)
          : null;
      const weeklyEffectiveMultiplier = needsWeeklyMult ? expMultiplierResolved : null;
      const row = await buildRowFromDoc(
        client,
        guild,
        rowBoard,
        doc,
        searchRank,
        pageMaxSecondary,
        globalExpMultiplier,
        overrides,
        weeklyEffectiveMultiplier,
        null,
        rankPeriod,
      );
      const statsBoard = board === "weekly" || (rankBoard === "level" && rankPeriod === "weekly") ? "weekly" : rankBoard;
      const stats: any = buildSearchStats(guild, statsBoard, doc, row.username, globalExpMultiplier, hourlySingular, null, membersApprox);
      const member =
        guild?.members?.cache?.get?.(searchId) || (guild ? await guild.members.fetch({ user: searchId, force: true }).catch(() => null) : null);
      const profileAvatarUrl =
        (member && siteMemberAvatarUrl(member, 256)) || String(row.avatarUrl || "").trim();
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
      const weeklyMultiplierSources = needsWeeklyMult
        ? buildWeeklyMultiplierSources(member, guildExpSettings, globalExpMultiplier)
        : null;
      const customProfile = await buildCustomProfileData(guild, searchId);
      const effectiveJoined = member ? await getEffectiveJoinedAt(member).catch(() => null) : null;
      if (guild && (rankBoard === "messages" || rankBoard === "voice")) {
        stats.siteRomeCalendarDay = getRomeDayKey(new Date());
      }
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        ok: true,
        search: true,
        notFound: false,
        board,
        period: responsePeriod,
        page: 1,
        perPage: 1,
        total: 1,
        totalPages: 1,
        stats,
        profile: {
          userId: String(row.userId || searchId),
          username: String(row.username || "").trim(),
          displayName: String(
            publicDisplayNameFromMemberOrUser(member, member?.user) ||
              row.displayName ||
              row.username ||
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
          ...(Array.isArray(weeklyMultiplierSources) ? { weeklyMultiplierSources } : {}),
          ...(Number.isFinite(Number(expMultiplierResolved)) ? { expMultiplierResolved: Number(expMultiplierResolved) } : {}),
        },
        rows: [row],
      });
    }

    const page = parseIntSafe(q.page, 1, 100000, 1);
    /* ulNineAlways1: UI /user/ è 3×3 — lite non deve clampare sotto 9 */
    const perPageMax = lite ? 9 : perfTier === "mid" ? 12 : 24;
    const perPageDefault = lite ? 9 : 12;
    const perPage = parseIntSafe(q.perPage, 1, perPageMax, perPageDefault);
    /* siteUsersSwr1: cache hit prima di Discord/membersApprox */
    let guild = client.guilds.cache.get(guildId) || null;
    let computedBoard = Boolean(guild) && isComputedListBoard(rankBoard, rankPeriod);
    const emptyMinigamesMonthly = rankBoard === "minigames" && rankPeriod === "monthly";
    const romeDayKey = rankBoard === "messages" || rankBoard === "voice" ? getRomeDayKey(new Date()) : "";
    /* periodLb1: bump cache key for board+period */
    let cacheKey = `v6:${guildId}:${board}:${responsePeriod}${computedBoard ? ":computed" : ""}:p${page}:n${perPage}:perf${perfTier}`;
    const listCcFresh = lite ? "public, max-age=45" : "public, max-age=20";
    const listCcStale = "public, max-age=5, stale-while-revalidate=120";
    const forceRebuild = Boolean(req && req.__vcForceUsersRebuild);

    if (emptyMinigamesMonthly) {
      const emptyPayload = {
        ok: true,
        board,
        period: responsePeriod,
        page: 1,
        perPage,
        total: 0,
        totalPages: 1,
        stats: {
          rankedUsers: 0,
          membersApprox: null,
          topDisplayName: "",
          topPlayerUsername: "",
          topLevel: null,
          topWeeklyExp: null,
          topMessagesTotal: null,
          topVoiceSeconds: null,
          topMinigameTotal: null,
          globalExpMultiplier: null,
        },
        rows: [],
      };
      return replyUsers(req, res, emptyPayload, listCcFresh, { "X-VC-Perf": perfTier });
    }

    let listMeta = cacheLookupMeta(cacheKey, LIST_STALE_KEEP_MS);
    if (listMeta.hit && !listMeta.stale) {
      return replyUsers(req, res, listMeta.hit, lite ? "public, max-age=45" : "public, max-age=15", {
        "X-VC-Perf": perfTier,
      });
    }
    if (listMeta.hit && listMeta.stale && !forceRebuild) {
      /* refresh in bg (force) — evita loop sullo stesso stale short-circuit */
      if (!listCacheInflight.has(cacheKey)) {
        setImmediate(() => {
          warmOneUsersQuery(
            client,
            {
              board,
              period: responsePeriod,
              page: String(page),
              perPage: String(perPage),
              ...(lite ? { perf: "lite" } : {}),
            },
            { force: true },
          ).catch(() => {});
        });
      }
      return replyUsers(req, res, listMeta.hit, listCcStale, {
        "X-VC-Perf": perfTier,
        "X-VC-Users-Stale": "1",
      });
    }

    if (!guild) {
      guild = (await client.guilds.fetch(guildId).catch(() => null)) || null;
      computedBoard = Boolean(guild) && isComputedListBoard(rankBoard, rankPeriod);
      cacheKey = `v6:${guildId}:${board}:${responsePeriod}${computedBoard ? ":computed" : ""}:p${page}:n${perPage}:perf${perfTier}`;
      listMeta = cacheLookupMeta(cacheKey, LIST_STALE_KEEP_MS);
      if (listMeta.hit && !listMeta.stale) {
        return replyUsers(req, res, listMeta.hit, lite ? "public, max-age=45" : "public, max-age=15", {
          "X-VC-Perf": perfTier,
        });
      }
      if (listMeta.hit && listMeta.stale && !forceRebuild) {
        if (!listCacheInflight.has(cacheKey)) {
          setImmediate(() => {
            warmOneUsersQuery(
              client,
              {
                board,
                period: responsePeriod,
                page: String(page),
                perPage: String(perPage),
                ...(lite ? { perf: "lite" } : {}),
              },
              { force: true },
            ).catch(() => {});
          });
        }
        return replyUsers(req, res, listMeta.hit, listCcStale, {
          "X-VC-Perf": perfTier,
          "X-VC-Users-Stale": "1",
        });
      }
    }
    const membersApprox = await resolveMembersApprox(client, guild, guildId);

    const skip = (page - 1) * perPage;
    /* siteUsersSwr1: lista mai bloccata su hydrate Discord duro (fill in background) */
    const softIds = true;

    if (computedBoard) {
      /* periodLb1: weekly/monthly EXP + monthly messages/voice via computeLeaderboardRows */
      const payload = await cacheGetOrBuild(cacheKey, async () => {
        const sorted = await getComputedSortedForBoard(guild, rankBoard, rankPeriod);
        const total = sorted.length;
        const slice = sorted.slice(skip, skip + perPage);
        let pageMaxSecondary = 1;
        for (const agg of slice) {
          pageMaxSecondary = Math.max(pageMaxSecondary, computedMetricFromAgg(rankBoard, rankPeriod, agg));
        }
        if (pageMaxSecondary < 1) pageMaxSecondary = 1;
        let globalExpMultiplier = 1;
        let guildExpSettings = null;
        const needsWeeklyMult = rankBoard === "level" && rankPeriod === "weekly";
        if (needsWeeklyMult) {
          globalExpMultiplier = Number(await getGlobalMultiplier(guildId).catch(() => 1));
          if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;
          guildExpSettings = lite ? null : await getGuildExpSettings(guildId).catch(() => null);
        }
        const userIds = slice.map((r?) => String(r.userId || "")).filter(Boolean);
        const profileDocs = userIds.length
          ? await ActivityUserProfile.find({ guildId, userId: { $in: userIds } })
              .select(SEARCH_SELECT)
              .lean()
              .catch(() => [])
          : [];
        const docMap = new Map(profileDocs.map((d?) => [String(d.userId), d]));
        const identityMap = await resolveIdentitiesForList(client, guild, userIds, lite, softIds);
        const rows = [];
        for (let i = 0; i < slice.length; i += 1) {
          const agg = slice[i];
          const d: any = docMap.get(String(agg.userId));
          if (!d) continue;
          const rank = skip + i + 1;
          const overrides = computedOverridesFromAgg(rankBoard, rankPeriod, agg);
          const memberHint =
            needsWeeklyMult ? guild?.members?.cache?.get?.(String(d.userId || "")) || null : null;
          const weeklyEffectiveMultiplier = needsWeeklyMult
            ? await getResolvedWeeklyExpMultiplier(
                guild,
                String(d.userId || ""),
                guildExpSettings,
                memberHint,
              ).catch(() => null)
            : null;
          rows.push(
            await buildRowFromDoc(
              client,
              guild,
              rowBoard,
              d,
              rank,
              pageMaxSecondary,
              globalExpMultiplier,
              overrides,
              weeklyEffectiveMultiplier,
              identityMap.get(String(d.userId || "")),
              rankPeriod,
            ),
          );
        }
        const first = sorted[0];
        let topDisplayName = "";
        let topWeeklyExp = 0;
        let topMessagesTotal = 0;
        let topVoiceSeconds = 0;
        if (first) {
          const uid = String(first.userId || "");
          if (uid) {
            const cachedId = identityFromCacheOnly(client, guild, uid);
            topDisplayName = String(cachedId.displayName || cachedId.username || "").trim();
          }
          const topMetric = computedMetricFromAgg(rankBoard, rankPeriod, first);
          if (rankBoard === "level") topWeeklyExp = topMetric;
          if (rankBoard === "messages") topMessagesTotal = topMetric;
          if (rankBoard === "voice") topVoiceSeconds = topMetric;
        }
        if (!String(topDisplayName || "").trim() && rows.length && skip === 0) {
          const fb = String(rows[0].displayName || rows[0].username || "").trim();
          if (fb) topDisplayName = fb;
        }
        return {
          ok: true,
          board,
          period: responsePeriod,
          page,
          perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / perPage)),
          stats: {
            rankedUsers: total,
            membersApprox,
            topDisplayName,
            topPlayerUsername: topDisplayName,
            topLevel: null,
            topWeeklyExp: rankBoard === "level" ? topWeeklyExp : null,
            topMessagesTotal: rankBoard === "messages" ? topMessagesTotal : null,
            topVoiceSeconds: rankBoard === "voice" ? topVoiceSeconds : null,
            topMinigameTotal: null,
            globalExpMultiplier: needsWeeklyMult ? globalExpMultiplier : null,
          },
          rows,
        };
      }, LIST_CACHE_TTL_MS, { force: forceRebuild });
      const hourlyMeta = cacheLookupMeta(cacheKey, LIST_STALE_KEEP_MS);
      const hourlyStale = Boolean(hourlyMeta.stale) && !forceRebuild;
      return replyUsers(
        req,
        res,
        payload,
        hourlyStale ? listCcStale : listCcFresh,
        {
          "X-VC-Perf": perfTier,
          ...(hourlyStale ? { "X-VC-Users-Stale": "1" } : {}),
        },
      );
    }

    const filter = boardQuery(rankBoard, guildId, rankPeriod);
    const sort = boardSort(rankBoard, rankPeriod);
    const select = boardSelect();

    const payload = await cacheGetOrBuild(cacheKey, async () => {
    let total = 0;
    let docs = [];
    let topDoc = null;
    if (rankBoard === "messages" || rankBoard === "voice") {
      const sortExpr = numericSortExpr(rankBoard, rankPeriod);
      const agg = await ActivityUserProfile.aggregate([
        { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
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
          .sort((sort as any))
          .skip(skip)
          .limit(perPage)
          .lean()
          .catch(() => []),
        ActivityUserProfile.findOne(filter).select(select).sort((sort as any)).lean().catch(() => null),
      ]);
    }

    let topDisplayName = "";
    let topLevel = 0;
    let topWeeklyExp = 0;
    let topMessagesTotal = 0;
    let topVoiceSeconds = 0;
    let topMinigameTotal = 0;

    if (topDoc) {
      const uid = String(topDoc.userId || "");
            if (uid) {
        const cachedId = identityFromCacheOnly(client, guild, uid);
        topDisplayName = String(cachedId.displayName || cachedId.username || "").trim();
      }
      if (rankBoard === "level" && rankPeriod === "alltime") {
        const te = nInt(topDoc.profile?.totals?.exp?.totalExp);
        const li = getLevelInfo(te);
        topLevel = Math.max(nInt(topDoc.profile?.totals?.exp?.level), li.level);
      } else if (rankBoard === "messages") {
        topMessagesTotal = nInt(
          topDoc.__sortVal ??
            (rankPeriod === "weekly"
              ? topDoc.profile?.totals?.messagesWeekly
              : topDoc.profile?.totals?.messagesTotal),
        );
      } else if (rankBoard === "voice") {
        topVoiceSeconds = nInt(
          topDoc.__sortVal ??
            (rankPeriod === "weekly"
              ? topDoc.profile?.totals?.voiceWeeklySeconds
              : topDoc.profile?.totals?.voiceTotalSeconds),
        );
      } else if (rankBoard === "minigames") {
        topMinigameTotal = nInt(
          rankPeriod === "weekly"
            ? topDoc.profile?.totals?.exp?.minigame?.weeklyExp
            : topDoc.profile?.totals?.exp?.minigame?.totalExp,
        );
      }
    }

    let pageMaxSecondary = 1;
    if (rankBoard === "messages") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(
          pageMaxSecondary,
          nInt(
            d.__sortVal ??
              (rankPeriod === "weekly" ? d.profile?.totals?.messagesWeekly : d.profile?.totals?.messagesTotal),
          ),
        );
      }
    } else if (rankBoard === "voice") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(
          pageMaxSecondary,
          nInt(
            d.__sortVal ??
              (rankPeriod === "weekly"
                ? d.profile?.totals?.voiceWeeklySeconds
                : d.profile?.totals?.voiceTotalSeconds),
          ),
        );
      }
    } else if (rankBoard === "minigames") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(
          pageMaxSecondary,
          nInt(
            rankPeriod === "weekly"
              ? d.profile?.totals?.exp?.minigame?.weeklyExp
              : d.profile?.totals?.exp?.minigame?.totalExp,
          ),
        );
      }
    }

    const identityMap = await resolveIdentitiesForList(
      client,
      guild,
      docs.map((d?) => d.userId).concat(topDoc ? [topDoc.userId] : []),
      lite,
      softIds,
    );
    const rows = await Promise.all(
      docs.map(async (d?, i?) => {
        const dayOvr =
          rankPeriod === "alltime" ? siteRomeDayOverridesFromDoc(d, rankBoard, romeDayKey) : {};
        const totalOvr =
          rankBoard === "messages"
            ? rankPeriod === "weekly"
              ? { messagesWeekly: nInt(d.__sortVal ?? d.profile?.totals?.messagesWeekly) }
              : { messagesTotal: nInt(d.__sortVal ?? d.profile?.totals?.messagesTotal) }
            : rankBoard === "voice"
              ? rankPeriod === "weekly"
                ? { voiceWeeklySeconds: nInt(d.__sortVal ?? d.profile?.totals?.voiceWeeklySeconds) }
                : { voiceTotalSeconds: nInt(d.__sortVal ?? d.profile?.totals?.voiceTotalSeconds) }
              : {};
        return buildRowFromDoc(
          client,
          guild,
          rowBoard,
          d,
          skip + i + 1,
          pageMaxSecondary,
          1,
          { ...totalOvr, ...dayOvr },
          null,
          identityMap.get(String(d.userId || "")),
          rankPeriod,
        );
      }),
    );

    if (!String(topDisplayName || "").trim() && rows.length && skip === 0) {
      const fb = String(rows[0].displayName || rows[0].username || "").trim();
      if (fb) topDisplayName = fb;
    }

    return {
      ok: true,
      board,
      period: responsePeriod,
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      stats: {
        rankedUsers: total,
        membersApprox,
        topDisplayName,
        topPlayerUsername: topDisplayName,
        topLevel: rankBoard === "level" && rankPeriod === "alltime" ? topLevel : null,
        topWeeklyExp: topWeeklyExp || null,
        topMessagesTotal: rankBoard === "messages" ? topMessagesTotal : null,
        topVoiceSeconds: rankBoard === "voice" ? topVoiceSeconds : null,
        topMinigameTotal: rankBoard === "minigames" ? topMinigameTotal : null,
        globalExpMultiplier: null,
        siteRomeCalendarDay: rankBoard === "messages" || rankBoard === "voice" ? romeDayKey : null,
      },
      rows,
    };
    }, LIST_CACHE_TTL_MS, { force: forceRebuild });
    const outMeta = cacheLookupMeta(cacheKey, LIST_STALE_KEEP_MS);
    const outStale = Boolean(outMeta.stale) && !forceRebuild;
    return replyUsers(req, res, payload, outStale ? listCcStale : listCcFresh, {
      "X-VC-Perf": perfTier,
      ...(outStale ? { "X-VC-Users-Stale": "1" } : {}),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-users:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function warmOneUsersQuery(client?, query?, opts?) {
  const req = {
    query: query || {},
    headers: {},
    __vcForceUsersRebuild: Boolean(opts?.force),
  };
  const res = {
    setHeader() {},
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  await handleSiteUsersLeaderboardGet(client, req, res);
}

/* siteApiW4 + siteUsersSwr1 + apiWarmSwr2: lite/mid/full first pages */
async function warmSiteUsersLeaderboardCache(client?) {
  const jobs = [
    { board: "level", period: "alltime", page: "1", perPage: "9", perf: "lite" },
    { board: "level", period: "weekly", page: "1", perPage: "9", perf: "lite" },
    { board: "level", period: "alltime", page: "1", perPage: "12" },
    { board: "level", period: "weekly", page: "1", perPage: "12" },
    { board: "level", period: "monthly", page: "1", perPage: "12" },
    { board: "level", period: "alltime", page: "1", perPage: "24" },
    { board: "messages", period: "alltime", page: "1", perPage: "12" },
    { board: "messages", period: "weekly", page: "1", perPage: "12" },
  ];
  for (const query of jobs) {
    try {
      await warmOneUsersQuery(client, query, { force: true });
    } catch (err) {
      global.logger?.warn?.("[WEBHOOK] site-users warm:", query.board, query.period, err?.message || err);
    }
  }
}

/** leaveProfileLive1: drop cached community profile for a user (after guild leave). */
function invalidateProfileCacheForUser(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  let n = 0;
  const exact = gid ? `profile:v${PROFILE_CACHE_VER}:${gid}:${uid}` : "";
  if (exact && listCache.delete(exact)) n += 1;
  const suffix = `:${uid}`;
  for (const key of listCache.keys()) {
    if (!String(key).startsWith("profile:v")) continue;
    if (exact && key === exact) continue;
    if (String(key).endsWith(suffix)) {
      listCache.delete(key);
      n += 1;
    }
  }
  return n;
}

export = {
  handleSiteUsersLeaderboardGet,
  buildCustomProfileData,
  warmSiteUsersLeaderboardCache,
  invalidateProfileCacheForUser,
};