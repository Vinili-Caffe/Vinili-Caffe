const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, EmbedBuilder } = require("discord.js");
const { getServerOverviewStats } = require("../Services/Community/activityService");
const { renderServerActivityCanvas } = require("../Utils/Render/activityCanvas");
const { guildIconUrl } = require("../Utils/Discord/guildDiscordIdentity");
const { resolveTopChannelEntries, resolveTopUserEntriesForCanvas } = require("../Prefix/Stats/top");
const SERVER_REFRESH_CUSTOM_ID_PREFIX = "server_refresh";
const ALLOWED_LOOKBACK = [7, 14, 21, 30];
const SERVER_STATS_TIMEOUT_MS = Math.max(5_000, Math.min(60_000, Number(process.env.SERVER_STATS_TIMEOUT_MS ?? 18_000)));
const SERVER_RESOLVE_TIMEOUT_MS = Math.max(2_000, Math.min(30_000, Number(process.env.SERVER_RESOLVE_TIMEOUT_MS ?? 8_000)));
const SERVER_RENDER_TIMEOUT_MS = Math.max(5_000, Math.min(60_000, Number(process.env.SERVER_RENDER_TIMEOUT_MS ?? 22_000)));

function normalizeLookback(value) {
  const n = Number.parseInt(String(value || "14"), 10);
  return ALLOWED_LOOKBACK.includes(n) ? n : 14;
}

function match(interaction) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId || "";
  return id === SERVER_REFRESH_CUSTOM_ID_PREFIX || id.startsWith(`${SERVER_REFRESH_CUSTOM_ID_PREFIX}:`);
}

async function withServerTimeout(promise, label, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildRefreshRow(authorId, safeLookback) {
  const customId = authorId ? `${SERVER_REFRESH_CUSTOM_ID_PREFIX}:${authorId}:${safeLookback}:embed` : `${SERVER_REFRESH_CUSTOM_ID_PREFIX}:${safeLookback}:embed`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_Refresh:1473359252276904203> ")
  );
}

