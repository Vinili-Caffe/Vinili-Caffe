/** Client REST del sito: arricchimento ruoli, emoji e sticker. */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { asCacheMap, snowflakeCreatedAt } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapUser, wrapRole } = require("./restUserRole") as typeof import("./restUserRole");

async function enrichGuildRoles(rest?, guild?) {
  const roles = await rest.get(Routes.guildRoles(guild.id));
  for (const r of roles || []) {
    const rid = String(r.id);
    const prev = guild.roles.cache.get(rid);
    guild.roles.cache.set(rid, wrapRole(r, guild, prev?.members || null));
  }
  const everyone = guild.roles.cache.get(guild.id);
  if (everyone) guild.roles.everyone = everyone;
}

async function enrichGuildEmojis(rest?, guild?) {
  const list = await rest.get(Routes.guildEmojis(guild.id)).catch(() => []);
  guild.emojis.cache.clear();
  for (const e of list || []) {
    const id = String(e.id);
    guild.emojis.cache.set(id, {
      id,
      name: e.name,
      animated: Boolean(e.animated),
      managed: Boolean(e.managed),
      available: e.available !== false,
      createdAt: snowflakeCreatedAt(id),
      author: e.user ? wrapUser(e.user, guild.client) : null,
      roles: { cache: asCacheMap((e.roles || []).map((rid?) => [String(rid), { id: String(rid) }])) },
      imageURL: (options: Record<string, any> = {}) => {
        const size = Number(options?.size) || 48;
        const ext =
          String(options?.extension || (e.animated ? "gif" : "png")).replace(/^\./, "") ||
          (e.animated ? "gif" : "png");
        return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=${size}`;
      },
    });
  }
}

async function enrichGuildStickers(rest?, guild?) {
  const list = await rest.get(Routes.guildStickers(guild.id)).catch(() => []);
  guild.stickers.cache.clear();
  for (const s of list || []) {
    const id = String(s.id);
    guild.stickers.cache.set(id, {
      id,
      name: s.name,
      description: s.description || null,
      format: s.format_type,
      type: s.type,
      tags: s.tags || null,
      url: `https://media.discordapp.net/stickers/${id}.png`,
      available: s.available !== false,
      guildId: guild.id,
      user: s.user ? wrapUser(s.user, guild.client) : null,
    });
  }
}

export = { enrichGuildRoles, enrichGuildEmojis, enrichGuildStickers };
