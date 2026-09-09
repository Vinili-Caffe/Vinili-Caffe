const { EmbedBuilder } = require("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { getPremiLaReactConfig, isPremiLaReactEventEnded } = require("./hogwartsReactPressService");
const { addGaleoni, formatGaleoni } = require("./gringottService");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { housePointPeriodKey } = require("../../Utils/Web/hogwartsHousePointPeriods");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const IDs = require("../../Utils/Config/ids");
const REACT_PRESS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS;
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const EVENT_OWNER_ID = "__event__";
const HOUSE_POINTS_OWNER_ID = "__event__";
const PODIUM_SIZE = 3;
const FINAL_REWARDS = Object.freeze([ { galeoni: 150, housePoints: 150 }, { galeoni: 100, housePoints: 100 }, { galeoni: 50, housePoints: 50 } ]);
const DEFAULT_SWEEP_MS = 15 * 60 * 1000;
const BOT_STATE_KEY_PREFIX = "premiLaReactLeaderboardPosted";
const loopState = new WeakSet();

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeHouseId(value) {
  const house = normalizeId(value).toLowerCase();
  return HOUSES.includes(house) ? house : "";
}

function botStateKey(eventKey) {
  return `${BOT_STATE_KEY_PREFIX}:${normalizeId(eventKey)}`;
}

function rankEmoji(index) {
  if (index === 0) return "<:VC_Podio1:1482694399283433582>";
  if (index === 1) return "<:VC_Podio2:1482694424411635712>";
  if (index === 2) return "<:VC_Podio3:1482694450806259744>";
  return `${index + 1}°`;
}

function winsLabel(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n === 1 ? "**1** reaction vinta" : `**${n}** reaction vinte`;
}

function houseLabel(houseId) {
  return getHouseMeta(houseId)?.label || houseId;
}

async function aggregatePremiLaReactWinCounts(guildId, eventKey) {
  const gid = normalizeId(guildId);
  const key = normalizeId(eventKey);
  if (!gid || !key) return { winners: [], totalCompleted: 0 };
  const match = {
    docType: REACT_PRESS_DOC,
    guildId: gid,
    status: "completed",
    planKey: key,
    "rawWebhook.winnerUserId": { $exists: true, $nin: ["", null, EVENT_OWNER_ID] },
  };
  const [rows, totalCompleted] = await Promise.all([
    SiteDocument.aggregate([
      { $match: match },
      { $group: { _id: "$rawWebhook.winnerUserId", wins: { $sum: 1 } } },
      { $sort: { wins: -1, _id: 1 } },
    ]).catch(() => []),
    SiteDocument.countDocuments(match).catch(() => 0),
  ]);
  const winners = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      userId: normalizeId(row?._id),
      wins: Math.max(0, Math.floor(Number(row?.wins) || 0)),
    }))
    .filter((row) => row.userId && row.wins > 0);
  return {
    winners,
    totalCompleted: Math.max(0, Math.floor(Number(totalCompleted) || 0)),
  };
}

async function loadSortedHouseByUserId(guildId, userIds, hogwartsEventKey) {
  const gid = normalizeId(guildId);
  const key = normalizeId(hogwartsEventKey);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(normalizeId).filter(Boolean))];
  if (!gid || !key || !ids.length) return new Map();
  const docs = await SiteDocument.find({
    docType: SORTING_DOC,
    guildId: gid,
    userId: { $in: ids },
    dedupeKey: key,
    status: { $in: HOUSES },
  })
    .select({ userId: 1, status: 1, planKey: 1, rawWebhook: 1 })
    .lean()
    .catch(() => []);
  const map = new Map();
  for (const doc of docs) {
    const uid = normalizeId(doc?.userId);
    const houseId = normalizeHouseId(doc?.status || doc?.rawWebhook?.houseId || doc?.planKey);
    if (uid && houseId) map.set(uid, houseId);
  }
  return map;
}

