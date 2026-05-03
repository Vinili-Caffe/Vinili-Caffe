const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require("discord.js");
const { getServerOverviewStats } = require("../Services/Community/activityService");
const { renderServerActivityCanvas } = require("../Utils/Render/activityCanvas");
const { guildIconUrl } = require("../Utils/Discord/guildDiscordIdentity");
const { resolveTopChannelEntries, resolveTopUserEntriesForCanvas } = require("../Prefix/Stats/top");
const SERVER_REFRESH_CUSTOM_ID_PREFIX = "server_refresh";
const ALLOWED_LOOKBACK = [7, 14, 21, 30];

function normalizeLookback(value) {
  const n = Number.parseInt(String(value || "14"), 10);
  return ALLOWED_LOOKBACK.includes(n) ? n : 14;
}

function match(interaction) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId || "";
  return id === SERVER_REFRESH_CUSTOM_ID_PREFIX || id.startsWith(`${SERVER_REFRESH_CUSTOM_ID_PREFIX}:`);
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
  const stats = await getServerOverviewStats(guild.id, safeLookback, 3);
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
  const [topUsersText, topUsersVoice, topChannelsText, topChannelsVoice] = await Promise.all([
    resolveTopUserEntriesForCanvas(guild, stats.topUsersText || []),
    resolveTopUserEntriesForCanvas(guild, stats.topUsersVoice || []),
    resolveTopChannelEntries(guild, stats.topChannelsText || [], emptySnapshot),
    resolveTopChannelEntries(guild, stats.topChannelsVoice || [], emptySnapshot),
  ]);
  const buffer = await renderServerActivityCanvas({ guildName, guildIconUrl: guildIconUrlResolved, createdOn, invitedBotOn, lookbackDays: safeLookback, windows: stats.windows, topUsersText, topUsersVoice, topChannelsText, topChannelsVoice, chart: stats.chart });
  const customId = authorId ? `${SERVER_REFRESH_CUSTOM_ID_PREFIX}:${authorId}:${safeLookback}:embed` : `${SERVER_REFRESH_CUSTOM_ID_PREFIX}:${safeLookback}:embed`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_Refresh:1473359252276904203> ")
  );

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