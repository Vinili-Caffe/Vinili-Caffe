const { EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");

function formatUptime(uptime) {
  const minutes = Math.floor((uptime / 60) % 60);
  const hours = Math.floor((uptime / (60 * 60)) % 24);
  const days = Math.floor(uptime / (60 * 60 * 24));
  return `${days}d ${hours}h ${minutes}m`;
}

function getShardLabel(client) {
  const shardIds = Array.isArray(client?.shard?.ids)
    ? client.shard.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id >= 0)
    : [];
  if (!shardIds.length) return "single";
  const totalShards = Number(client?.shard?.count || 0);
  const current = shardIds.join(", ");
  return totalShards > 0 ? `${current}/${totalShards}` : current;
}

async function pingDbLatencyMs() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  const startedAt = Date.now();
  await db.admin().ping();
  return Math.max(0, Date.now() - startedAt);
}

module.exports = {
  name: "ping",
  allowEmptyArgs: true,
  description: "Mostra latenza bot, database e uptime.",
  async execute(message) {
    const gatewayPing = Number(message.client.ws.ping || 0);
    const shardLabel = getShardLabel(message.client);
    const uptimeString = formatUptime(process.uptime());
    const databasePing = await pingDbLatencyMs().catch(() => null);
    const databaseLabel = Number.isFinite(databasePing) && databasePing >= 0 ? `\`${databasePing}ms\`` : "`offline`";
    const empty = "\u200b";

    const pingEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(`<:VC_Status_5:1472011474909008017> Ping: **\`${gatewayPing}ms\`**`)
      .addFields(
        { name: `<:clock:1502622515825217756> **Uptime:** \`${uptimeString}\``, value: empty, inline: true },
        { name: `<a:VC_Loading:1482526772862914776> **API:** \`...\``, value: empty, inline: true },
        { name: empty, value: empty, inline: true },
        { name: `<:DatabaseCheck:1502622781236449500> **Database:** ${databaseLabel}`, value: empty, inline: true },
        { name: `<a:VC_Calendar:1482706208149475358> **Shard:** \`${shardLabel}\``, value: empty, inline: true },
        { name: empty, value: empty, inline: true },
      );

    const sent = await safeMessageReply(message, {
      embeds: [pingEmbed],
      allowedMentions: { repliedUser: false },
    });
    if (!sent?.editable) return;

    const apiStart = Date.now();
    const apiMs = Math.max(0, Date.now() - apiStart);
    const finalEmbed = EmbedBuilder.from(pingEmbed).spliceFields(1, 1, {
      name: `<a:VC_Loading:1482526772862914776> **API:** \`${apiMs}ms\``,
      value: empty,
      inline: true,
    });
    await sent.edit({ embeds: [finalEmbed], allowedMentions: { repliedUser: false } }).catch(() => null);
  },
};
