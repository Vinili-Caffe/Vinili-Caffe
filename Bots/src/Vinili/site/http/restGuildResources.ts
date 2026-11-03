/** Client REST del sito: webhook, invite, audit, eventi, automod e ban. */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { guildAuditLogPath, guildWebhooksPath, guildBansPath, guildIntegrationsPath, guildAutoModerationRulesPath } = require("./restPaths") as typeof import("./restPaths");
const { asCacheMap, snowflakeCreatedAt } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapUser } = require("./restUserRole") as typeof import("./restUserRole");

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
}

export = { attachGuildLookupApis, attachGuildCollectionApis };
