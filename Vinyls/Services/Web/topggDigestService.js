const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");

const TOPGG_REVIEW_SNAPSHOT_KEY = "topgg_review_digest_snapshot";

function readFirstDefined(data, keys) {
  if (!data || typeof data !== "object") return undefined;
  for (const k of keys) {
    if (!k) continue;
    const v = data[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function toFiniteNumber(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Conteggio e media aggregati se l’API li espone (chiavi legacy / camelCase). */
function extractReviewAggregate(data) {
  const countRaw = readFirstDefined(data, ["review_count", "reviewCount", "reviews_count", "reviewsCount"]);
  const scoreRaw = readFirstDefined(data, ["review_score", "reviewScore", "reviews_average", "reviewsAverage"]);
  const count = countRaw != null ? Math.trunc(Number(countRaw)) : null;
  const score = toFiniteNumber(scoreRaw);
  const safeCount = count != null && Number.isFinite(count) && count >= 0 ? count : null;
  return { count: safeCount, score };
}

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
  const { count: rc, score: rs } = extractReviewAggregate(data);
  if (rc != null) {
    rows.push({ name: "Recensioni (n.)", value: String(rc), inline: true });
  }
  if (rs != null) {
    const label = rs <= 5 ? "Media recensioni (/5)" : "Media recensioni";
    rows.push({ name: label, value: String(rs).slice(0, 32), inline: true });
  }
  return rows.slice(0, 25);
}

/** Scheda Top.gg per digest statistiche: non usare votePageUrl (hub sul sito). */
function resolveTopggStatsDigestSchedaUrl(client, botId) {
  const explicit = String(client?.config?.topgg?.statsDigestListingUrl || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const bid = String(botId || client?.user?.id || "").trim();
  return bid ? `https://top.gg/bot/${bid}` : "";
}

function resolveTopggBotUrl(client) {
  return resolveTopggStatsDigestSchedaUrl(client, client?.user?.id);
}

/** URL tab recensioni: override `topgg.reviewsPageUrl`, altrimenti `/reviews` sulla scheda digest. */
function resolveTopggReviewsUrl(client, botId) {
  const explicit = String(client?.config?.topgg?.reviewsPageUrl || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const base =
    resolveTopggStatsDigestSchedaUrl(client, botId) ||
    (String(botId || client?.user?.id || "").trim()
      ? `https://top.gg/bot/${String(botId || client?.user?.id || "").trim()}`
      : "");
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/reviews`;
}

/**
 * Opzionale: se in .env c’è TOPGG_API_TOKEN e in config `topgg.statsDigestChannelId`,
 * invia un embed con statistiche pubbliche + link recensioni.
 * L’API non espone in modo stabile il **testo** delle singole recensioni; non esiste webhook recensioni documentato.
 * Confronta `review_count` con l’ultimo digest salvato in BotState e segnala incrementi.
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

  const baseUrl = resolveTopggStatsDigestSchedaUrl(client, botId) || `https://top.gg/bot/${botId}`;
  const reviewsUrl = resolveTopggReviewsUrl(client, botId);
  const { count: reviewCount, score: reviewScore } = extractReviewAggregate(data);
  const prevSnap = await getBotState(TOPGG_REVIEW_SNAPSHOT_KEY);
  const prevCount = Number(prevSnap?.count);
  let deltaLine = "";
  if (reviewCount != null && Number.isFinite(prevCount) && reviewCount > prevCount) {
    deltaLine = `\n\n**Recensioni:** rispetto all’ultimo digest risultano **+${reviewCount - prevCount}** (${prevCount} → ${reviewCount}).`;
  }

  const fields = pickTopggStatsFields(data);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Top.gg — statistiche e recensioni")
    .setDescription(
      [
        "L’API del bot fornisce di solito solo **aggregati** (conteggio / media). Il **testo** delle singole recensioni non è disponibile in modo affidabile; **non** esiste un webhook ufficiale solo-recensioni.",
        "",
        `· [Scheda](${baseUrl})`,
        reviewsUrl ? `· [Recensioni](${reviewsUrl})` : "",
        deltaLine,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setTimestamp(new Date());
  if (fields.length) embed.addFields(fields);

  const sent = await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger?.warn?.("[TOPGG] stats digest send failed:", err?.message || err);
    return null;
  });
  if (sent && reviewCount != null) {
    await setBotState(TOPGG_REVIEW_SNAPSHOT_KEY, {
      count: reviewCount,
      score: reviewScore != null ? reviewScore : null,
      at: Date.now(),
    });
  }
  return { ok: Boolean(sent), fields: fields.length, reviewCount };
}

module.exports = { postTopggStatsDigestIfConfigured, resolveTopggBotUrl, resolveTopggReviewsUrl };