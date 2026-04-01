const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require("discord.js");
const { getGuildExpSettings } = require("../Services/Community/expService");
const { getEventWeekTopNTextAndVoice } = require("../Services/Community/weeklyActivityWinnersService");
const { getTop10ExpDuringEventExcludingStaff, getTop10ExpDuringEventExcludingHighStaff, getEventWeekNumber } = require("../Services/Community/activityEventRewardsService");
const EVENTO_CLASSIFICA_PREFIX = "evento_classifica:";
const EVENTO_CLASSIFICA_EXP_PREFIX = "evento_classifica_exp";
const MAX_WEEKS = 4;
const TROPHY_LABELS = ["<:VC_Podio1:1482694399283433582>", "<:VC_Podio2:1482694424411635712>", "<:VC_Podio3:1482694450806259744>"];

function formatVoiceDuration(seconds) {
  const s = Number(seconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = (s / 3600).toFixed(1);
  return `${h}h`;
}

function match(interaction) {
  const id = interaction?.customId || "";
  return interaction.isButton() && (
    id === EVENTO_CLASSIFICA_EXP_PREFIX ||
    id === EVENTO_CLASSIFICA_PREFIX ||
    id.startsWith(`${EVENTO_CLASSIFICA_PREFIX}`)
  );
}

async function execute(interaction, client) {
  const customId = interaction.customId || "";
  const isExpOnly = customId === EVENTO_CLASSIFICA_EXP_PREFIX;
  if (!isExpOnly && !customId.startsWith(EVENTO_CLASSIFICA_PREFIX)) return false;
  const weekStr = isExpOnly ? "" : customId.slice(EVENTO_CLASSIFICA_PREFIX.length).trim();
  const week = Math.max(1, Math.min(MAX_WEEKS, Number.parseInt(weekStr || "1", 10) || 1));

  const guild = interaction.guild;
  if (!guild) return false;
  const settings = await getGuildExpSettings(guild.id).catch(() => null);
  if (!settings?.eventExpiresAt || !settings?.eventStartedAt) {
    await interaction.reply({ content: "<:vegax:1443934876440068179> Nessun evento attivo.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  try {
    const currentEventWeek = Math.max(1, Math.min(MAX_WEEKS, Number(getEventWeekNumber(settings) || 1)));
    const payload = isExpOnly
      ? await buildEventoClassificaExpOnlyPayload(guild, week, currentEventWeek)
      : await buildEventoClassificaPayload(guild, week, currentEventWeek);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => { }));
    } else {
      await interaction.update(payload).catch(async () => {
        await interaction.reply(payload).catch(() => { });
      });
    }
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/eventoClassifica] execute", err);
    await interaction.reply({ content: "<:vegax:1443934876440068179> Errore durante l'aggiornamento.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
}

function rankLabel(i) {
  return TROPHY_LABELS[i] || `**${i + 1}.**`;
}

async function buildEventoClassificaPayload(guild, selectedWeek, currentEventWeek) {
  const week = selectedWeek ?? 1;
  const maxWeek = currentEventWeek ?? week;
  const { topMessages, topVoice } = await getEventWeekTopNTextAndVoice(guild, week, 10);
  const topExp = await getTop10ExpDuringEventExcludingHighStaff(guild, 10);

  const msgLines = topMessages.length
    ? topMessages.map((item, i) => `${rankLabel(i)} <@${item.userId}> <a:VC_Arrow:1482706699365257397> **${item.messageCount}** _messaggi_`)
    : ["<:VC_InactiveStatus:1482526984234860574> - Nessun dato per la classifica testuale."];
  const voiceLines = topVoice.length
    ? topVoice.map((item, i) => `${rankLabel(i)} <@${item.userId}> <a:VC_Arrow:1482706699365257397> **${formatVoiceDuration(item.voiceSeconds)}** _in vocale_`)
    : ["<:VC_InactiveStatus:1482526984234860574> - Nessun dato per la classifica vocale."];
  const expLines = topExp.length
    ? topExp.map((item, i) => {
        const value = Number(
          item.activityExpDuringEvent != null
            ? item.activityExpDuringEvent
            : item.expDuringEvent,
        );
        return `${rankLabel(i)} <@${item.userId}> <a:VC_Arrow:1482706699365257397> **${value}** _EXP_`;
      })
    : ["<:VC_InactiveStatus:1482526984234860574> - Nessun dato per la classifica EXP (solo messaggi + vocale)."];

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<:VC_Leaderboard:1482534806314287387> Evento Activity EXP — Settimana ${week}`)
    .setDescription(
      [
        "<a:VC_HeartsPink:1468685897389052008> **Top 10 testuale**:",
        ...msgLines,
        "",
        "<a:VC_HeartsBlue:1468686100045369404> **Top 10 vocale**:",
        ...voiceLines,
        "",
        "<:VC_Leaderboard:1482534806314287387> **Top 10 EXP**:",
        ...expLines,
      ].join("\n")
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setFooter({ text: `Settimana ${week} di evento • Classifica settimanale` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(EVENTO_CLASSIFICA_EXP_PREFIX)
      .setLabel("Classifica EXP")
      .setEmoji("<:VC_Leaderboard:1482534806314287387>")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

async function buildEventoClassificaExpOnlyPayload(guild, selectedWeek = 1, currentEventWeek = 1) {
  const topExp = await getTop10ExpDuringEventExcludingHighStaff(guild, 10);

  const expLines = topExp.length
    ? topExp.map((item, i) => {
        const value = Number(
          item.activityExpDuringEvent != null
            ? item.activityExpDuringEvent
            : item.expDuringEvent,
        );
        return `${rankLabel(i)} <@${item.userId}> <a:VC_Arrow:1482706699365257397> **${value}** _EXP_`;
      })
    : ["<:VC_InactiveStatus:1482526984234860574> - Nessun dato per la classifica EXP."];

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<:VC_Leaderboard:1482534806314287387> Evento Activity EXP`)
    .setDescription(
      [
        "_Classifica cumulativa dell'evento_",
        "",
        "<:VC_Leaderboard:1482534806314287387> **Top 10 EXP**:",
        ...expLines,
      ].join("\n")
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setFooter({ text: "Solo EXP" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(EVENTO_CLASSIFICA_EXP_PREFIX)
      .setLabel("Classifica EXP")
      .setEmoji("<:VC_Leaderboard:1482534806314287387>")
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

module.exports = { name: "eventoClassifica", order: 10, match, execute, EVENTO_CLASSIFICA_PREFIX, MAX_WEEKS, buildEventoClassificaPayload, buildEventoClassificaExpOnlyPayload };