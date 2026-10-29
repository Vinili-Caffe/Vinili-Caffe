const cron = require("node-cron") as typeof import("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { resolveSortedHouseId } = require("../../Utils/Web/hogwartsSortingResolve") as typeof import("../../Utils/Web/hogwartsSortingResolve");
const { listPunticasaAllowedUserIds } = require("../../Utils/Community/punticasaPrefectAccess") as typeof import("../../Utils/Community/punticasaPrefectAccess");
const { ensureSortedMemberHouseRoles } = require("./hogwartsSortingRoleService") as typeof import("./hogwartsSortingRoleService");
const { getClientGuildCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const FINALE_PUBLISH_DOC = "hogwarts_finale_prizes";
const EVENT_OWNER_ID = "__event__";
const TIME_ZONE = "Europe/Rome";
const MEMBER_POINTS_THRESHOLD = 7000;
const REWARD_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const FINALE_REWARD_BASE = "profile.events.hogwarts.finaleRoleRewards";
const FINALE_HOUSE_PATH = `${FINALE_REWARD_BASE}.house`;
const FINALE_MEMBER_PATH = `${FINALE_REWARD_BASE}.memberTop`;
const MONTHLY_TOP_REWARD_PATH = "profile.totals.exp.monthlyTopReward";
const MONTHLY_VOTER_REWARD_PATH = "profile.totals.exp.monthlyVoteTopReward";

const HOUSE_PLACE_ROLE_IDS = Object.freeze([
  String(IDs.roles?.VIPplus || IDs.roles?.["VIP+"] || "").trim(),
  String(IDs.roles?.VIP || "").trim(),
  String(IDs.roles?.Donator || "").trim(),
]);
const MEMBER_TOP3_ROLE_ID = String(IDs.roles?.VIP || "").trim();

const loopState = new WeakSet();

function normalizeId(value?) {
  return String(value || "").trim();
}

function readHouseTotals(pointsDoc?) {
  const totals = pointsDoc?.rawWebhook?.totals && typeof pointsDoc.rawWebhook.totals === "object"
    ? pointsDoc.rawWebhook.totals
    : {};
  const out: Record<string, any> = {};
  for (const id of HOUSES) out[id] = Math.max(0, Math.floor(Number(totals[id]) || 0));
  return out;
}

function rankHousesByTotals(totals?) {
  return HOUSES.map((houseId?) => ({ houseId, points: totals[houseId] || 0 })).sort((a?, b?) => {
    if (b.points !== a.points) return b.points - a.points;
    return HOUSES.indexOf(a.houseId) - HOUSES.indexOf(b.houseId);
  });
}

function readMemberPointsRows(pointsDoc?) {
  const byMember = pointsDoc?.rawWebhook?.byMember && typeof pointsDoc.rawWebhook.byMember === "object"
    ? pointsDoc.rawWebhook.byMember
    : {};
  const rows = [];
  for (const [userId, row] of Object.entries(byMember)) {
    const uid = normalizeId(userId);
    if (!uid) continue;
    rows.push({
      userId: uid,
      houseId: normalizeId(row?.houseId).toLowerCase(),
      totalPoints: Math.max(0, Math.floor(Number(row?.total) || 0)),
    });
  }
  rows.sort((a?, b?) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.userId.localeCompare(b.userId);
  });
  return rows;
}

function rewardExpiresMs(reward?) {
  return Number(new Date(reward?.expiresAt || 0).getTime() || 0);
}

function hasActiveTimedRewardOnRole(reward?, roleId?, nowMs?) {
  const role = normalizeId(roleId);
  if (!role || normalizeId(reward?.roleId) !== role) return false;
  return rewardExpiresMs(reward) > nowMs;
}

function hasActiveMonthlyTopRewardOnRole(profileDoc?, roleId?, nowMs = Date.now()) {
  return hasActiveTimedRewardOnRole(profileDoc?.profile?.totals?.exp?.monthlyTopReward, roleId, nowMs);
}

function hasActiveMonthlyVoterRewardOnRole(profileDoc?, roleId?, nowMs = Date.now()) {
  return hasActiveTimedRewardOnRole(profileDoc?.profile?.totals?.exp?.monthlyVoteTopReward, roleId, nowMs);
}

function readFinaleRewards(profileDoc?) {
  const bag = profileDoc?.profile?.events?.hogwarts?.finaleRoleRewards;
  return bag && typeof bag === "object" ? bag : {};
}

function hasActiveHogwartsFinaleRewardOnRole(profileDoc?, roleId?, nowMs = Date.now()) {
  const bag = readFinaleRewards(profileDoc);
  return (
    hasActiveTimedRewardOnRole(bag.house, roleId, nowMs) ||
    hasActiveTimedRewardOnRole(bag.memberTop, roleId, nowMs)
  );
}

function shouldKeepRoleFromOtherRewards(profileDoc?, roleId?, nowMs?, skipSlot = "") {
  if (hasActiveMonthlyTopRewardOnRole(profileDoc, roleId, nowMs)) return true;
  if (hasActiveMonthlyVoterRewardOnRole(profileDoc, roleId, nowMs)) return true;
  const bag = readFinaleRewards(profileDoc);
  if (skipSlot !== "house" && hasActiveTimedRewardOnRole(bag.house, roleId, nowMs)) return true;
  if (skipSlot !== "memberTop" && hasActiveTimedRewardOnRole(bag.memberTop, roleId, nowMs)) return true;
  return false;
}

async function maybeAssignHogwartsCompletionRoleOnJoin(client?, member?) {
  if (!member?.guild || member.user?.bot) return;
  const cfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(cfg.eventKey);
  const guildId = normalizeId(member.guild.id);
  if (!eventKey || guildId !== normalizeId(IDs.guilds?.main)) return;

  const sorted = await SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId,
    userId: normalizeId(member.id),
    dedupeKey: eventKey,
    status: { $in: HOUSES },
  })
    .select({ status: 1, houseId: 1, house: 1, rawWebhook: 1 })
    .lean()
    .catch(() => null);
  if (!sorted) return;

  const houseId = resolveSortedHouseId(sorted);
  if (!houseId) return;

  const result: any = await ensureSortedMemberHouseRoles(member, cfg, houseId);
  if (result.roleError) {
    global.logger?.warn?.("[HOGWARTS SORTING] join role repair:", member.id, result.roleError);
  }
}

