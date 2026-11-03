/** Client REST del sito: messaggi e file allegati. */
const { Routes, PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { channelThreadsArchivedPublicPath, channelThreadsArchivedPrivatePath, channelPermissionPath } = require("./restPaths") as typeof import("./restPaths");
const { asCacheMap, wrapPermissionBits, wrapLivePermissionBits, computeChannelPermissionBits } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapMessage } = require("./restUserRole") as typeof import("./restUserRole");

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

export = { wrapThreadLike, wrapChannel };
