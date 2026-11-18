/** Caricamento backup: ruoli, canali e permessi ricreati dal backup. */
const { sleep } = require("./backupLoadSessions") as typeof import("./backupLoadSessions");

function mapOverwriteId(rawId?, roleMap?, guild?) {
  const id = String(rawId || "");
  if (!id) return null;
  if (roleMap.has(id)) return roleMap.get(id);
  if (id === String(guild.id)) return String(guild.id);
  return id;
}

function buildPermissionOverwrites(overwrites?, roleMap?, guild?) {
  const list = Array.isArray(overwrites) ? overwrites : [];
  return list
    .map((ow?) => {
      const id = mapOverwriteId(ow?.id, roleMap, guild);
      if (!id) return null;
      return {
        id,
        type: Number(ow?.type ?? 0),
        allow: BigInt(String(ow?.allow ?? "0")),
        deny: BigInt(String(ow?.deny ?? "0")),
      };
    })
    .filter(Boolean);
}

async function syncLoadedRoles({ guild, backupRoles, roleMap, backupId, throwIfCancelledFn, bumpProcessedFn }) {
  const roles = (Array.isArray(backupRoles) ? backupRoles : []).filter((r?) => String(r?.name || "").trim() !== "@everyone").sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

  for (const backupRole of roles) {
    throwIfCancelledFn();
    const mappedRoleId = roleMap.get(String(backupRole.id || ""));
    if (!mappedRoleId) continue;
    const role = guild.roles.cache.get(mappedRoleId);
    if (!role || !role.editable) continue;

    const icon = await resolveAssetInput(backupRole.iconData || backupRole.iconURL || null);
    await role
      .edit({
        name: String(backupRole.name || role.name),
        color: Number(backupRole.color || 0),
        hoist: Boolean(backupRole.hoist),
        mentionable: Boolean(backupRole.mentionable),
        permissions: BigInt(String(backupRole.permissions || "0")),
        ...(icon ? { icon } : {}),
        unicodeEmoji: backupRole.unicodeEmoji || undefined,
        reason: `Backup load ${backupId}`,
      })
      .catch(() => null);
    bumpProcessedFn();
    await sleep(120);
  }

  for (const backupRole of roles) {
    throwIfCancelledFn();
    const mappedRoleId = roleMap.get(String(backupRole.id || ""));
    if (!mappedRoleId) continue;
    const role = guild.roles.cache.get(mappedRoleId);
    if (!role || !role.editable) continue;
    await role
      .setPosition(Number(backupRole.position ?? role.position), {
        reason: `Backup load ${backupId}`,
      })
      .catch(() => null);
    bumpProcessedFn();
    await sleep(100);
  }
}

async function syncLoadedChannels({ guild, backupChannels, roleMap, channelMap, backupId, throwIfCancelledFn, bumpProcessedFn }) {
  const channels = Array.isArray(backupChannels) ? backupChannels : [];
  const categories = channels.filter((c?) => Number(c?.type) === 4).sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
  const others = channels.filter((c?) => Number(c?.type) !== 4).sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

  for (const backupChannel of [...categories, ...others]) {
    throwIfCancelledFn();
    const mappedChannelId = channelMap.get(String(backupChannel.id || ""));
    if (!mappedChannelId) continue;
    const channel = guild.channels.cache.get(mappedChannelId);
    if (!channel || !channel.manageable) continue;

    const parentMapped = backupChannel.parentId ? channelMap.get(String(backupChannel.parentId)) || null : null;
    const patch: Record<string, any> = {
      name: String(backupChannel.name || channel.name), position: Number(backupChannel.position ?? channel.position), permissionOverwrites: buildPermissionOverwrites(backupChannel.permissionOverwrites, roleMap, guild,), reason: `Backup load ${backupId}`,
    };

    if (Number(backupChannel.type) !== 4) {
      patch.parent = parentMapped || null;
    }
    if ("topic" in backupChannel && "topic" in channel) {
      patch.topic = backupChannel.topic || null;
    }
    if ("nsfw" in backupChannel && "nsfw" in channel) {
      patch.nsfw = Boolean(backupChannel.nsfw);
    }
    if ("rateLimitPerUser" in backupChannel && "rateLimitPerUser" in channel) {
      patch.rateLimitPerUser = Number(backupChannel.rateLimitPerUser ?? 0);
    }
    if ("bitrate" in backupChannel && "bitrate" in channel) {
      patch.bitrate =
        Number(backupChannel.bitrate ?? channel.bitrate ?? 0) || undefined;
    }
    if ("userLimit" in backupChannel && "userLimit" in channel) {
      patch.userLimit = Number(backupChannel.userLimit ?? 0) || undefined;
    }
    if ("rtcRegion" in backupChannel && "rtcRegion" in channel) {
      patch.rtcRegion = backupChannel.rtcRegion || null;
    }
    if ("videoQualityMode" in backupChannel && "videoQualityMode" in channel) {
      patch.videoQualityMode = backupChannel.videoQualityMode ?? undefined;
    }
    if ("defaultAutoArchiveDuration" in backupChannel && "defaultAutoArchiveDuration" in channel) {
      patch.defaultAutoArchiveDuration =
        backupChannel.defaultAutoArchiveDuration ?? undefined;
    }
    if ("defaultThreadRateLimitPerUser" in backupChannel && "defaultThreadRateLimitPerUser" in channel) {
      patch.defaultThreadRateLimitPerUser =
        backupChannel.defaultThreadRateLimitPerUser ?? undefined;
    }
    if ("defaultForumLayout" in backupChannel && "defaultForumLayout" in channel) {
      patch.defaultForumLayout = backupChannel.defaultForumLayout ?? undefined;
    }
    if ("defaultSortOrder" in backupChannel && "defaultSortOrder" in channel) {
      patch.defaultSortOrder = backupChannel.defaultSortOrder ?? undefined;
    }
    if ("availableTags" in backupChannel && "availableTags" in channel) {
      patch.availableTags = Array.isArray(backupChannel.availableTags)
        ? backupChannel.availableTags
        : undefined;
    }
    if ("defaultReactionEmoji" in backupChannel && "defaultReactionEmoji" in channel) {
      patch.defaultReactionEmoji = backupChannel.defaultReactionEmoji || undefined;
    }

    await channel.edit(patch).catch(() => null);
    bumpProcessedFn();
    await sleep(120);
  }
}

