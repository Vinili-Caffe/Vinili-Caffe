const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { ActivityUserProfile } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { housePointPeriodKey, getPeriodBounds, housePointPeriodKeyForClose } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const { loadSortedHouseByUserId } = require("./weeklyActivityWinnersService") as typeof import("./weeklyActivityWinnersService");
const {
  buildRoundsFromMessages,
  fetchChannelMessagesSince,
  parsePodiumSummaryLegacy,
  parseSingleWinnerLegacy,
  parseUnsortedCloseLegacy,
  collectPodiumWinnersFromReactions,
  roundNeedsReactionScan,
  isPodiumSummaryMessage,
  isSingleWinnerMessage,
  isUnsortedCloseMessage,
  podiumPointsForRound,
  roundUsesBonusMultiplier,
} = require("./hogwartsMinigameHousePointsBackfillService") as typeof import("./hogwartsMinigameHousePointsBackfillService");

const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const BIWEEKLY_PUBLISH_DOC = "hogwarts_biweekly_top_publish";
const BIWEEKLY_PUBLISH_OWNER_ID = "__event__";
const BIWEEKLY_POINTS_BY_RANK = [300, 200, 100];
const BIWEEKLY_REWARD_RE = /^hogwarts_biweekly_([^_]+)_(.+)_(messages|voice|minigames)_r(\d)$/;

function emptyMemberMap() {
  return {};
}

function addMemberAward(map, { userId, houseId, periodKey, points }) {
  const uid = String(userId || "").trim();
  const hid = String(houseId || "").trim();
  const pk = String(periodKey || "").trim();
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  if (!uid || !hid || !pk || pts <= 0) return;
  if (!map[uid]) map[uid] = { houseId: hid, byPeriod: {}, total: 0 };
  map[uid].houseId = hid;
  map[uid].byPeriod[pk] = (map[uid].byPeriod[pk] || 0) + pts;
  map[uid].total = (map[uid].total || 0) + pts;
}

function mergeMemberMaps(...maps) {
  const out = emptyMemberMap();
  for (const map of maps) {
    if (!map || typeof map !== "object") continue;
    for (const [uid, row] of Object.entries(map)) {
      const hid = String(row?.houseId || "").trim();
      const byPeriod = row?.byPeriod && typeof row.byPeriod === "object" ? row.byPeriod : {};
      for (const [pk, ptsRaw] of Object.entries(byPeriod)) {
        addMemberAward(out, { userId: uid, houseId: hid, periodKey: pk, points: ptsRaw });
      }
    }
  }
  return out;
}

async function buildMemberAwardsFromRound(round?, cfg?, sortedHouseByUserId?, botId?, options: Record<string, any> = {}) {
  const close = round?.closeMessage;
  if (!close) return [];
  const periodKey = String(housePointPeriodKey(round.closeMs || round.startMs)?.key || "").trim();
  if (!periodKey) return [];
  const awards = [];
  const push = (userId?, houseId?, points?) => {
    const uid = String(userId || "").trim();
    const hid = String(houseId || sortedHouseByUserId.get(uid) || "").trim();
    const pts = Math.max(0, Math.floor(Number(points) || 0));
    if (!uid || !hid || pts <= 0) return;
    awards.push({ userId: uid, houseId: hid, periodKey, points: pts });
  };
  if (isUnsortedCloseMessage(close)) return awards;
  if (isPodiumSummaryMessage(close)) {
    const rows = parsePodiumSummaryLegacy(close);
    const usesBonus = roundUsesBonusMultiplier(round);
    for (const row of rows) {
      const placeIdx = Math.max(0, Math.min(2, Number(row.place || 1) - 1));
      const parsedPts = row.points > 0 && row.points <= 100 ? row.points : 0;
      const pts = parsedPts > 0 ? parsedPts : podiumPointsForRound(cfg, placeIdx, usesBonus);
      push(row.userId, row.houseId, pts);
    }
    return awards;
  }
  if (isSingleWinnerMessage(close)) {
    const legacy = parseSingleWinnerLegacy(close);
    if (!legacy || legacy.unsorted) return awards;
    let reactionWinners = [];
    if (!options.skipReactionScan && roundNeedsReactionScan(round) && botId) {
      reactionWinners = await collectPodiumWinnersFromReactions(round, botId, sortedHouseByUserId);
    }
    const winners = reactionWinners.length
      ? reactionWinners
      : [{ userId: legacy.userId, houseId: legacy.houseId || sortedHouseByUserId.get(legacy.userId) || "" }];
    const usesBonus = roundUsesBonusMultiplier(round);
    for (let i = 0; i < winners.length && i < 3; i += 1) {
      const row = winners[i];
      const base = podiumPointsForRound(cfg, i, usesBonus);
      const pts = i === 0 && legacy.points > 0 && !reactionWinners.length ? legacy.points : base;
      const mult = i === 0 ? (legacy.petMult || 1) : 1;
      push(row.userId, row.houseId, Math.floor(pts * Math.max(1, mult)));
    }
  }
  return awards;
}

