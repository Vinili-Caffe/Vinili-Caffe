/** Mute: aggiornamento dei ruoli del membro (anche via REST). */
function syncLocalMemberRolesCache(member?, guild?, roleIds?) {
  try {
    const cache = member?.roles?.cache;
    if (!cache || typeof cache.set !== "function") return;
    const keep = new Set((roleIds || []).map(String));
    for (const key of [...(cache.keys?.() || [])]) {
      if (!keep.has(String(key))) cache.delete(key);
    }
    for (const rid of keep) {
      if (!cache.has(rid)) cache.set(rid, guild?.roles?.cache?.get(rid) || { id: rid });
    }
  } catch (_) {}
}

function hasUsableRolesSet(member?) {
  const roles = member?.roles;
  const setFn = roles?.set;
  if (typeof setFn !== "function") return false;
    if (typeof roles?.has === "function" && typeof roles?.get === "function" && !roles.cache) return false;
    if (roles?.cache && setFn === roles.cache.set) return false;
  return true;
}

async function setMemberRolesViaRest(guild?, userId?, roleIds?, reasonOpt?) {
  const rest = guild?.client?._rest;
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!rest || typeof rest.patch !== "function" || !guildId || !uid) return false;
  const { Routes } = require("discord.js") as typeof import("discord.js");
  await rest.patch(Routes.guildMember(guildId, uid), {
    body: { roles: roleIds },
    reason: reasonOpt,
  });
  return true;
}

async function setMemberRolesSafe(member?, roleIds?, reason?) {
  const guild = member?.guild;
  const userId = String(member?.id || "").trim();
  const guildId = String(guild?.id || "").trim();
  const ids = [
    ...new Set(
      (Array.isArray(roleIds) ? roleIds : [roleIds])
        .map((x?) => String(x || "").trim())
        .filter((id?) => id && id !== guildId),
    ),
  ];
  const reasonOpt = reason ? String(reason).slice(0, 512) : undefined;

    if (await setMemberRolesViaRest(guild, userId, ids, reasonOpt)) {
    syncLocalMemberRolesCache(member, guild, ids);
    return true;
  }

  if (hasUsableRolesSet(member)) {
    try {
      await member.roles.set(ids, reasonOpt);
      return true;
    } catch (err) {
      const msg = String(err?.message || err || "");
            if (!/is not a function/i.test(msg)) throw err;
    }
  }

  const current = [...(member?.roles?.cache?.keys?.() || [])].map(String);
  const want = new Set(ids);
  const toRemove = current.filter((id?) => id !== guildId && !want.has(id));
  const toAdd = ids.filter((id?) => !member?.roles?.cache?.has?.(id));
  if (typeof member?.roles?.remove === "function" && toRemove.length) {
    await member.roles.remove(toRemove, reasonOpt);
  }
  if (typeof member?.roles?.add === "function" && toAdd.length) {
        for (const roleId of toAdd) {
      await member.roles.add(roleId, reasonOpt);
    }
  }
  if (typeof member?.roles?.add === "function" || typeof member?.roles?.remove === "function") {
    syncLocalMemberRolesCache(member, guild, ids);
    return true;
  }

  throw new Error(
    `cannot set member roles (guild=${guildId || "?"} user=${userId || "?"} rest=${Boolean(guild?.client?._rest)} set=${typeof member?.roles?.set})`,
  );
}

async function resolveGuildBotMember(guild?, options: Record<string, any> = {}) {
  if (!guild) return null;
  if (options.me) return options.me;
  const cached = guild.members?.me || null;
  if (cached) return cached;
  if (typeof guild.members?.fetchMe === "function") {
    return guild.members.fetchMe().catch(() => null);
  }
  const meId = String(guild.client?.user?.id || "").trim();
  if (meId && typeof guild.members?.fetch === "function") {
    return guild.members.fetch(meId).catch(() => null);
  }
  return null;
}

export = { setMemberRolesSafe, resolveGuildBotMember };
