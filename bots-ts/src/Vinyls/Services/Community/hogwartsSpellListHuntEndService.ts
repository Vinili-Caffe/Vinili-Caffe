const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { cfg, isSpellListHuntEventEnded } = require("./hogwartsSpellListHuntService") as typeof import("./hogwartsSpellListHuntService");
const { assignManualHousePoints } = require("./hogwartsManualHousePointsService") as typeof import("./hogwartsManualHousePointsService");
const { addGaleoni, formatGaleoni } = require("./gringottService") as typeof import("./gringottService");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const HUNT_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SPELL_LIST_HUNT;
const EVENT_OWNER_ID = "__event__";
const PODIUM_SIZE = 3;
const FINAL_REWARDS = Object.freeze([
  { galeoni: 150, housePoints: 150 },
  { galeoni: 100, housePoints: 100 },
  { galeoni: 50, housePoints: 50 },
]);
const DEFAULT_SWEEP_MS = 15 * 60 * 1000;
const BOT_STATE_KEY_PREFIX = "spellListHuntHouseLeaderboardPosted";
const loopState = new WeakSet();

function normalizeId(value?) {
  return String(value || "").trim();
}

function normalizeHouseId(value?) {
  const house = normalizeId(value).toLowerCase();
  return HOUSES.includes(house) ? house : "";
}

function botStateKey(eventKey?) {
  return `${BOT_STATE_KEY_PREFIX}:${normalizeId(eventKey)}`;
}

function rankEmoji(index?) {
  if (index === 0) return "<:VC_Podio1:1482694399283433582>";
  if (index === 1) return "<:VC_Podio2:1482694424411635712>";
  if (index === 2) return "<:VC_Podio3:1482694450806259744>";
  return `${index + 1}°`;
}

function winsLabel(count?) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n === 1 ? "**1** turno vinto" : `**${n}** turni vinti`;
}

function houseLabel(houseId?, client?) {
  const eventCfg = resolveHogwartsEventConfig(client);
  const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  return getHouseMeta(houseId, crest || undefined)?.label || houseId;
}

async function aggregateHouseWinCounts(guildId?, eventKey?) {
  const gid = normalizeId(guildId);
  const key = normalizeId(eventKey);
  if (!gid || !key) return { ranking: [], totalWonRounds: 0, totalRounds: 0 };
  const match = {
    docType: HUNT_DOC,
    guildId: gid,
    userId: EVENT_OWNER_ID,
    planKey: key,
    status: "won",
    "rawWebhook.winningHouseId": { $exists: true, $nin: ["", null] },
  };
  const [rows, totalWonRounds, totalRounds] = await Promise.all([
    SiteDocument.aggregate([
      { $match: match },
      { $group: { _id: "$rawWebhook.winningHouseId", wins: { $sum: 1 } } },
      { $sort: { wins: -1, _id: 1 } },
    ]).catch(() => []),
    SiteDocument.countDocuments(match).catch(() => 0),
    SiteDocument.countDocuments({
      docType: HUNT_DOC,
      guildId: gid,
      userId: EVENT_OWNER_ID,
      planKey: key,
      status: { $in: ["won", "expired", "mixed_houses"] },
    }).catch(() => 0),
  ]);
  const winMap = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const houseId = normalizeHouseId(row?._id);
    if (!houseId) continue;
    winMap.set(houseId, Math.max(0, Math.floor(Number(row?.wins) || 0)));
  }
  const ranking = [...HOUSES]
    .map((houseId?) => ({ houseId, wins: winMap.get(houseId) || 0 }))
    .sort((a?, b?) => b.wins - a.wins || HOUSES.indexOf(a.houseId) - HOUSES.indexOf(b.houseId));
  return {
    ranking,
    totalWonRounds: Math.max(0, Math.floor(Number(totalWonRounds) || 0)),
    totalRounds: Math.max(0, Math.floor(Number(totalRounds) || 0)),
  };
}

async function aggregateHouseContributorCounts(guildId?, eventKey?) {
  const gid = normalizeId(guildId);
  const key = normalizeId(eventKey);
  const byHouse = new Map();
  if (!gid || !key) return byHouse;
  const docs = await SiteDocument.find({
    docType: HUNT_DOC,
    guildId: gid,
    userId: EVENT_OWNER_ID,
    planKey: key,
    status: "won",
  })
    .select({ rawWebhook: 1 })
    .lean()
    .catch(() => []);
  for (const doc of Array.isArray(docs) ? docs : []) {
    const houseId = normalizeHouseId(doc?.rawWebhook?.winningHouseId);
    if (!houseId) continue;
    const claims = doc?.rawWebhook?.claims && typeof doc.rawWebhook.claims === "object" ? doc.rawWebhook.claims : {};
    for (const slot of ["a", "b"]) {
      const claim = claims[slot];
      const uid = normalizeId(claim?.userId);
      if (!uid) continue;
      const claimHouse = normalizeHouseId(claim?.houseId) || houseId;
      if (claimHouse !== houseId) continue;
      if (!byHouse.has(houseId)) byHouse.set(houseId, new Map());
      const users = byHouse.get(houseId);
      users.set(uid, (users.get(uid) || 0) + 1);
    }
  }
  return byHouse;
}