function awardsToMemberMap(awards?) {
  const map = emptyMemberMap();
  for (const row of Array.isArray(awards) ? awards : []) {
    addMemberAward(map, row);
  }
  return map;
}

async function collectMemberAwardsFromMinigameChannel(client?, guildId?, eventKey?, sinceMs?, options: Record<string, any> = {}) {
  const minigameCfg = client?.config?.minigames || null;
  const { HOUSE_CHANNEL_MAP } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
  const channelIds = new Set();
  const mainChannel = String(options.channelId || minigameCfg?.channelId || IDs.channels?.chat || "").trim();
  if (mainChannel) channelIds.add(mainChannel);
  for (const chId of HOUSE_CHANNEL_MAP.keys()) {
    channelIds.add(String(chId));
  }
  if (!channelIds.size) return { awards: [], rounds: 0, channelIds: [] };
  const sortedHouseByUserId = await loadSortedHouseByUserId(guildId, eventKey);
  const botId = client.user?.id || options.botId || "";
  const allAwards = [];
  let totalRounds = 0;
  const scanned = [];
  const periodWindows = (options.periodKeys?.length
    ? getPeriodBounds().filter((row?) => options.periodKeys.includes(row.period.key))
    : getPeriodBounds()
  ).map((row?) => ({
    key: row.period.key,
    sinceMs: row.startMs,
    untilMs: row.endMs,
  })).filter((row?) => Number.isFinite(row.sinceMs) && Number.isFinite(row.untilMs));
  const fetchDelayMs = Number(options.fetchDelayMs ?? (options.skipReactionScan ? 0 : 350));
  for (const channelId of channelIds) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.messages?.fetch) continue;
    let channelMessages = 0;
    let channelRounds = 0;
    for (const window of periodWindows) {
      if (options.logProgress !== false) {
        console.log("[member-hp-backfill] scan", channelId, window.key);
      }
      const messages = await fetchChannelMessagesSince(channel, window.sinceMs, {
        untilMs: window.untilMs,
        untilMsExclusive: true,
        fetchDelayMs,
        maxMessages: channelId === mainChannel ? 8000 : 0,
      });
      channelMessages += messages.length;
      const rounds = buildRoundsFromMessages(messages);
      channelRounds += rounds.length;
      for (const round of rounds) {
        if (!round.closeMessage) continue;
        const roundAwards = await buildMemberAwardsFromRound(round, minigameCfg, sortedHouseByUserId, botId, options);
        for (const award of roundAwards) {
          const dedupeKey = `${round.startId || round.closeMessage?.id || ""}:${award.userId}:${award.periodKey}`;
          if (!dedupeKey || options._seenAwardKeys?.has(dedupeKey)) continue;
          if (!options._seenAwardKeys) options._seenAwardKeys = new Set();
          options._seenAwardKeys.add(dedupeKey);
          allAwards.push(award);
        }
      }
    }
    totalRounds += channelRounds;
    scanned.push({ channelId, messages: channelMessages, rounds: channelRounds });
    if (options.logProgress !== false) {
      console.log("[member-hp-backfill] channel done", channelId, channelMessages, "msgs", channelRounds, "rounds");
    }
  }
  return { awards: allAwards, rounds: totalRounds, channelIds: [...channelIds], scanned };
}

function parseBiweeklyRewardKey(key?, eventKey?) {
  const m = String(key || "").trim().match(BIWEEKLY_REWARD_RE);
  if (!m) return null;
  const ek = String(m[1] || "").trim();
  if (ek && ek !== String(eventKey || "").trim()) return null;
  const biweekKey = String(m[2] || "").trim();
  const category = String(m[3] || "").trim();
  const rank = Math.max(1, Math.min(3, Math.floor(Number(m[4]) || 0)));
  const endPart = biweekKey.includes("_") ? biweekKey.split("_").pop() : biweekKey;
  const endRow = getPeriodBounds().find((row?) => row.period.end === endPart);
  const endMs = endRow?.endMs ?? null;
  const academicKey = endMs ? String(housePointPeriodKeyForClose(endMs)?.key || "").trim() : "";
  const points = BIWEEKLY_POINTS_BY_RANK[rank - 1] || 0;
  if (!academicKey || points <= 0) return null;
  return { biweekKey, category, rank, periodKey: academicKey, points };
}