function formatVoice(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function buildServerFallbackPayload({ guild, safeLookback, authorId, stats = null, reason = null }) {
  const windowKey = `d${safeLookback}`;
  const selected = stats?.windows?.[windowKey] || stats?.windows?.d14 || stats?.windows?.d7 || stats?.windows?.d1 || null;
  const fields = [];
  if (selected) {
    fields.push(
      { name: "Messaggi", value: String(Number(selected.text || 0)), inline: true },
      { name: "Vocale", value: formatVoice(selected.voiceSeconds), inline: true },
      { name: "Utenti", value: String(Number(selected.contributors || 0)), inline: true },
    );
  }
  if (reason) {
    fields.push({ name: "Nota", value: "Il canvas/statistiche complete sono lente, quindi ho mandato il riepilogo leggero.", inline: false });
  }
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Statistiche server - ${guild?.name || "Server"}`)
    .setDescription(`Periodo: ultimi ${safeLookback} giorni`)
    .addFields(fields.length ? fields : [{ name: "Stato", value: "Statistiche temporaneamente lente. Riprova tra poco.", inline: false }]);
  return { embeds: [embed], files: [], components: [buildRefreshRow(authorId, safeLookback)] };
}

async function execute(interaction) {
  const { parseServerRefreshCustomId, denyIfNotOwner, sendControlErrorFallback } = require("../Utils/Interaction/buttonParsers");
  const parsed = parseServerRefreshCustomId(interaction.customId);
  if (!parsed) return false;
  const denied = await denyIfNotOwner(interaction, parsed.ownerId);
  if (denied) return true;

  const guild = interaction.guild;
  if (!guild) {
    await sendControlErrorFallback(interaction);
    return true;
  }

  try {
    await interaction.deferUpdate().catch(() => {});
    const payload = await buildServerOverviewPayload(guild, parsed.lookbackDays, parsed.ownerId || interaction.user?.id);
    const msg = interaction.message;
    if (!msg?.edit) {
      await sendControlErrorFallback(interaction);
      return true;
    }
    await msg.edit({
      files: payload.files || [],
      components: payload.components || [],
      embeds: Array.isArray(payload.embeds) ? payload.embeds : [],
      content: typeof payload.content === "string" ? payload.content : null,
    });
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/server] execute", err);
    await sendControlErrorFallback(interaction);
    return true;
  }
}

async function buildServerOverviewPayload(guild, lookbackDays, authorId) {
  const safeLookback = normalizeLookback(lookbackDays);
  let stats = null;
  try {
    stats = await withServerTimeout(getServerOverviewStats(guild.id, safeLookback, 3), "getServerOverviewStats", SERVER_STATS_TIMEOUT_MS);
  } catch (err) {
    global.logger?.error?.("[Buttons/server] stats timeout/failure", err?.stack || err?.message || err);
    return buildServerFallbackPayload({ guild, safeLookback, authorId, reason: err });
  }
  const guildName = guild.name || "Server";
  let guildIconUrlResolved = null;
  if (guild?.icon && typeof guild.iconURL === "function") {
    guildIconUrlResolved = guild.iconURL({ size: 512, extension: "png", forceStatic: true });
  }
  if (!guildIconUrlResolved) guildIconUrlResolved = guildIconUrl(guild, { size: 512 });
  const createdOn = guild.createdAt ?? new Date(0);
  const me = guild.members?.me;
  const invitedBotOn = (me?.joinedAt && me.joinedAt instanceof Date) ? me.joinedAt : (me?.joinedTimestamp ? new Date(me.joinedTimestamp) : createdOn);
  const emptySnapshot = new Map();
  let topUsersText = [];
  let topUsersVoice = [];
  let topChannelsText = [];
  let topChannelsVoice = [];
  try {
    [topUsersText, topUsersVoice, topChannelsText, topChannelsVoice] = await withServerTimeout(Promise.all([
      resolveTopUserEntriesForCanvas(guild, stats.topUsersText || []),
      resolveTopUserEntriesForCanvas(guild, stats.topUsersVoice || []),
      resolveTopChannelEntries(guild, stats.topChannelsText || [], emptySnapshot),
      resolveTopChannelEntries(guild, stats.topChannelsVoice || [], emptySnapshot),
    ]), "resolveServerTopEntries", SERVER_RESOLVE_TIMEOUT_MS);
  } catch (err) {
    global.logger?.warn?.("[Buttons/server] top entries fallback", err?.message || err);
  }
  let buffer = null;
  try {
    buffer = await withServerTimeout(
      renderServerActivityCanvas({ guildName, guildIconUrl: guildIconUrlResolved, createdOn, invitedBotOn, lookbackDays: safeLookback, windows: stats.windows, topUsersText, topUsersVoice, topChannelsText, topChannelsVoice, chart: stats.chart }),
      "renderServerActivityCanvas",
      SERVER_RENDER_TIMEOUT_MS,
    );
  } catch (err) {
    global.logger?.error?.("[Buttons/server] render timeout/failure", err?.stack || err?.message || err);
    return buildServerFallbackPayload({ guild, safeLookback, authorId, stats, reason: err });
  }
  const row = buildRefreshRow(authorId, safeLookback);

  const overviewExt =
    buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 ? "gif" : "png";
  const file = new AttachmentBuilder(buffer, { name: `server-overview.${overviewExt}` });
  return { files: [file], components: [row] };
}

function parseServerActivityArgs(args) {
  const raw = args && args[0] != null ? String(args[0]).trim() : "";
  const lookback = raw ? Number.parseInt(raw, 10) : 14;
  return { lookbackDays: normalizeLookback(lookback) };
}

module.exports = { name: "server", order: 5, match, execute, SERVER_REFRESH_CUSTOM_ID_PREFIX, buildServerOverviewPayload, parseServerActivityArgs };