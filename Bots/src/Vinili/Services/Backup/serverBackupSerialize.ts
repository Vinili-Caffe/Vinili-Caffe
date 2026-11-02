function stringifyBackupPayload(payload?) {
  try {
    return JSON.stringify(payload);
  } catch (err) {
    if (!(err instanceof RangeError) && String(err?.name || "") !== "RangeError") throw err;
    global.logger?.warn?.("[backup] payload too large — slim snapshot (no messages)");
    const slim = {
      ...payload,
      messages: { channels: {}, threads: {}, omitted: true, reason: "payload_too_large" },
      auditLogs: Array.isArray(payload.auditLogs) ? payload.auditLogs.slice(0, 500) : [],
      captureNote: "truncated_for_size",
    };
    return JSON.stringify(slim);
  }
}

function toIso(value?) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizePermissionOverwrites(channel?) {
  try {
    const overwrites = channel?.permissionOverwrites?.cache;
    if (!overwrites) return [];

    return [...overwrites.values()].map((ow?) => ({
      id: String(ow.id),
      type: Number(ow.type),
      allow: String(ow.allow?.bitfield ?? 0n),
      deny: String(ow.deny?.bitfield ?? 0n),
    }));
  } catch {
    return [];
  }
}

function serializeMessage(message?) {
  return {
    id: String(message.id),
    channelId: String(message.channelId),
    guildId: String(message.guildId || ""),
    author: message.author
      ? {
        id: String(message.author.id),
        tag: String(message.author.tag || ""),
        username: String(message.author.username || ""),
        globalName: message.author.globalName || null,
        bot: Boolean(message.author.bot),
        system: Boolean(message.author.system),
      }
      : null,
    member: message.member
      ? {
        id: String(message.member.id),
        nickname: message.member.nickname || null,
        roles: message.member.roles?.cache
          ? [...message.member.roles.cache.keys()].map(String)
          : [],
      }
      : null,
    content: String(message.content || ""),
    cleanContent: String(message.cleanContent || ""),
    type: Number(message.type ?? 0),
    tts: Boolean(message.tts),
    pinned: Boolean(message.pinned),
    flags: String(message.flags?.bitfield ?? 0),
    webhookId: message.webhookId ? String(message.webhookId) : null,
    applicationId: message.applicationId ? String(message.applicationId) : null,
    createdAt: toIso(message.createdTimestamp || message.createdAt),
    editedAt: toIso(message.editedTimestamp || message.editedAt),
    url: message.url || null,
    reference: message.reference
      ? {
        messageId: message.reference.messageId
          ? String(message.reference.messageId)
          : null,
        channelId: message.reference.channelId
          ? String(message.reference.channelId)
          : null,
        guildId: message.reference.guildId
          ? String(message.reference.guildId)
          : null,
      }
      : null,
    attachments: [...(message.attachments?.values?.() || [])].map((a?) => ({
      id: String(a.id),
      name: a.name || null,
      description: a.description || null,
      contentType: a.contentType || null,
      size: Number(a.size || 0),
      url: a.url || null,
      proxyURL: a.proxyURL || null,
      width: a.width ?? null,
      height: a.height ?? null,
      ephemeral: Boolean(a.ephemeral),
    })),
    embeds: Array.isArray(message.embeds)
      ? message.embeds.map((e?) => (typeof e?.toJSON === "function" ? e.toJSON() : e))
      : [],
    stickers: [...(message.stickers?.values?.() || [])].map((s?) => ({
      id: String(s.id),
      name: String(s.name || ""),
      format: Number(s.format ?? 0),
      url: s.url || null,
    })),
    reactions: [...(message.reactions?.cache?.values?.() || [])].map((r?) => ({
      emoji: {
        id: r.emoji?.id ? String(r.emoji.id) : null,
        name: r.emoji?.name || null,
        animated: Boolean(r.emoji?.animated),
      },
      count: Number(r.count || 0),
      me: Boolean(r.me),
    })),
    mentions: {
      users: [...(message.mentions?.users?.keys?.() || [])].map(String),
      roles: [...(message.mentions?.roles?.keys?.() || [])].map(String),
      channels: [...(message.mentions?.channels?.keys?.() || [])].map(String),
      everyone: Boolean(message.mentions?.everyone),
    },
    components: Array.isArray(message.components)
      ? message.components.map((c?) =>
        typeof c?.toJSON === "function" ? c.toJSON() : c,
      )
      : [],
  };
}

function serializeChannel(channel?) {
  return {
    id: String(channel.id),
    name: String(channel.name || ""),
    type: Number(channel.type ?? -1),
    parentId: channel.parentId ? String(channel.parentId) : null,
    position: Number(channel.position ?? 0),
    topic: channel.topic || null,
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: Number(channel.rateLimitPerUser ?? 0),
    bitrate: Number(channel.bitrate ?? 0),
    userLimit: Number(channel.userLimit ?? 0),
    rtcRegion: channel.rtcRegion || null,
    videoQualityMode: channel.videoQualityMode ?? null,
    defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration ?? null,
    defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser ?? null,
    defaultForumLayout: channel.defaultForumLayout ?? null,
    defaultSortOrder: channel.defaultSortOrder ?? null,
    availableTags: Array.isArray(channel.availableTags)
      ? channel.availableTags.map((t?) =>
        typeof t?.toJSON === "function" ? t.toJSON() : t,
      )
      : [],
    defaultReactionEmoji: channel.defaultReactionEmoji || null,
    permissionsLocked:
      typeof channel.permissionsLocked === "boolean"
        ? channel.permissionsLocked
        : null,
    permissionOverwrites: normalizePermissionOverwrites(channel),
  };
}

function serializeThread(thread?) {
  return {
    id: String(thread.id),
    parentId: thread.parentId ? String(thread.parentId) : null,
    name: String(thread.name || ""),
    type: Number(thread.type ?? -1),
    ownerId: thread.ownerId ? String(thread.ownerId) : null,
    archived: Boolean(thread.archived),
    locked: Boolean(thread.locked),
    invitable: Boolean(thread.invitable),
    autoArchiveDuration: Number(thread.autoArchiveDuration ?? 0),
    rateLimitPerUser: Number(thread.rateLimitPerUser ?? 0),
    createdAt: toIso(thread.createdAt),
    archiveTimestamp: toIso(thread.archiveTimestamp),
    lastMessageId: thread.lastMessageId ? String(thread.lastMessageId) : null,
    memberCount: Number(thread.memberCount ?? 0),
    messageCount: Number(thread.messageCount ?? 0),
    permissionOverwrites: normalizePermissionOverwrites(thread),
  };
}

export = {
  stringifyBackupPayload,
  toIso,
  normalizePermissionOverwrites,
  serializeMessage,
  serializeChannel,
  serializeThread,
};
