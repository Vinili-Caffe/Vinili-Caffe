/** Dashboard partnership: scelta del server e invito. */
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");

const TEXT_CHANNEL_TYPES = new Set([0, 5]);
const VOICE_CHANNEL_TYPES = new Set([2, 13]);
const CATEGORY_TYPE = 4;

async function resolveGuildOrFail(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  let guild = client?.guilds?.cache?.get(gid) || null;
  const needsHydrate =
    !guild ||
    guild.partial === true ||
    !guild.channels ||
    typeof guild.channels.fetch !== "function" ||
    !guild.roles ||
    typeof guild.roles.fetch !== "function";
  if (needsHydrate && typeof client?.guilds?.fetch === "function") {
    guild = (await client.guilds.fetch(gid).catch(() => null)) || guild;
  }
  if (!guild) return null;
  return guild;
}

async function listGuildPickerData(client?, guildId?, opts: Record<string, any> = {}) {
  const guild = await resolveGuildOrFail(client, guildId);
  if (!guild) return { textChannels: [], voiceChannels: [], categories: [], roles: [], emojis: [] };

      const force = opts.force === true;

  let channels = [];
  try {
    if (guild.channels?.cache?.size && !force) {
      channels = [...guild.channels.cache.values()];
    } else {
      if (force && guild.channels?.cache && typeof guild.channels.cache.clear === "function") {
        try {
          guild.channels.cache.clear();
        } catch (_) {}
      }
      const fetched = await guild.channels.fetch();
      channels = fetched && typeof fetched.values === "function" ? [...fetched.values()] : [];
      if (!channels.length && guild.channels?.cache?.size) {
        channels = [...guild.channels.cache.values()];
      }
    }
  } catch {
    channels = guild.channels?.cache?.size ? [...guild.channels.cache.values()] : [];
  }

  const channelPosition = (ch?) => {
    const raw = Number(ch?.rawPosition);
    if (Number.isFinite(raw)) return raw;
    const pos = Number(ch?.position);
    return Number.isFinite(pos) ? pos : 0;
  };
  const byDiscordOrder = (a?, b?) =>
    a.position - b.position || String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" });

  const textChannels = channels
    .filter((ch?) => TEXT_CHANNEL_TYPES.has(Number(ch?.type)))
    .map((ch?) => ({
      id: String(ch.id),
      name: String(ch.name || "canale"),
      parentId: ch.parentId ? String(ch.parentId) : null,
      kind: "text",
      position: channelPosition(ch),
    }))
    .sort(byDiscordOrder);

  const voiceChannels = channels
    .filter((ch?) => VOICE_CHANNEL_TYPES.has(Number(ch?.type)))
    .map((ch?) => ({
      id: String(ch.id),
      name: String(ch.name || "vocale"),
      parentId: ch.parentId ? String(ch.parentId) : null,
      kind: "voice",
      position: channelPosition(ch),
    }))
    .sort(byDiscordOrder);

  const categories = channels
    .filter((ch?) => Number(ch?.type) === CATEGORY_TYPE)
    .map((ch?) => ({
      id: String(ch.id),
      name: String(ch.name || "categoria"),
      position: channelPosition(ch),
    }))
    .sort(byDiscordOrder);

  let roles = [];
  try {
    let list = [];
    if (guild.roles?.cache?.size && !force) {
      list = [...guild.roles.cache.values()];
    } else {
      if (force && guild.roles?.cache && typeof guild.roles.cache.clear === "function") {
        try {
          guild.roles.cache.clear();
        } catch (_) {}
      }
      const roleCache = await guild.roles.fetch();
      list = roleCache && typeof roleCache.values === "function" ? [...roleCache.values()] : [];
      if (!list.length && guild.roles?.cache?.size) {
        list = [...guild.roles.cache.values()];
      }
    }
    roles = list
      .filter((r?) => r && String(r.id) !== String(guildId))
      .map((r?) => {
        let permissions = "0";
        try {
          permissions = String(r.permissions?.bitfield ?? r.permissions ?? 0n);
        } catch {
          permissions = "0";
        }
        let administrator = false;
        try {
          administrator = Boolean(r.permissions?.has?.(PermissionFlagsBits.Administrator));
          if (!administrator) {
            administrator = (BigInt(permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
          }
        } catch {
          administrator = false;
        }
        return {
          id: String(r.id),
          name: String(r.name || "ruolo"),
          color: r.hexColor || null,
          position: Number(r.position) || 0,
          permissions,
          administrator,
          managed: Boolean(r.managed),
        };
      })
      .sort((a?, b?) => b.position - a.position || a.name.localeCompare(b.name, "it"));
  } catch {
    roles = [];
  }

  let emojis = [];
  try {
    let list = [];
    if (guild.emojis?.cache?.size && !force) {
      list = [...guild.emojis.cache.values()];
    } else if (typeof guild.emojis?.fetch === "function") {
      if (force && guild.emojis?.cache && typeof guild.emojis.cache.clear === "function") {
        try {
          guild.emojis.cache.clear();
        } catch (_) {}
      }
      const emojiCache = await guild.emojis.fetch();
      list = emojiCache && typeof emojiCache.values === "function" ? [...emojiCache.values()] : [];
      if (!list.length && guild.emojis?.cache?.size) {
        list = [...guild.emojis.cache.values()];
      }
    }

        if (!list.length) {
      const rest = client?.rest || client?._rest;
      if (rest && typeof rest.get === "function") {
        const { Routes } = require("discord.js") as typeof import("discord.js");
        const raw = await rest.get(Routes.guildEmojis(String(guildId))).catch(() => []);
        list = Array.isArray(raw) ? raw : [];
        if (guild.emojis?.cache?.set && list.length) {
          try {
            if (typeof guild.emojis.cache.clear === "function") guild.emojis.cache.clear();
          } catch (_) {}
          for (const e of list) {
            if (!e?.id) continue;
            const id = String(e.id);
            const animated = Boolean(e.animated);
            guild.emojis.cache.set(id, {
              id,
              name: String(e.name || "emoji"),
              animated,
              available: e.available !== false,
              imageURL: (options: Record<string, any> = {}) => {
                const size = Number(options?.size) || 48;
                const defaultExt = animated ? "gif" : "png";
                const ext =
                  String(options?.extension || defaultExt).replace(/^\./, "") || defaultExt;
                return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=${size}`;
              },
            });
          }
          list = [...guild.emojis.cache.values()];
        }
      }
    }

    emojis = list
      .filter((e?) => e && e.id && e.available !== false)
      .map((e?) => {
        const animated = Boolean(e.animated);
        const id = String(e.id);
        const name = String(e.name || "emoji");
                const ext = animated ? "gif" : "png";
        let url = null;
        try {
          url =
            typeof e.imageURL === "function"
              ? e.imageURL({ size: 48, extension: ext })
              : null;
        } catch {
          url = null;
        }
        if (!url || typeof url !== "string") {
          url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48`;
        } else {
          if (animated && /\.png(\?|$)/i.test(url)) {
            url = url.replace(/\.png(\?|$)/i, ".gif$1");
          } else if (!animated && /\.gif(\?|$)/i.test(url)) {
            url = url.replace(/\.gif(\?|$)/i, ".png$1");
          }
          if (!/[?&]size=/i.test(url)) url += (url.includes("?") ? "&" : "?") + "size=48";
        }
        return { id, name, animated, url };
      })
      .sort((a?, b?) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] listGuildPickerData emojis:", err?.message || err);
    emojis = [];
  }

  return { textChannels, voiceChannels, categories, roles, emojis };
}

async function maybeEnsureInvite(client?, guildId?, channelId?) {
  if (!channelId) return;
  try {
    const guild = await resolveGuildOrFail(client, guildId);
    if (!guild) return;
    const { ensurePartnershipChannelInvite } = require("../../Services/Partner/partnershipInviteService") as typeof import("../../Services/Partner/partnershipInviteService");
    await ensurePartnershipChannelInvite(guild, channelId);
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] ensurePartnershipChannelInvite:", err?.message || err);
  }
}

function parseOptionalId(value?) {
  if (value === null || value === undefined || value === "" || value === "off" || value === "null") {
    return { clear: true, id: null };
  }
  const id = String(value).trim();
  if (!/^\d{16,22}$/.test(id)) return { clear: false, id: null, invalid: true };
  return { clear: false, id };
}

export = { listGuildPickerData, maybeEnsureInvite, parseOptionalId };
