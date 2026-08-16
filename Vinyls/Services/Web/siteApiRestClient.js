/**
 * Client Discord “lite” solo REST (niente gateway): può coesistere col bot online.
 * Espone la superficie usata dalle API sito e dai worker (scheduler / backup / vote-drain).
 */
const { REST, Routes, PermissionsBitField } = require("discord.js");

function routeCall(name, ...args) {
  const fn = Routes[name];
  if (typeof fn === "function") return fn(...args);
  throw new Error(`discord.js Routes.${name} missing`);
}

/** Fallback paths if Routes helper manca nella versione installata. */
function guildActiveThreadsPath(guildId) {
  try {
    return routeCall("guildActiveThreads", guildId);
  } catch {
    return `/guilds/${guildId}/threads/active`;
  }
}
function channelThreadsArchivedPublicPath(channelId) {
  try {
    return routeCall("channelThreadsArchivedPublic", channelId);
  } catch {
    return `/channels/${channelId}/threads/archived/public`;
  }
}
function channelThreadsArchivedPrivatePath(channelId) {
  try {
    return routeCall("channelThreadsArchivedPrivate", channelId);
  } catch {
    return `/channels/${channelId}/threads/archived/private`;
  }
}
function guildAutoModerationRulesPath(guildId) {
  try {
    return routeCall("guildAutoModerationRules", guildId);
  } catch {
    return `/guilds/${guildId}/auto-moderation/rules`;
  }
}
function guildAuditLogPath(guildId) {
  try {
    return routeCall("guildAuditLog", guildId);
  } catch {
    return `/guilds/${guildId}/audit-logs`;
  }
}
function guildWebhooksPath(guildId) {
  try {
    return routeCall("guildWebhooks", guildId);
  } catch {
    return `/guilds/${guildId}/webhooks`;
  }
}
function guildBansPath(guildId) {
  try {
    return routeCall("guildBans", guildId);
  } catch {
    return `/guilds/${guildId}/bans`;
  }
}
function guildIntegrationsPath(guildId) {
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
function channelPermissionPath(channelId, overwriteId) {
  try {
    return routeCall("channelPermission", channelId, overwriteId);
  } catch {
    return `/channels/${channelId}/permissions/${overwriteId}`;
  }
}

function asCacheMap(seed = []) {
  const map = new Map(seed);
  const api = {
    get: (id) => map.get(String(id)),
    set: (id, value) => map.set(String(id), value),
    has: (id) => map.has(String(id)),
    delete: (id) => map.delete(String(id)),
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
    forEach: (fn, thisArg) => map.forEach(fn, thisArg),
    filter: (fn) =>
      asCacheMap(
        [...map.values()]
          .filter(fn)
          .map((v) => [String(v?.id || v?.user?.id || ""), v])
          .filter(([id]) => id),
      ),
    find: (fn) => [...map.values()].find(fn),
    map: (fn) => [...map.values()].map(fn),
    some: (fn) => [...map.values()].some(fn),
    every: (fn) => [...map.values()].every(fn),
    first: () => map.values().next().value ?? null,
  };
  return api;
}

function wrapPermissionBits(raw) {
  let bits = 0n;
  try {
    bits = BigInt(raw ?? 0);
  } catch {
    bits = 0n;
  }
  return {
    bitfield: bits,
    has: (flag) => permissionBitsHas(bits, flag),
  };
}

function permissionBitsHas(bits, flag) {
  try {
    if (Array.isArray(flag)) return flag.every((f) => permissionBitsHas(bits, f));
    const f = typeof flag === "bigint" ? flag : BigInt(flag);
    return (bits & f) === f;
  } catch {
    return false;
  }
}

function wrapLivePermissionBits(getBits) {
  return {
    get bitfield() {
      try {
        return getBits();
      } catch {
        return 0n;
      }
    },
    has: (flag) => {
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

/** Permessi di guild del membro (@everyone + ruoli), senza overwrite di canale. */
function computeMemberGuildPermissionBits(member, guild) {
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

/**
 * Risoluzione permessi canale come Discord:
 * base guild → overwrite @everyone → overwrite ruoli → overwrite membro.
 */
function computeChannelPermissionBits(channel, memberOrRole) {
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

  // Thread pubblici: eredita overwrite dal parent se il thread non ne ha.
  let overwriteSource = channel;
  try {
    const isThread = typeof channel.isThread === "function" ? channel.isThread() : [10, 11, 12].includes(Number(channel.type));
    if (isThread && channel.parentId && (!channel.permissionOverwrites?.cache?.size)) {
      const parent = guild.channels?.cache?.get?.(String(channel.parentId));
      if (parent) overwriteSource = parent;
    }
  } catch {
    /* ignore */
  }

  const overwrites = overwriteSource.permissionOverwrites?.cache;
  if (!overwrites) return bits;

  const applyOw = (ow) => {
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

function snowflakeCreatedAt(id) {
  try {
    const ts = Number((BigInt(String(id)) >> 22n) + 1420070400000n);
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

function wrapUser(raw, clientRef = null) {
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
    displayAvatarURL: (opts = {}) => {
      const size = opts.size || 128;
      const ext = opts.extension || (raw.avatar?.startsWith("a_") ? "gif" : "png");
      if (raw.avatar) return `https://cdn.discordapp.com/avatars/${id}/${raw.avatar}.${ext}?size=${size}`;
      const idx = Number(BigInt(id) >> 22n) % 6;
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    },
    tag: raw.discriminator && raw.discriminator !== "0" ? `${raw.username}#${raw.discriminator}` : raw.username,
    toString: () => `<@${id}>`,
    valueOf: () => id,
    send: async (payload) => {
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
              embeds: payload?.embeds?.map?.((e) => (typeof e.toJSON === "function" ? e.toJSON() : e)),
              components: payload?.components?.map?.((row) =>
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
          fetch: async (messageId) => {
            const raw = await rest.get(Routes.channelMessage(String(dm.id), String(messageId)));
            return wrapMessage(raw, clientRef, { channelId: String(dm.id) });
          },
        },
      };
    },
  };
  return user;
}

function wrapRole(raw, guild = null, existingMembers = null) {
  if (!raw?.id) return null;
  const members =
    existingMembers && typeof existingMembers.set === "function" ? existingMembers : asCacheMap();
  const roleId = String(raw.id);
  return {
    id: roleId,
    name: raw.name,
    color: raw.color,
    hoist: Boolean(raw.hoist),
    managed: Boolean(raw.managed),
    mentionable: Boolean(raw.mentionable),
    tags: raw.tags || null,
    hexColor:
      Number(raw.color) > 0 ? `#${Number(raw.color).toString(16).padStart(6, "0")}` : "#000000",
    position: raw.position,
    permissions: wrapPermissionBits(raw.permissions),
    unicodeEmoji: raw.unicode_emoji || raw.unicodeEmoji || null,
    icon: raw.icon || null,
    iconURL: (opts = {}) => {
      if (!raw.icon) return null;
      const size = opts.size || 256;
      return `https://cdn.discordapp.com/role-icons/${raw.id}/${raw.icon}.png?size=${size}`;
    },
    createdAt: snowflakeCreatedAt(roleId),
    members,
    delete: async (reason) => {
      const rest = guild?.client?._rest;
      if (!rest || !guild?.id) throw new Error("REST unavailable");
      await rest.delete(Routes.guildRole(guild.id, roleId), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      guild.roles.cache.delete(roleId);
      return true;
    },
  };
}

function encodeReactionEmoji(emoji) {
  const raw = String(emoji || "").trim();
  if (!raw) return "";
  const custom = raw.match(/^<a?:([a-zA-Z0-9_]+):(\d{17,22})>$/);
  if (custom) return encodeURIComponent(`${custom[1]}:${custom[2]}`);
  return encodeURIComponent(raw);
}

function wrapMessage(raw, clientRef, meta = {}) {
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
  const message = {
    id: messageId,
    channelId,
    channel: meta.channel || null,
    content: raw.content || "",
    embeds: Array.isArray(raw.embeds) ? raw.embeds : [],
    components: Array.isArray(raw.components) ? raw.components : [],
    author,
    createdTimestamp,
    createdAt: new Date(createdTimestamp),
    editable: true,
    react: async (emoji) => {
      const rest = clientRef?._rest;
      if (!rest || !channelId) throw new Error("REST unavailable");
      const encoded = encodeReactionEmoji(emoji);
      if (!encoded) throw new Error("Invalid emoji");
      await rest.put(Routes.channelMessageOwnReaction(channelId, messageId, encoded));
      return true;
    },
    edit: async (payload = {}) => {
      const rest = clientRef?._rest;
      if (!rest || !channelId) throw new Error("REST unavailable");
      const body =
        typeof payload === "string"
          ? { content: payload }
          : {
              content: payload.content,
              embeds: payload.embeds?.map?.((e) => (typeof e.toJSON === "function" ? e.toJSON() : e)),
              components: payload.components?.map?.((row) =>
                typeof row?.toJSON === "function" ? row.toJSON() : row,
              ),
            };
      const updated = await rest.patch(Routes.channelMessage(channelId, messageId), { body });
      return wrapMessage(updated, clientRef, { channelId, channel: meta.channel });
    },
    startThread: async (opts = {}) => {
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

function wrapThreadLike(raw, guild, clientRef) {
  const ch = wrapChannel(raw, guild, clientRef);
  if (!ch) return null;
  ch.isThread = () => true;
  return ch;
}

function guessImageContentType(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function normalizeRestMessageFiles(files) {
  if (!Array.isArray(files) || !files.length) return undefined;
  const fs = require("fs");
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

function wrapChannel(raw, guild, clientRef) {
  if (!raw?.id) return null;
  const restClient = clientRef || guild?.client || null;
  const channelId = String(raw.id);
  const type = Number(raw.type);
  const overwriteCache = asCacheMap(
    (raw.permission_overwrites || []).map((o) => {
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
      edit: async (target, options = {}, opts = {}) => {
        const rest = restClient?._rest;
        if (!rest) throw new Error("REST unavailable");
        const targetId = String(target?.id || target);
        const existing = overwriteCache.get(targetId) || {
          allow: wrapPermissionBits(0),
          deny: wrapPermissionBits(0),
        };
        let allow = BigInt(existing.allow?.bitfield ?? 0);
        let deny = BigInt(existing.deny?.bitfield ?? 0);
        for (const [key, value] of Object.entries(options || {})) {
          const bit = PermissionsBitField.Flags[key];
          if (bit == null) continue;
          allow &= ~bit;
          deny &= ~bit;
          if (value === true) allow |= bit;
          else if (value === false) deny |= bit;
        }
        const overwriteType =
          target?.user || (target?.bot != null && target?.username != null) ? 1 : Number(existing.type || 0);
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
    },
    isTextBased: () => [0, 5, 11, 12].includes(type),
    isThread: () => [10, 11, 12].includes(type),
    isDMBased: () => !guild,
    permissionsFor: (memberOrRole) =>
      wrapLivePermissionBits(() => computeChannelPermissionBits(channel, memberOrRole)),
    messages: {
      fetch: async (opts = {}) => {
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
            .map((rawMsg) => {
              const msg = wrapMessage(rawMsg, restClient, { channelId, channel });
              return msg?.id ? [msg.id, msg] : null;
            })
            .filter(Boolean),
        );
      },
    },
    threads: {
      fetchArchived: async (opts = {}) => {
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
            .map((t) => {
              const wrapped = wrapThreadLike(t, guild, restClient);
              return wrapped?.id ? [wrapped.id, wrapped] : null;
            })
            .filter(Boolean),
        );
        return { threads };
      },
    },
    send: async (payload) => {
      const rest = restClient?._rest;
      if (!rest) throw new Error("REST unavailable");
      let body;
      if (typeof payload === "string") {
        body = { content: payload };
      } else {
        body = {
          content: payload.content,
          embeds: payload.embeds?.map?.((e) => (typeof e.toJSON === "function" ? e.toJSON() : e)),
          components: payload.components?.map?.((row) =>
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
    delete: async (reason) => {
      const rest = restClient?._rest;
      if (!rest) throw new Error("REST unavailable");
      await rest.delete(Routes.channel(channelId), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      if (guild?.channels?.cache) guild.channels.cache.delete(channelId);
      if (restClient?.channels?.cache) restClient.channels.cache.delete(channelId);
      return true;
    },
  };
  return channel;
}

function isRestSnowflakeId(value) {
  return /^\d{17,22}$/.test(String(value || "").trim());
}

/** Normalizza RoleResolvable | RoleResolvable[] (e stringhe "id1,id2") in snowflake validi. */
function expandRestRoleIds(roleOrRoles) {
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

function wrapMember(raw, guild, userObj) {
  const user = userObj || wrapUser(raw.user, guild?.client);
  const roleIds = (raw.roles || []).map(String);
  const rolesCache = asCacheMap(
    roleIds.map((rid) => {
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
    displayAvatarURL: (opts = {}) => user.displayAvatarURL(opts),
    roles: {
      cache: rolesCache,
      highest: [...rolesCache.values()].sort((a, b) => (b.position || 0) - (a.position || 0))[0] || null,
      add: async (roleOrRoles, reason) => {
        // discord.js accetta Role | Role[]; String([id1,id2]) diventava "id1,id2" → 400 Discord.
        const ids = expandRestRoleIds(roleOrRoles);
        const reasonOpt = reason ? String(reason).slice(0, 512) : undefined;
        for (const roleId of ids) {
          await guild.client._rest.put(Routes.guildMemberRole(guild.id, user.id, roleId), {
            reason: reasonOpt,
          });
          rolesCache.set(roleId, guild.roles.cache.get(roleId) || { id: roleId });
        }
      },
      remove: async (roleOrRoles, reason) => {
        const ids = expandRestRoleIds(roleOrRoles);
        const reasonOpt = reason ? String(reason).slice(0, 512) : undefined;
        for (const roleId of ids) {
          await guild.client._rest.delete(Routes.guildMemberRole(guild.id, user.id, roleId), {
            reason: reasonOpt,
          });
          rolesCache.delete(roleId);
        }
      },
      set: async (roleOrRoles, reason) => {
        const guildId = String(guild.id || "");
        const ids = expandRestRoleIds(roleOrRoles).filter((id) => id && id !== guildId);
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

async function enrichGuildRoles(rest, guild) {
  const roles = await rest.get(Routes.guildRoles(guild.id));
  for (const r of roles || []) {
    const rid = String(r.id);
    const prev = guild.roles.cache.get(rid);
    guild.roles.cache.set(rid, wrapRole(r, guild, prev?.members || null));
  }
  const everyone = guild.roles.cache.get(guild.id);
  if (everyone) guild.roles.everyone = everyone;
}

async function enrichGuildEmojis(rest, guild) {
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
      roles: { cache: asCacheMap((e.roles || []).map((rid) => [String(rid), { id: String(rid) }])) },
      imageURL: (options = {}) => {
        const size = Number(options?.size) || 48;
        const ext =
          String(options?.extension || (e.animated ? "gif" : "png")).replace(/^\./, "") ||
          (e.animated ? "gif" : "png");
        return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=${size}`;
      },
    });
  }
}

async function enrichGuildStickers(rest, guild) {
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

async function fetchAllMembers(rest, guildId) {
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

function wrapGuild(raw, client) {
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
    iconURL: (opts = {}) => {
      const hash = String(raw.icon || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 256;
      const ext = opts.extension || (hash.startsWith("a_") ? "gif" : "png");
      return `https://cdn.discordapp.com/icons/${raw.id}/${hash}.${ext}?size=${size}`;
    },
    bannerURL: (opts = {}) => {
      const hash = String(raw.banner || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 1024;
      const ext = opts.extension || (hash.startsWith("a_") ? "gif" : "png");
      return `https://cdn.discordapp.com/banners/${raw.id}/${hash}.${ext}?size=${size}`;
    },
    splashURL: (opts = {}) => {
      const hash = String(raw.splash || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 2048;
      return `https://cdn.discordapp.com/splashes/${raw.id}/${hash}.png?size=${size}`;
    },
    discoverySplashURL: (opts = {}) => {
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
          .map((h) => {
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
            .map((inv) => {
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
    },
    fetchIntegrations: async () => {
      const list = await client._rest.get(guildIntegrationsPath(guild.id)).catch(() => []);
      return Array.isArray(list) ? list : [];
    },
    fetchAuditLogs: async (opts = {}) => {
      const query = new URLSearchParams({ limit: String(Math.min(100, Number(opts.limit) || 100)) });
      if (opts.before) query.set("before", String(opts.before));
      const rawLogs = await client._rest
        .get(`${guildAuditLogPath(guild.id)}?${query.toString()}`)
        .catch(() => null);
      const entries = asCacheMap(
        (rawLogs?.audit_log_entries || []).map((entry) => {
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

  guild.roles.fetch = async (roleId) => {
    if (roleId) {
      const existing = guild.roles.cache.get(String(roleId));
      if (existing) return existing;
    }
    await enrichGuildRoles(client._rest, guild);
    return roleId ? guild.roles.cache.get(String(roleId)) || null : guild.roles.cache;
  };

  guild.channels.fetch = async (channelId) => {
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

  guild.emojis.fetch = async () => {
    await enrichGuildEmojis(client._rest, guild);
    return guild.emojis.cache;
  };

  guild.channels.fetchActiveThreads = async () => {
    const raw = await client._rest.get(guildActiveThreadsPath(guild.id)).catch(() => null);
    const threads = asCacheMap(
      (raw?.threads || [])
        .map((t) => {
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
    fetchMe: async () => {
      const meId = String(client.user?.id || "").trim();
      if (!meId) return null;
      return guild.members.fetch(meId);
    },
    fetch: async (opts = {}) => {
      const force = opts?.force === true;
      if (
        typeof opts === "string" ||
        typeof opts?.user === "string" ||
        (typeof opts === "object" && opts && !opts.query && (opts.user || opts.id))
      ) {
        const uid = String(typeof opts === "string" ? opts : opts.user || opts.id || "").trim();
        if (!uid) return null;
        if (!force) {
          const cached = guild.members.cache.get(uid);
          if (cached) return cached;
        }
        const rawM = await client._rest.get(Routes.guildMember(guild.id, uid)).catch(() => null);
        if (!rawM) return null;
        const member = wrapMember(rawM, guild, wrapUser(rawM.user, client));
        guild.members.cache.set(uid, member);
        return member;
      }
      const rawMembers = await fetchAllMembers(client._rest, guild.id);
      for (const rawM of rawMembers) {
        const member = wrapMember(rawM, guild, wrapUser(rawM.user, client));
        guild.members.cache.set(member.id, member);
        for (const rid of rawM.roles || []) {
          const role = guild.roles.cache.get(String(rid));
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
        (list || []).map((rule) => {
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
    fetch: async (userId) => {
      if (userId) {
        const ban = await client._rest.get(Routes.guildBan(guild.id, String(userId))).catch(() => null);
        return ban;
      }
      const list = await client._rest.get(guildBansPath(guild.id)).catch(() => []);
      return asCacheMap(
        (list || []).map((ban) => {
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
    remove: async (userId, reason) => {
      await client._rest.delete(Routes.guildBan(guild.id, String(userId)), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      return true;
    },
  };

  return guild;
}

async function createSiteApiRestClient(config, token, options = {}) {
  const rest = new REST({ version: "10" }).setToken(token);
  const me = await rest.get(Routes.user("@me"));
  const guildCache = asCacheMap();

  const client = {
    config,
    _rest: rest,
    _isSiteApiRestClient: true,
    user: wrapUser(me),
    fetchInvite: async (code) => {
      const inviteCode = String(code || "").trim();
      if (!inviteCode) return null;
      const raw = await rest.get(Routes.invite(inviteCode));
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
      fetch: async (id, opts = {}) => {
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
      createDM: async (userId) => {
        const channel = await rest.post(Routes.userChannels(), {
          body: { recipient_id: String(userId) },
        });
        return wrapChannel(channel, null, client);
      },
    },
    channels: {
      cache: asCacheMap(),
      fetch: async (id) => {
        const raw = await rest.get(Routes.channel(String(id)));
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
      fetch: async (id) => {
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

  // Ensure users.cache entries get send() bound to client
  client.user = wrapUser(me, client);
  client.users.cache.set(String(me.id), client.user);
  const { initializeCommandCollections } = require("../../../shared/runtime/clientRuntime");
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
    await client.guilds.fetch(mainGuildId).catch(() => null);
  }

  // Seed IDs di tutte le guild del bot (stub leggeri). Senza questo site-api
  // pensa che il bot sia solo sulla main e la dashboard mostra "Invita".
  try {
    let after = "";
    for (let page = 0; page < 25; page += 1) {
      const query = new URLSearchParams({ limit: "200" });
      if (after) query.set("after", after);
      const batch = await rest.get(`${userGuildsPath()}?${query.toString()}`);
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
      const stub = guildCache.get(gid);
      if (stub && stub.partial !== true) continue;
      await client.guilds.fetch(gid).catch(() => null);
    }
  }

  return client;
}

module.exports = { createSiteApiRestClient };
