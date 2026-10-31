/** Client REST del sito: server (ruoli, emoji, sticker, membri). */
const { Routes, PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { guildActiveThreadsPath, guildAutoModerationRulesPath, guildAuditLogPath, guildWebhooksPath, guildBansPath, guildIntegrationsPath } = require("./restPaths") as typeof import("./restPaths");
const { asCacheMap, snowflakeCreatedAt } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapUser, colorValueToInt, buildRoleColorsApiBody, bufferToRoleIconDataUri, wrapRole } = require("./restUserRole") as typeof import("./restUserRole");
const { wrapThreadLike, wrapChannel } = require("./restMessage") as typeof import("./restMessage");
const { wrapMember } = require("./restMember") as typeof import("./restMember");

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

export = { enrichGuildRoles, enrichGuildEmojis, enrichGuildStickers, wrapGuild };
