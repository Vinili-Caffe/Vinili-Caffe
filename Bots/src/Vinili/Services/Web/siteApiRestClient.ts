const { REST, Routes, PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");

function routeCall(name?, ...args) {
  const fn = Routes[name];
  if (typeof fn === "function") return fn(...args);
  throw new Error(`discord.js Routes.${name} missing`);
}

function guildActiveThreadsPath(guildId?) {
  try {
    return routeCall("guildActiveThreads", guildId);
  } catch {
    return `/guilds/${guildId}/threads/active`;
  }
}
function channelThreadsArchivedPublicPath(channelId?) {
  try {
    return routeCall("channelThreadsArchivedPublic", channelId);
  } catch {
    return `/channels/${channelId}/threads/archived/public`;
  }
}
function channelThreadsArchivedPrivatePath(channelId?) {
  try {
    return routeCall("channelThreadsArchivedPrivate", channelId);
  } catch {
    return `/channels/${channelId}/threads/archived/private`;
  }
}
function guildAutoModerationRulesPath(guildId?) {
  try {
    return routeCall("guildAutoModerationRules", guildId);
  } catch {
    return `/guilds/${guildId}/auto-moderation/rules`;
  }
}
function guildAuditLogPath(guildId?) {
  try {
    return routeCall("guildAuditLog", guildId);
  } catch {
    return `/guilds/${guildId}/audit-logs`;
  }
}
function guildWebhooksPath(guildId?) {
  try {
    return routeCall("guildWebhooks", guildId);
  } catch {
    return `/guilds/${guildId}/webhooks`;
  }
}
function guildBansPath(guildId?) {
  try {
    return routeCall("guildBans", guildId);
  } catch {
    return `/guilds/${guildId}/bans`;
  }
}
function guildIntegrationsPath(guildId?) {
  try {
    return routeCall("guildIntegrations", guildId);
  } catch {
    return `/guilds/${guildId}/integrations`;
  }
}
function userGuildsPath() {
  try {
    return routeCall("userGuilds");
  } catch {
    return "/users/@me/guilds";
  }
}
function channelPermissionPath(channelId?, overwriteId?) {
  try {
    return routeCall("channelPermission", channelId, overwriteId);
  } catch {
    return `/channels/${channelId}/permissions/${overwriteId}`;
  }
}

function asCacheMap(seed = []) {
  const map = new Map(seed);
  const api = {
    get: (id?) => map.get(String(id)),
    set: (id?, value?) => map.set(String(id), value),
    has: (id?) => map.has(String(id)),
    delete: (id?) => map.delete(String(id)),
    clear: () => map.clear(),
    get size() {
      return map.size;
    },
    get length() {
      return map.size;
    },
    values: () => map.values(),
    keys: () => map.keys(),
    entries: () => map.entries(),
    [Symbol.iterator]: () => map[Symbol.iterator](),
    forEach: (fn?, thisArg?) => map.forEach(fn, thisArg),
    filter: (fn?) =>
      asCacheMap(
        [...map.values()]
          .filter(fn)
          .map((v?: any) => [String(v?.id || v?.user?.id || ""), v])
          .filter(([id]) => id),
      ),
    find: (fn?) => [...map.values()].find(fn),
    map: (fn?) => [...map.values()].map(fn),
    some: (fn?) => [...map.values()].some(fn),
    every: (fn?) => [...map.values()].every(fn),
    first: () => map.values().next().value ?? null,
    last: () => {
      let out = null;
      for (const value of map.values()) out = value;
      return out;
    },
    at: (index?) => {
      const arr = [...map.values()];
      const i = Number(index);
      if (!Number.isFinite(i)) return null;
      const idx = i < 0 ? arr.length + i : i;
      return idx >= 0 && idx < arr.length ? arr[idx] : null;
    },
  };
  return api;
}

function wrapPermissionBits(raw?) {
  let bits = 0n;
  try {
    bits = BigInt(raw ?? 0);
  } catch {
    bits = 0n;
  }
  return {
    bitfield: bits,
    has: (flag?) => permissionBitsHas(bits, flag),
  };
}

function permissionBitsHas(bits?, flag?) {
  try {
    if (Array.isArray(flag)) return flag.every((f?) => permissionBitsHas(bits, f));
    const f = typeof flag === "bigint" ? flag : BigInt(flag);
    return (bits & f) === f;
  } catch {
    return false;
  }
}

function wrapLivePermissionBits(getBits?) {
  return {
    get bitfield() {
      try {
        return getBits();
      } catch {
        return 0n;
      }
    },
    has: (flag?) => {
      try {
        return permissionBitsHas(getBits(), flag);
      } catch {
        return false;
      }
    },
  };
}

const ADMIN_BIT = (() => {
  try {
    return BigInt(PermissionsBitField.Flags.Administrator);
  } catch {
    return 8n;
  }
})();

function computeMemberGuildPermissionBits(member?, guild?) {
  const g = guild || member?.guild || null;
  if (!member || !g) return 0n;
  const everyone = g.roles?.cache?.get?.(String(g.id));
  let bits = BigInt(everyone?.permissions?.bitfield ?? 0);
  if ((bits & ADMIN_BIT) === ADMIN_BIT) return ~0n;
  const roles = member.roles?.cache;
  if (roles && typeof roles.values === "function") {
    for (const role of roles.values()) {
      bits |= BigInt(role?.permissions?.bitfield ?? 0);
      if ((bits & ADMIN_BIT) === ADMIN_BIT) return ~0n;
    }
  }
  return bits;
}

function computeChannelPermissionBits(channel?, memberOrRole?) {
  if (!channel || !memberOrRole) return 0n;
  const guild = channel.guild || null;
  if (!guild) return 0n;

  const isMember = Boolean(memberOrRole.user || memberOrRole.roles?.cache);
  let bits = 0n;

  if (isMember) {
    bits = computeMemberGuildPermissionBits(memberOrRole, guild);
  } else {
    const everyone = guild.roles?.cache?.get?.(String(guild.id));
    bits = BigInt(everyone?.permissions?.bitfield ?? 0);
    bits |= BigInt(memberOrRole.permissions?.bitfield ?? 0);
  }
  if ((bits & ADMIN_BIT) === ADMIN_BIT) return ~0n;

    let overwriteSource = channel;
  try {
    const isThread = typeof channel.isThread === "function" ? channel.isThread() : [10, 11, 12].includes(Number(channel.type));
    if (isThread && channel.parentId && (!channel.permissionOverwrites?.cache?.size)) {
      const parent = guild.channels?.cache?.get?.(String(channel.parentId));
      if (parent) overwriteSource = parent;
    }
  } catch {
      }

  const overwrites = overwriteSource.permissionOverwrites?.cache;
  if (!overwrites) return bits;

  const applyOw = (ow?) => {
    if (!ow) return;
    bits &= ~BigInt(ow.deny?.bitfield ?? 0);
    bits |= BigInt(ow.allow?.bitfield ?? 0);
  };

  applyOw(overwrites.get?.(String(guild.id)));

  if (isMember) {
    let allow = 0n;
    let deny = 0n;
    const roles = memberOrRole.roles?.cache;
    if (roles && typeof roles.values === "function") {
      for (const role of roles.values()) {
        const ow = overwrites.get?.(String(role.id));
        if (!ow) continue;
        deny |= BigInt(ow.deny?.bitfield ?? 0);
        allow |= BigInt(ow.allow?.bitfield ?? 0);
      }
    }
    bits &= ~deny;
    bits |= allow;
    applyOw(overwrites.get?.(String(memberOrRole.id)));
  } else {
    applyOw(overwrites.get?.(String(memberOrRole.id)));
  }

  return bits;
}

function snowflakeCreatedAt(id?) {
  try {
    const ts = Number((BigInt(String(id)) >> 22n) + 1420070400000n);
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

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
  const raw = String(emoji || "").trim();
  if (!raw) return "";
  const custom = raw.match(/^<a?:([a-zA-Z0-9_]+):(\d{17,22})>$/);
  if (custom) return encodeURIComponent(`${custom[1]}:${custom[2]}`);
  return encodeURIComponent(raw);
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

function wrapThreadLike(raw?, guild?, clientRef?) {
  const ch = wrapChannel(raw, guild, clientRef);
  if (!ch) return null;
  ch.isThread = () => true;
  return ch;
}

function guessImageContentType(name?) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function normalizeRestMessageFiles(files?) {
  if (!Array.isArray(files) || !files.length) return undefined;
  const fs = require("fs") as typeof import("fs");
  const out = [];
  for (let i = 0; i < files.length; i += 1) {
    const entry = files[i];
    if (!entry) continue;
    const name = String(entry.name || `file-${i}.png`).slice(0, 200);
    let data = entry.attachment ?? entry.data ?? entry.file ?? null;
    if (typeof data === "string") {
      data = await fs.promises.readFile(data);
    } else if (data && typeof data === "object" && typeof data.path === "string" && !Buffer.isBuffer(data)) {
      data = await fs.promises.readFile(data.path);
    } else if (data && typeof data.arrayBuffer === "function") {
      data = Buffer.from(await data.arrayBuffer());
    } else if (data && typeof data.read === "function" && !Buffer.isBuffer(data)) {
      const chunks = [];
      for await (const chunk of data) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      data = Buffer.concat(chunks);
    }
    if (!Buffer.isBuffer(data)) continue;
    out.push({
      name,
      data,
      contentType: entry.contentType || guessImageContentType(name),
    });
  }
  return out.length ? out : undefined;
}

function wrapChannel(raw?, guild?, clientRef?) {
  if (!raw?.id) return null;
  const restClient = clientRef || guild?.client || null;
  const channelId = String(raw.id);
  const type = Number(raw.type);
  const overwriteCache = asCacheMap(
    (raw.permission_overwrites || []).map((o?) => {
      const id = String(o.id);
      return [
        id,
        {
          id,
          type: o.type,
          allow: wrapPermissionBits(o.allow),
          deny: wrapPermissionBits(o.deny),
        },
      ];
    }),
  );

  const channel = {
    id: channelId,
    name: raw.name,
    type,
    position: Number(raw.position || 0),
    topic: raw.topic || null,
    nsfw: Boolean(raw.nsfw),
    rateLimitPerUser: Number(raw.rate_limit_per_user || 0),
    bitrate: Number(raw.bitrate || 0),
    userLimit: Number(raw.user_limit || 0),
    rtcRegion: raw.rtc_region || null,
    videoQualityMode: raw.video_quality_mode ?? null,
    defaultAutoArchiveDuration: raw.default_auto_archive_duration ?? null,
    defaultThreadRateLimitPerUser: raw.default_thread_rate_limit_per_user ?? null,
    defaultForumLayout: raw.default_forum_layout ?? null,
    defaultSortOrder: raw.default_sort_order ?? null,
    availableTags: Array.isArray(raw.available_tags) ? raw.available_tags : [],
    parentId: raw.parent_id ? String(raw.parent_id) : null,
    guild,
    guildId: guild?.id || (raw.guild_id ? String(raw.guild_id) : null),
    permissionOverwrites: {
      cache: overwriteCache,
      edit: async (target?, options: Record<string, any> = {}, opts: Record<string, any> = {}) => {
        const rest = restClient?._rest;
        if (!rest) throw new Error("REST unavailable");
        const targetId = String(target?.id || target);
        const existing: any = overwriteCache.get(targetId) || {
          allow: wrapPermissionBits(0),
          deny: wrapPermissionBits(0),
          type: 1,
        };
        let allow: any = BigInt(existing.allow?.bitfield ?? 0);
        let deny: any = BigInt(existing.deny?.bitfield ?? 0);
        for (const [key, value] of Object.entries(options || {})) {
          const bit: any = PermissionsBitField.Flags[key];
          if (bit == null) continue;
          allow &= ~bit;
          deny &= ~bit;
          if (value === true) allow |= bit;
          else if (value === false) deny |= bit;
        }
        let overwriteType = 1;
        if (opts.type === OverwriteType.Role || opts.type === 0 || opts.type === "0") overwriteType = 0;
        else if (opts.type === OverwriteType.Member || opts.type === 1 || opts.type === "1") overwriteType = 1;
        else if (target?.user || (target?.bot != null && target?.username != null)) overwriteType = 1;
        else if (guild?.roles?.cache?.has?.(targetId) || targetId === String(guild?.id || "")) overwriteType = 0;
        else if (overwriteCache.has(targetId) && existing?.type != null) overwriteType = Number(existing.type) === 0 ? 0 : 1;
        await rest.put(channelPermissionPath(channelId, targetId), {
          body: {
            id: targetId,
            type: overwriteType,
            allow: String(allow),
            deny: String(deny),
          },
          reason: opts.reason ? String(opts.reason).slice(0, 512) : undefined,
        });
        overwriteCache.set(targetId, {
          id: targetId,
          type: overwriteType,
          allow: wrapPermissionBits(allow),
          deny: wrapPermissionBits(deny),
        });
        return true;
      },
      create: async (target?, options: Record<string, any> = {}, opts: Record<string, any> = {}) => {
        return channel.permissionOverwrites.edit(target, options, opts);
      },
      delete: async (target?, reason?) => {
        const rest = restClient?._rest;
        if (!rest) throw new Error("REST unavailable");
        const targetId = String(target?.id || target);
        await rest.delete(channelPermissionPath(channelId, targetId), {
          reason: reason ? String(reason).slice(0, 512) : undefined,
        });
        overwriteCache.delete(targetId);
        return true;
      },
    },
    isTextBased: () => [0, 5, 11, 12].includes(type),
    isThread: () => [10, 11, 12].includes(type),
    isDMBased: () => !guild,
    permissionsFor: (memberOrRole?) =>
      wrapLivePermissionBits(() => computeChannelPermissionBits(channel, memberOrRole)),
    messages: {
      fetch: async (opts: Record<string, any> = {}) => {
        const rest = restClient?._rest;
        if (!rest) throw new Error("REST unavailable");
        if (typeof opts === "string" || typeof opts === "number") {
          const mid = String(opts);
          const rawMsg = await rest.get(Routes.channelMessage(channelId, mid));
          return wrapMessage(rawMsg, restClient, { channelId, channel });
        }
        if (opts && typeof opts === "object" && (opts.id || opts.message)) {
          const mid = String(opts.id || opts.message);
          const rawMsg = await rest.get(Routes.channelMessage(channelId, mid));
          return wrapMessage(rawMsg, restClient, { channelId, channel });
        }
        const query = new URLSearchParams({
          limit: String(Math.min(100, Math.max(1, Number(opts.limit) || 50))),
        });
        if (opts.before) query.set("before", String(opts.before));
        if (opts.after) query.set("after", String(opts.after));
        if (opts.around) query.set("around", String(opts.around));
        const list = await rest.get(`${Routes.channelMessages(channelId)}?${query.toString()}`);
        return asCacheMap(
          (Array.isArray(list) ? list : [])
            .map((rawMsg?) => {
              const msg = wrapMessage(rawMsg, restClient, { channelId, channel });
              return msg?.id ? [msg.id, msg] : null;
            })
            .filter(Boolean),
        );
      },
    },
    threads: {
      fetchArchived: async (opts: Record<string, any> = {}) => {
        const rest = restClient?._rest;
        if (!rest) throw new Error("REST unavailable");
        const type = String(opts.type || "public").toLowerCase() === "private" ? "private" : "public";
        const path =
          type === "private"
            ? channelThreadsArchivedPrivatePath(channelId)
            : channelThreadsArchivedPublicPath(channelId);
        const query = new URLSearchParams({ limit: "100" });
        const raw = await rest.get(`${path}?${query.toString()}`).catch(() => null);
        const threads = asCacheMap(
          (raw?.threads || [])
            .map((t?) => {
              const wrapped = wrapThreadLike(t, guild, restClient);
              return wrapped?.id ? [wrapped.id, wrapped] : null;
            })
            .filter(Boolean),
        );
        return { threads };
      },
    },
    send: async (payload?) => {
      const rest = restClient?._rest;
      if (!rest) throw new Error("REST unavailable");
      let body;
      if (typeof payload === "string") {
        body = { content: payload };
      } else {
        body = {
          content: payload.content,
          embeds: payload.embeds?.map?.((e?) => (typeof e.toJSON === "function" ? e.toJSON() : e)),
          components: payload.components?.map?.((row?) =>
            typeof row?.toJSON === "function" ? row.toJSON() : row,
          ),
        };
        if (payload.allowedMentions && typeof payload.allowedMentions === "object") {
          body.allowed_mentions = {
            parse: Array.isArray(payload.allowedMentions.parse) ? payload.allowedMentions.parse : [],
          };
          if (Array.isArray(payload.allowedMentions.roles)) {
            body.allowed_mentions.roles = payload.allowedMentions.roles.map(String);
          }
          if (Array.isArray(payload.allowedMentions.users)) {
            body.allowed_mentions.users = payload.allowedMentions.users.map(String);
          }
          if (payload.allowedMentions.repliedUser != null) {
            body.allowed_mentions.replied_user = Boolean(payload.allowedMentions.repliedUser);
          }
        }
        const files = await normalizeRestMessageFiles(payload.files);
        if (files?.length) body.files = files;
      }
      const created = await rest.post(Routes.channelMessages(channelId), { body });
      return wrapMessage(created, restClient, { channelId, channel });
    },
    /* boardsGenInvite5: site-api REST client — createInvite via POST /channels/{id}/invites */
    createInvite: async (options: Record<string, any> = {}) => {
      const rest = restClient?._rest;
      if (!rest) throw new Error("REST unavailable");
      const body: Record<string, any> = {
        max_age: options.maxAge != null ? Number(options.maxAge) : 86400,
        max_uses: options.maxUses != null ? Number(options.maxUses) : 0,
        unique: Boolean(options.unique),
        temporary: Boolean(options.temporary),
      };
      if (options.targetUser != null) {
        body.target_user_id = String(options.targetUser?.id || options.targetUser);
      }
      if (options.targetApplication != null) {
        body.target_application_id = String(
          options.targetApplication?.id || options.targetApplication,
        );
      }
      const data = await rest.post(Routes.channelInvites(channelId), {
        body,
        reason: options.reason ? String(options.reason).slice(0, 512) : undefined,
      });
      const code = String(data?.code || "").trim();
      return {
        code,
        url: code ? `https://discord.gg/${code}` : "",
        channelId,
        maxAge: Number(data?.max_age ?? body.max_age),
        maxUses: Number(data?.max_uses ?? body.max_uses),
        temporary: Boolean(data?.temporary ?? body.temporary),
        unique: Boolean(body.unique),
      };
    },
    delete: async (reason?) => {
      const rest = restClient?._rest;
      if (!rest) throw new Error("REST unavailable");
      await rest.delete(Routes.channel(channelId), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      if (guild?.channels?.cache) guild.channels.cache.delete(channelId);
      if (restClient?.channels?.cache) restClient.channels.cache.delete(channelId);
      return true;
    },
    edit: async (payload: Record<string, any> = {}, reason?) => {
      const rest = restClient?._rest;
      if (!rest) throw new Error("REST unavailable");
      const body: Record<string, any> = {};
      if (payload.name != null) body.name = String(payload.name).slice(0, 100);
      if (payload.topic != null) body.topic = payload.topic == null ? null : String(payload.topic);
      if (payload.bitrate != null) body.bitrate = Number(payload.bitrate);
      if (payload.userLimit != null) body.user_limit = Number(payload.userLimit);
      if (payload.parent != null || payload.parentId != null) {
        body.parent_id = payload.parentId != null ? String(payload.parentId) : String(payload.parent?.id || payload.parent || "") || null;
      }
      if (payload.nsfw != null) body.nsfw = Boolean(payload.nsfw);
      if (payload.rateLimitPerUser != null) body.rate_limit_per_user = Number(payload.rateLimitPerUser);
      if (payload.rtcRegion !== undefined) body.rtc_region = payload.rtcRegion;
      const updated = await rest.patch(Routes.channel(channelId), {
        body,
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      const wrapped = wrapChannel(updated, guild, restClient);
      if (guild?.channels?.cache) guild.channels.cache.set(channelId, wrapped);
      if (restClient?.channels?.cache) restClient.channels.cache.set(channelId, wrapped);
      Object.assign(channel, {
        name: wrapped.name,
        topic: wrapped.topic,
        bitrate: wrapped.bitrate,
        userLimit: wrapped.userLimit,
        parentId: wrapped.parentId,
        nsfw: wrapped.nsfw,
        rateLimitPerUser: wrapped.rateLimitPerUser,
        rtcRegion: wrapped.rtcRegion,
      });
      return channel;
    },
  };
  return channel;
}

function isRestSnowflakeId(value?) {
  return /^\d{17,22}$/.test(String(value || "").trim());
}

function expandRestRoleIds(roleOrRoles?) {
  const raw = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  const out = [];
  for (const item of raw) {
    if (item == null) continue;
    const asId =
      typeof item === "object" && item.id != null ? String(item.id) : String(item);
    for (const part of asId.split(/[,\s]+/)) {
      const id = part.trim();
      if (isRestSnowflakeId(id)) out.push(id);
    }
  }
  return [...new Set(out)];
}

function wrapMember(raw?, guild?, userObj?) {
  const user = userObj || wrapUser(raw.user, guild?.client);
  const roleIds = (raw.roles || []).map(String);
  const rolesCache = asCacheMap(
    roleIds.map((rid?) => {
      const role = guild.roles.cache.get(rid) || { id: rid, name: rid, position: 0 };
      return [rid, role];
    }),
  );
  const disabledUntil = raw.communication_disabled_until
    ? Date.parse(raw.communication_disabled_until)
    : null;
  return {
    id: user.id,
    user,
    nickname: raw.nick || null,
    displayName: raw.nick || user.globalName || user.username,
    joinedTimestamp: raw.joined_at ? Date.parse(raw.joined_at) : null,
    joinedAt: raw.joined_at ? new Date(raw.joined_at) : null,
    premiumSince: raw.premium_since ? new Date(raw.premium_since) : null,
    communicationDisabledUntil: Number.isFinite(disabledUntil) ? new Date(disabledUntil) : null,
    communicationDisabledUntilTimestamp: Number.isFinite(disabledUntil) ? disabledUntil : null,
    pending: Boolean(raw.pending),
    avatar: raw.avatar || null,
    displayAvatarURL: (opts: Record<string, any> = {}) => user.displayAvatarURL(opts),
    roles: {
      cache: rolesCache,
      highest: [...rolesCache.values()].sort((a?: any, b?: any) => (b.position || 0) - (a.position || 0))[0] || null,
      add: async (roleOrRoles?, reason?) => {
                const ids = expandRestRoleIds(roleOrRoles);
        const reasonOpt = reason ? String(reason).slice(0, 512) : undefined;
        for (const roleId of ids) {
          await guild.client._rest.put(Routes.guildMemberRole(guild.id, user.id, roleId), {
            reason: reasonOpt,
          });
          rolesCache.set(roleId, guild.roles.cache.get(roleId) || { id: roleId });
        }
      },
      remove: async (roleOrRoles?, reason?) => {
        const ids = expandRestRoleIds(roleOrRoles);
        const reasonOpt = reason ? String(reason).slice(0, 512) : undefined;
        for (const roleId of ids) {
          await guild.client._rest.delete(Routes.guildMemberRole(guild.id, user.id, roleId), {
            reason: reasonOpt,
          });
          rolesCache.delete(roleId);
        }
      },
      set: async (roleOrRoles?, reason?) => {
        const guildId = String(guild.id || "");
        const ids = expandRestRoleIds(roleOrRoles).filter((id?) => id && id !== guildId);
        await guild.client._rest.patch(Routes.guildMember(guild.id, user.id), {
          body: { roles: ids },
          reason: reason ? String(reason).slice(0, 512) : undefined,
        });
        for (const key of [...rolesCache.keys()]) {
          if (!ids.includes(key)) rolesCache.delete(key);
        }
        for (const roleId of ids) {
          rolesCache.set(roleId, guild.roles.cache.get(roleId) || { id: roleId });
        }
      },
    },
    guild,
    permissions: wrapLivePermissionBits(() => computeMemberGuildPermissionBits({ roles: { cache: rolesCache }, guild }, guild)),
    toString: () => `<@${user.id}>`,
    valueOf: () => String(user.id),
  };
}

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

async function fetchAllMembers(rest?, guildId?) {
  const out = [];
  let after;
  for (let i = 0; i < 50; i += 1) {
    const query = new URLSearchParams({ limit: "1000" });
    if (after) query.set("after", after);
    const batch = await rest.get(`/guilds/${guildId}/members?${query.toString()}`);
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    after = String(batch[batch.length - 1]?.user?.id || "");
    if (!after || batch.length < 1000) break;
  }
  return out;
}

function wrapGuild(raw?, client?) {
  const approxMembers = Number(raw?.approximate_member_count);
  const approxOnline = Number(raw?.approximate_presence_count);
  const exactMembers = Number(raw?.member_count ?? raw?.memberCount);
  const memberCount =
    Number.isFinite(exactMembers) && exactMembers >= 0
      ? exactMembers
      : Number.isFinite(approxMembers) && approxMembers >= 0
        ? approxMembers
        : null;
  const approximatePresenceCount =
    Number.isFinite(approxOnline) && approxOnline >= 0 ? approxOnline : null;

  const guild = {
    id: String(raw.id),
    name: raw.name,
    icon: raw.icon || null,
    banner: raw.banner || null,
    splash: raw.splash || null,
    discoverySplash: raw.discovery_splash || null,
    description: raw.description || null,
    vanityURLCode: raw.vanity_url_code || null,
    preferredLocale: raw.preferred_locale || null,
    features: Array.isArray(raw.features) ? raw.features : [],
    verificationLevel: Number(raw.verification_level ?? 0),
    explicitContentFilter: Number(raw.explicit_content_filter ?? 0),
    defaultMessageNotifications: Number(raw.default_message_notifications ?? 0),
    mfaLevel: Number(raw.mfa_level ?? 0),
    nsfwLevel: Number(raw.nsfw_level ?? 0),
    premiumTier: Number(raw.premium_tier ?? 0),
    premiumProgressBarEnabled: Boolean(raw.premium_progress_bar_enabled),
    afkTimeout: Number(raw.afk_timeout ?? 0),
    afkChannelId: raw.afk_channel_id ? String(raw.afk_channel_id) : null,
    systemChannelId: raw.system_channel_id ? String(raw.system_channel_id) : null,
    rulesChannelId: raw.rules_channel_id ? String(raw.rules_channel_id) : null,
    publicUpdatesChannelId: raw.public_updates_channel_id
      ? String(raw.public_updates_channel_id)
      : null,
    safetyAlertsChannelId: raw.safety_alerts_channel_id
      ? String(raw.safety_alerts_channel_id)
      : null,
    widgetEnabled: Boolean(raw.widget_enabled),
    widgetChannelId: raw.widget_channel_id ? String(raw.widget_channel_id) : null,
    ownerId: raw.owner_id ? String(raw.owner_id) : null,
    maximumMembers: Number(raw.max_members ?? 0),
    maximumPresences: Number(raw.max_presences ?? 0),
    maxVideoChannelUsers: Number(raw.max_video_channel_users ?? 0),
    createdAt: snowflakeCreatedAt(raw.id),
    client,
    memberCount,
    approximateMemberCount: Number.isFinite(approxMembers) && approxMembers >= 0 ? approxMembers : memberCount,
    approximatePresenceCount,
    members: null,
    roles: { cache: asCacheMap(), fetch: null, everyone: null },
    channels: { cache: asCacheMap(), fetch: null, fetchActiveThreads: null },
    emojis: { cache: asCacheMap() },
    stickers: { cache: asCacheMap() },
    scheduledEvents: { cache: asCacheMap(), fetch: null },
    autoModerationRules: { fetch: null },
    bans: null,
    iconURL: (opts: Record<string, any> = {}) => {
      const hash = String(raw.icon || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 256;
      const ext = opts.extension || (hash.startsWith("a_") ? "gif" : "png");
      return `https://cdn.discordapp.com/icons/${raw.id}/${hash}.${ext}?size=${size}`;
    },
    bannerURL: (opts: Record<string, any> = {}) => {
      const hash = String(raw.banner || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 1024;
      const ext = opts.extension || (hash.startsWith("a_") ? "gif" : "png");
      return `https://cdn.discordapp.com/banners/${raw.id}/${hash}.${ext}?size=${size}`;
    },
    splashURL: (opts: Record<string, any> = {}) => {
      const hash = String(raw.splash || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 2048;
      return `https://cdn.discordapp.com/splashes/${raw.id}/${hash}.png?size=${size}`;
    },
    discoverySplashURL: (opts: Record<string, any> = {}) => {
      const hash = String(raw.discovery_splash || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 2048;
      return `https://cdn.discordapp.com/discovery-splashes/${raw.id}/${hash}.png?size=${size}`;
    },
    fetch: async () => {
      const refreshed = await client.guilds.fetch(guild.id);
      return refreshed;
    },
    fetchWebhooks: async () => {
      const list = await client._rest.get(guildWebhooksPath(guild.id)).catch(() => []);
      return asCacheMap(
        (list || [])
          .map((h?) => {
            const id = String(h.id);
            return [
              id,
              {
                id,
                type: h.type,
                guildId: h.guild_id ? String(h.guild_id) : guild.id,
                channelId: h.channel_id ? String(h.channel_id) : null,
                name: h.name || null,
                avatar: h.avatar || null,
                applicationId: h.application_id ? String(h.application_id) : null,
                sourceGuild: h.source_guild || null,
                sourceChannel: h.source_channel || null,
              },
            ];
          })
          .filter(Boolean),
      );
    },
    invites: {
      fetch: async () => {
        const list = await client._rest.get(Routes.guildInvites(guild.id)).catch(() => []);
        return asCacheMap(
          (list || [])
            .map((inv?) => {
              const code = String(inv.code);
              return [
                code,
                {
                  code,
                  url: `https://discord.gg/${code}`,
                  channelId: inv.channel?.id ? String(inv.channel.id) : null,
                  inviterId: inv.inviter?.id ? String(inv.inviter.id) : null,
                  targetType: inv.target_type ?? null,
                  targetUserId: inv.target_user?.id ? String(inv.target_user.id) : null,
                  expiresAt: inv.expires_at ? new Date(inv.expires_at) : null,
                  createdAt: inv.created_at ? new Date(inv.created_at) : null,
                  temporary: Boolean(inv.temporary),
                  maxAge: Number(inv.max_age ?? 0),
                  maxUses: Number(inv.max_uses ?? 0),
                  uses: Number(inv.uses ?? 0),
                },
              ];
            })
            .filter(Boolean),
        );
      },
      /* boardsGenInvite5 */
      create: async (channelOrId?, options: Record<string, any> = {}) => {
        const chId = String(channelOrId?.id || channelOrId || "").trim();
        if (!/^\d{17,22}$/.test(chId)) throw new Error("missing_channel");
        let ch: any = guild.channels.cache.get(chId);
        if (!ch && typeof guild.channels.fetch === "function") {
          ch = await guild.channels.fetch(chId).catch(() => null);
        }
        if (ch && typeof ch.createInvite === "function") {
          return ch.createInvite(options);
        }
        const rest = client._rest;
        if (!rest) throw new Error("REST unavailable");
        const body = {
          max_age: options.maxAge != null ? Number(options.maxAge) : 86400,
          max_uses: options.maxUses != null ? Number(options.maxUses) : 0,
          unique: Boolean(options.unique),
          temporary: Boolean(options.temporary),
        };
        const data = await rest.post(Routes.channelInvites(chId), {
          body,
          reason: options.reason ? String(options.reason).slice(0, 512) : undefined,
        });
        const code = String(data?.code || "").trim();
        return {
          code,
          url: code ? `https://discord.gg/${code}` : "",
          channelId: chId,
          maxAge: Number(data?.max_age ?? body.max_age),
          maxUses: Number(data?.max_uses ?? body.max_uses),
          temporary: Boolean(data?.temporary ?? body.temporary),
        };
      },
    },
    fetchIntegrations: async () => {
      const list = await client._rest.get(guildIntegrationsPath(guild.id)).catch(() => []);
      return Array.isArray(list) ? list : [];
    },
    fetchAuditLogs: async (opts: Record<string, any> = {}) => {
      const query = new URLSearchParams({ limit: String(Math.min(100, Number(opts.limit) || 100)) });
      if (opts.before) query.set("before", String(opts.before));
      const rawLogs = await client._rest
        .get(`${guildAuditLogPath(guild.id)}?${query.toString()}`)
        .catch(() => null);
      const entries = asCacheMap(
        (rawLogs?.audit_log_entries || []).map((entry?) => {
          const id = String(entry.id);
          return [
            id,
            {
              id,
              action: entry.action_type,
              actionType: String(entry.action_type || ""),
              targetId: entry.target_id ? String(entry.target_id) : null,
              executorId: entry.user_id ? String(entry.user_id) : null,
              reason: entry.reason || null,
              createdAt: snowflakeCreatedAt(id),
              extra: entry.options || null,
              changes: Array.isArray(entry.changes) ? entry.changes : [],
            },
          ];
        }),
      );
      return { entries };
    },
  };

  guild.roles.fetch = async (roleId?, opts: Record<string, any> = {}) => {
    const force = Boolean(opts && opts.force);
    if (roleId && !force) {
      const existing = guild.roles.cache.get(String(roleId));
      if (existing) return existing;
    }
    if (roleId && force && client._rest) {
      try {
        const raw = await client._rest.get(Routes.guildRole(guild.id, String(roleId)));
        const prev: any = guild.roles.cache.get(String(roleId));
        const wrapped = wrapRole(raw, guild, prev?.members || null);
        if (wrapped?.id) guild.roles.cache.set(wrapped.id, wrapped);
        return wrapped;
      } catch (_) {
        /* fall through to full enrich */
      }
    }
    await enrichGuildRoles(client._rest, guild);
    return roleId ? guild.roles.cache.get(String(roleId)) || null : guild.roles.cache;
  };

  (guild.roles as any).create = async (options: Record<string, any> = {}) => {
    const rest = client._rest;
    if (!rest) throw new Error("REST unavailable");
    const body: Record<string, any> = {};
    if (options.name != null) body.name = String(options.name).slice(0, 100);
    if (options.hoist != null) body.hoist = Boolean(options.hoist);
    if (options.mentionable != null) body.mentionable = Boolean(options.mentionable);
    if (Object.prototype.hasOwnProperty.call(options, "unicodeEmoji") || Object.prototype.hasOwnProperty.call(options, "unicode_emoji")) {
      const ue = options.unicodeEmoji !== undefined ? options.unicodeEmoji : options.unicode_emoji;
      body.unicode_emoji = ue == null || ue === "" ? null : String(ue);
    }
    if (Object.prototype.hasOwnProperty.call(options, "icon")) {
      if (options.icon == null) body.icon = null;
      else if (Buffer.isBuffer(options.icon) || options.icon instanceof Uint8Array) {
        body.icon = await bufferToRoleIconDataUri(options.icon);
      } else if (typeof options.icon === "string") {
        body.icon = options.icon;
      }
    }
    if (options.permissions != null) {
      try {
        body.permissions = String(PermissionsBitField.resolve(options.permissions));
      } catch (_) {}
    }
    if (options.colors && typeof options.colors === "object") {
      const colorsBody = buildRoleColorsApiBody(options.colors);
      if (colorsBody) body.colors = colorsBody;
    } else if (options.color != null) {
      const c = colorValueToInt(options.color);
      if (c != null) {
        body.colors = { primary_color: c, secondary_color: null, tertiary_color: null };
      }
    }
    const created = await rest.post(Routes.guildRoles(guild.id), {
      body,
      reason: options.reason ? String(options.reason).slice(0, 512) : undefined,
    });
    const wrapped = wrapRole(created, guild);
    if (wrapped?.id) guild.roles.cache.set(wrapped.id, wrapped);
    if (wrapped && options.position != null && typeof wrapped.setPosition === "function") {
      await wrapped.setPosition(options.position, { reason: options.reason }).catch(() => {});
    }
    return wrapped;
  };

  (guild.roles as any).edit = async (roleId?, payload: Record<string, any> = {}, reason?) => {
    const id = String(roleId?.id || roleId || "").trim();
    if (!id) throw new Error("roleId required");
    let role: any = guild.roles.cache.get(id);
    if (!role || typeof role.edit !== "function") {
      role = await guild.roles.fetch(id);
    }
    if (!role || typeof role.edit !== "function") throw new Error("role_not_found");
    return role.edit(payload, reason);
  };

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

  guild.members = {
    me: null,
    cache: asCacheMap(),
    /* guildJoinAuto1: OAuth guilds.join → PUT /guilds/{id}/members/{user} */
    add: async (userId?, options: Record<string, any> = {}) => {
      const uid = String(userId || "").trim();
      if (!uid || !/^\d{5,24}$/.test(uid)) throw new Error("invalid_user");
      const accessToken = String(options.accessToken || options.access_token || "").trim();
      if (!accessToken) throw new Error("missing_access_token");
      const body: Record<string, any> = { access_token: accessToken };
      if (Array.isArray(options.roles)) {
        body.roles = options.roles.map((r?) => String(r)).filter((id?) => /^\d{5,24}$/.test(id));
      }
      if (options.nick != null) body.nick = String(options.nick).slice(0, 32);
      if (options.mute != null) body.mute = Boolean(options.mute);
      if (options.deaf != null) body.deaf = Boolean(options.deaf);
      const raw = await client._rest.put(Routes.guildMember(guild.id, uid), {
        body,
        reason: options.reason ? String(options.reason).slice(0, 512) : undefined,
      });
      if (!raw) {
        return guild.members.fetch(uid).catch(() => ({ id: uid, user: { id: uid }, guild }));
      }
      const member = wrapMember(raw, guild, wrapUser(raw.user || { id: uid }, client));
      guild.members.cache.set(uid, member);
      return member;
    },
    fetchMe: async () => {
      const meId = String(client.user?.id || "").trim();
      if (!meId) return null;
      return guild.members.fetch(meId);
    },
    /* unbanAcceptFix1: decideUnbanAppeal chiama members.unban (discord.js); REST aveva solo bans.remove */
    unban: async (userId?, reason?) => {
      const uid = String(userId || "").trim();
      if (!uid || !/^\d{5,24}$/.test(uid)) throw new Error("invalid_user");
      await client._rest.delete(Routes.guildBan(guild.id, uid), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      return { user: { id: uid } };
    },
    fetch: async (opts: Record<string, any> = {}) => {
      const force = opts?.force === true;
      const fetchOne = async (rawUid?) => {
        const uid = String(rawUid || "").trim();
        if (!uid || !/^\d{5,24}$/.test(uid)) return null;
        if (!force) {
          const cached = guild.members.cache.get(uid);
          if (cached) return cached;
        }
        let rawM;
        try {
          rawM = await client._rest.get(Routes.guildMember(guild.id, uid));
        } catch (err) {
          const code = Number(err?.code ?? err?.rawError?.code ?? 0);
          const msg = String(err?.message || err || "");
          if (code === 10007 || /unknown member/i.test(msg)) return null;
          throw err;
        }
        if (!rawM) return null;
        const member = wrapMember(rawM, guild, wrapUser(rawM.user, client));
        guild.members.cache.set(uid, member);
        return member;
      };
      // discord.js-compatible: fetch({ user: string[] })
      if (Array.isArray(opts?.user)) {
        const list = [
          ...new Set(
            opts.user
              .map((x?) => String(x || "").trim())
              .filter((id?) => /^\d{5,24}$/.test(id)),
          ),
        ];
        const out = asCacheMap();
        const concurrency = 20;
        for (let i = 0; i < list.length; i += concurrency) {
          const chunk = list.slice(i, i + concurrency);
          const got = await Promise.all(chunk.map((id?) => fetchOne(id).catch(() => null)));
          for (const m of got) {
            if (m?.id) out.set(m.id, m);
          }
        }
        return out;
      }
      if (
        typeof opts === "string" ||
        typeof opts?.user === "string" ||
        (typeof opts === "object" && opts && !opts.query && (opts.user || opts.id) && !Array.isArray(opts.user))
      ) {
        return fetchOne(typeof opts === "string" ? opts : opts.user || opts.id);
      }
      const rawMembers = await fetchAllMembers(client._rest, guild.id);
      for (const rawM of rawMembers) {
        const member = wrapMember(rawM, guild, wrapUser(rawM.user, client));
        guild.members.cache.set(member.id, member);
        for (const rid of rawM.roles || []) {
          const role: any = guild.roles.cache.get(String(rid));
          if (role?.members) role.members.set(member.id, member);
        }
      }
      return guild.members.cache;
    },
  };

  guild.scheduledEvents = {
    cache: asCacheMap(),
    fetch: async () => {
      const events = await client._rest.get(Routes.guildScheduledEvents(guild.id));
      guild.scheduledEvents.cache.clear();
      for (const e of events || []) {
        const id = String(e.id);
        guild.scheduledEvents.cache.set(id, {
          id,
          name: e.name,
          description: e.description,
          scheduledStartTimestamp: e.scheduled_start_time ? Date.parse(e.scheduled_start_time) : null,
          scheduledEndTimestamp: e.scheduled_end_time ? Date.parse(e.scheduled_end_time) : null,
          scheduledStartAt: e.scheduled_start_time ? new Date(e.scheduled_start_time) : null,
          scheduledEndAt: e.scheduled_end_time ? new Date(e.scheduled_end_time) : null,
          status: e.status,
          entityType: e.entity_type,
          privacyLevel: e.privacy_level,
          entityMetadata: e.entity_metadata || null,
          channelId: e.channel_id ? String(e.channel_id) : null,
          creatorId: e.creator_id ? String(e.creator_id) : null,
          userCount: e.user_count,
          createdAt: snowflakeCreatedAt(id),
          image: e.image || null,
        });
      }
      return guild.scheduledEvents.cache;
    },
  };

  guild.autoModerationRules = {
    fetch: async () => {
      const list = await client._rest.get(guildAutoModerationRulesPath(guild.id)).catch(() => []);
      return asCacheMap(
        (list || []).map((rule?) => {
          const id = String(rule.id);
          return [
            id,
            {
              id,
              name: rule.name,
              creatorId: rule.creator_id ? String(rule.creator_id) : null,
              eventType: rule.event_type,
              triggerType: rule.trigger_type,
              triggerMetadata: rule.trigger_metadata || null,
              enabled: Boolean(rule.enabled),
              exemptChannels: Array.isArray(rule.exempt_channels)
                ? rule.exempt_channels.map(String)
                : [],
              exemptRoles: Array.isArray(rule.exempt_roles) ? rule.exempt_roles.map(String) : [],
              actions: Array.isArray(rule.actions) ? rule.actions : [],
            },
          ];
        }),
      );
    },
  };

  guild.bans = {
    fetch: async (userId?) => {
      if (userId) {
        const ban = await client._rest.get(Routes.guildBan(guild.id, String(userId))).catch(() => null);
        return ban;
      }
      const list = await client._rest.get(guildBansPath(guild.id)).catch(() => []);
      return asCacheMap(
        (list || []).map((ban?) => {
          const uid = String(ban.user?.id || "");
          return [
            uid,
            {
              reason: ban.reason || null,
              user: wrapUser(ban.user, client),
            },
          ];
        }),
      );
    },
    remove: async (userId?, reason?) => {
      await client._rest.delete(Routes.guildBan(guild.id, String(userId)), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      return true;
    },
  };

  return guild;
}

async function createSiteApiRestClient(config?, token?, options: Record<string, any> = {}) {
  const rest = new REST({
    version: "10",
        timeout: Math.max(3000, Number(options.restTimeoutMs) || 8000),
  }).setToken(token);
  /* siteApiMeRetry1: Discord a volte risponde 500 su /users/@me → non far crashare site-api */
  let me = null;
  let lastErr = null;
  const attempts = Math.max(1, Math.min(8, Number(options.meAttempts) || 5));
  for (let i = 0; i < attempts; i += 1) {
    try {
      me = await rest.get(Routes.user("@me"));
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const st = Number(err?.status || err?.statusCode || 0);
      const retryable = st === 500 || st === 502 || st === 503 || st === 504 || st === 429 || !st;
      if (!retryable || i === attempts - 1) throw err;
      const waitMs = Math.min(12_000, 800 * Math.pow(2, i));
      console.warn(
        `[SITE-API] Discord /users/@me attempt ${i + 1}/${attempts} failed (${st || err?.message || "err"}); retry in ${waitMs}ms`,
      );
      await new Promise((r?) => setTimeout(r, waitMs));
    }
  }
  if (!me) throw lastErr || new Error("discord_me_unavailable");
  const guildCache = asCacheMap();

  const client: Record<string, any> = {
    config,
    _rest: rest,
    _isSiteApiRestClient: true,
    user: wrapUser(me),
    fetchInvite: async (code?) => {
      const inviteCode = String(code || "").trim();
      if (!inviteCode) return null;
      const raw: any = await rest.get(Routes.invite(inviteCode));
      if (!raw) return null;
      return {
        code: String(raw.code || inviteCode),
        url: `https://discord.gg/${raw.code || inviteCode}`,
        guild: raw.guild
          ? {
              id: String(raw.guild.id),
              name: String(raw.guild.name || "").trim() || null,
              icon: raw.guild.icon || null,
              approximate_member_count: Number(raw.approximate_member_count) || 0,
            }
          : null,
        approximateMemberCount: Number(raw.approximate_member_count) || 0,
      };
    },
    users: {
      cache: asCacheMap([[String(me.id), wrapUser(me)]]),
      fetch: async (id?, opts: Record<string, any> = {}) => {
        const uid = String(id);
        if (!opts.force) {
          const cached = client.users.cache.get(uid);
          if (cached) return cached;
        }
        const raw = await rest.get(Routes.user(uid));
        const user = wrapUser(raw, client);
        client.users.cache.set(uid, user);
        return user;
      },
      createDM: async (userId?) => {
        const channel = await rest.post(Routes.userChannels(), {
          body: { recipient_id: String(userId) },
        });
        return wrapChannel(channel, null, client);
      },
    },
    channels: {
      cache: asCacheMap(),
      fetch: async (id?) => {
        const raw: any = await rest.get(Routes.channel(String(id)));
        const guild =
          raw.guild_id &&
          (guildCache.get(String(raw.guild_id)) ||
            (await client.guilds.fetch(String(raw.guild_id)).catch(() => null)));
        const ch = wrapChannel(raw, guild || { id: raw.guild_id, client }, client);
        client.channels.cache.set(ch.id, ch);
        return ch;
      },
    },
    guilds: {
      cache: guildCache,
            fetchLite: async (id?) => {
        const gid = String(id);
        const hit: any = guildCache.get(gid);
        if (hit?.members && typeof hit.members.fetch === "function") return hit;
        const raw = await rest.get(Routes.guild(gid));
        const guild = wrapGuild(raw, client);
        await enrichGuildRoles(rest, guild).catch(() => {});
        guildCache.set(gid, guild);
        return guild;
      },
      fetch: async (id?) => {
        const gid = String(id);
        const raw = await rest.get(Routes.guild(gid), {
          query: new URLSearchParams({ with_counts: "true" }),
        });
        const guild = wrapGuild(raw, client);
        await enrichGuildRoles(rest, guild).catch(() => {});
        await guild.channels.fetch().catch(() => {});
        await enrichGuildEmojis(rest, guild).catch(() => {});
        await enrichGuildStickers(rest, guild).catch(() => {});
        await guild.scheduledEvents.fetch().catch(() => {});
        const meMember = await rest.get(Routes.guildMember(gid, me.id)).catch(() => null);
        if (meMember) {
          guild.members.me = wrapMember(meMember, guild, wrapUser(me, client));
          guild.members.cache.set(String(me.id), guild.members.me);
        }
        guildCache.set(gid, guild);
        return guild;
      },
    },
  };

    client.user = wrapUser(me, client);
  client.users.cache.set(String(me.id), client.user);
  const { initializeCommandCollections } = require("../../../shared/runtime/clientRuntime") as typeof import("../../../shared/runtime/clientRuntime");
  initializeCommandCollections(client);
  client.logs = {
    success: (...a) => console.log(...a),
    info: (...a) => console.log(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
  };
  client.__prefixCommandsReady = false;

  const mainGuildId = String(config?.mainGuildId || "").trim();
  if (/^\d{17,22}$/.test(mainGuildId)) {
    /* siteApiFetchLiteBoot1: boot warm senza channels/emojis/events full fetch */
    const lite = client.guilds?.fetchLite;
    if (typeof lite === "function") {
      await lite(mainGuildId).catch(() => null);
    } else {
      await client.guilds.fetch(mainGuildId).catch(() => null);
    }
  }

      try {
    let after = "";
    for (let page = 0; page < 25; page += 1) {
      const query = new URLSearchParams({ limit: "200" });
      if (after) query.set("after", after);
      const batch = await rest.get((`${userGuildsPath()}?${query.toString()}` as any));
      if (!Array.isArray(batch) || !batch.length) break;
      for (const g of batch) {
        const gid = String(g?.id || "").trim();
        if (!/^\d{17,22}$/.test(gid)) continue;
        if (guildCache.has(gid)) continue;
        guildCache.set(gid, {
          id: gid,
          name: String(g?.name || "").trim() || gid,
          icon: g?.icon || null,
          partial: true,
          client,
        });
      }
      after = String(batch[batch.length - 1]?.id || "").trim();
      if (!after || batch.length < 200) break;
    }
  } catch (_) {}

  if (options.warmAllGuilds) {
    for (const gid of [...guildCache.keys()]) {
      const stub: any = guildCache.get(gid);
      if (stub && stub.partial !== true) continue;
      await client.guilds.fetch(gid).catch(() => null);
    }
  }

  return client;
}

export = { createSiteApiRestClient };