async function loadHousePointsDoc(guildId?, eventKey?) {
  return SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: normalizeId(guildId),
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: normalizeId(eventKey),
  })
    .lean()
    .catch(() => null);
}

async function findFinalePublishMarker(guildId?, dedupeKey?) {
  return SiteDocument.findOne({
    docType: FINALE_PUBLISH_DOC,
    guildId: normalizeId(guildId),
    userId: EVENT_OWNER_ID,
    dedupeKey: normalizeId(dedupeKey),
  })
    .lean()
    .catch(() => null);
}

async function markFinalePublish(guildId?, dedupeKey?, summary?) {
  return SiteDocument.findOneAndUpdate(
    {
      docType: FINALE_PUBLISH_DOC,
      guildId: normalizeId(guildId),
      userId: EVENT_OWNER_ID,
      dedupeKey: normalizeId(dedupeKey),
    },
    {
      $setOnInsert: {
        docType: FINALE_PUBLISH_DOC,
        guildId: normalizeId(guildId),
        userId: EVENT_OWNER_ID,
        dedupeKey: normalizeId(dedupeKey),
        createdBy: "hogwarts_finale_prizes",
      },
      $set: {
        status: "completed",
        planKey: "hogwarts_finale_prizes",
        decidedAt: new Date(),
        "rawWebhook.summary": summary || {},
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function assignTimedFinaleRole(guild?, userId?, roleId?, slotPath?, meta: Record<string, any> = {}) {
  const uid = normalizeId(userId);
  const rid = normalizeId(roleId);
  if (!uid || !rid) return { ok: false, reason: "missing_ids" };

  const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
  if (!member) return { ok: false, reason: "member_missing" };

  const hadRoleBefore = member.roles.cache.has(rid);
  if (!hadRoleBefore) {
    await member.roles.add(rid).catch(() => null);
  }

  const now = Date.now();
  await ActivityUserProfile.updateOne(
    { guildId: guild.id, userId: uid },
    {
      $set: {
        [`${slotPath}.roleId`]: rid,
        [`${slotPath}.awardedAt`]: new Date(now),
        [`${slotPath}.expiresAt`]: new Date(now + REWARD_DURATION_MS),
        [`${slotPath}.hadRoleBefore`]: hadRoleBefore,
        [`${slotPath}.kind`]: meta.kind || "",
        [`${slotPath}.rank`]: Number(meta.rank) || 0,
        [`${slotPath}.houseId`]: normalizeId(meta.houseId),
        [`${slotPath}.points`]: Math.max(0, Math.floor(Number(meta.points) || 0)),
        [`${slotPath}.eventKey`]: normalizeId(meta.eventKey),
      },
    },
    { upsert: true },
  ).catch(() => null);

  return { ok: true, hadRoleBefore, skippedAdd: hadRoleBefore };
}

async function cleanupExpiredFinaleSlot(guild?, row?, slotKey?, nowMs?) {
  const userId = normalizeId(row?.userId);
  const bag = readFinaleRewards(row);
  const reward = slotKey === "house" ? bag.house : bag.memberTop;
  const roleId = normalizeId(reward?.roleId);
  const path = slotKey === "house" ? FINALE_HOUSE_PATH : FINALE_MEMBER_PATH;
  if (!userId || !roleId) {
    if (userId) {
      await ActivityUserProfile.updateOne(
        { guildId: guild.id, userId },
        { $unset: { [path]: "" } },
      ).catch(() => null);
    }
    return;
  }
  if (rewardExpiresMs(reward) > nowMs) return;

  const hadRoleBefore = Boolean(reward?.hadRoleBefore);
  const keep = shouldKeepRoleFromOtherRewards(row, roleId, nowMs, slotKey);
  if (!hadRoleBefore && !keep) {
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (member?.roles?.cache?.has(roleId)) {
      await member.roles.remove(roleId).catch(() => null);
    }
  }
  await ActivityUserProfile.updateOne(
    { guildId: guild.id, userId },
    { $unset: { [path]: "" } },
  ).catch(() => null);
}

async function cleanupExpiredHogwartsFinaleRewards(guild?) {
  if (!guild?.id) return;
  const now = new Date();
  const nowMs = Date.now();
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    $or: [
      { [`${FINALE_HOUSE_PATH}.expiresAt`]: { $lte: now } },
      { [`${FINALE_MEMBER_PATH}.expiresAt`]: { $lte: now } },
    ],
  })
    .select(`userId ${FINALE_REWARD_BASE} ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
    .lean()
    .catch(() => []);

  for (const row of rows) {
    const bag = readFinaleRewards(row);
    if (bag.house && rewardExpiresMs(bag.house) <= nowMs) {
      await cleanupExpiredFinaleSlot(guild, row, "house", nowMs);
    }
    if (bag.memberTop && rewardExpiresMs(bag.memberTop) <= nowMs) {
      const refreshed = await ActivityUserProfile.findOne({ guildId: guild.id, userId: row.userId })
        .select(`userId ${FINALE_REWARD_BASE} ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
        .lean()
        .catch(() => row);
      await cleanupExpiredFinaleSlot(guild, refreshed || row, "memberTop", nowMs);
    }
  }
}

async function resolveMainGuild(client?) {
  const mainGuildId = normalizeId(IDs.guilds?.main);
  if (!mainGuildId) return null;
  return (
    client.guilds.cache.get(mainGuildId) ||
    (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null))
  );
}