function topContributorsForHouse(contributorsByHouse?, houseId?, limit = 2) {
  const users = contributorsByHouse.get(houseId);
  if (!users) return [];
  return [...users.entries()]
    .map(([userId, wins]) => ({ userId, wins }))
    .sort((a?, b?) => b.wins - a.wins || a.userId.localeCompare(b.userId))
    .slice(0, limit);
}

function buildHousePodium(ranking?, contributorsByHouse?) {
  const topHouses = ranking.filter((row?) => row.wins > 0).slice(0, PODIUM_SIZE);
  if (topHouses.length < PODIUM_SIZE) return [];
  const podium = [];
  for (let place = 0; place < topHouses.length; place += 1) {
    const row = topHouses[place];
    const topUsers = topContributorsForHouse(contributorsByHouse, row.houseId, 2);
    if (topUsers.length < 2) return [];
    podium.push({
      place,
      houseId: row.houseId,
      wins: row.wins,
      userIds: topUsers.map((u?) => u.userId),
      users: topUsers,
    });
  }
  return podium.length >= PODIUM_SIZE ? podium : [];
}

async function awardHousePodiumPrizes(client?, guildId?, huntEventKey?, hogwartsEventKey?, podium?) {
  const results = [];
  for (const row of podium) {
    const reward = FINAL_REWARDS[row.place];
    if (!reward) continue;
    const place = row.place + 1;
    const houseAward = await assignManualHousePoints(client, {
      guildId,
      houseId: row.houseId,
      points: reward.housePoints,
      actorId: "bot",
      reason: `Caccia alle liste — ${place}° casata`,
    });
    const userAwards = [];
    for (const uid of row.userIds) {
      const rewardKey = `${huntEventKey}:final:${place}:${row.houseId}:${uid}`;
      const galeoni = await addGaleoni({
        guildId,
        userId: uid,
        amount: reward.galeoni,
        reason: `Caccia alle liste — ${place}° casata`,
        actorId: "bot",
        source: "hogwarts_spell_list_hunt_final",
        eventKey: hogwartsEventKey,
        rewardKey,
      });
      userAwards.push({ userId: uid, galeoniOk: galeoni?.ok !== false });
    }
    results.push({
      place,
      houseId: row.houseId,
      userIds: row.userIds,
      galeoni: reward.galeoni,
      housePoints: reward.housePoints,
      houseOk: houseAward?.ok === true,
      userAwards,
    });
  }
  return results;
}

async function resolveDisplayName(guild?, userId?) {
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  if (member?.displayName) return member.displayName;
  if (member?.user?.username) return member.user.username;
  return `<@${userId}>`;
}

async function buildLeaderboardEmbed(client?, guild?, ranking?, eventKey?, stats?, podium?, awards?) {
  const awardByPlace = new Map((Array.isArray(awards) ? awards : []).map((row?) => [row.place, row]));
  const podiumByHouse = new Set((Array.isArray(podium) ? podium : []).map((row?) => row.houseId));
  const lines = [];

  if (podium.length >= PODIUM_SIZE) {
    lines.push("**Podio premi** — i **2 maghi più attivi** di ciascuna casata sul podio:", "");
    for (const row of podium) {
      const place = row.place + 1;
      const reward = FINAL_REWARDS[row.place];
      const award = awardByPlace.get(place);
      const names = await Promise.all((row.userIds || []).map((id?) => resolveDisplayName(guild, id)));
      const who = names.length >= 2 ? `**${names[0]}** e **${names[1]}**` : names[0] || "—";
      lines.push(
        `${rankEmoji(row.place)} **${place}° posto · ${houseLabel(row.houseId, client)}** — ${winsLabel(row.wins)}`,
        `> ${who}`,
      );
      if (reward) {
        lines.push(
          `> ${formatGaleoni(reward.galeoni)} ciascuno · **+${reward.housePoints}** punti casa`,
        );
      }
      lines.push("");
    }
  }

  const otherHouses = ranking.filter((row?) => !podiumByHouse.has(row.houseId) && row.wins > 0);
  if (otherHouses.length > 0) {
    lines.push("**Altre case** (senza premi podio):", "");
    for (const row of otherHouses) {
      lines.push(`• **${houseLabel(row.houseId, client)}** — ${winsLabel(row.wins)}`);
    }
    lines.push("");
  }

  const zeroHouses = ranking.filter((row?) => row.wins <= 0);
  if (zeroHouses.length > 0) {
    lines.push("**Case senza turni vinti:**", "");
    for (const row of zeroHouses) {
      lines.push(`• **${houseLabel(row.houseId, client)}** — ${winsLabel(0)}`);
    }
  }

  const topWins = ranking[0]?.wins || 0;
  const intro =
    topWins > 0
      ? "Classifica finale **Caccia alle liste**. Sul podio: **3 case diverse**; a ogni casata i **2 maghi più attivi**."
      : "L'evento **Caccia alle liste** è terminato. Nessuna casa ha completato un turno con due maghi della stessa casa.";
  const extras = [];
  if (topWins > 0 && podium.length < PODIUM_SIZE) {
    extras.push(
      "",
      "<a:VC_Arrow:1482706699365257397> Podio premi non assegnato: servono **3 case diverse** con almeno un turno vinto e **2 maghi** per casata.",
    );
  }

  return new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia alle liste — Classifica finale")
    .setDescription([intro, "", ...lines, ...extras].join("\n").trim())
    .setFooter({
      text: `${normalizeId(eventKey) || "hogwarts_spell_list_hunt"} · ${stats.totalWonRounds} vittorie su ${stats.totalRounds} turni conclusi`,
    })
    .setTimestamp();
}