async function collectMemberAwardsFromBiweeklyProfiles(guildId?, eventKey?) {
  const gid = String(guildId || "").trim();
  const ek = String(eventKey || "").trim();
  if (!gid || !ek) return [];
  const docs = await ActivityUserProfile.find({
    guildId: gid,
    "profile.events.hogwarts.gringott.rewardKeys": { $regex: `^hogwarts_biweekly_${ek}_` },
  })
    .select("userId profile.events.hogwarts.gringott.rewardKeys")
    .lean()
    .catch(() => []);
  const sortedHouseByUserId = await loadSortedHouseByUserId(gid, ek);
  const awards = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const uid = String(doc?.userId || "").trim();
    const keys = doc?.profile?.events?.hogwarts?.gringott?.rewardKeys;
    if (!uid || !Array.isArray(keys)) continue;
    const houseId = sortedHouseByUserId.get(uid) || "";
    if (!houseId) continue;
    for (const key of keys) {
      const parsed = parseBiweeklyRewardKey(key, ek);
      if (!parsed) continue;
      awards.push({
        userId: uid,
        houseId,
        periodKey: parsed.periodKey,
        points: parsed.points,
        source: `biweekly:${parsed.category}:r${parsed.rank}`,
      });
    }
  }
  return awards;
}

async function collectMemberAwardsFromBiweeklyPublishDocs(guildId?, eventKey?) {
  const gid = String(guildId || "").trim();
  const ek = String(eventKey || "").trim();
  if (!gid || !ek) return [];
  const docs = await SiteDocument.find({
    docType: BIWEEKLY_PUBLISH_DOC,
    guildId: gid,
    userId: BIWEEKLY_PUBLISH_OWNER_ID,
    status: "completed",
    "rawWebhook.eventKey": ek,
  })
    .select("rawWebhook.periodEndMs rawWebhook.stats")
    .lean()
    .catch(() => []);
  const sortedHouseByUserId = await loadSortedHouseByUserId(gid, ek);
  const awards = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const endMs = Number(doc?.rawWebhook?.periodEndMs);
    const periodKey = Number.isFinite(endMs)
      ? String(housePointPeriodKeyForClose(endMs)?.key || "").trim()
      : "";
    if (!periodKey) continue;
    const awardStats = doc?.rawWebhook?.stats?.awardStats;
    if (!awardStats || typeof awardStats !== "object") continue;
    for (const cat of ["messages", "voice", "minigames"]) {
      const rows = Array.isArray(awardStats[cat]) ? awardStats[cat] : [];
      for (const row of rows) {
        const uid = String(row?.userId || "").trim();
        const houseId = String(row?.houseId || sortedHouseByUserId.get(uid) || "").trim();
        const pts = Math.max(0, Math.floor(Number(row?.housePoints) || 0));
        if (!uid || !houseId || !pts || row?.skipped) continue;
        awards.push({ userId: uid, houseId, periodKey, points: pts, source: `biweekly_doc:${cat}` });
      }
    }
  }
  return awards;
}

function memberMapToDbPayload(map?) {
  const byMember: Record<string, any> = {};
  for (const [uid, row] of Object.entries(map || {})) {
    const hid = String(row?.houseId || "").trim();
    const byPeriod = row?.byPeriod && typeof row.byPeriod === "object" ? row.byPeriod : {};
    const total = Math.max(0, Math.floor(Number(row?.total) || 0));
    if (!hid) continue;
    byMember[uid] = {
      houseId: hid,
      total,
      byPeriod: Object.fromEntries(
        Object.entries(byPeriod).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))]).filter(([, v]) => (v as any) > 0),
      ),
    };
  }
  return byMember;
}

function sumMemberPeriodPoints(byPeriod?) {
  const row = byPeriod && typeof byPeriod === "object" ? byPeriod : {};
  let sum = 0;
  for (const pts of Object.values(row)) {
    sum += Math.max(0, Math.floor(Number(pts) || 0));
  }
  return sum;
}

function mergeMemberPointsRow(existing?, rebuilt?) {
  if (!existing) return rebuilt;
  if (!rebuilt) return existing;
  const houseId = String(rebuilt.houseId || existing.houseId || "").trim();
  const byPeriod = { ...(existing.byPeriod && typeof existing.byPeriod === "object" ? existing.byPeriod : {}) };
  for (const [pk, ptsRaw] of Object.entries(rebuilt.byPeriod && typeof rebuilt.byPeriod === "object" ? rebuilt.byPeriod : {})) {
    const pkKey = String(pk || "").trim();
    if (!pkKey) continue;
    const prev = Math.max(0, Math.floor(Number(byPeriod[pkKey]) || 0));
    const next = Math.max(0, Math.floor(Number(ptsRaw) || 0));
    byPeriod[pkKey] = Math.max(prev, next);
  }
  const periodSum = sumMemberPeriodPoints(byPeriod);
  const total = Math.max(
    periodSum,
    Math.max(0, Math.floor(Number(existing.total) || 0)),
    Math.max(0, Math.floor(Number(rebuilt.total) || 0)),
  );
  return { houseId, byPeriod, total };
}