async function awardHogwartsFinalePrizes(client?, options: Record<string, any> = {}) {
  const cfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(cfg.eventKey);
  const endMs = Number(cfg.endMs || 0);
  const winnerBonusRoleId = normalizeId(cfg.finaleWinnerHouseBonusRoleId);
  const nowMs = options.nowMs != null ? Number(options.nowMs) : Date.now();
  if (!cfg.enabled || !eventKey) {
    return { skipped: true, reason: "disabled" };
  }
  if (!options.force && (!Number.isFinite(endMs) || nowMs < endMs)) {
    return { skipped: true, reason: "event_not_ended" };
  }

  const guild = await resolveMainGuild(client);
  if (!guild) {
    global.logger?.error?.("[HOGWARTS FINALE PRIZES] Guild non trovata.");
    return { skipped: true, reason: "guild_missing" };
  }

  const dedupeKey = `${eventKey}_finale_prizes`;
  const existing = await findFinalePublishMarker(guild.id, dedupeKey);
  const priorSummary =
    existing?.rawWebhook?.summary && typeof existing.rawWebhook.summary === "object"
      ? existing.rawWebhook.summary
      : null;
  if (existing?.status === "completed" && !options.force) {
    if (priorSummary?.announceMessageId) {
      return { skipped: true, reason: "already_done" };
    }
    if (priorSummary?.houseRanking?.length) {
      try {
        const { publishHogwartsFinaleAnnounce } = require("./hogwartsEventFinaleAnnounce") as typeof import("./hogwartsEventFinaleAnnounce");
        const announce = await publishHogwartsFinaleAnnounce(client, guild, priorSummary, options);
        if (announce?.ok) {
          priorSummary.announceChannelId = announce.channelId;
          priorSummary.announceMessageId = announce.messageId;
          priorSummary.announceMessageIds = announce.messageIds;
          await markFinalePublish(guild.id, dedupeKey, priorSummary);
        } else if (announce?.reason && announce.reason !== "already_posted") {
          global.logger?.warn?.("[HOGWARTS FINALE PRIZES] announce retry:", announce.reason);
        }
      } catch (errAnn) {
        global.logger?.warn?.("[HOGWARTS FINALE PRIZES] announce retry failed:", errAnn?.message || errAnn);
      }
      return { skipped: false, summary: priorSummary, announceOnly: true };
    }
    return { skipped: true, reason: "already_done" };
  }

  const pointsDoc = await loadHousePointsDoc(guild.id, eventKey);
  if (!pointsDoc) {
    global.logger?.warn?.("[HOGWARTS FINALE PRIZES] Documento punti assente.");
    return { skipped: true, reason: "points_missing" };
  }

  const totals = readHouseTotals(pointsDoc);
  const rankedHouses = rankHousesByTotals(totals);
  const memberRows = readMemberPointsRows(pointsDoc);
  const prefectIds = new Set(listPunticasaAllowedUserIds(client).map((id?) => normalizeId(id)));

  const housePlaceById = new Map();
  rankedHouses.forEach((row?, index?) => {
    if (index < 3) housePlaceById.set(row.houseId, index);
  });

  const summary: Record<string, any> = {
    eventKey,
    awardedAt: new Date(nowMs).toISOString(),
    houseRanking: rankedHouses,
    houseAwards: [],
    winnerHouseBonusAwards: [],
    memberTop: [],
    memberTopAward: null,
  };

  for (const row of memberRows) {
    if (row.totalPoints < MEMBER_POINTS_THRESHOLD) continue;
    const placeIndex = housePlaceById.get(row.houseId);
    if (placeIndex == null) continue;
    const roleId = HOUSE_PLACE_ROLE_IDS[placeIndex];
    if (!roleId) continue;
    const result = await assignTimedFinaleRole(guild, row.userId, roleId, FINALE_HOUSE_PATH, {
      kind: "house_place",
      rank: placeIndex + 1,
      houseId: row.houseId,
      points: row.totalPoints,
      eventKey,
    });
    summary.houseAwards.push({
      userId: row.userId,
      houseId: row.houseId,
      place: placeIndex + 1,
      points: row.totalPoints,
      roleId,
      ok: Boolean(result?.ok),
      hadRoleBefore: Boolean(result?.hadRoleBefore),
      reason: result?.reason || null,
    });

    if (placeIndex === 0 && winnerBonusRoleId) {
      const member = await getGuildMemberCached(guild, row.userId, { preferFresh: true }).catch(() => null);
      let bonusOk = false;
      let bonusHadRole = false;
      if (member) {
        bonusHadRole = member.roles.cache.has(winnerBonusRoleId);
        if (!bonusHadRole) {
          bonusOk = Boolean(await member.roles.add(winnerBonusRoleId).then(() => true).catch(() => false));
        } else {
          bonusOk = true;
        }
      }
      summary.winnerHouseBonusAwards.push({
        userId: row.userId,
        houseId: row.houseId,
        points: row.totalPoints,
        roleId: winnerBonusRoleId,
        ok: bonusOk,
        hadRoleBefore: bonusHadRole,
      });
    }
  }

  const topEligible = [];
  for (const row of memberRows) {
    if (prefectIds.has(row.userId)) continue;
    topEligible.push(row);
    if (topEligible.length >= 3) break;
  }
  summary.memberTop = topEligible.map((row?, index?) => ({
    userId: row.userId,
    houseId: row.houseId,
    points: row.totalPoints,
    place: index + 1,
    autoAward: index === 2,
  }));

  const third = topEligible[2];
  if (third && MEMBER_TOP3_ROLE_ID) {
    const result = await assignTimedFinaleRole(guild, third.userId, MEMBER_TOP3_ROLE_ID, FINALE_MEMBER_PATH, {
      kind: "member_top3",
      rank: 3,
      houseId: third.houseId,
      points: third.totalPoints,
      eventKey,
    });
    summary.memberTopAward = {
      userId: third.userId,
      houseId: third.houseId,
      points: third.totalPoints,
      roleId: MEMBER_TOP3_ROLE_ID,
      ok: Boolean(result?.ok),
      hadRoleBefore: Boolean(result?.hadRoleBefore),
      reason: result?.reason || null,
    };
  }

  await markFinalePublish(guild.id, dedupeKey, summary);

  try {
    const { publishHogwartsFinaleAnnounce } = require("./hogwartsEventFinaleAnnounce") as typeof import("./hogwartsEventFinaleAnnounce");
    const announce = await publishHogwartsFinaleAnnounce(client, guild, summary, options);
    if (announce?.ok) {
      summary.announceChannelId = announce.channelId;
      summary.announceMessageId = announce.messageId;
      summary.announceMessageIds = announce.messageIds;
      await markFinalePublish(guild.id, dedupeKey, summary);
    } else if (announce?.reason && announce.reason !== "already_posted") {
      global.logger?.warn?.("[HOGWARTS FINALE PRIZES] announce:", announce.reason);
    }
  } catch (errAnn) {
    global.logger?.warn?.("[HOGWARTS FINALE PRIZES] announce failed:", errAnn?.message || errAnn);
  }

  global.logger?.info?.(
    `[HOGWARTS FINALE PRIZES] Assegnati house=${summary.houseAwards.filter((a?) => a.ok).length}/${summary.houseAwards.length} winnerBonus=${summary.winnerHouseBonusAwards.filter((a?) => a.ok).length}/${summary.winnerHouseBonusAwards.length} memberTop3=${summary.memberTopAward?.ok ? 1 : 0}`,
  );
  return { skipped: false, summary };
}