function normalizeMessagePayload(message?, backupId?, opts: Record<string, any> = {}) {
  const viaWebhook = Boolean(opts.viaWebhook);
  const contentRaw = String(message?.content || "");
  let content = contentRaw;
  if (!viaWebhook) {
    const authorTag =
      message?.author?.tag || message?.author?.username || message?.author?.id || "Sconosciuto";
    const header = `**[${backupId}] ${authorTag}**`;
    content = contentRaw.trim() ? `${header}\n${contentRaw}` : header;
  }

  const embedList = Array.isArray(message?.embeds) ? message.embeds.slice(0, 10) : [];
  const embeds = embedList
    .map((emb?) => {
      if (!emb || typeof emb !== "object") return null;
      const clone = { ...emb };
      if (Array.isArray(clone.fields) && clone.fields.length > 25) {
        clone.fields = clone.fields.slice(0, 25);
      }
      return clone;
    })
    .filter(Boolean);

  const username = String(
    message?.author?.globalName || message?.author?.username || message?.author?.tag || "Utente",
  ).slice(0, 80);
  const avatarURL =
    message?.author?.id && message?.author?.avatar
      ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png?size=128`
      : message?.member?.avatarURL || null;

  return {
    content: content.slice(0, 2000),
    embeds,
    username,
    avatarURL,
    tts: Boolean(message?.tts),
  };
}

async function collectMessageFiles(message?, maxFiles = 10, maxBytes = 8 * 1024 * 1024) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const files = [];
  for (const att of attachments) {
    if (files.length >= maxFiles) break;
    const url = String(att?.url || att?.proxyURL || "").trim();
    if (!url) continue;
    const buf = await resolveAssetInput(url);
    if (!buf || buf.length > maxBytes) continue;
    files.push({
      attachment: buf,
      name: String(att?.name || `file-${files.length + 1}`).slice(0, 100),
    });
  }
  return files;
}

function remapReactionEmoji(raw?, emojiMap?) {
  if (!raw || typeof raw !== "object") return raw || undefined;
  const id = raw.id ? String(raw.id) : null;
  if (id && emojiMap?.has?.(id)) {
    return { id: emojiMap.get(id), name: raw.name || undefined, animated: Boolean(raw.animated) };
  }
  if (raw.name && !id) return { name: String(raw.name) };
  return raw;
}

async function resolveAssetInput(value?) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("data:")) {
    const commaIndex = raw.indexOf(",");
    if (commaIndex < 0) return null;
    return Buffer.from(raw.slice(commaIndex + 1), "base64");
  }
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(raw);
    if (!response?.ok) return null;
    const arr = await response.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

export = {
  buildPermissionOverwrites,
  syncLoadedRoles,
  syncLoadedChannels,
  normalizeMessagePayload,
  collectMessageFiles,
  remapReactionEmoji,
  resolveAssetInput,
};