function mergeMemberPointsPayload(rebuiltMap?, existingMap?) {
  const out = { ...(existingMap && typeof existingMap === "object" ? existingMap : {}) };
  for (const [uid, rebuiltRow] of Object.entries(rebuiltMap || {})) {
    const key = String(uid || "").trim();
    if (!key || !rebuiltRow) continue;
    out[key] = mergeMemberPointsRow(out[key], rebuiltRow);
  }
  return out;
}

async function applyMemberHousePointsBackfill(guildId?, eventKey?, memberMap?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const ek = String(eventKey || "").trim();
  if (!gid || !ek) return { ok: false, code: "bad_input" };
  const rebuiltByMember = memberMapToDbPayload(memberMap);
  const memberCount = Object.keys(rebuiltByMember).length;
  if (!memberCount && !options.allowEmpty) return { ok: false, code: "empty", memberCount: 0 };
  const existingDoc = await SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: gid,
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: ek,
  })
    .select("rawWebhook.byMember")
    .lean()
    .catch(() => null);
  const existingByMember = existingDoc?.rawWebhook?.byMember && typeof existingDoc.rawWebhook.byMember === "object"
    ? existingDoc.rawWebhook.byMember
    : {};
  const byMember = mergeMemberPointsPayload(rebuiltByMember, existingByMember);
  const now = new Date();
  await SiteDocument.findOneAndUpdate(
    {
      docType: HOUSE_POINTS_DOC,
      guildId: gid,
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: ek,
    },
    {
      $setOnInsert: {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: ek,
        createdBy: "member_house_points_backfill",
        status: "active",
        planKey: "hogwarts_house_points",
      },
      $set: {
        "rawWebhook.eventKey": ek,
        "rawWebhook.updatedAt": now,
        "rawWebhook.byMember": byMember,
        "rawWebhook.memberPointsBackfill.at": now.toISOString(),
        "rawWebhook.memberPointsBackfill.memberCount": Object.keys(byMember).length,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return { ok: true, memberCount: Object.keys(byMember).length };
}

async function rebuildMemberHousePointsMap(client?, options: Record<string, any> = {}) {
  const cfg = resolveHogwartsEventConfig(client);
  const eventKey = String(cfg?.eventKey || options.eventKey || "").trim();
  const guildId = String(options.guildId || IDs.guilds?.main || "").trim();
  if (!client || !guildId || !eventKey) return { ok: false, code: "missing_config" };
  const firstPeriodStart = getPeriodBounds()[0]?.startMs ?? null;
  const eventStartMs = Number(cfg?.sortingStartMs ?? cfg?.startMs);
  const sinceMs = Number.isFinite(firstPeriodStart)
    ? firstPeriodStart
    : Number.isFinite(eventStartMs)
      ? eventStartMs
      : null;
  if (!Number.isFinite(sinceMs)) return { ok: false, code: "no_since" };
  const [minigame, biweeklyProfiles, biweeklyDocs] = await Promise.all([
    collectMemberAwardsFromMinigameChannel(client, guildId, eventKey, sinceMs, options),
    collectMemberAwardsFromBiweeklyProfiles(guildId, eventKey),
    collectMemberAwardsFromBiweeklyPublishDocs(guildId, eventKey),
  ]);
  const merged = mergeMemberMaps(
    awardsToMemberMap(minigame.awards),
    awardsToMemberMap(biweeklyProfiles),
    awardsToMemberMap(biweeklyDocs),
  );
  return {
    ok: true,
    guildId,
    eventKey,
    sinceMs,
    stats: {
      minigameRounds: minigame.rounds,
      minigameAwards: minigame.awards.length,
      minigameChannels: minigame.scanned || [],
      biweeklyProfileAwards: biweeklyProfiles.length,
      biweeklyDocAwards: biweeklyDocs.length,
      members: Object.keys(merged).length,
    },
    memberMap: merged,
  };
}

export = {
  addMemberAward,
  mergeMemberMaps,
  awardsToMemberMap,
  memberMapToDbPayload,
  mergeMemberPointsPayload,
  mergeMemberPointsRow,
  buildMemberAwardsFromRound,
  collectMemberAwardsFromMinigameChannel,
  collectMemberAwardsFromBiweeklyProfiles,
  collectMemberAwardsFromBiweeklyPublishDocs,
  rebuildMemberHousePointsMap,
  applyMemberHousePointsBackfill,
};