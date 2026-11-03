const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { housePointPeriodKey, resolvePeriodBounds } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const { HOUSES, getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { loadSortedHouseByUserId } = require("./weeklyActivityWinnersService") as typeof import("./weeklyActivityWinnersService");

const HOUSE_POINTS_OWNER_ID = "__event__";
const WIN_REACTION_EMOJI_ID = "1482706144953897223";
const HOGWARTS_PODIUM_POINTS = [10, 9, 8];
const HOGWARTS_PODIUM_BONUS_HALF_BASE_POINTS = [10, 8, 6];
const NEW_UNSORTED_POINTS = 25;
const LEGACY_UNSORTED_POINTS = 5;
const BONUS_HOUSE_POINTS_MULT_DEFAULT = 0.5;
const BACKFILL_GAME_KEY = "minigameBackfill";
const FETCH_DELAY_MS = 350;
const REACTION_FETCH_DELAY_MS = 250;

const HOUSE_LABEL_TO_ID = Object.freeze(
  HOUSES.reduce((acc?, id?) => {
    const meta = getHouseMeta(id);
    if (meta?.label) acc[String(meta.label).trim().toLowerCase()] = id;
    acc[String(id).trim().toLowerCase()] = id;
    return acc;
  }, {}),
);

const GAME_START_TITLE_RE = /Indovina|Scrivi|Hangman|Capitale|capoluogo|Hogwarts|Memory|Cifrario|Torre|Quiz|Caccia|Matematica|Proverbio|Sinonimo|Emoji|Film|Verse|Anno|Bot\b/i;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function snowflakeFromMs(ms?) {
  const n = BigInt(Math.max(0, Math.floor(Number(ms) || 0)));
  return ((n - 1289430000000n) << 22n).toString();
}

function parseUserId(text?) {
  const m = String(text || "").match(/<@!?(\d{17,20})>/);
  return m ? m[1] : "";
}

function parseHouseIdFromText(text?) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return "";
  for (const [label, id] of Object.entries(HOUSE_LABEL_TO_ID)) {
    if (raw.includes(label)) return id;
  }
  return "";
}

function parsePointsFromText(text?) {
  const raw = String(text || "");
  const casa = raw.match(/\+(\d+)\s*punti\s*casa/i);
  if (casa) {
    const n = Math.max(0, Math.floor(Number(casa[1]) || 0));
    return n > 0 && n <= 100 ? n : 0;
  }
  const m = raw.match(/\+(\d+)\s*punti/i);
  if (!m) return 0;
  const n = Math.max(0, Math.floor(Number(m[1]) || 0));
  return n > 0 && n <= 100 ? n : 0;
}

