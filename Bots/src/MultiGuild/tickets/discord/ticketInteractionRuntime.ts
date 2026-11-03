const Ticket = require("../data/guildFeatureBucketTicketModel");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const CHANNEL_WARM_TTL_MS = 5 * 60_000;
const guildChannelWarmCache = new Map();
function getCachedEntity(cache?, key?) {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached?.value && now < Number(cached.expiresAt || 0)) {
    return cached.value;
  }
  if (cached?.promise) {
    return cached.promise;
  }
  return null;
}

function setCachedEntity(cache?, key?, value?, ttlMs?, promise = null) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + (ttlMs || 15_000),
    promise,
  });
}

async function warmGuildChannels(guild?) {
  const key = String(guild?.id || "");
  if (!guild || !key) return null;
  const cached = getCachedEntity(guildChannelWarmCache, key);
  if (cached) return cached;
  const promise = guild.channels.fetch().catch(() => null);
  guildChannelWarmCache.set(key, { value: null, expiresAt: 0, promise });
  const resolved = await promise;
  setCachedEntity(guildChannelWarmCache, key, resolved, CHANNEL_WARM_TTL_MS);
  return resolved;
}

async function countOpenTicketsByUser(guildId?, userId?, guild = null) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!uid) return { count: 0, tickets: [] };

  const seen = new Set();
  const list = [];
  const pushDoc = (doc?) => {
    const id = String(doc?._id || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push(doc);
  };

  const byGuild = await Ticket.find({ guildId: gid, userId: uid, open: true })
    .limit(30)
    .catch(() => []);
  for (const doc of Array.isArray(byGuild) ? byGuild : []) pushDoc(doc);

    const openByUser = await Ticket.find({ userId: uid, open: true }).limit(30).catch(() => []);
  for (const doc of Array.isArray(openByUser) ? openByUser : []) {
    const docGid = String(doc?.guildId || "").trim();
    if (docGid && docGid === gid) {
      pushDoc(doc);
      continue;
    }
    if (!guild || docGid) continue;
    const cid = String(doc?.channelId || "").trim();
    if (!cid) continue;
    const inGuild =
      guild.channels?.cache?.get?.(cid) ||
      (await guild.channels.fetch(cid).catch(() => null));
    if (inGuild?.id) {
      pushDoc(doc);
      await Ticket.updateOne(
        { _id: doc._id, open: true },
        { $set: { guildId: gid } },
      ).catch(() => null);
    }
  }

  if (!list.length) return { count: 0, tickets: [] };
  if (!guild) return { count: list.length, tickets: list };

  await warmGuildChannels(guild).catch(() => null);
  const valid = [];
  for (const doc of list) {
    const cid = String(doc?.channelId || "").trim();
    if (!cid) continue;
    const cached = guild.channels?.cache?.get?.(cid) || null;
    if (cached) {
      valid.push(doc);
      continue;
    }
    const fetched = await guild.channels.fetch(cid).catch((err?) => err);
    if (fetched && typeof fetched.id === "string") {
      valid.push(doc);
      continue;
    }
    const code = Number(fetched?.code ?? fetched?.rawError?.code);
    if (code === 10003) {
      await Ticket.updateOne(
        { _id: doc._id, open: true },
        {
          $set: {
            open: false,
            closedAt: new Date(),
            closeReason: "Auto-closed stale open ticket (missing channel)",
          },
        },
      ).catch(() => null);
    }
  }
  return { count: valid.length, tickets: valid };
}

async function findOpenTicketByUser(guildId?, userId?, guild = null) {
  const counted = await countOpenTicketsByUser(guildId, userId, guild);
  return counted.tickets[0] || null;
}

export = {
  countOpenTicketsByUser,
  findOpenTicketByUser,
  getClientGuildCached,
  getGuildChannelCached,
  getGuildMemberCached,
  warmGuildChannels,
};