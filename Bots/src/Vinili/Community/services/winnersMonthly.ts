/** Vincitori attività: annuncio del mese. */
const path = require("path") as typeof import("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { MESSAGE_EXP } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef") as typeof import("../../../shared/web/siteTicketsPageRef");
const { getClientChannelCached, getClientGuildCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { guildIconUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { getPreviousRomeCalendarMonth } = require("./winnersTime") as typeof import("./winnersTime");
const { loadMonthlyRowsFromRomeCalendarMonth, resolveTopThreeUsers, uniqueRankingByUserId } = require("./winnersRows") as typeof import("./winnersRows");
const { updateMonthlyWinnerRoles } = require("./winnersRoles") as typeof import("./winnersRoles");
const { TROPHY_LABELS, resolvePreviousMonthTopVoters, cleanupExpiredMonthlyVoterRewards, assignMonthlyVoterRewards, buildMonthlyTopPrizeEmbedLines, buildMonthlyTopWinnerAnnounceLines, revokeActiveMonthlyTopRewardsExcept, revokeActiveMonthlyVoterRewardsExcept, cleanupExpiredMonthlyTopRewards, assignMonthlyTopRewards } = require("./winnersMonthlyRewards") as typeof import("./winnersMonthlyRewards");
const { TARGET_CHANNEL_ID, buildEmptyLine, formatRankLine } = require("./winnersWeekly") as typeof import("./winnersWeekly");

/** Durante SW i premi mensili sono sostituiti dai podi di fine fase. */
function isRankedMonthCoveredByStarWarsEvent(client?, rankedYear?, rankedMonth?) {
  try {
    const swCfgPath = path.resolve(__dirname, "../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig");
    const { resolveStarWarsEventConfig } = require(swCfgPath) as typeof import("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig");
    const cfg = resolveStarWarsEventConfig(client);
    if (!cfg?.enabled) return false;
    const y = Number(rankedYear);
    const m = Number(rankedMonth);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return false;
    /* Intersezione mese calendario Rome con finestra evento (startMs/endMs). */
    const monthStart = Date.parse(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+01:00`);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = Date.parse(`${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59+01:00`);
    if (!Number.isFinite(monthStart) || !Number.isFinite(monthEnd)) return false;
    return Number(cfg.startMs) <= monthEnd && Number(cfg.endMs) >= monthStart;
  } catch (_) {
    /* Fallback hardcode finestra nota se archivio non raggiungibile. */
    const y = Number(rankedYear);
    const m = Number(rankedMonth);
    return (y === 2026 && m === 12) || (y === 2027 && m >= 1 && m <= 2);
  }
}

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const IT_MONTH_NAMES = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

async function publishMonthlyActivityWinners(client?, options: Record<string, any> = {}) {
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild =
    mainGuildId &&
    (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
  const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
  if (!guild) {
    const channel =
      client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
    if (!channel?.guild) {
      global.logger?.error?.("[MONTHLY ACTIVITY] Publish skipped: guild not found (main o canale top weekly).");
      return;
    }
    guild = channel.guild;
  }
  const channel =
    client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
  if (!channel?.guild) {
    global.logger?.error?.("[MONTHLY ACTIVITY] Publish skipped: canale top weekly non trovato.", channelIdToUse);
    return;
  }
  const anchor =
    options.anchorDate instanceof Date && !Number.isNaN(options.anchorDate.getTime()) ? options.anchorDate : new Date();
  let rankedYear;
  let rankedMonth;
  if (options.rankedYear != null && options.rankedMonth != null) {
    rankedYear = Number(options.rankedYear);
    rankedMonth = Number(options.rankedMonth);
  } else {
    const prev = getPreviousRomeCalendarMonth(anchor);
    rankedYear = prev.year;
    rankedMonth = prev.month;
  }
  if (!Number.isFinite(rankedYear) || !Number.isFinite(rankedMonth) || rankedMonth < 1 || rankedMonth > 12) {
    global.logger?.error?.("[MONTHLY ACTIVITY] Publish skipped: mese non valido.", rankedYear, rankedMonth);
    return;
  }
  if (isRankedMonthCoveredByStarWarsEvent(client, rankedYear, rankedMonth) && !options.forceDespiteStarWars) {
    global.logger?.info?.(
      `[MONTHLY ACTIVITY] Skip ${rankedYear}-${String(rankedMonth).padStart(2, "0")}: sostituito dai podi fine fase Star Wars.`,
    );
    return;
  }
  const monthNameLabel = `${IT_MONTH_NAMES[rankedMonth - 1] || ""} ${rankedYear}`.trim();
  const rows = await loadMonthlyRowsFromRomeCalendarMonth(guild, rankedYear, rankedMonth);
  const augmented = rows.map((r?) => {
    const textExp = Math.max(0, Math.floor(Number(r.messageCount || 0) * MESSAGE_EXP));
    const voiceExp = Math.max(0, Math.floor(Number(r.voiceExp || 0)));
    return {
      userId: r.userId,
      textExp,
      voiceExp,
      totalExp: textExp + voiceExp,
    };
  });
  const combinedDocs = augmented
    .filter((row?) => Number(row.totalExp || 0) > 0)
    .sort((a?, b?) => Number(b.totalExp || 0) - Number(a.totalExp || 0))
    .slice(0, 200);
  const topCombined = await resolveTopThreeUsers(client, guild, combinedDocs, (doc?) => Number(doc?.totalExp || 0), 10);
  const displayTopCombined = uniqueRankingByUserId(topCombined, 3);
  const combinedRows = displayTopCombined.length
    ? displayTopCombined.map((item?, index?) => formatRankLine(index, `<@${item.userId}>`, item.value, "exp totali"))
    : [buildEmptyLine("EXP totali (chat + vocale)")];
  let awarded: any = { topMonthlyWinner: null, monthlyTopSecond: null, monthlyTopThird: null, monthlyVotersTop: [] };
  if (options.skipMonthlyRoles) {
    awarded = {
      topMonthlyWinner: displayTopCombined[0] || null,
      monthlyTopSecond: displayTopCombined[1] || null,
      monthlyTopThird: displayTopCombined[2] || null,
    };
  } else {
    awarded = await updateMonthlyWinnerRoles(guild, displayTopCombined);
  }
  const monthlyVotersTop = await resolvePreviousMonthTopVoters(client, guild);
  awarded.monthlyVotersTop = monthlyVotersTop;
  if (!options.skipMonthlyRoles) {
    await cleanupExpiredMonthlyVoterRewards(guild).catch(() => null);
    await cleanupExpiredMonthlyTopRewards(guild).catch(() => null);
    await revokeActiveMonthlyVoterRewardsExcept(guild, monthlyVotersTop).catch(() => null);
    await revokeActiveMonthlyTopRewardsExcept(guild, displayTopCombined, rankedYear, rankedMonth).catch(() => null);
    await assignMonthlyVoterRewards(guild, monthlyVotersTop).catch(() => null);
    await assignMonthlyTopRewards(guild, displayTopCombined, rankedYear, rankedMonth).catch(() => null);
  }
  const voterRows = monthlyVotersTop.length
    ? monthlyVotersTop.map((item?, index?) => {
      const rewardLabel = index === 0
        ? "VIP+ (30g)"
        : index === 1
          ? "VIP (30g)"
          : "Donator (30g)";
      return `${TROPHY_LABELS[index] || TROPHY_LABELS[2] || E.VC_Podio3} <@${item.userId}> ${E.VC_Arrow} **${item.value}** *voti* · \`${rewardLabel}\``;
    })
    : [buildEmptyLine("voti del mese scorso")];
  const monthlyRewardRows = buildMonthlyTopPrizeEmbedLines(displayTopCombined, rankedYear, rankedMonth);
  const embedDescLines = [
    `${E.VC_Leaderboard} // **${monthNameLabel}** — I vantaggi che avete sbloccato sono sul [nostro sito](https://viniliecaffe.it/perks)`,
    "",
    `${E.VC_HeartsPink} • **Classifica mensile EXP totale:**`,
    ...combinedRows,
    "",
    `${E.VC_Winner} • **Premi Top Monthly:**`,
    ...monthlyRewardRows,
    "",
    `${E.VC_Leaderboard} • **Top Voters:**`,
    ...voterRows,
  ];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(embedDescLines.join("\n"))
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
  const monthlyAnnounce = buildMonthlyTopWinnerAnnounceLines(awarded, rankedYear, rankedMonth);
  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Chat")
      .setStyle(ButtonStyle.Link)
      .setEmoji(E.VC_FrogCute)
      .setURL("https://discord.com/channels/1329080093599076474/1442569130573303898"),
    new ButtonBuilder()
      .setLabel("Vocal")
      .setStyle(ButtonStyle.Link)
      .setEmoji(E.VC_FrogJuice)
      .setURL("https://discord.com/channels/1329080093599076474/1442569101225496819"),
    new ButtonBuilder()
      .setLabel("Vota")
      .setStyle(ButtonStyle.Link)
      .setEmoji(E.VC_Vote)
      .setURL("https://www.viniliecaffe.it/vote"),
  );
  if (!options.skipDiscordSends && channel) {
    const introLine = `${E.VC_Winner} Ciao a tutti! Annunciamo i vincitori del mese.`;
    const votersRoleTextByIndex = ["<@&1544830868575625276>", "<@&1544830866616754257>", "<@&1544830864565735515>"];
    const voter1 = monthlyVotersTop[0];
    const voter2 = monthlyVotersTop[1];
    const voter3 = monthlyVotersTop[2];
    const votersTextLine = monthlyVotersTop.length
      ? [
        `\n${E.VC_Leaderboard} **Top Voters:**`,
        voter1
          ? `${TROPHY_LABELS[0] || E.VC_Podio1} <@${voter1.userId}> ${E.VC_Arrow} **${voter1.value}** *voti* · ${votersRoleTextByIndex[0]} 30 giorni`
          : null,
        voter2
          ? `${TROPHY_LABELS[1] || E.VC_Podio2} <@${voter2.userId}> ${E.VC_Arrow} **${voter2.value}** *voti* · ${votersRoleTextByIndex[1]} 30 giorni`
          : null,
        voter3
          ? `${TROPHY_LABELS[2] || E.VC_Podio3} <@${voter3.userId}> ${E.VC_Arrow} **${voter3.value}** *voti* · ${votersRoleTextByIndex[2]} 30 giorni`
          : null,
      ].filter(Boolean).join("\n")
      : "";
    try {
      await channel.send({
        content: `<@&1442568949605597264>
${introLine}

${E.VC_Podio1} Con un totale di **${monthlyAnnounce.winnerTotal} EXP**, ${monthlyAnnounce.winnerMention} ottiene il primo posto della **__classifica mensile__** e riceve il ruolo <@&1544830838443741194> e un **Nitro Boost** riscattabile tramite ${siteTicketsPageDiscordRef("HIGH STAFF")}.
${monthlyAnnounce.secondLine}
${monthlyAnnounce.thirdLine}
${votersTextLine}
_ _`,
        embeds: [embed],
        components: [button],
      });
    } catch (error) {
      global.logger.error("[MONTHLY ACTIVITY] Failed to send winners message:", error);
    }
  }
}

export = { publishMonthlyActivityWinners };