function pickPodiumDistinctHouses(eligibleSorted) {
  const podium = [];
  const housesUsed = new Set();
  for (const row of eligibleSorted) {
    const houseId = normalizeHouseId(row.houseId);
    if (!houseId || housesUsed.has(houseId)) continue;
    housesUsed.add(houseId);
    podium.push({ ...row, houseId, place: podium.length });
    if (podium.length >= PODIUM_SIZE) break;
  }
  return podium.length >= PODIUM_SIZE ? podium : [];
}

async function buildEligiblePodium(guildId, premiEventKey, hogwartsEventKey) {
  const { winners, totalCompleted } = await aggregatePremiLaReactWinCounts(guildId, premiEventKey);
  if (!winners.length) return { podium: [], totalCompleted, eligibleCount: 0, distinctHouses: 0 };
  const houseByUser = await loadSortedHouseByUserId(
    guildId,
    winners.map((row) => row.userId),
    hogwartsEventKey,
  );
  const eligible = winners
    .map((row) => {
      const houseId = houseByUser.get(row.userId) || "";
      if (!houseId) return null;
      return { userId: row.userId, wins: row.wins, houseId };
    })
    .filter(Boolean);
  const podium = pickPodiumDistinctHouses(eligible);
  const distinctHouses = new Set(eligible.map((row) => row.houseId)).size;
  return { podium, totalCompleted, eligibleCount: eligible.length, distinctHouses };
}

