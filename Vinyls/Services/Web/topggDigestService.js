const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");

function pickTopggStatsFields(data) {
  if (!data || typeof data !== "object") return [];
  const rows = [];
  const add = (label, key) => {
    const v = data[key];
    if (v == null || v === "") return;
    const s = typeof v === "number" && Number.isFinite(v) ? String(Math.trunc(v)) : String(v);
    if (!s) return;
    rows.push({ name: label, value: s.slice(0, 1024), inline: true });
  };
  add("Punti", "points");
  add("Punti mensili", "monthly_points");
  add("Voti mensili", "monthlyVotes");
  add("Tot. voti", "totalVotes");
  add("Server", "server_count");
  return rows.slice(0, 25);
}

function resolveTopggBotUrl(client) {
  const fromCfg = String(client?.config?.topgg?.votePageUrl || "").trim();
  if (fromCfg) return fromCfg.replace(/\/+$/, "");
  const bid = String(client?.user?.id || "").trim();
  return bid ? `https://top.gg/bot/${bid}` : "";
}

/**
 * Opzionale: se in .env c’è TOPGG_API_TOKEN e in config `topgg.statsDigestChannelId`,
 * invia un embed con le statistiche pubbliche del bot e il link alla pagina Top.gg (dove si lasciano le recensioni).
 * L’API Top.gg non espone il testo delle singole recensioni in modo documentato per webhook.
 */
async function postTopggStatsDigestIfConfigured(client) {
  const channelId = String(client?.config?.topgg?.statsDigestChannelId || "").trim();
  const token = String(process.env.TOPGG_API_TOKEN || "").trim();
  const botId = String(client?.user?.id || "").trim();
  if (!channelId || !token || !botId) return { skipped: true };

  let data = null;
  try {
    const res = await axios.get(`https://top.gg/api/bots/${botId}`, {
      headers: { Authorization: token },
      timeout: 12_000,
      validateStatus: (s) => s >= 200 && s < 500,
    });
    if (res.status !== 200 || !res.data) {
      global.logger?.warn?.("[TOPGG] stats digest: API status", res.status);
      return { skipped: true, status: res.status };
    }
    data = res.data;
  } catch (err) {
    global.logger?.warn?.("[TOPGG] stats digest fetch failed:", err?.message || err);
    return { skipped: true };
  }

  const channel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId));
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[TOPGG] stats digest: channel not usable", channelId);
    return { skipped: true };
  }

  const baseUrl = resolveTopggBotUrl(client) || `https://top.gg/bot/${botId}`;
  const fields = pickTopggStatsFields(data);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Top.gg — statistiche bot")
    .setDescription(
      "Le **recensioni** restano sulla scheda Top.gg (nessun webhook recensioni documentato).\n" +
        `· [Scheda bot su Top.gg](${baseUrl})`,
    )
    .setTimestamp(new Date());
  if (fields.length) embed.addFields(fields);

  await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger?.warn?.("[TOPGG] stats digest send failed:", err?.message || err);
  });
  return { ok: true, fields: fields.length };
}

module.exports = { postTopggStatsDigestIfConfigured, resolveTopggBotUrl };