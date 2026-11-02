/** Client REST del sito: canali, thread attivi ed emoji fetch. */
const { Routes, PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { guildActiveThreadsPath } = require("./restPaths") as typeof import("./restPaths");
const { asCacheMap } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapThreadLike, wrapChannel } = require("./restMessage") as typeof import("./restMessage");
const { enrichGuildEmojis } = require("./restGuildEnrich") as typeof import("./restGuildEnrich");

function attachGuildChannelsApi(guild?, client?) {
  guild.channels.fetch = async (channelId?) => {
    if (channelId) {
      const cached = guild.channels.cache.get(String(channelId));
      if (cached) return cached;
      const rawCh = await client._rest.get(Routes.channel(String(channelId)));
      const ch = wrapChannel(rawCh, guild, client);
      guild.channels.cache.set(ch.id, ch);
      return ch;
    }
    const list = await client._rest.get(Routes.guildChannels(guild.id));
    for (const rawCh of list || []) {
      const ch = wrapChannel(rawCh, guild, client);
      guild.channels.cache.set(ch.id, ch);
    }
    return guild.channels.cache;
  };

  (guild.channels as any).create = async (options: Record<string, any> = {}) => {
    const rest = client._rest;
    if (!rest) throw new Error("REST unavailable");
    const body: Record<string, any> = {
      name: String(options.name || "channel").slice(0, 100),
    };
    if (options.type != null) body.type = Number(options.type);
    const parentId = options.parentId || options.parent?.id || options.parent || null;
    if (parentId) body.parent_id = String(parentId);
    if (options.topic != null) body.topic = String(options.topic).slice(0, 1024);
    if (options.nsfw != null) body.nsfw = Boolean(options.nsfw);
    if (options.bitrate != null) body.bitrate = Number(options.bitrate);
    if (options.userLimit != null) body.user_limit = Number(options.userLimit);
    if (options.rateLimitPerUser != null) body.rate_limit_per_user = Number(options.rateLimitPerUser);
    if (options.position != null) body.position = Number(options.position);
    if (Array.isArray(options.permissionOverwrites) && options.permissionOverwrites.length) {
      body.permission_overwrites = options.permissionOverwrites.map((ow?) => {
        const id = String(ow?.id?.id || ow?.id || "").trim();
        let type = 0;
        if (ow?.type === OverwriteType.Member || ow?.type === 1 || ow?.type === "1") type = 1;
        else if (ow?.type === OverwriteType.Role || ow?.type === 0 || ow?.type === "0") type = 0;
        else if (id && id === String(guild.id)) type = 0;
        else if (id && guild.roles?.cache?.has?.(id)) type = 0;
        else type = 1;
        let allow = 0n;
        let deny = 0n;
        try {
          allow = BigInt(PermissionsBitField.resolve(ow?.allow ?? 0));
        } catch (_) {
          allow = 0n;
        }
        try {
          deny = BigInt(PermissionsBitField.resolve(ow?.deny ?? 0));
        } catch (_) {
          deny = 0n;
        }
        return {
          id,
          type,
          allow: String(allow),
          deny: String(deny),
        };
      }).filter((row?) => row.id);
    }
    const created = await rest.post(Routes.guildChannels(guild.id), {
      body,
      reason: options.reason ? String(options.reason).slice(0, 512) : undefined,
    });
    const wrapped = wrapChannel(created, guild, client);
    if (wrapped?.id) guild.channels.cache.set(wrapped.id, wrapped);
    return wrapped;
  };

  (guild.emojis as any).fetch = async () => {
    await enrichGuildEmojis(client._rest, guild);
    return guild.emojis.cache;
  };

  guild.channels.fetchActiveThreads = async () => {
    const raw = await client._rest.get(guildActiveThreadsPath(guild.id)).catch(() => null);
    const threads = asCacheMap(
      (raw?.threads || [])
        .map((t?) => {
          const wrapped = wrapThreadLike(t, guild, client);
          return wrapped?.id ? [wrapped.id, wrapped] : null;
        })
        .filter(Boolean),
    );
    return { threads };
  };
}

export = { attachGuildChannelsApi };
