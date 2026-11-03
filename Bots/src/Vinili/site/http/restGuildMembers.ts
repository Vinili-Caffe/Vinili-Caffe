/** Client REST del sito: membri guild (fetch, add, unban). */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { asCacheMap } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapUser } = require("./restUserRole") as typeof import("./restUserRole");
const { wrapMember } = require("./restMember") as typeof import("./restMember");

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

function attachGuildMembersApi(guild?, client?) {
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
}

export = { attachGuildMembersApi };
