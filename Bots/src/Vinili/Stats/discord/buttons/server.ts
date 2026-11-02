const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { getServerOverviewStats } = require("../../../Services/Community/activityService") as typeof import("../../../Services/Community/activityService");
const { renderServerActivityCanvas, prefetchStatsCanvasAvatar } = require("../../../Utils/Render/activityCanvas") as typeof import("../../../Utils/Render/activityCanvas");
const { getOrBuildStatsCanvasBuffer } = require("../../runtime/statsCanvasCache") as typeof import("../../runtime/statsCanvasCache");
const { guildIconUrl } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { resolveTopChannelEntries, resolveTopUserEntriesForCanvas } = require("../prefix/top") as typeof import("../prefix/top");
const SERVER_REFRESH_CUSTOM_ID_PREFIX = "server_refresh";
const ALLOWED_LOOKBACK = [7, 14, 21, 30];
const SERVER_STATS_TIMEOUT_MS = Math.max(5_000, Math.min(60_000, Number(process.env.SERVER_STATS_TIMEOUT_MS ?? 18_000)));
const SERVER_RESOLVE_TIMEOUT_MS = Math.max(2_000, Math.min(30_000, Number(process.env.SERVER_RESOLVE_TIMEOUT_MS ?? 8_000)));
const SERVER_RENDER_TIMEOUT_MS = Math.max(5_000, Math.min(60_000, Number(process.env.SERVER_RENDER_TIMEOUT_MS ?? 12_000)));
const SERVER_CANVAS_GIF = String(process.env.VC_SERVER_CANVAS_GIF ?? "0").trim() === "1";
const serverRenderEpochByGuild = new Map();

function beginServerRenderEpoch(guildId?) {
  const key = String(guildId || "");
  const n = (serverRenderEpochByGuild.get(key) || 0) + 1;
  serverRenderEpochByGuild.set(key, n);
  return n;
}

function isCurrentServerRenderEpoch(guildId?, epoch?) {
  return serverRenderEpochByGuild.get(String(guildId || "")) === epoch;
}

function normalizeLookback(value?) {
  const n = Number.parseInt(String(value || "14"), 10);
  return ALLOWED_LOOKBACK.includes(n) ? n : 14;
}

function match(interaction?) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId || "";
  return id === SERVER_REFRESH_CUSTOM_ID_PREFIX || id.startsWith(`${SERVER_REFRESH_CUSTOM_ID_PREFIX}:`);
}

async function withServerTimeout(promise?, label?, timeoutMs?) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_?, reject?) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildRefreshRow(authorId?, safeLookback?) {
  const customId = authorId ? `${SERVER_REFRESH_CUSTOM_ID_PREFIX}:${authorId}:${safeLookback}:embed` : `${SERVER_REFRESH_CUSTOM_ID_PREFIX}:${safeLookback}:embed`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_Refresh:1473359252276904203> ")
  );
}

function formatVoice(seconds?) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function buildServerFallbackPayload({ guild, safeLookback, authorId, stats = null, reason = null, pending = false }) {
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
  const lines = [`Periodo: ultimi **${safeLookback}** giorni`];
  if (pending) {
    lines.push("", "<a:VC_pixeltime:1482535344103620771> Sto ancora generando il grafico…");
  } else if (reason) {
    lines.push("", "<a:VC_pixeltime:1482535344103620771> Grafico non generato in tempo. Premi ↻ per riprovare.");
  }
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Statistiche Server")
    .setDescription(lines.join("\n"));
  if (fields.length) embed.setFields(fields);
  if (guild?.name) embed.setFooter({ text: String(guild.name).slice(0, 2048) });
  return { embeds: [embed], files: [], components: [buildRefreshRow(authorId, safeLookback)] };
}

function buildServerLoadingPayload(safeLookback?, authorId?) {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Statistiche Server")
    .setDescription(`<a:VC_pixeltime:1482535344103620771> Caricamento ultimi **${safeLookback}** giorni…`);
  return { embeds: [embed], files: [], components: [buildRefreshRow(authorId, safeLookback)] };
}

function normalizeServerMessageEdit(payload?, allowedMentions = null) {
  const out: Record<string, any> = {
    content: payload?.content != null ? String(payload.content) : "",
    embeds: Array.isArray(payload?.embeds) ? payload.embeds : [],
    files: payload?.files || [],
    components: payload?.components || [],
  };
  if (allowedMentions) out.allowedMentions = allowedMentions;
  return out;
}

async function editServerPanel(interaction?, payload?) {
  const msg = interaction.message;
  const body = normalizeServerMessageEdit(payload);
  if (!msg?.edit) {
    if (interaction.channel?.send) await interaction.channel.send(body).catch(() => null);
    return;
  }
  try {
    await msg.edit(body);
  } catch (err) {
    if (err?.code === 10008) {
      await interaction.channel?.send?.(body).catch(() => null);
      return;
    }
    throw err;
  }
}