async function awardFinalHousePoints(client, guildId, userId, amount, rewardKey) {
  const pts = Math.max(0, Math.floor(Number(amount) || 0));
  if (pts <= 0) return { ok: false, code: "bad_amount" };
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  if (!isValidGuildUserId(gid, uid)) return { ok: false, code: "invalid_ids" };
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || "hogwarts";
  const houseByUser = await loadSortedHouseByUserId(gid, [uid], eventKey);
  const houseId = houseByUser.get(uid) || "";
  if (!houseId) return { ok: false, code: "not_sorted" };
  const period = housePointPeriodKey(Date.now());
  const periodKey = normalizeId(period?.key);
  const now = new Date();
  const inc = {
    "rawWebhook.byGame.premiLaReactFinal": pts,
    "rawWebhook.total": pts,
    [`rawWebhook.totals.${houseId}`]: pts,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${houseId}`] = pts;
  await SiteDocument.findOneAndUpdate(
    {
      docType: HOUSE_POINTS_DOC,
      guildId: gid,
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: eventKey,
    },
    {
      $setOnInsert: {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: eventKey,
        createdBy: "premiLaReactFinal",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.updatedAt": now,
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return { ok: true, houseId, points: pts };
}

async function awardPodiumPrizes(client, guildId, premiEventKey, hogwartsEventKey, podium) {
  const results = [];
  for (const row of podium) {
    const reward = FINAL_REWARDS[row.place];
    if (!reward) continue;
    const place = row.place + 1;
    const rewardKey = `${premiEventKey}:final:${place}:${row.userId}`;
    const galeoni = await addGaleoni({
      guildId,
      userId: row.userId,
      amount: reward.galeoni,
      reason: `Premi la reaction — ${place}° classificato`,
      actorId: "bot",
      source: "premi_la_react_final",
      eventKey: hogwartsEventKey,
      rewardKey,
    });
    const houseAward = await awardFinalHousePoints(client, guildId, row.userId, reward.housePoints, rewardKey);
    results.push({
      userId: row.userId,
      place,
      galeoni: reward.galeoni,
      housePoints: reward.housePoints,
      galeoniOk: galeoni?.ok !== false,
      houseOk: houseAward?.ok === true,
      houseId: row.houseId,
    });
  }
  return results;
}

async function resolveDisplayName(guild, userId) {
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  if (member?.displayName) return member.displayName;
  if (member?.user?.username) return member.user.username;
  return `<@${userId}>`;
}

async function buildLeaderboardEmbed(guild, podium, eventKey, totalCompleted) {
  const lines = [];
  for (const row of podium) {
    const reward = FINAL_REWARDS[row.place];
    const name = await resolveDisplayName(guild, row.userId);
    const prize = reward
      ? `${formatGaleoni(reward.galeoni)} + **${reward.housePoints}** punti ${houseLabel(row.houseId)}`
      : "";
    lines.push(`${rankEmoji(row.place)} **${name}** (${houseLabel(row.houseId)}) — ${winsLabel(row.wins)} · ${prize}`);
  }
  return new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Premi la reaction — Classifica finale")
    .setDescription(
      lines.join("\n")
      + "\n\n<a:VC_Arrow:1482706699365257397> Podio riservato a maghi **smistati** di **case diverse**.",
    )
    .setFooter({
      text: `Evento ${normalizeId(eventKey) || "premi_la_react"} · ${totalCompleted} round completati`,
    })
    .setTimestamp();
}

async function publishPremiLaReactLeaderboard(client) {
  const c = getPremiLaReactConfig(client);
  if (!isPremiLaReactEventEnded(c)) return false;
  const premiEventKey = normalizeId(c.eventKey);
  const hogwartsEventKey = normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  if (!guildId || !premiEventKey) return false;
  if (await getBotState(botStateKey(premiEventKey), null)) return false;
  const channelId = normalizeId(IDs.channels?.eventAnnouncements);
  if (!channelId) return false;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return false;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return false;
  const stats = await buildEligiblePodium(guildId, premiEventKey, hogwartsEventKey);
  if (!stats.podium.length) {
    const reason = stats.totalCompleted <= 0 ? "no_wins" : "insufficient_sorted_houses";
    global.logger?.warn?.(
      `[PREMI LA REACT END] Classifica saltata (${reason}): round=${stats.totalCompleted}, eleggibili=${stats.eligibleCount}, case=${stats.distinctHouses}.`,
    );
    await setBotState(botStateKey(premiEventKey), {
      postedAt: Date.now(),
      skipped: true,
      reason,
      totalCompleted: stats.totalCompleted,
      eligibleCount: stats.eligibleCount,
      distinctHouses: stats.distinctHouses,
    });
    return false;
  }
  const awardResults = await awardPodiumPrizes(client, guildId, premiEventKey, hogwartsEventKey, stats.podium);
  const embed = await buildLeaderboardEmbed(guild, stats.podium, premiEventKey, stats.totalCompleted);
  const sent = await channel
    .send({
      content:
        "<@&1536086666169684074>\n <a:VC_Events:1482706144953897223> L'evento **Premi la reaction** è terminato. Podio e premi assegnati ai maghi più veloci:",
      embeds: [embed],
      allowedMentions: { parse: [] },
    })
    .catch((err) => {
      global.logger?.warn?.("[PREMI LA REACT END] publish failed:", err?.message || err);
      return null;
    });
  if (!sent?.id) return false;
  await setBotState(botStateKey(premiEventKey), {
    postedAt: Date.now(),
    channelId,
    messageId: sent.id,
    podium: stats.podium,
    awards: awardResults,
    totalCompleted: stats.totalCompleted,
  });
  global.logger?.info?.(
    `[PREMI LA REACT END] Classifica pubblicata in #${channelId}: ${stats.podium.length} in podio, ${stats.totalCompleted} round.`,
  );
  return true;
}

async function runPremiLaReactEndSweep(client) {
  await publishPremiLaReactLeaderboard(client);
}

function startPremiLaReactEndLoop(client) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return;
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    runPremiLaReactEndSweep(client).catch((err) => {
      global.logger?.warn?.("[PREMI LA REACT END] sweep:", err?.message || err);
    });
  };
  const first = setTimeout(tick, 90 * 1000);
  if (typeof first.unref === "function") first.unref();
  const interval = setInterval(tick, DEFAULT_SWEEP_MS);
  if (typeof interval.unref === "function") interval.unref();
}

module.exports = { publishPremiLaReactLeaderboard, runPremiLaReactEndSweep, startPremiLaReactEndLoop };