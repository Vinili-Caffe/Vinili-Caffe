/** Vincitori attività: annuncio del mese. */
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
      return `${TROPHY_LABELS[index] || TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>"} <@${item.userId}> <a:VC_Arrow:1482706699365257397> **${item.value}** *voti* · \`${rewardLabel}\``;
    })
    : [buildEmptyLine("voti del mese scorso")];
  const monthlyRewardRows = buildMonthlyTopPrizeEmbedLines(displayTopCombined, rankedYear, rankedMonth);
  const embedDescLines = [
    `<:VC_Leaderboard:1482534806314287387> // **${monthNameLabel}** — I vantaggi che avete sbloccato sono sul [nostro sito](https://viniliecaffe.it/perks)`,
    "",
    `<a:VC_HeartsPink:1468685897389052008> • **Classifica mensile EXP totale:**`,
    ...combinedRows,
    "",
    `<a:VC_Winner:1482535294757507255> • **Premi Top Monthly:**`,
    ...monthlyRewardRows,
    "",
    `<:VC_Leaderboard:1482534806314287387> • **Top Voters:**`,
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
      .setEmoji("<:VC_FrogCute:1331620415185096746>")
      .setURL("https://discord.com/channels/1329080093599076474/1442569130573303898"),
    new ButtonBuilder()
      .setLabel("Vocal")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<:VC_FrogJuice:1331620486517358613>")
      .setURL("https://discord.com/channels/1329080093599076474/1442569101225496819"),
    new ButtonBuilder()
      .setLabel("Vota")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<a:VC_Vote:1482535223001485473>")
      .setURL("https://www.viniliecaffe.it/vote"),
  );
  if (!options.skipDiscordSends && channel) {
    const introLine = `<a:VC_Winner:1482535294757507255> Ciao a tutti! Annunciamo i vincitori del mese.`;
    const votersRoleTextByIndex = ["<@&1544830868575625276>", "<@&1544830866616754257>", "<@&1544830864565735515>"];
    const voter1 = monthlyVotersTop[0];
    const voter2 = monthlyVotersTop[1];
    const voter3 = monthlyVotersTop[2];
    const votersTextLine = monthlyVotersTop.length
      ? [
        "\n<:VC_Leaderboard:1482534806314287387> **Top Voters:**",
        voter1
          ? `${TROPHY_LABELS[0] || "<:VC_Podio1:1482694399283433582>"} <@${voter1.userId}> <a:VC_Arrow:1482706699365257397> **${voter1.value}** *voti* · ${votersRoleTextByIndex[0]} 30 giorni`
          : null,
        voter2
          ? `${TROPHY_LABELS[1] || "<:VC_Podio2:1482694424411635712>"} <@${voter2.userId}> <a:VC_Arrow:1482706699365257397> **${voter2.value}** *voti* · ${votersRoleTextByIndex[1]} 30 giorni`
          : null,
        voter3
          ? `${TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>"} <@${voter3.userId}> <a:VC_Arrow:1482706699365257397> **${voter3.value}** *voti* · ${votersRoleTextByIndex[2]} 30 giorni`
          : null,
      ].filter(Boolean).join("\n")
      : "";
    try {
      await channel.send({
        content: `<@&1442568949605597264>
${introLine}

<:VC_Podio1:1482694399283433582> Con un totale di **${monthlyAnnounce.winnerTotal} EXP**, ${monthlyAnnounce.winnerMention} ottiene il primo posto della **__classifica mensile__** e riceve il ruolo <@&1544830838443741194> e un **Nitro Boost** riscattabile tramite ${siteTicketsPageDiscordRef("HIGH STAFF")}.
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