function parsePetMultiplier(text?) {
  const m = String(text || "").match(/×\s*(\d+(?:\.\d+)?)/);
  const n = Number(m?.[1]);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

function isGameStartMessage(msg?) {
  if (!msg?.author?.bot || !msg.embeds?.length) return false;
  const title = String(msg.embeds[0]?.title || msg.embeds[0]?.data?.title || "");
  return GAME_START_TITLE_RE.test(title);
}

function isPodiumSummaryMessage(msg?) {
  const title = String(msg.embeds?.[0]?.title || msg.embeds?.[0]?.data?.title || "");
  return /Podio Hogwarts|Classifica Hogwarts/i.test(title);
}

function isSingleWinnerMessage(msg?) {
  const title = String(msg.embeds?.[0]?.title || msg.embeds?.[0]?.data?.title || "");
  return /Un utente ha vinto/i.test(title);
}

function isUnsortedCloseMessage(msg?) {
  const title = String(msg.embeds?.[0]?.title || msg.embeds?.[0]?.data?.title || "");
  const desc = String(msg.embeds?.[0]?.description || msg.embeds?.[0]?.data?.description || "");
  return /Minigame Hogwarts concluso/i.test(title) && /senza essere smistato/i.test(desc);
}

function isRoundCloseMessage(msg?) {
  return isPodiumSummaryMessage(msg) || isSingleWinnerMessage(msg) || isUnsortedCloseMessage(msg);
}

function applyBonusMultiplier(cfg?, points?) {
  const mult = Number(cfg?.hogwartsEventBonusHousePointsMultiplier ?? BONUS_HOUSE_POINTS_MULT_DEFAULT);
  const factor = Number.isFinite(mult) ? mult : BONUS_HOUSE_POINTS_MULT_DEFAULT;
  return Math.max(0, Math.floor(points * factor));
}

function podiumBasePoints(placeIndex?, usesBonus = false) {
  const table = usesBonus ? HOGWARTS_PODIUM_BONUS_HALF_BASE_POINTS : HOGWARTS_PODIUM_POINTS;
  return Math.max(0, Math.floor(Number(table[placeIndex]) || 0));
}

function roundUsesBonusMultiplier(round?) {
  const title = String(round?.startMessage?.embeds?.[0]?.title || round?.startMessage?.embeds?.[0]?.data?.title || "");
  if (/Hogwarts|Scroll|Memory|Cifrario|Torre/i.test(title)) return false;
  return true;
}

function podiumPointsForRound(cfg?, placeIndex?, usesBonus?) {
  const base = podiumBasePoints(placeIndex, usesBonus);
  return usesBonus ? applyBonusMultiplier(cfg, base) : base;
}

function buildRoundsFromMessages(messages?) {
  const rounds = [];
  let current = null;
  for (const msg of messages) {
    if (isGameStartMessage(msg)) {
      if (current) rounds.push(current);
      current = {
        startId: msg.id,
        startMs: msg.createdTimestamp,
        startMessage: msg,
        messages: [msg],
        closeMessage: null,
        closeMs: null,
      };
      continue;
    }
    if (!current) continue;
    current.messages.push(msg);
    if (isRoundCloseMessage(msg) && msg.author?.bot) {
      current.closeMessage = msg;
      current.closeMs = msg.createdTimestamp;
      rounds.push(current);
      current = null;
    }
  }
  if (current) rounds.push(current);
  return rounds;
}

function parsePodiumSummaryLegacy(msg?) {
  const desc = String(msg.embeds?.[0]?.description || msg.embeds?.[0]?.data?.description || "");
  const blocks = desc.split(/\n\n+/).filter((b?) => /<@/.test(b));
  const rows = [];
  for (const block of blocks) {
    const userId = parseUserId(block);
    if (!userId) continue;
    const houseId = parseHouseIdFromText(block);
    const points = parsePointsFromText(block);
    const placeEmoji = block.includes("VC_Podio1") || block.includes("\u{1F947}") ? 1 : block.includes("VC_Podio2") || block.includes("\u{1F948}") ? 2 : block.includes("VC_Podio3") || block.includes("\u{1F949}") ? 3 : rows.length + 1;
    rows.push({ userId, houseId, points, place: placeEmoji });
  }
  return rows;
}

function parseSingleWinnerLegacy(msg?) {
  const desc = String(msg.embeds?.[0]?.description || msg.embeds?.[0]?.data?.description || "");
  const userId = parseUserId(desc);
  if (!userId) return null;
  const unsorted = /non smistato/i.test(desc);
  const points = parsePointsFromText(desc);
  const petMult = parsePetMultiplier(desc);
  const houseId = parseHouseIdFromText(desc);
  return { userId, unsorted, points, petMult, houseId };
}

function parseUnsortedCloseLegacy(msg?) {
  const desc = String(msg.embeds?.[0]?.description || msg.embeds?.[0]?.data?.description || "");
  const userId = parseUserId(desc);
  if (!userId) return null;
  const points = parsePointsFromText(desc);
  const petMult = parsePetMultiplier(desc);
  return { userId, unsorted: true, points, petMult };
}

async function messageHasBotWinReaction(msg?, botId?) {
  if (!msg || !botId) return false;
  const reactions = msg.reactions?.cache;
  if (!reactions?.size) return false;
  for (const reaction of reactions.values()) {
    const emojiId = String(reaction.emoji?.id || "");
    const emojiName = String(reaction.emoji?.name || "");
    const isWin = emojiId === WIN_REACTION_EMOJI_ID || emojiName === "\u2714";
    if (!isWin) continue;
    try {
      const users = await reaction.users.fetch();
      if (users.has(botId)) return true;
    } catch {
    }
    await sleep(REACTION_FETCH_DELAY_MS);
  }
  return false;
}

async function collectPodiumWinnersFromReactions(round?, botId?, sortedHouseByUserId?) {
  const closeMs = round.closeMs || Number.MAX_SAFE_INTEGER;
  const candidates = round.messages.filter(
    (m?) => !m.author?.bot && m.createdTimestamp > round.startMs && m.createdTimestamp <= closeMs,
  );
  const winners = [];
  const seenUsers = new Set();
  const seenHouses = new Set();
  for (const msg of candidates) {
    const uid = String(msg.author?.id || "");
    if (!uid || seenUsers.has(uid)) continue;
    const hasWin = await messageHasBotWinReaction(msg, botId);
    if (!hasWin) continue;
    seenUsers.add(uid);
    const houseId = sortedHouseByUserId.get(uid) || "";
    if (!houseId) continue;
    if (seenHouses.has(houseId)) continue;
    seenHouses.add(houseId);
    winners.push({ userId: uid, houseId, messageId: msg.id, ms: msg.createdTimestamp });
    if (winners.length >= 3) break;
  }
  return winners;
}

function buildExpectedAwards(round?, cfg?, sortedHouseByUserId?, reactionWinners?) {
  const close = round.closeMessage;
  if (!close) return [];
  const periodKey = String(housePointPeriodKey(round.closeMs || round.startMs)?.key || "").trim();
  if (!periodKey) return [];
  const usesBonus = roundUsesBonusMultiplier(round);
  const awards = [];
  const pushHouse = (houseId?, basePoints?, petMult = 1) => {
    const hid = String(houseId || "").trim();
    const pts = Math.max(0, Math.floor(basePoints * Math.max(1, petMult)));
    if (!hid || pts <= 0) return;
    awards.push({ houseId: hid, points: pts, periodKey, allHouses: false });
  };
  const pushAllHouses = (basePoints?, petMult = 1) => {
    const pts = Math.max(0, Math.floor(basePoints * Math.max(1, petMult)));
    if (pts <= 0) return;
    awards.push({ houseId: "", points: pts, periodKey, allHouses: true });
  };
  if (isUnsortedCloseMessage(close)) {
    const legacy = parseUnsortedCloseLegacy(close);
    const petMult = legacy?.petMult || 1;
    pushAllHouses(NEW_UNSORTED_POINTS, petMult);
    return awards;
  }
  if (isPodiumSummaryMessage(close)) {
    const rows = parsePodiumSummaryLegacy(close);
    for (const row of rows) {
      const placeIdx = Math.max(0, Math.min(2, Number(row.place || 1) - 1));
      const base = podiumPointsForRound(cfg, placeIdx, usesBonus);
      const hid = row.houseId || sortedHouseByUserId.get(row.userId) || "";
      pushHouse(hid, base, 1);
    }
    return awards;
  }
  if (isSingleWinnerMessage(close)) {
    const legacy = parseSingleWinnerLegacy(close);
    if (!legacy) return awards;
    if (legacy.unsorted) {
      pushAllHouses(NEW_UNSORTED_POINTS, legacy.petMult || 1);
      return awards;
    }
    const winners = reactionWinners.length ? reactionWinners : [{ userId: legacy.userId, houseId: legacy.houseId || sortedHouseByUserId.get(legacy.userId) || "" }];
    for (let i = 0; i < winners.length && i < 3; i += 1) {
      const row = winners[i];
      const hid = row.houseId || sortedHouseByUserId.get(row.userId) || "";
      if (!hid) continue;
      const base = podiumPointsForRound(cfg, i, usesBonus);
      pushHouse(hid, base, i === 0 ? (legacy.petMult || 1) : 1);
    }
    return awards;
  }
  return awards;
}

function buildLegacyAwards(round?, sortedHouseByUserId?) {
  const close = round.closeMessage;
  if (!close) return [];
  const periodKey = String(housePointPeriodKey(round.closeMs || round.startMs)?.key || "").trim();
  if (!periodKey) return [];
  const awards = [];
  const pushHouse = (houseId?, points?) => {
    const hid = String(houseId || "").trim();
    const pts = Math.max(0, Math.floor(Number(points) || 0));
    if (!hid || pts <= 0) return;
    awards.push({ houseId: hid, points: pts, periodKey, allHouses: false });
  };
  const pushAllHouses = (points?) => {
    const pts = Math.max(0, Math.floor(Number(points) || 0));
    if (pts <= 0) return;
    awards.push({ houseId: "", points: pts, periodKey, allHouses: true });
  };
  if (isUnsortedCloseMessage(close)) {
    const legacy = parseUnsortedCloseLegacy(close);
    if (legacy?.points > 0) pushAllHouses(legacy.points);
    return awards;
  }
  if (isPodiumSummaryMessage(close)) {
    for (const row of parsePodiumSummaryLegacy(close)) {
      const hid = row.houseId || sortedHouseByUserId.get(row.userId) || "";
      if (row.points > 0) pushHouse(hid, row.points);
    }
    return awards;
  }
  if (isSingleWinnerMessage(close)) {
    const legacy = parseSingleWinnerLegacy(close);
    if (!legacy) return awards;
    if (legacy.unsorted) {
      if (legacy.points > 0) pushAllHouses(legacy.points);
      return awards;
    }
    const hid = legacy.houseId || sortedHouseByUserId.get(legacy.userId) || "";
    if (legacy.points > 0) pushHouse(hid, legacy.points);
  }
  return awards;
}

function aggregateAwards(rows?) {
  const totals = { houses: {}, allHousesPoints: 0, periodKey: "" };
  for (const row of rows) {
    totals.periodKey = totals.periodKey || row.periodKey || "";
    if (row.allHouses) {
      totals.allHousesPoints += Math.max(0, Math.floor(Number(row.points) || 0));
      continue;
    }
    const hid = String(row.houseId || "").trim();
    if (!hid) continue;
    totals.houses[hid] = (totals.houses[hid] || 0) + Math.max(0, Math.floor(Number(row.points) || 0));
  }
  return totals;
}

function diffAwardTotals(expected?, legacy?) {
  const delta = { houses: {}, allHousesPoints: 0, periodKey: expected.periodKey || legacy.periodKey || "" };
  for (const id of HOUSES) {
    const exp = expected.houses[id] || 0;
    const leg = legacy.houses[id] || 0;
    const d = exp - leg;
    if (d !== 0) delta.houses[id] = d;
  }
  const allDelta = (expected.allHousesPoints || 0) - (legacy.allHousesPoints || 0);
  if (allDelta !== 0) delta.allHousesPoints = allDelta;
  const hasHouse = Object.keys(delta.houses).length > 0;
  return hasHouse || delta.allHousesPoints !== 0 ? delta : null;
}

function roundNeedsReactionScan(round?) {
  const close = round.closeMessage;
  if (!close || !isSingleWinnerMessage(close)) return false;
  const legacy = parseSingleWinnerLegacy(close);
  if (!legacy || legacy.unsorted) return false;
  return true;
}

function roundAlreadyCorrect(round?, cfg?, sortedHouseByUserId?) {
  const close = round.closeMessage;
  if (!close) return true;
  const usesBonus = roundUsesBonusMultiplier(round);
  if (isPodiumSummaryMessage(close)) {
    const rows = parsePodiumSummaryLegacy(close);
    if (rows.length >= 3) {
      const ok = rows.every((row?, idx?) => {
        const base = podiumPointsForRound(cfg, idx, usesBonus);
        return Math.abs((row.points || 0) - base) <= 1;
      });
      if (ok) return true;
    }
  }
  if (isUnsortedCloseMessage(close)) {
    const legacy = parseUnsortedCloseLegacy(close);
    const target = Math.floor(NEW_UNSORTED_POINTS * (legacy?.petMult || 1));
    if (legacy && Math.abs((legacy.points || 0) - target) <= 1) return true;
  }
  if (isSingleWinnerMessage(close)) {
    const legacy = parseSingleWinnerLegacy(close);
    if (legacy?.unsorted) {
      const target = Math.floor(NEW_UNSORTED_POINTS * (legacy.petMult || 1));
      if (Math.abs((legacy.points || 0) - target) <= 1) return true;
    }
  }
  return false;
}

function sanitizePositiveDelta(delta?) {
  if (!delta) return null;
  const out = { houses: {}, allHousesPoints: 0, periodKey: delta.periodKey || "" };
  for (const [houseId, ptsRaw] of Object.entries(delta.houses || {})) {
    const pts = Math.floor(Number(ptsRaw) || 0);
    if (pts > 0) out.houses[houseId] = pts;
  }
  const allPts = Math.floor(Number(delta.allHousesPoints) || 0);
  if (allPts > 0) out.allHousesPoints = allPts;
  const hasHouse = Object.keys(out.houses).length > 0;
  return hasHouse || out.allHousesPoints > 0 ? out : null;
}

async function markRoundProcessed(guildId?, eventKey?, roundId?, reason?, extra = null) {
  const now = new Date();
  await SiteDocument.findOneAndUpdate(
    {
      docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
      guildId: String(guildId || ""),
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: String(eventKey || ""),
    },
    {
      $set: {
        [`rawWebhook.minigameHousePointsBackfill.appliedRoundIds.${String(roundId || "")}`]: {
          at: now,
          reason: String(reason || ""),
          ...(extra && typeof extra === "object" ? extra : {}),
        },
      },
    },
    { upsert: true },
  ).catch(() => null);
}

async function loadBackfillState(guildId?, eventKey?) {
  const doc = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
    guildId: String(guildId || ""),
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: String(eventKey || ""),
  })
    .select("rawWebhook.minigameHousePointsBackfill")
    .lean()
    .catch(() => null);
  const state = doc?.rawWebhook?.minigameHousePointsBackfill;
  const applied = state?.appliedRoundIds && typeof state.appliedRoundIds === "object" ? state.appliedRoundIds : {};
  return { applied };
}

