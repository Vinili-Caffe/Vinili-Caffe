/** Client REST del sito: utenti e ruoli. */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { asCacheMap, wrapPermissionBits, snowflakeCreatedAt } = require("./restPermissions") as typeof import("./restPermissions");

function wrapUser(raw?, clientRef = null) {
  if (!raw?.id) return null;
  const id = String(raw.id);
  const user = {
    id,
    username: raw.username,
    globalName: raw.global_name || raw.globalName || null,
    discriminator: raw.discriminator || "0",
    bot: Boolean(raw.bot),
    system: Boolean(raw.system),
    avatar: raw.avatar,
    banner: raw.banner || null,
    accentColor: raw.accent_color ?? raw.accentColor ?? null,
    createdAt: snowflakeCreatedAt(id),
    displayAvatarURL: (opts: Record<string, any> = {}) => {
      const size = opts.size || 128;
      const ext = opts.extension || (raw.avatar?.startsWith("a_") ? "gif" : "png");
      if (raw.avatar) return `https://cdn.discordapp.com/avatars/${id}/${raw.avatar}.${ext}?size=${size}`;
      // feedbackAvatar2: never invent Discord embed/blurple defaults for site-api REST users.
      if (opts.allowDefault === false || opts.forceStatic === true) return null;
      const idx = Number(BigInt(id) >> 22n) % 6;
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png?size=${size}`;
    },
    tag: raw.discriminator && raw.discriminator !== "0" ? `${raw.username}#${raw.discriminator}` : raw.username,
    toString: () => `<@${id}>`,
    valueOf: () => id,
    send: async (payload?) => {
      const rest = clientRef?._rest;
      if (!rest) throw new Error("REST unavailable");
      const dm = await rest.post(Routes.userChannels(), {
        body: { recipient_id: id },
      });
      const channelId = String(dm.id);
      const body =
        typeof payload === "string"
          ? { content: payload }
          : {
              content: payload?.content,
              embeds: payload?.embeds?.map?.((e?) => (typeof e.toJSON === "function" ? e.toJSON() : e)),
              components: payload?.components?.map?.((row?) =>
                typeof row?.toJSON === "function" ? row.toJSON() : row,
              ),
            };
      const created = await rest.post(Routes.channelMessages(channelId), { body });
      return wrapMessage(created, clientRef, { channelId });
    },
    createDM: async () => {
      const rest = clientRef?._rest;
      if (!rest) throw new Error("REST unavailable");
      const dm = await rest.post(Routes.userChannels(), {
        body: { recipient_id: id },
      });
      return {
        id: String(dm.id),
        messages: {
          cache: asCacheMap(),
          fetch: async (messageId?) => {
            const raw = await rest.get(Routes.channelMessage(String(dm.id), String(messageId)));
            return wrapMessage(raw, clientRef, { channelId: String(dm.id) });
          },
        },
      };
    },
  };
  return user;
}

function colorValueToInt(raw?) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
  const s = String(raw).trim();
  if (!s) return null;
  const hexPart = s.startsWith("#") ? s.slice(1) : s;
  if (/^[0-9a-fA-F]{3}$/.test(hexPart) || /^[0-9a-fA-F]{6}$/.test(hexPart)) {
    const hex = hexPart.replace(/[^0-9a-fA-F]/g, "");
    if (hex.length === 3) {
      const full = hex
        .split("")
        .map((c?) => c + c)
        .join("");
      return parseInt(full, 16);
    }
    if (hex.length === 6) return parseInt(hex, 16);
  }
  if (s.startsWith("#")) {
    const hex = s.slice(1).replace(/[^0-9a-fA-F]/g, "");
    if (hex.length === 3) {
      const full = hex
        .split("")
        .map((c?) => c + c)
        .join("");
      return parseInt(full, 16);
    }
    if (hex.length === 6) return parseInt(hex, 16);
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function buildRoleColorsApiBody(colorsObj?) {
  if (!colorsObj || typeof colorsObj !== "object") return null;
  const primary = colorValueToInt(colorsObj.primaryColor ?? colorsObj.primary_color);
  if (primary == null) return null;
  const body: Record<string, any> = { primary_color: primary };
  const secondary = colorValueToInt(colorsObj.secondaryColor ?? colorsObj.secondary_color);
  if (secondary != null) body.secondary_color = secondary;
  else body.secondary_color = null;
  const tertiary = colorValueToInt(colorsObj.tertiaryColor ?? colorsObj.tertiary_color);
  if (tertiary != null) body.tertiary_color = tertiary;
  else body.tertiary_color = null;
  return body;
}

async function bufferToRoleIconDataUri(buf?) {
  if (!buf) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (!b.length) return null;
    let mime = "image/png";
  if (b[0] === 0x47 && b[1] === 0x49) mime = "image/gif";
  else if (b[0] === 0xff && b[1] === 0xd8) mime = "image/jpeg";
  return `data:${mime};base64,${b.toString("base64")}`;
}

function wrapRole(raw?, guild = null, existingMembers = null) {
  if (!raw?.id) return null;
  const members =
    existingMembers && typeof existingMembers.set === "function" ? existingMembers : asCacheMap();
  const roleId = String(raw.id);
  const colorsRaw = raw.colors && typeof raw.colors === "object" ? raw.colors : null;
  const primaryFromColors = colorValueToInt(colorsRaw?.primary_color ?? colorsRaw?.primaryColor);
  const colorInt = primaryFromColors != null ? primaryFromColors : Number(raw.color || 0);
  const secondaryFromColors = colorValueToInt(colorsRaw?.secondary_color ?? colorsRaw?.secondaryColor);
  const tertiaryFromColors = colorValueToInt(colorsRaw?.tertiary_color ?? colorsRaw?.tertiaryColor);

  const role = {
    id: roleId,
    name: raw.name,
    color: colorInt,
    colors: {
      primaryColor: colorInt,
      secondaryColor: secondaryFromColors,
      tertiaryColor: tertiaryFromColors,
    },
    hoist: Boolean(raw.hoist),
    managed: Boolean(raw.managed),
    mentionable: Boolean(raw.mentionable),
    tags: raw.tags || null,
    hexColor: colorInt > 0 ? `#${colorInt.toString(16).padStart(6, "0")}` : "#000000",
    position: raw.position,
    permissions: wrapPermissionBits(raw.permissions),
    unicodeEmoji: raw.unicode_emoji || raw.unicodeEmoji || null,
    icon: raw.icon || null,
    iconURL: (opts: Record<string, any> = {}) => {
      if (!raw.icon && !role.icon) return null;
      const hash = role.icon || raw.icon;
      if (!hash || String(hash).startsWith("data:")) return null;
      const size = opts.size || 256;
      return `https://cdn.discordapp.com/role-icons/${raw.id}/${hash}.png?size=${size}`;
    },
    createdAt: snowflakeCreatedAt(roleId),
    members,
    delete: async (reason?) => {
      const rest = guild?.client?._rest;
      if (!rest || !guild?.id) throw new Error("REST unavailable");
      await rest.delete(Routes.guildRole(guild.id, roleId), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      guild.roles.cache.delete(roleId);
      return true;
    },
    setPosition: async (position?, opts: Record<string, any> = {}) => {
      const rest = guild?.client?._rest;
      if (!rest || !guild?.id) throw new Error("REST unavailable");
      const pos = Number(position);
      if (!Number.isFinite(pos)) return role;
      await rest.patch(Routes.guildRoles(guild.id), {
        body: [{ id: roleId, position: Math.max(0, Math.floor(pos)) }],
        reason: opts?.reason ? String(opts.reason).slice(0, 512) : undefined,
      });
      role.position = Math.max(0, Math.floor(pos));
      return role;
    },
    edit: async (payload: Record<string, any> = {}, reason?) => {
      const rest = guild?.client?._rest;
      if (!rest || !guild?.id) throw new Error("REST unavailable");
      const body: Record<string, any> = {};
      if (payload.name != null) body.name = String(payload.name).slice(0, 100);
      if (payload.hoist != null) body.hoist = Boolean(payload.hoist);
      if (payload.mentionable != null) body.mentionable = Boolean(payload.mentionable);
      if (Object.prototype.hasOwnProperty.call(payload, "unicodeEmoji") || Object.prototype.hasOwnProperty.call(payload, "unicode_emoji")) {
        const ue = payload.unicodeEmoji !== undefined ? payload.unicodeEmoji : payload.unicode_emoji;
        body.unicode_emoji = ue == null || ue === "" ? null : String(ue);
      }
      if (Object.prototype.hasOwnProperty.call(payload, "icon")) {
        if (payload.icon == null) body.icon = null;
        else if (Buffer.isBuffer(payload.icon) || payload.icon instanceof Uint8Array) {
          body.icon = await bufferToRoleIconDataUri(payload.icon);
        } else if (typeof payload.icon === "string") {
          body.icon = payload.icon;
        }
      }
      if (payload.colors && typeof payload.colors === "object") {
        const colorsBody = buildRoleColorsApiBody(payload.colors);
        if (!colorsBody) {
          throw new Error("invalid_role_colors");
        }
        // Solo `colors` (come discord.js): evitare `color` legacy che può far restare il ruolo solido.
        body.colors = colorsBody;
      } else if (payload.color != null) {
        const c = colorValueToInt(payload.color);
        if (c != null) {
          body.colors = { primary_color: c, secondary_color: null, tertiary_color: null };
        }
      }
      if (!Object.keys(body).length) {
        throw new Error("empty_role_edit");
      }
      const updated = await rest.patch(Routes.guildRole(guild.id, roleId), {
        body,
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      const wrapped = wrapRole(updated, guild, role.members);
      if (body.colors && typeof body.colors === "object") {
        const wantP = Number(body.colors.primary_color);
        const gotP = Number(wrapped?.colors?.primaryColor ?? wrapped?.color ?? NaN);
        if (Number.isFinite(wantP) && Number.isFinite(gotP) && wantP !== gotP) {
          throw new Error("role_color_mismatch");
        }
        const wantS = body.colors.secondary_color;
        const gotS = wrapped?.colors?.secondaryColor;
        const wantT = body.colors.tertiary_color;
        const gotT = wrapped?.colors?.tertiaryColor;
        const sameNullable = (a?, b?) => {
          if (a == null && b == null) return true;
          if (a == null || b == null) return false;
          return Number(a) === Number(b);
        };
        if (!sameNullable(wantS, gotS) || !sameNullable(wantT, gotT)) {
          throw new Error("role_color_mismatch");
        }
      }
      guild.roles.cache.set(roleId, wrapped);
      return wrapped;
    },
  };
  return role;
}

function encodeReactionEmoji(emoji?) {
  if (emoji && typeof emoji === "object") {
    const id = String(emoji.id || "").trim();
    const name = String(emoji.name || "").trim();
    if (id && name) return encodeURIComponent(`${name}:${id}`);
    if (name) return encodeURIComponent(name);
    return "";
  }
  const raw = String(emoji || "").trim();
  if (!raw) return "";
  const custom = raw.match(/^<a?:([a-zA-Z0-9_]+):(\d{17,22})>$/);
  if (custom) return encodeURIComponent(`${custom[1]}:${custom[2]}`);
  /* name:id già pronto */
  if (/^[a-zA-Z0-9_]+:\d{17,22}$/.test(raw)) return encodeURIComponent(raw);
  return encodeURIComponent(raw);
}

function wrapMessageReactions(rawReactions?, clientRef?, channelId?, messageId?) {
  const botId = String(clientRef?.user?.id || "").trim();
  const entries = (Array.isArray(rawReactions) ? rawReactions : [])
    .map((r?) => {
      const emojiId = r?.emoji?.id ? String(r.emoji.id) : null;
      const emojiName = String(r?.emoji?.name || "").trim();
      if (!emojiId && !emojiName) return null;
      const key = emojiId || emojiName;
      const encoded = encodeReactionEmoji(emojiId ? { id: emojiId, name: emojiName || "emoji" } : emojiName);
      const reaction = {
        count: Number(r?.count) || 0,
        me: Boolean(r?.me),
        emoji: { id: emojiId, name: emojiName },
        users: {
          fetch: async (opts: Record<string, any> = {}) => {
            const rest = clientRef?._rest;
            if (!rest || !channelId || !messageId || !encoded) {
              return asCacheMap();
            }
            const query = new URLSearchParams({
              limit: String(Math.min(100, Math.max(1, Number(opts.limit) || 100))),
            });
            if (opts.after) query.set("after", String(opts.after));
            const list = await rest
              .get(`${Routes.channelMessageReaction(channelId, messageId, encoded)}?${query.toString()}`)
              .catch(() => []);
            return asCacheMap(
              (Array.isArray(list) ? list : [])
                .map((u?) => {
                  const user = wrapUser(u, clientRef);
                  return user?.id ? [user.id, user] : null;
                })
                .filter(Boolean)
            );
          },
        },
      };
      /* count fallback helpers for callers that skip users.fetch */
      if (botId && reaction.me) {
        reaction._botId = botId;
      }
      return [key, reaction];
    })
    .filter(Boolean);
  return { cache: asCacheMap(entries) };
}

function wrapMessage(raw?, clientRef?, meta: Record<string, any> = {}) {
  if (!raw?.id) return null;
  const channelId = String(meta.channelId || raw.channel_id || "").trim();
  const messageId = String(raw.id);
  let createdTimestamp = Number.NaN;
  if (raw.timestamp) createdTimestamp = Date.parse(raw.timestamp);
  if (!Number.isFinite(createdTimestamp)) {
    try {
      createdTimestamp = Number((BigInt(messageId) >> 22n) + 1420070400000n);
    } catch {
      createdTimestamp = Date.now();
    }
  }
  const author = wrapUser(raw.author, clientRef) || {
    id: String(raw.author?.id || "").trim(),
    username: raw.author?.username || "unknown",
    bot: Boolean(raw.author?.bot),
  };
  const attachmentEntries = (Array.isArray(raw.attachments) ? raw.attachments : [])
    .map((a?) => {
      const id = String(a?.id || "").trim();
      if (!id) return null;
      return [
        id,
        {
          id,
          name: String(a?.filename || a?.name || "").trim(),
          url: String(a?.url || "").trim(),
          proxyURL: String(a?.proxy_url || a?.proxyURL || "").trim(),
          contentType: String(a?.content_type || a?.contentType || "").trim(),
          size: Number(a?.size) || 0,
        },
      ];
    })
    .filter(Boolean);
  const message = {
    id: messageId,
    channelId,
    channel: meta.channel || null,
    content: raw.content || "",
    embeds: Array.isArray(raw.embeds) ? raw.embeds : [],
    components: Array.isArray(raw.components) ? raw.components : [],
    attachments: asCacheMap(attachmentEntries),
    reactions: wrapMessageReactions(raw.reactions, clientRef, channelId, messageId),
    poll: raw.poll || null,
    author,
    createdTimestamp,
    createdAt: new Date(createdTimestamp),
    editable: true,
    react: async (emoji?) => {
      const rest = clientRef?._rest;
      if (!rest || !channelId) throw new Error("REST unavailable");
      const encoded = encodeReactionEmoji(emoji);
      if (!encoded) throw new Error("Invalid emoji");
      await rest.put(Routes.channelMessageOwnReaction(channelId, messageId, encoded));
      return true;
    },
    edit: async (payload: Record<string, any> = {}) => {
      const rest = clientRef?._rest;
      if (!rest || !channelId) throw new Error("REST unavailable");
      const body =
        typeof payload === "string"
          ? { content: payload }
          : {
              content: payload.content,
              embeds: payload.embeds?.map?.((e?) => (typeof e.toJSON === "function" ? e.toJSON() : e)),
              components: payload.components?.map?.((row?) =>
                typeof row?.toJSON === "function" ? row.toJSON() : row,
              ),
            };
      const updated = await rest.patch(Routes.channelMessage(channelId, messageId), { body });
      return wrapMessage(updated, clientRef, { channelId, channel: meta.channel });
    },
    delete: async (reason?) => {
      const rest = clientRef?._rest;
      if (!rest || !channelId) throw new Error("REST unavailable");
      await rest.delete(Routes.channelMessage(channelId, messageId), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      return true;
    },
    startThread: async (opts: Record<string, any> = {}) => {
      const rest = clientRef?._rest;
      if (!rest || !channelId) throw new Error("REST unavailable");
      return rest.post(Routes.threads(channelId, messageId), {
        body: {
          name: String(opts.name || "thread").slice(0, 100),
          auto_archive_duration: Number(opts.autoArchiveDuration) || 1440,
        },
        reason: opts.reason ? String(opts.reason).slice(0, 512) : undefined,
      });
    },
  };
  return message;
}

export = { wrapUser, colorValueToInt, buildRoleColorsApiBody, bufferToRoleIconDataUri, wrapRole, wrapMessage };
