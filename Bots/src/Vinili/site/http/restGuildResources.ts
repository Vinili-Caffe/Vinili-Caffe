/** Client REST del sito: webhook, invite, audit, eventi, automod e ban. */
const { Routes } = require("discord.js") as typeof import("discord.js");
const {
  guildAuditLogPath,
  guildWebhooksPath,
  guildBansPath,
  guildIntegrationsPath,
  guildAutoModerationRulesPath,
  guildAutoModerationRulePath,
} = require("./restPaths") as typeof import("./restPaths");
const { asCacheMap, snowflakeCreatedAt } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapUser } = require("./restUserRole") as typeof import("./restUserRole");

function toAutomodTriggerMetadataApi(meta?) {
  if (!meta || typeof meta !== "object") return undefined;
  const out: Record<string, any> = {};
  if (Array.isArray(meta.keywordFilter) || Array.isArray(meta.keyword_filter)) {
    out.keyword_filter = [...(meta.keywordFilter || meta.keyword_filter)].map(String);
  }
  if (Array.isArray(meta.regexPatterns) || Array.isArray(meta.regex_patterns)) {
    out.regex_patterns = [...(meta.regexPatterns || meta.regex_patterns)].map(String);
  }
  if (Array.isArray(meta.allowList) || Array.isArray(meta.allow_list)) {
    out.allow_list = [...(meta.allowList || meta.allow_list)].map(String);
  }
  if (Array.isArray(meta.presets)) out.presets = [...meta.presets].map(Number);
  const mentionLimit = meta.mentionTotalLimit ?? meta.mention_total_limit;
  if (mentionLimit != null) out.mention_total_limit = Number(mentionLimit);
  const raid =
    meta.mentionRaidProtectionEnabled ?? meta.mention_raid_protection_enabled;
  if (raid != null) out.mention_raid_protection_enabled = Boolean(raid);
  return Object.keys(out).length ? out : undefined;
}

function toAutomodActionsApi(actions?) {
  if (!Array.isArray(actions)) return undefined;
  return actions.map((a?) => {
    const type = Number(a?.type);
    const md = a?.metadata || {};
    const metadata: Record<string, any> = {};
    const channelId = md.channelId ?? md.channel_id ?? md.channel;
    if (channelId != null) metadata.channel_id = String(channelId);
    const customMessage = md.customMessage ?? md.custom_message;
    if (customMessage != null) metadata.custom_message = String(customMessage);
    const duration = md.durationSeconds ?? md.duration_seconds;
    if (duration != null) metadata.duration_seconds = Number(duration);
    return Object.keys(metadata).length ? { type, metadata } : { type };
  });
}

function toAutomodRuleBodyApi(input: Record<string, any> = {}) {
  const body: Record<string, any> = {};
  if (input.name != null) body.name = String(input.name);
  if (input.eventType != null || input.event_type != null) {
    body.event_type = Number(input.eventType ?? input.event_type);
  }
  if (input.triggerType != null || input.trigger_type != null) {
    body.trigger_type = Number(input.triggerType ?? input.trigger_type);
  }
  const triggerMetadata = toAutomodTriggerMetadataApi(
    input.triggerMetadata ?? input.trigger_metadata,
  );
  if (triggerMetadata) body.trigger_metadata = triggerMetadata;
  const actions = toAutomodActionsApi(input.actions);
  if (actions) body.actions = actions;
  if (input.enabled != null) body.enabled = Boolean(input.enabled);
  if (input.exemptRoles != null || input.exempt_roles != null) {
    body.exempt_roles = [...(input.exemptRoles || input.exempt_roles || [])].map(String);
  }
  if (input.exemptChannels != null || input.exempt_channels != null) {
    body.exempt_channels = [...(input.exemptChannels || input.exempt_channels || [])].map(String);
  }
  return body;
}

function wrapAutomodRule(raw?, guild?, client?) {
  const id = String(raw?.id || "");
  const rule: Record<string, any> = {
    id,
    name: raw?.name,
    creatorId: raw?.creator_id ? String(raw.creator_id) : raw?.creatorId || null,
    eventType: raw?.event_type ?? raw?.eventType,
    triggerType: raw?.trigger_type ?? raw?.triggerType,
    triggerMetadata: raw?.trigger_metadata ?? raw?.triggerMetadata ?? null,
    enabled: Boolean(raw?.enabled),
    exemptChannels: Array.isArray(raw?.exempt_channels)
      ? raw.exempt_channels.map(String)
      : Array.isArray(raw?.exemptChannels)
        ? raw.exemptChannels.map(String)
        : [],
    exemptRoles: Array.isArray(raw?.exempt_roles)
      ? raw.exempt_roles.map(String)
      : Array.isArray(raw?.exemptRoles)
        ? raw.exemptRoles.map(String)
        : [],
    actions: Array.isArray(raw?.actions) ? raw.actions : [],
    guild,
    edit: async (data: Record<string, any> = {}) => {
      const reason = data.reason ? String(data.reason).slice(0, 512) : undefined;
      const updated = await client._rest.patch(guildAutoModerationRulePath(guild.id, id), {
        body: toAutomodRuleBodyApi(data),
        reason,
      });
      return wrapAutomodRule(updated, guild, client);
    },
    delete: async (reason?) => {
      await client._rest.delete(guildAutoModerationRulePath(guild.id, id), {
        reason: reason ? String(reason).slice(0, 512) : undefined,
      });
      return rule;
    },
  };
  return rule;
}

function attachGuildLookupApis(guild?, client?) {
  guild.fetchWebhooks = async () => {
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
  };
  guild.invites = {
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
  };
  guild.fetchIntegrations = async () => {
    const list = await client._rest.get(guildIntegrationsPath(guild.id)).catch(() => []);
    return Array.isArray(list) ? list : [];
  };
  guild.fetchAuditLogs = async (opts: Record<string, any> = {}) => {
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
  };
}

function attachGuildCollectionApis(guild?, client?) {
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
          const wrapped = wrapAutomodRule(rule, guild, client);
          return [wrapped.id, wrapped];
        }),
      );
    },
    create: async (data: Record<string, any> = {}) => {
      const reason = data.reason ? String(data.reason).slice(0, 512) : undefined;
      const created = await client._rest.post(guildAutoModerationRulesPath(guild.id), {
        body: toAutomodRuleBodyApi(data),
        reason,
      });
      return wrapAutomodRule(created, guild, client);
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
}

export = { attachGuildLookupApis, attachGuildCollectionApis };