async function applyRoundDelta(client?, guildId?, eventKey?, roundId?, delta?, stats?) {
  const periodKey = String(delta.periodKey || "").trim();
  if (!periodKey) return false;
  const inc: Record<string, any> = {};
  let total = 0;
  if (delta.allHousesPoints) {
    const pts = Math.floor(delta.allHousesPoints);
    if (pts !== 0) {
      total += pts * HOUSES.length;
      inc[`rawWebhook.byGame.${BACKFILL_GAME_KEY}`] = (inc[`rawWebhook.byGame.${BACKFILL_GAME_KEY}`] || 0) + pts * HOUSES.length;
      for (const id of HOUSES) {
        inc[`rawWebhook.totals.${id}`] = (inc[`rawWebhook.totals.${id}`] || 0) + pts;
        inc[`rawWebhook.byPeriod.${periodKey}.${id}`] = (inc[`rawWebhook.byPeriod.${periodKey}.${id}`] || 0) + pts;
      }
    }
  }
  for (const [houseId, ptsRaw] of Object.entries(delta.houses || {})) {
    const pts = Math.floor(Number(ptsRaw) || 0);
    if (!pts) continue;
    total += pts;
    inc[`rawWebhook.totals.${houseId}`] = (inc[`rawWebhook.totals.${houseId}`] || 0) + pts;
    inc[`rawWebhook.byPeriod.${periodKey}.${houseId}`] = (inc[`rawWebhook.byPeriod.${periodKey}.${houseId}`] || 0) + pts;
    inc[`rawWebhook.byGame.${BACKFILL_GAME_KEY}`] = (inc[`rawWebhook.byGame.${BACKFILL_GAME_KEY}`] || 0) + pts;
  }
  if (total <= 0) return false;
  inc["rawWebhook.total"] = total;
  const now = new Date();
  await SiteDocument.findOneAndUpdate(
    {
      docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
      guildId: String(guildId || ""),
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: String(eventKey || ""),
    },
    {
      $setOnInsert: {
        docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
        guildId: String(guildId || ""),
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: String(eventKey || ""),
        createdBy: "minigame_house_points_backfill",
        status: "active",
        planKey: "hogwarts_house_points",
      },
      $set: {
        "rawWebhook.eventKey": String(eventKey || ""),
        "rawWebhook.updatedAt": now,
        [`rawWebhook.minigameHousePointsBackfill.appliedRoundIds.${roundId}`]: {
          at: now,
          delta: { ...delta, total },
        },
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  stats.pointsAdded += total;
  return true;
}

async function fetchChannelMessagesSince(channel?, sinceMs?, options: Record<string, any> = {}) {
  const untilMs = Number.isFinite(Number(options.untilMs)) ? Number(options.untilMs) : null;
  const delayMs = Math.max(0, Number(options.fetchDelayMs ?? FETCH_DELAY_MS));
  const maxMessages = Math.max(0, Math.floor(Number(options.maxMessages) || 0));
  const out = [];
  let before = undefined;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    const sorted = [...batch.values()].sort((a?, b?) => b.createdTimestamp - a.createdTimestamp);
    for (const msg of sorted) {
      if (msg.createdTimestamp < sinceMs) continue;
      if (untilMs != null) {
        if (options.untilMsExclusive && msg.createdTimestamp >= untilMs) continue;
        else if (!options.untilMsExclusive && msg.createdTimestamp > untilMs) continue;
      }
      out.push(msg);
      if (maxMessages > 0 && out.length >= maxMessages) {
        return out.sort((a?, b?) => a.createdTimestamp - b.createdTimestamp);
      }
    }
    const oldest = sorted[sorted.length - 1];
    if (!oldest || oldest.createdTimestamp < sinceMs || batch.size < 100) break;
    before = oldest.id;
    if (delayMs > 0) await sleep(delayMs);
  }
  return out.sort((a?, b?) => a.createdTimestamp - b.createdTimestamp);
}

let backfillStarted = false;

async function syncHogwartsMinigameHousePointsBackfillOnStartup(client?) {
  if (backfillStarted) return { ok: false, reason: "already_running" };
  backfillStarted = true;
  const cfg = resolveHogwartsEventConfig(client);
  const eventKey = String(cfg?.eventKey || "").trim();
  const guildId = String(IDs.guilds?.main || "").trim();
  const minigameCfg = client?.config?.minigames || null;
  const channelId = String(minigameCfg?.channelId || "").trim();
  if (!client || !guildId || !eventKey || !channelId) {
    return { ok: false, reason: "missing_config" };
  }
  const period = housePointPeriodKey();
  const periodStartMs = resolvePeriodBounds(period)?.startMs ?? null;
  const eventStartMs = Number(cfg?.sortingStartMs ?? cfg?.startMs);
  const sinceMs = Number.isFinite(periodStartMs)
    ? periodStartMs
    : Number.isFinite(eventStartMs)
      ? eventStartMs
      : null;
  if (!Number.isFinite(sinceMs)) return { ok: false, reason: "no_since" };
  const channel = await getGuildChannelCached(client, channelId);
  if (!channel?.messages?.fetch) return { ok: false, reason: "no_channel" };
  const sortedHouseByUserId = await loadSortedHouseByUserId(guildId, eventKey);
  const { applied } = await loadBackfillState(guildId, eventKey);
  const messages = await fetchChannelMessagesSince(channel, sinceMs);
  const rounds = buildRoundsFromMessages(messages);
  const stats = { scanned: rounds.length, skipped: 0, corrected: 0, pointsAdded: 0 };
  const botId = client.user?.id;
  for (const round of rounds) {
    const roundId = String(round.startId || "");
    if (!roundId || !round.closeMessage) {
      stats.skipped += 1;
      continue;
    }
    if (applied[roundId]) {
      stats.skipped += 1;
      continue;
    }
    if (roundAlreadyCorrect(round, minigameCfg, sortedHouseByUserId)) {
      await markRoundProcessed(guildId, eventKey, roundId, "already_correct");
      stats.skipped += 1;
      continue;
    }
    let reactionWinners = [];
    if (roundNeedsReactionScan(round) && botId) {
      reactionWinners = await collectPodiumWinnersFromReactions(round, botId, sortedHouseByUserId);
    }
    const expected = buildExpectedAwards(round, minigameCfg, sortedHouseByUserId, reactionWinners);
    const legacy = buildLegacyAwards(round, sortedHouseByUserId);
    const delta = sanitizePositiveDelta(diffAwardTotals(aggregateAwards(expected), aggregateAwards(legacy)));
    if (!delta) {
      await markRoundProcessed(guildId, eventKey, roundId, "no_positive_delta");
      stats.skipped += 1;
      continue;
    }
    const ok = await applyRoundDelta(client, guildId, eventKey, roundId, delta, stats);
    if (ok) stats.corrected += 1;
    else {
      await markRoundProcessed(guildId, eventKey, roundId, "apply_failed");
      stats.skipped += 1;
    }
    await sleep(FETCH_DELAY_MS);
  }
  global.logger?.info?.("[hogwarts-minigame-hp-backfill] done", stats);
  return { ok: true, ...stats };
}

export = {
  syncHogwartsMinigameHousePointsBackfillOnStartup,
  LEGACY_UNSORTED_POINTS,
  NEW_UNSORTED_POINTS,
  buildRoundsFromMessages,
  fetchChannelMessagesSince,
  parsePodiumSummaryLegacy,
  parseSingleWinnerLegacy,
  parseUnsortedCloseLegacy,
  collectPodiumWinnersFromReactions,
  roundNeedsReactionScan,
  isGameStartMessage,
  isRoundCloseMessage,
  isPodiumSummaryMessage,
  isSingleWinnerMessage,
  isUnsortedCloseMessage,
  parseUserId,
  messageHasBotWinReaction,
  podiumPointsForRound,
  roundUsesBonusMultiplier,
};