async function execute(interaction?) {
  const { parseServerRefreshCustomId, denyIfNotOwner, sendControlErrorFallback } = require("../../../Utils/Interaction/buttonParsers") as typeof import("../../../Utils/Interaction/buttonParsers");
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
    const safeLookback = normalizeLookback(parsed.lookbackDays);
    const authorId = parsed.ownerId || interaction.user?.id;
    const payload = await buildServerOverviewPayload(guild, safeLookback, authorId, {
      onLateImage: (finalPayload?) => editServerPanel(interaction, finalPayload),
    });
    await editServerPanel(interaction, payload);
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/server] execute", err);
    await sendControlErrorFallback(interaction);
    return true;
  }
}

function buildServerImagePayload(buffer?, authorId?, safeLookback?) {
  const row = buildRefreshRow(authorId, safeLookback);
  const overviewExt =
    Buffer.isBuffer(buffer) && buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46
      ? "gif"
      : "png";
  const file = new AttachmentBuilder(buffer, { name: `server-overview.${overviewExt}` });
  return { files: [file], embeds: [], components: [row] };
}

async function buildServerOverviewPayload(guild?, lookbackDays?, authorId?, hooks: Record<string, any> = {}) {
  const epoch = beginServerRenderEpoch(guild?.id);
  const safeLookback = normalizeLookback(lookbackDays);
  let guildIconUrlResolved = null;
  if (guild?.icon && typeof guild.iconURL === "function") {
    guildIconUrlResolved = guild.iconURL({ size: 512, extension: "png", forceStatic: true });
  }
  if (!guildIconUrlResolved) guildIconUrlResolved = guildIconUrl(guild, { size: 512 });

  let stats = null;
  let guildIconPrefetch = null;
  try {
    const bundle = await withServerTimeout(
      Promise.all([
        getServerOverviewStats(guild.id, safeLookback, 3),
        guildIconUrlResolved ? prefetchStatsCanvasAvatar(guildIconUrlResolved) : Promise.resolve(null),
      ]),
      "getServerOverviewStats",
      SERVER_STATS_TIMEOUT_MS,
    );
    stats = bundle[0];
    guildIconPrefetch = bundle[1];
  } catch (err) {
    global.logger?.error?.("[Buttons/server] stats timeout/failure", err?.stack || err?.message || err);
    return buildServerFallbackPayload({ guild, safeLookback, authorId, reason: err });
  }

  const guildName = guild.name || "Server";
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

  const renderPromise = getOrBuildStatsCanvasBuffer(`server:${guild.id}:${safeLookback}`, () =>
    renderServerActivityCanvas({
      guildName,
      guildIconUrl: guildIconUrlResolved,
      guildIconPrefetch,
      createdOn,
      invitedBotOn,
      lookbackDays: safeLookback,
      windows: stats.windows,
      topUsersText,
      topUsersVoice,
      topChannelsText,
      topChannelsVoice,
      chart: stats.chart,
      forceStatic: !SERVER_CANVAS_GIF,
    }),
  );

  const deliverLate = (payload?) => {
    if (!isCurrentServerRenderEpoch(guild?.id, epoch)) return;
    if (typeof hooks.onLateImage !== "function") return;
    Promise.resolve(hooks.onLateImage(payload)).catch((err?) => {
      global.logger?.warn?.("[Buttons/server] late image", err?.message || err);
    });
  };

  let buffer = null;
  try {
    buffer = await withServerTimeout(renderPromise, "renderServerActivityCanvas", SERVER_RENDER_TIMEOUT_MS);
  } catch (err) {
    global.logger?.warn?.("[Buttons/server] render timeout, keeping background render", err?.message || err);
    renderPromise.then(
      (buf?) => {
        if (!Buffer.isBuffer(buf) || !buf.length) {
          deliverLate(buildServerFallbackPayload({ guild, safeLookback, authorId, stats, reason: err, pending: false }));
          return;
        }
        deliverLate(buildServerImagePayload(buf, authorId, safeLookback));
      },
      (lateErr?) => {
        deliverLate(buildServerFallbackPayload({ guild, safeLookback, authorId, stats, reason: lateErr || err, pending: false }));
      },
    );
    return buildServerFallbackPayload({ guild, safeLookback, authorId, stats, reason: err, pending: true });
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return buildServerFallbackPayload({ guild, safeLookback, authorId, stats, reason: new Error("empty canvas"), pending: false });
  }
  return buildServerImagePayload(buffer, authorId, safeLookback);
}

function parseServerActivityArgs(args?) {
  const raw = args && args[0] != null ? String(args[0]).trim() : "";
  const lookback = raw ? Number.parseInt(raw, 10) : 14;
  return { lookbackDays: normalizeLookback(lookback) };
}

export = { name: "server", order: 5, match, execute, SERVER_REFRESH_CUSTOM_ID_PREFIX, buildServerOverviewPayload, buildServerLoadingPayload, normalizeServerMessageEdit, parseServerActivityArgs };