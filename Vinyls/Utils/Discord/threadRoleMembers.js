const { fetchGuildMembersRespectingGatewayRateLimit } = require("./gatewayMemberFetch");

const guildHydratePromises = new Map();
const guildHydrateDoneAt = new Map();
const HYDRATE_TTL_MS = 10 * 60 * 1000;
const MIN_CACHED_MEMBERS_FOR_SKIP = 25;

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

function guildCacheLooksHydrated(guild) {
  const guildId = String(guild?.id || "");
  if (!guildId) return false;
  const last = guildHydrateDoneAt.get(guildId) || 0;
  if (Date.now() - last >= HYDRATE_TTL_MS) return false;
  return Number(guild?.members?.cache?.size || 0) >= MIN_CACHED_MEMBERS_FOR_SKIP;
}

/**
 * Popola `guild.members.cache` (gateway / chunk) così `role.members` è completo.
 * Una sola hydrate per guild alla volta; skip se la cache è recente.
 */
async function hydrateGuildMembersForRolePings(guild, logTag = "[threadRoleMembers]") {
  if (!guild?.members?.fetch) return;
  const guildId = String(guild.id || "");
  if (!guildId) return;
  if (guildCacheLooksHydrated(guild)) return;

  const inFlight = guildHydratePromises.get(guildId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      await fetchGuildMembersRespectingGatewayRateLimit(guild, {
        maxAttempts: 5,
        onRateLimit: (waitMs, attempt, maxAttempts) => {
          if (attempt <= 1) return;
          global.logger?.info?.(
            `${logTag} hydrate rate limit, retry ${attempt}/${maxAttempts} in ~${Math.round(waitMs / 1000)}s`,
          );
        },
      });
      guildHydrateDoneAt.set(guildId, Date.now());
    } catch (err) {
      global.logger?.warn?.(`${logTag} guild members fetch failed:`, err?.message || err);
    } finally {
      guildHydratePromises.delete(guildId);
    }
  })();

  guildHydratePromises.set(guildId, promise);
  return promise;
}

/**
 * Aggiunge al thread i membri umani con il ruolo indicato che non ci sono già.
 * @param {import("discord.js").AnyThreadChannel} thread
 * @param {import("discord.js").Guild} guild
 * @param {string} roleId
 * @param {{ logTag?: string, throttleEvery?: number, throttleMs?: number, hydrate?: boolean }} [opts]
 */
async function addAllRoleMembersToThread(thread, guild, roleId, opts = {}) {
  const rid = String(roleId || "").trim();
  if (!thread?.members?.add || !guild || !rid) return { added: 0, failed: 0, skipped: 0 };
  const logTag = opts.logTag || "[addAllRoleMembersToThread]";
  if (opts.hydrate !== false) {
    await hydrateGuildMembersForRolePings(guild, logTag);
  }
  const role = guild.roles.cache.get(rid) || (await guild.roles.fetch(rid).catch(() => null));
  if (!role) return { added: 0, failed: 0, skipped: 0 };
  const threadMemberIds = new Set(
    thread.members?.cache ? [...thread.members.cache.keys()].map(String) : [],
  );
  const every = Math.max(0, Math.floor(Number(opts.throttleEvery ?? 8)));
  const throttleMs = Math.max(0, Math.floor(Number(opts.throttleMs ?? 45)));
  let added = 0;
  let failed = 0;
  let skipped = 0;
  let i = 0;
  for (const m of role.members.values()) {
    if (m.user?.bot) continue;
    if (threadMemberIds.has(String(m.id))) {
      skipped += 1;
      continue;
    }
    const ok = await thread.members.add(m.id).then(() => true).catch(() => false);
    if (ok) {
      added += 1;
      threadMemberIds.add(String(m.id));
    } else failed += 1;
    i += 1;
    if (every > 0 && throttleMs > 0 && i % every === 0) await sleep(throttleMs);
  }
  return { added, failed, skipped };
}

async function resolveGuildMemberIds(guild, logTag = "[threadRoleMembers]") {
  if (!guild?.members?.cache) return null;
  const guildId = String(guild.id || "");
  await hydrateGuildMembersForRolePings(guild, logTag);
  const ids = [...guild.members.cache.values()]
    .map((m) => String(m?.id || ""))
    .filter((id) => /^\d{16,20}$/.test(id));
  if (!ids.length) return null;
  const hydratedRecently = Date.now() - (guildHydrateDoneAt.get(guildId) || 0) < HYDRATE_TTL_MS;
  if (!hydratedRecently && ids.length < MIN_CACHED_MEMBERS_FOR_SKIP) return null;
  return ids;
}

module.exports = { hydrateGuildMembersForRolePings, addAllRoleMembersToThread, resolveGuildMemberIds };