async function publishSpellListHuntHouseLeaderboard(client?) {
  const c = cfg(client);
  if (!isSpellListHuntEventEnded(c)) return false;
  const eventKey = normalizeId(c.eventKey);
  const hogwartsEventKey = normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  const channelId = normalizeId(c.leaderboardChannelId || IDs.channels?.eventAnnouncements);
  if (!guildId || !eventKey || !channelId) return false;
  if (await getBotState(botStateKey(eventKey), null)) return false;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return false;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return false;
  const stats = await aggregateHouseWinCounts(guildId, eventKey);
  const contributorsByHouse = await aggregateHouseContributorCounts(guildId, eventKey);
  const podium = buildHousePodium(stats.ranking, contributorsByHouse);
  let awards = [];
  if (podium.length >= PODIUM_SIZE) {
    awards = await awardHousePodiumPrizes(client, guildId, eventKey, hogwartsEventKey, podium);
  } else if (stats.totalWonRounds > 0) {
    global.logger?.warn?.(
      `[HOGWARTS SPELL LIST HUNT END] Podio premi saltato: servono ${PODIUM_SIZE} case diverse con vittorie (case con win=${stats.ranking.filter((r?) => r.wins > 0).length}).`,
    );
  }
  const embed = await buildLeaderboardEmbed(client, guild, stats.ranking, eventKey, stats, podium, awards);
  const ping = c.eventsRoleId ? `<@&${c.eventsRoleId}>` : "";
  const content = [
    ping,
    podium.length >= PODIUM_SIZE
      ? "<a:VC_Events:1482706144953897223> L'evento **Caccia alle liste** è terminato. Classifica e **premi podio** assegnati:"
      : "<a:VC_Events:1482706144953897223> L'evento **Caccia alle liste** è terminato. Ecco la classifica delle case:",
  ]
    .filter(Boolean)
    .join("\n");
  const sent = await channel
    .send({
      content,
      embeds: [embed],
      allowedMentions: c.eventsRoleId ? { roles: [c.eventsRoleId] } : { parse: [] },
    })
    .catch((err?) => {
      global.logger?.warn?.("[HOGWARTS SPELL LIST HUNT END] publish failed:", err?.message || err);
      return null;
    });
  if (!sent?.id) return false;
  await setBotState(botStateKey(eventKey), {
    postedAt: Date.now(),
    channelId,
    messageId: sent.id,
    ranking: stats.ranking,
    podium,
    awards,
    totalWonRounds: stats.totalWonRounds,
    totalRounds: stats.totalRounds,
  });
  global.logger?.info?.(
    `[HOGWARTS SPELL LIST HUNT END] Classifica pubblicata in #${channelId}: podio=${podium.length}, ${stats.totalWonRounds} vittorie, ${stats.totalRounds} turni.`,
  );
  return true;
}

async function runSpellListHuntEndSweep(client?) {
  await publishSpellListHuntHouseLeaderboard(client);
}

function startHogwartsSpellListHuntEndLoop(client?) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return;
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    runSpellListHuntEndSweep(client).catch((err?) => {
      global.logger?.warn?.("[HOGWARTS SPELL LIST HUNT END] sweep:", err?.message || err);
    });
  };
  const first = setTimeout(tick, 120 * 1000);
  if (typeof first.unref === "function") first.unref();
  const interval = setInterval(tick, DEFAULT_SWEEP_MS);
  if (typeof interval.unref === "function") interval.unref();
}

export = { publishSpellListHuntHouseLeaderboard, runSpellListHuntEndSweep, startHogwartsSpellListHuntEndLoop };
