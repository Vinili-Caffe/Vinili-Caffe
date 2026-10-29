const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");
const { safeMessageReply } = require("./replyRuntime") as typeof import("./replyRuntime");
const { formatCompactUptime } = require("./uptimeFormat") as typeof import("./uptimeFormat");
const { embedTwoColumnStack } = require("./embedTwoColumnFields") as typeof import("./embedTwoColumnFields");

function getShardLabel(client?, guild?) {
  if (guild?.shardId != null && Number.isFinite(guild.shardId)) {
    return String(guild.shardId);
  }
  const shardIds = Array.isArray(client?.shard?.ids)
    ? client.shard.ids.map((id?) => Number(id)).filter((id?) => Number.isInteger(id) && id >= 0)
    : [];
  if (shardIds.length) return String(shardIds[0]);
  return "0";
}

function buildPingStatStack(uptimeString?, apiLabel?, databaseLabel?, shardLabel?, labels: Record<string, any> = {}) {
  const uptime = labels.uptime || "Uptime";
  const database = labels.database || "Database";
  const api = labels.api || "API";
  const shard = labels.shard || "Shard";
  return embedTwoColumnStack(
    [
      `<:Clock:1330530065133338685> **${uptime}:** \`${uptimeString}\``,
      `<:DatabaseCheck:1330543470259212329> **${database}:** ${databaseLabel}`,
    ],
    [
      `<a:VC_Loading:1482526772862914776> **${api}:** \`${apiLabel}\``,
      `<a:VC_Calendar:1482706208149475358> **${shard}:** \`${shardLabel}\``,
    ],
  );
}

function buildPingEmbed(gatewayPing?, uptimeString?, apiLabel?, databaseLabel?, shardLabel?, options: Record<string, any> = {}) {
  const labels = options.labels && typeof options.labels === "object" ? options.labels : {};
  const latencyText = typeof options.formatLatencyText === "function"
    ? options.formatLatencyText(gatewayPing)
    : (options.latencyText
      || `<:VC_Status_5:1472011474909008017> La **latenza** del bot è di **\`${gatewayPing}ms\`**`);
  const color = options.color || "#6f4e37";
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(latencyText)
    .addFields(...buildPingStatStack(uptimeString, apiLabel, databaseLabel, shardLabel, labels));
}

async function measureRestLatencyMs(client?) {
  if (!client?.rest?.get) return null;
  const startedAt = Date.now();
  try {
    await client.rest.get(Routes.user("@me"));
    return Math.max(0, Date.now() - startedAt);
  } catch {
    return null;
  }
}

function formatDatabaseLabel(databasePing?, offlineLabel = "offline") {
  return Number.isFinite(databasePing) && databasePing >= 0 ? `\`${databasePing}ms\`` : `\`${offlineLabel}\``;
}

function formatApiLabel(restPing?, ndLabel = "n/d") {
  return Number.isFinite(restPing) && restPing >= 0 ? `${restPing}ms` : ndLabel;
}

async function measureDatabaseLatencyMs(pingDbLatencyMs?) {
  if (typeof pingDbLatencyMs !== "function") return null;
  try {
    const ms = await pingDbLatencyMs();
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
  } catch {
    return null;
  }
}

async function executePingCommand(message?, options: Record<string, any> = {}) {
  const client = message?.client;
  if (!client) return null;

  await message.channel?.sendTyping?.().catch(() => null);

  const rawGatewayPing = Number(client.ws.ping ?? 0);
  const gatewayPing =
    Number.isFinite(rawGatewayPing) && rawGatewayPing >= 0 ? rawGatewayPing : 0;
  const shardLabel = getShardLabel(client, message.guild);
  const uptimeString = formatCompactUptime(process.uptime());

  const [databasePing, restPing] = await Promise.all([
    measureDatabaseLatencyMs(options.pingDbLatencyMs),
    measureRestLatencyMs(client),
  ]);

  const offlineLabel = options.offlineLabel || "offline";
  const ndLabel = options.ndLabel || "n/d";
  const embed = buildPingEmbed(
    gatewayPing,
    uptimeString,
    formatApiLabel(restPing, ndLabel),
    formatDatabaseLabel(databasePing, offlineLabel),
    shardLabel,
    options,
  );

  return safeMessageReply(message, {
    embeds: [embed],
    allowedMentions: { repliedUser: false },
  });
}

export = {
  executePingCommand,
  buildPingEmbed,
  measureRestLatencyMs,
  measureDatabaseLatencyMs,
  getShardLabel,
};
