const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const {
  getClientChannelCached,
  getClientGuildCached,
  getGuildChannelCached,
} = require("../discord/interactionEntityCache") as typeof import("../discord/interactionEntityCache");
const {
  embedThumbnailAvatarUrl,
  memberDisplayName,
} = require("../discord/guildDiscordIdentity") as typeof import("../discord/guildDiscordIdentity");

function createCommandUsageLogger(IDs?, options: Record<string, any> = {}) {
  const RESOLUTION_CACHE_TTL_MS = 30_000;
  const EMBED_FIELD_MAX = 1024;
  const truncateFields = options.truncateFields !== false;
  const resolutionCache = new Map();

  function truncateEmbedField(value?, max = EMBED_FIELD_MAX) {
    const s = String(value ?? "");
    if (!truncateFields || s.length <= max) return s;
    return `${s.slice(0, Math.max(0, max - 1))}…`;
  }

  function formatCommandContentField(content?) {
    const raw = String(content ?? "");
    if (!truncateFields) return `\`\`\`${raw}\`\`\``;
    const overhead = 6;
    const maxInner = Math.max(0, EMBED_FIELD_MAX - overhead);
    const inner = raw.length <= maxInner ? raw : `${raw.slice(0, Math.max(0, maxInner - 1))}…`;
    return `\`\`\`${inner}\`\`\``;
  }

  function getCacheKey(kind?, primaryId?, secondaryId?) {
    return `${kind}:${String(primaryId || "none")}:${String(secondaryId || "none")}`;
  }

  function getCachedValue(key?) {
    const cached = resolutionCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;
    if (cached) resolutionCache.delete(key);
    return null;
  }

  function setCachedValue(key?, value?) {
    resolutionCache.set(key, {
      value: value || null,
      expiresAt: Date.now() + RESOLUTION_CACHE_TTL_MS,
    });
    return value || null;
  }

  async function getChannelSafe(client?, channelId?) {
    if (!channelId) return null;
    const cacheKey = getCacheKey("channel", client?.user?.id, channelId);
    const cached = getCachedValue(cacheKey);
    if (cached) return cached;
    const channel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId));
    return setCachedValue(cacheKey, channel);
  }

  async function getCentralChannel(client?, channelId?) {
    if (!client || !channelId) return getChannelSafe(client, channelId);
    const cacheKey = getCacheKey("central", client?.user?.id, channelId);
    const cached = getCachedValue(cacheKey);
    if (cached) return cached;
    const mainGuildId = IDs?.guilds?.main || null;
    if (!mainGuildId) return getChannelSafe(client, channelId);
    const guild = client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId));
    if (!guild) return getChannelSafe(client, channelId);
    const centralChannel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
    if (centralChannel) return setCachedValue(cacheKey, centralChannel);
    return getChannelSafe(client, channelId);
  }

  async function logCommandUsage(client, { channelId, serverName, user, userId, content, userLike }) {
    if (!channelId) return;
    const channel = await getCentralChannel(client, channelId);
    if (!channel) return;
    if (options.requireTextBased && !channel?.isTextBased?.()) return;
    const displayName =
      memberDisplayName(userLike) || String(user || "").trim() || String(userId || "unknown");
    const userFieldIcon = options.userFieldIcon || "<:member_role_icon:1330530086792728618>";
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setAuthor({
        name: `${displayName} ha usato un comando.`,
        iconURL: embedThumbnailAvatarUrl(userLike || { id: userId }, { size: 64 }),
      })
      .setTitle(`${client.user.username} - Log Comandi`)
      .addFields(
        { name: "<a:VC_Channel:1482534583944871996> Server:", value: truncateEmbedField(serverName || "—") },
        { name: "<:VC_Bot:1482526555174604964> Comando:", value: formatCommandContentField(content) },
        { name: `${userFieldIcon} Utente:`, value: truncateEmbedField(`${displayName} · \`${userId}\``) },
      )
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch((err?) => {
      global.logger?.warn?.("[commandUsageLogger] send failed:", channelId, err?.message || err);
    });
  }

  return { logCommandUsage, getChannelSafe, getCentralChannel };
}

export = { createCommandUsageLogger };