async function runHogwartsEventCompletionSweep(client?, options: Record<string, any> = {}) {
  const guild = await resolveMainGuild(client);
  if (guild) {
    await cleanupExpiredHogwartsFinaleRewards(guild).catch((err?) => {
      global.logger?.warn?.("[HOGWARTS FINALE PRIZES] cleanup:", err?.message || err);
    });
  }
  const prizes: any = await awardHogwartsFinalePrizes(client, options);
  try {
    const { maybeWipeHogwartsEventDataAfterFinale } = require("./hogwartsEventWipeService") as typeof import("./hogwartsEventWipeService");
    const wipe = await maybeWipeHogwartsEventDataAfterFinale(client, {
      force: Boolean(options.forceWipe),
      nowMs: options.nowMs,
    });
    if (wipe && !wipe.skipped) {
      prizes.wipe = wipe.summary || wipe;
    } else if (wipe?.reason) {
      prizes.wipeSkipped = wipe.reason;
    }
  } catch (errWipe) {
    global.logger?.error?.("[HOGWARTS EVENT WIPE] sweep:", errWipe?.message || errWipe);
  }
  return prizes;
}

function startHogwartsEventEndLoop(client?) {
  /* Keep finale VIP/role cleanup alive even after event runtime kill-switch */
  if (!client || loopState.has(client)) return;
  loopState.add(client);

  const tick = async () => {
    const guild = await resolveMainGuild(client);
    if (guild) {
      await cleanupExpiredHogwartsFinaleRewards(guild).catch((err?) => {
        global.logger?.warn?.("[HOGWARTS FINALE PRIZES] cleanup:", err?.message || err);
      });
    }
    /* Re-award/wipe only if still needed; wipe disabled by default after retirement */
    await awardHogwartsFinalePrizes(client).catch((err?) => {
      global.logger?.error?.("[HOGWARTS FINALE PRIZES] award:", err?.message || err);
    });
  };

  cron.schedule(
    "*/15 * * * *",
    runCronDetached("[HOGWARTS FINALE PRIZES]", tick),
    { timezone: TIME_ZONE, noOverlap: true },
  );

  setTimeout(() => {
    tick().catch(() => null);
  }, 20_000).unref?.();
}

export = {
  maybeAssignHogwartsCompletionRoleOnJoin,
  runHogwartsEventCompletionSweep,
  startHogwartsEventEndLoop,
  awardHogwartsFinalePrizes,
  cleanupExpiredHogwartsFinaleRewards,
  hasActiveHogwartsFinaleRewardOnRole,
  MEMBER_POINTS_THRESHOLD,
  FINALE_HOUSE_PATH,
  FINALE_MEMBER_PATH,
  wipeHogwartsEventData: (...args) => require("./hogwartsEventWipeService").wipeHogwartsEventData(...args),
};
