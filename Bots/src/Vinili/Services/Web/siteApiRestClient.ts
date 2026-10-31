const { REST, Routes } = require("discord.js") as typeof import("discord.js");
const { userGuildsPath } = require("./restPaths") as typeof import("./restPaths");
const { asCacheMap } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapUser } = require("./restUserRole") as typeof import("./restUserRole");
const { wrapChannel } = require("./restMessage") as typeof import("./restMessage");
const { wrapMember } = require("./restMember") as typeof import("./restMember");
const { enrichGuildRoles, enrichGuildEmojis, enrichGuildStickers, wrapGuild } = require("./restGuild") as typeof import("./restGuild");


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
