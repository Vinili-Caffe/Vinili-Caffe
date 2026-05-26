const { EmbedBuilder } = require("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { cfg, isSpellListHuntEventEnded } = require("./hogwartsSpellListHuntService");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const IDs = require("../../Utils/Config/ids");
const HUNT_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SPELL_LIST_HUNT;
const EVENT_OWNER_ID = "__event__";
const DEFAULT_SWEEP_MS = 15 * 60 * 1000;
const BOT_STATE_KEY_PREFIX = "spellListHuntHouseLeaderboardPosted";
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
  return n === 1 ? "**1** turno vinto" : `**${n}** turni vinti`;
}

function houseLabel(houseId, client) {
  const eventCfg = resolveHogwartsEventConfig(client);
  const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  return getHouseMeta(houseId, crest || undefined)?.label || houseId;
}

async function aggregateHouseWinCounts(guildId, eventKey) {
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
    .map((houseId) => ({ houseId, wins: winMap.get(houseId) || 0 }))
    .sort((a, b) => b.wins - a.wins || HOUSES.indexOf(a.houseId) - HOUSES.indexOf(b.houseId));
  return {
    ranking,
    totalWonRounds: Math.max(0, Math.floor(Number(totalWonRounds) || 0)),
    totalRounds: Math.max(0, Math.floor(Number(totalRounds) || 0)),
  };
}

function buildLeaderboardEmbed(client, ranking, eventKey, stats) {
  const lines = ranking.map((row, index) => {
    const medal = row.wins > 0 && index < 3 ? rankEmoji(index) : `${index + 1}°`;
    return `${medal} **${houseLabel(row.houseId, client)}** — ${winsLabel(row.wins)}`;
  });
  const topWins = ranking[0]?.wins || 0;
  const intro =
    topWins > 0
      ? "Classifica delle **case** per turni vinti alla **Caccia alle liste**:"
      : "L'evento **Caccia alle liste** è terminato. Nessuna casa ha completato un turno con due maghi della stessa casa.";
  return new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia alle liste — Classifica case")
    .setDescription([intro, "", ...lines].join("\n"))
    .setFooter({
      text: `${normalizeId(eventKey) || "hogwarts_spell_list_hunt"} · ${stats.totalWonRounds} vittorie su ${stats.totalRounds} turni conclusi`,
    })
    .setTimestamp();
}

async function publishSpellListHuntHouseLeaderboard(client) {
  const c = cfg(client);
  if (!isSpellListHuntEventEnded(c)) return false;
  const eventKey = normalizeId(c.eventKey);
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  const channelId = normalizeId(c.leaderboardChannelId);
  if (!guildId || !eventKey || !channelId) return false;
  if (await getBotState(botStateKey(eventKey), null)) return false;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return false;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return false;
  const stats = await aggregateHouseWinCounts(guildId, eventKey);
  const embed = buildLeaderboardEmbed(client, stats.ranking, eventKey, stats);
  const sent = await channel
    .send({
      content:
        "<a:VC_Events:1482706144953897223> L'evento **Caccia alle liste** è terminato. Ecco la classifica delle case:",
      embeds: [embed],
      allowedMentions: { parse: [] },
    })
    .catch((err) => {
      global.logger?.warn?.("[HOGWARTS SPELL LIST HUNT END] publish failed:", err?.message || err);
      return null;
    });
  if (!sent?.id) return false;
  await setBotState(botStateKey(eventKey), {
    postedAt: Date.now(),
    channelId,
    messageId: sent.id,
    ranking: stats.ranking,
    totalWonRounds: stats.totalWonRounds,
    totalRounds: stats.totalRounds,
  });
  global.logger?.info?.(
    `[HOGWARTS SPELL LIST HUNT END] Classifica case pubblicata in #${channelId}: ${stats.totalWonRounds} vittorie, ${stats.totalRounds} turni.`,
  );
  return true;
}

async function runSpellListHuntEndSweep(client) {
  await publishSpellListHuntHouseLeaderboard(client);
}

function startHogwartsSpellListHuntEndLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    runSpellListHuntEndSweep(client).catch((err) => {
      global.logger?.warn?.("[HOGWARTS SPELL LIST HUNT END] sweep:", err?.message || err);
    });
  };
  const first = setTimeout(tick, 120 * 1000);
  if (typeof first.unref === "function") first.unref();
  const interval = setInterval(tick, DEFAULT_SWEEP_MS);
  if (typeof interval.unref === "function") interval.unref();
}

module.exports = { publishSpellListHuntHouseLeaderboard, runSpellListHuntEndSweep, startHogwartsSpellListHuntEndLoop };