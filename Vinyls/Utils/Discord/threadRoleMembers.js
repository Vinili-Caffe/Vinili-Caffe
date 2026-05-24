const { fetchGuildMembersRespectingGatewayRateLimit } = require("./gatewayMemberFetch");

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

/**
 * Popola `guild.members.cache` (gateway / chunk) così `role.members` è completo.
 * Richiede **Server Members Intent** nel Developer Portal per vedere anche chi è offline.
 */
async function hydrateGuildMembersForRolePings(guild, logTag = "[threadRoleMembers]") {
  if (!guild?.members?.fetch) return;
  try {
    await fetchGuildMembersRespectingGatewayRateLimit(guild, {
      maxAttempts: 12,
      onRateLimit: (waitMs, attempt, maxAttempts) => {
        global.logger?.info?.(
          `${logTag} hydrate rate limit, retry ${attempt}/${maxAttempts} in ~${Math.round(waitMs / 1000)}s`,
        );
      },
    });
  } catch (err) {
    global.logger?.warn?.(`${logTag} guild members fetch failed:`, err?.message || err);
  }
}

/**
 * Aggiunge al thread tutti i membri umani con il ruolo indicato.
 * @param {import("discord.js").AnyThreadChannel} thread
 * @param {import("discord.js").Guild} guild
 * @param {string} roleId
 * @param {{ logTag?: string, throttleEvery?: number, throttleMs?: number }} [opts]
 */
async function addAllRoleMembersToThread(thread, guild, roleId, opts = {}) {
  const rid = String(roleId || "").trim();
  if (!thread?.members?.add || !guild || !rid) return { added: 0, failed: 0 };
  const logTag = opts.logTag || "[addAllRoleMembersToThread]";
  await hydrateGuildMembersForRolePings(guild, logTag);
  const role = guild.roles.cache.get(rid) || (await guild.roles.fetch(rid).catch(() => null));
  if (!role) return { added: 0, failed: 0 };
  const every = Math.max(0, Math.floor(Number(opts.throttleEvery ?? 8)));
  const throttleMs = Math.max(0, Math.floor(Number(opts.throttleMs ?? 45)));
  let added = 0;
  let failed = 0;
  let i = 0;
  for (const m of role.members.values()) {
    if (m.user?.bot) continue;
    const ok = await thread.members.add(m.id).then(() => true).catch(() => false);
    if (ok) added += 1;
    else failed += 1;
    i += 1;
    if (every > 0 && throttleMs > 0 && i % every === 0) await sleep(throttleMs);
  }
  return { added, failed };
}

module.exports = { hydrateGuildMembersForRolePings, addAllRoleMembersToThread };