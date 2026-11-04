/** Vincitori attività: annuncio della settimana. */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { VOICE_EXP_PER_MINUTE } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getClientChannelCached, getClientGuildCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { guildIconUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { getLastSunday21BoundaryMsAtOrBefore, getWeekKey, getMinigameRankWeekKeyForPublish, buildAnchorDateFromWeekKey } = require("./winnersTime") as typeof import("./winnersTime");
const { WEEKLY_WINNERS_EXCLUDED_ROLE_IDS, wasStaffDuringWeeklyActivityWindow, effectiveMinigameWeeklyScoreForRankWeek, loadWeeklyRowsFromHourlyWindow, loadDailyRowsFromHourlyWindow, resolveTopThreeUsers, resolveMinigameTopForced, uniqueRankingByUserId, deduplicateTopTwoLists } = require("./winnersRows") as typeof import("./winnersRows");
const { MINIGAME_WINNER_ROLE_ID, pickFirstAvailable, updateWeeklyWinnerRoles, syncRoyaleMinigameTotalRole } = require("./winnersRoles") as typeof import("./winnersRoles");
const { TROPHY_LABELS } = require("./winnersMonthlyRewards") as typeof import("./winnersMonthlyRewards");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const TARGET_CHANNEL_ID = IDs.channels.topWeeklyUser;
const TEMP_SUPPRESS_MINIGAME_WEEK_KEYS = new Set(
  ["2026-W19"]
    .map((k?) => String(k || "").trim())
    .filter(Boolean),
);

function buildEmptyLine(kind?) {
  return `${E.VC_InactiveStatus} - Nessun dato disponibile per ${kind}.`;
}

function formatRankLine(index?, userMention?, value?, unit?) {
  const medal = TROPHY_LABELS[index] || TROPHY_LABELS[2] || E.VC_Podio3;
  return `${medal} ${userMention} ${E.VC_Arrow} **${value}** *${unit}*`;
}

function voiceExpToMinutes(voiceExp?) {
  return Math.max(0, Math.floor(Number(voiceExp) || 0) / Math.max(1, VOICE_EXP_PER_MINUTE));
}

function formatVoiceHoursFromExp(voiceExp?) {
  const mins = Math.max(0, Math.floor(voiceExpToMinutes(voiceExp)));
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatVoiceRankLine(index?, userMention?, voiceExp?) {
  const medal = TROPHY_LABELS[index] || TROPHY_LABELS[2] || E.VC_Podio3;
  return `${medal} ${userMention} ${E.VC_Arrow} **${formatVoiceHoursFromExp(voiceExp)}**`;
}

async function publishWeeklyActivityWinners(client?, options: Record<string, any> = {}) {
  const mode = String(options.mode || "weekly").trim().toLowerCase() === "daily" ? "daily" : "weekly";
  const skipNormalWeekly = Boolean(options.skipNormalWeekly);
  const editMessage = options.editMessage || null;
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild = null;
  let channel = null;
  if (editMessage?.guild) {
    guild = editMessage.guild;
    channel = editMessage.channel || null;
  } else {
    guild =
      mainGuildId &&
      (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
    if (!guild) {
      const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
      const ch =
        client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
      if (!ch?.guild) {
        global.logger?.error?.("[WEEKLY ACTIVITY] Publish skipped: guild not found (main o canale top weekly).");
        return;
      }
      guild = ch.guild;
    }
    if (!skipNormalWeekly) {
      const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
      channel =
        client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
      if (!channel?.guild) {
        global.logger?.error?.("[WEEKLY ACTIVITY] Publish skipped: canale top weekly non trovato.", channelIdToUse);
        return;
      }
    }
  }
  const anchorFromWeekKey = options.weekKey ? buildAnchorDateFromWeekKey(options.weekKey) : null;
  const now =
    anchorFromWeekKey && !Number.isNaN(anchorFromWeekKey.getTime())
      ? anchorFromWeekKey
      :
      options.anchorDate instanceof Date && !Number.isNaN(options.anchorDate.getTime())
        ? options.anchorDate
        : new Date();
  let displayTopMessages = [];
  let displayTopVoice = [];
  let displayTopMinigame = [];
  let messageRows = [buildEmptyLine("messaggi")];
  let voiceRows = [buildEmptyLine("ore in vocale")];
  let minigameRows = [];
  let awarded = { messageWinner: null, voiceWinner: null, minigameWinner: null };
  let minigameRankWeekKey = "";
  let suppressMinigameThisWeek = false;
  if (!skipNormalWeekly) {
    const rowsSource =
      mode === "daily"
        ? await loadDailyRowsFromHourlyWindow(guild, now)
        : await loadWeeklyRowsFromHourlyWindow(guild, now);
    let messageDocs = rowsSource.filter((row?) => Number(row?.messageCount || 0) > 0).sort((a?, b?) => Number(b.messageCount || 0) - Number(a.messageCount || 0)).slice(0, 200);
    let voiceDocs = rowsSource.filter((row?) => Number(row?.voiceExp || 0) > 0).sort((a?, b?) => Number(b.voiceExp || 0) - Number(a.voiceExp || 0)).slice(0, 200);
    if (mode === "weekly") {
      const weekPeriodEndMs = getLastSunday21BoundaryMsAtOrBefore(now);
      const weekPeriodStartMs = weekPeriodEndMs - 7 * 24 * 60 * 60 * 1000;
      const mvIds = [
        ...new Set(
          [...messageDocs.map((r?) => String(r.userId)), ...voiceDocs.map((r?) => String(r.userId))].filter(Boolean),
        ),
      ];
      const staffByUserId = new Map();
      if (mvIds.length) {
        const profs = await ActivityUserProfile.find({ guildId: guild.id, userId: { $in: mvIds } })
          .select("userId staff.rolesHistory staffRolesHistoryRetention")
          .lean()
          .catch(() => []);
        for (const p of profs) {
          staffByUserId.set(String(p.userId), { staff: p.staff, staffRolesHistoryRetention: p.staffRolesHistoryRetention });
        }
      }
      const notStaffThatWeek = (uid?) => {
        const row = staffByUserId.get(String(uid)) || {};
        return !wasStaffDuringWeeklyActivityWindow(
          row.staff,
          weekPeriodStartMs,
          weekPeriodEndMs,
          WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
          row.staffRolesHistoryRetention,
        );
      };
      messageDocs = messageDocs.filter((row?) => notStaffThatWeek(row.userId));
      voiceDocs = voiceDocs.filter((row?) => notStaffThatWeek(row.userId));
    }
    const topMessages = await resolveTopThreeUsers(client, guild, messageDocs, (doc?) => Number(doc?.messageCount || 0), 10);
    const topVoice = await resolveTopThreeUsers(client, guild, voiceDocs, (doc?) => Number(doc?.voiceExp || 0), 10);
    const dedupe = deduplicateTopTwoLists(topMessages.slice(0, 3), topVoice.slice(0, 3), topMessages, topVoice, 3);
    displayTopMessages = uniqueRankingByUserId(dedupe.listA, 3);
    displayTopVoice = uniqueRankingByUserId(dedupe.listB, 3);
    messageRows = displayTopMessages.length
      ? displayTopMessages.map((item?, index?) => formatRankLine(index, `<@${item.userId}>`, item.value, "messaggi"))
      : [buildEmptyLine("messaggi")];
    voiceRows = displayTopVoice.length
      ? displayTopVoice.map((item?, index?) => formatVoiceRankLine(index, `<@${item.userId}>`, item.value))
      : [buildEmptyLine("ore in vocale")];
    if (mode === "weekly") {
      const rankKeyForSuppress = String(options.weekKey || getMinigameRankWeekKeyForPublish(now) || "").trim();
      suppressMinigameThisWeek = TEMP_SUPPRESS_MINIGAME_WEEK_KEYS.has(rankKeyForSuppress);
      if (suppressMinigameThisWeek) {
        minigameRankWeekKey = rankKeyForSuppress;
        displayTopMinigame = [];
        minigameRows = [];
      } else {
        const weekPeriodEndMs = getLastSunday21BoundaryMsAtOrBefore(now);
        const weekPeriodStartMs = weekPeriodEndMs - 7 * 24 * 60 * 60 * 1000;
        const fetchMinigameDocsByRankKey = async (weekKey?) => {
          const k = String(weekKey || "").trim();
          if (!k) return [];
          return ActivityUserProfile.find({
            guildId: guild.id,
            $or: [
              {
                "profile.totals.exp.minigame.weeklyKey": k,
                "profile.totals.exp.minigame.weeklyExp": { $gt: 0 },
              },
              {
                "profile.totals.exp.minigame.prevWeekKey": k,
                "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 },
              },
            ],
          })
            .select("userId profile.totals.exp.minigame staff.rolesHistory staffRolesHistoryRetention")
            .limit(800)
            .lean()
            .catch(() => []);
        };
        minigameRankWeekKey = String(options.weekKey || getMinigameRankWeekKeyForPublish(now) || "").trim();
        let minigameDocsRaw = await fetchMinigameDocsByRankKey(minigameRankWeekKey);
        const hasPositiveMinigameScore = (docs?, key?) =>
          (Array.isArray(docs) ? docs : []).some((d?) => effectiveMinigameWeeklyScoreForRankWeek(d, key) > 0);
        if (!hasPositiveMinigameScore(minigameDocsRaw, minigameRankWeekKey)) {
          const hint = await ActivityUserProfile.findOne({
            guildId: guild.id,
            "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 },
          })
            .sort({ "profile.totals.exp.minigame.prevWeekExp": -1 })
            .select("profile.totals.exp.minigame.prevWeekKey")
            .lean()
            .catch(() => null);
          const alt = String(hint?.profile?.totals?.exp?.minigame?.prevWeekKey || "").trim();
          if (alt) {
            const altDocs = await fetchMinigameDocsByRankKey(alt);
            if (hasPositiveMinigameScore(altDocs, alt)) {
              minigameRankWeekKey = alt;
              minigameDocsRaw = altDocs;
            }
          }
        }
        minigameDocsRaw.sort(
          (a?, b?) => effectiveMinigameWeeklyScoreForRankWeek(b, minigameRankWeekKey) - effectiveMinigameWeeklyScoreForRankWeek(a, minigameRankWeekKey),
        );
        const minigameDocs = minigameDocsRaw
          .slice(0, 450)
          .filter(
            (d?) =>
              !wasStaffDuringWeeklyActivityWindow(
                d?.staff,
                weekPeriodStartMs,
                weekPeriodEndMs,
                WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
                d?.staffRolesHistoryRetention,
              ),
          );
        const mgScore = (doc?) => effectiveMinigameWeeklyScoreForRankWeek(doc, minigameRankWeekKey);
        const topMinigame = await resolveTopThreeUsers(client, guild, minigameDocs, mgScore, 10);
        displayTopMinigame = uniqueRankingByUserId(topMinigame, 3);
        const rawPool = minigameDocsRaw.slice(0, 450);
        if (!displayTopMinigame.length && rawPool.some((d?) => mgScore(d) > 0)) {
          const forced = await resolveMinigameTopForced(client, guild, rawPool, mgScore, 10);
          displayTopMinigame = uniqueRankingByUserId(forced, 3);
        }
        minigameRows = displayTopMinigame.length
          ? displayTopMinigame.map((item?, index?) => formatRankLine(index, `<@${item.userId}>`, item.value, "pt minigame"))
          : [buildEmptyLine("minigames")];
      }
    }
    if (options.skipWeeklyRoles) {
      const chosenUserIds = new Set();
      const messageWinner = pickFirstAvailable(displayTopMessages, chosenUserIds);
      if (messageWinner) chosenUserIds.add(messageWinner.userId);
      const voiceWinner = pickFirstAvailable(displayTopVoice, chosenUserIds);
      if (voiceWinner) chosenUserIds.add(voiceWinner.userId);
      const minigameWinner =
        mode === "weekly" && !suppressMinigameThisWeek && displayTopMinigame.length
          ? pickFirstAvailable(displayTopMinigame, chosenUserIds)
          : null;
      awarded = { messageWinner, voiceWinner, minigameWinner };
    } else {
      awarded = await updateWeeklyWinnerRoles(
        guild,
        displayTopMessages,
        displayTopVoice,
        mode === "weekly" ? (suppressMinigameThisWeek ? false : displayTopMinigame) : false,
      );
      if (mode === "weekly") {
        await syncRoyaleMinigameTotalRole(client, { guild }).catch(() => null);
      }
    }
  }
  if (skipNormalWeekly) return;
  const embedDescLines = [
    `${E.VC_Leaderboard} // I vantaggi che avete sbloccato sono sul [nostro sito](https://viniliecaffe.it/perks)`,
    "",
    `${E.VC_HeartsPink} • **Classifica testuale:**`,
    ...messageRows,
    "",
    `${E.VC_HeartsBlue} • **Classifica vocale:**`,
    ...voiceRows,
  ];
  if (mode === "weekly" && !suppressMinigameThisWeek && minigameRows.length) {
    embedDescLines.push("", `${E.VC_Events} • **Classifica minigames:**`, ...minigameRows);
  }
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(embedDescLines.join("\n"))
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
  const messageWinnerTotal = Number(awarded?.messageWinner?.value || 0);
  const voiceWinnerTotal = Number(awarded?.voiceWinner?.value || 0);
  const minigameWinnerTotal = Number(awarded?.minigameWinner?.value || 0);
  const messageWinnerMention = awarded?.messageWinner?.userId ? `<@${awarded.messageWinner.userId}>` : "Nessun vincitore";
  const voiceWinnerMention = awarded?.voiceWinner?.userId ? `<@${awarded.voiceWinner.userId}>` : "Nessun vincitore";
  const minigameWinnerMention = awarded?.minigameWinner?.userId ? `<@${awarded.minigameWinner.userId}>` : "Nessun vincitore";
  const safeMinigameWinnerRoleMention =
    MINIGAME_WINNER_ROLE_ID && guild?.roles?.cache?.get(MINIGAME_WINNER_ROLE_ID)
      ? `<@&${MINIGAME_WINNER_ROLE_ID}>`
      : "il ruolo dei vincitori";
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
  );
  const isDailyIntro = mode === "daily";
  const introLine = isDailyIntro
    ? `${E.VC_Winner} Ciao a tutti! Ecco la Top 3 utenti più attivi di oggi.`
    : `${E.VC_Winner} Ciao a tutti! Annunciamo i vincitori di questa settimana per attività.`;
  const minigameAnnounceLine =
    mode === "weekly" && MINIGAME_WINNER_ROLE_ID && !suppressMinigameThisWeek
      ? `\n${E.VC_Podio1} Con un totale di **${minigameWinnerTotal} pt**, ${minigameWinnerMention} ottieni il primo posto per **__minigames__** e il ruolo ${safeMinigameWinnerRoleMention}.`
      : "";
  const payload = {
    content: `<@&1442568949605597264>
${introLine}

${E.VC_Podio1} Con un totale di **${messageWinnerTotal} messaggi**, ${messageWinnerMention} ottieni il primo posto per **__chat testuale__** e il ruolo <@&1544830834849087630>.
${E.VC_Podio1} Con un totale di **${formatVoiceHoursFromExp(voiceWinnerTotal)}** in vocale, ${voiceWinnerMention} ottieni il primo posto per **__chat vocale__** e il ruolo <@&1544830836686200992>.${minigameAnnounceLine}
_ _`,
    embeds: [embed],
    components: [button],
  };
  if (typeof options.dryRunLogger === "function") {
    try {
      options.dryRunLogger({
        mode,
        guildId: guild?.id || null,
        minigameRankWeekKey: minigameRankWeekKey || null,
        suppressMinigameThisWeek,
        skipDiscordSends: Boolean(options.skipDiscordSends),
        skipWeeklyRoles: Boolean(options.skipWeeklyRoles),
        awarded,
        displayTopMessages,
        displayTopVoice,
        displayTopMinigame,
        messageRows,
        voiceRows,
        minigameRows,
        embedDescription: embedDescLines.join("\n"),
        payloadContent: payload.content,
      });
    } catch (e) {
      global.logger?.warn?.("[WEEKLY ACTIVITY] dryRunLogger:", e?.message || e);
    }
  }
  const discordTarget = editMessage || channel;
  if (!options.skipDiscordSends && discordTarget) {
    try {
      if (editMessage) {
        await editMessage.edit(payload);
      } else {
        await channel.send(payload);
      }
    } catch (error) {
      global.logger.error(
        editMessage ? "[WEEKLY ACTIVITY] Failed to edit winners message:" : "[WEEKLY ACTIVITY] Failed to send winners message:",
        error,
      );
    }
  }
}

async function resetWeeklyActivityCounters(client?, options: Record<string, any> = {}) {
  const channel = client.channels.cache.get(TARGET_CHANNEL_ID) || (await getClientChannelCached(client, TARGET_CHANNEL_ID, { ttlMs: 60_000 }));
  const guildId = channel?.guild?.id;
  if (!guildId) {
    global.logger?.error?.("[WEEKLY ACTIVITY] Reset skipped: channel or guild not found.", TARGET_CHANNEL_ID);
    return;
  }
  const now = new Date();
  const nextWeekKey = String(options.nextWeekKey != null ? options.nextWeekKey : getWeekKey(now));
  await ActivityUserProfile.updateMany(
    { guildId },
    [
      {
        $set: {
          "profile.totals.messagesWeekly": 0,
          "profile.totals.messagesWeeklyKey": nextWeekKey,
          "profile.totals.voiceWeeklySeconds": 0,
          "profile.totals.voiceWeeklyKey": nextWeekKey,
          "profile.totals.exp.weeklyExp": 0,
          "profile.totals.exp.weeklyKey": nextWeekKey,
          "profile.totals.exp.minigame.prevWeekKey": { $ifNull: ["$profile.totals.exp.minigame.weeklyKey", ""] },
          "profile.totals.exp.minigame.prevWeekExp": { $ifNull: ["$profile.totals.exp.minigame.weeklyExp", 0] },
          "profile.totals.exp.minigame.weeklyExp": 0,
          "profile.totals.exp.minigame.weeklyKey": nextWeekKey,
        },
      },
    ],
  );
}

export = { TARGET_CHANNEL_ID, buildEmptyLine, formatRankLine, publishWeeklyActivityWinners, resetWeeklyActivityCounters };
