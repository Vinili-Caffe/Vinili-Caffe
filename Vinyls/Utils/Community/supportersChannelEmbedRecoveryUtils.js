const { AuditLogEvent } = require("discord.js");

const DEFAULT_RECOVERY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const EMBED_DEDUPE_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_SUPPORTERS_CHANNEL_SCAN = 400;

function recoverySleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecoveryPrimaryShard(client) {
  return !client?.shard || client.shard.ids?.[0] === 0;
}

function auditLogChangesArray(entry) {
  const ch = entry?.changes;
  if (!ch) return [];
  if (Array.isArray(ch)) return ch;
  if (typeof ch.values === "function") return Array.from(ch.values());
  return [];
}

function changeNewRoleIds(c) {
  if (String(c?.key || "") !== "$add") return [];
  const raw = c?.new ?? c?.new_value ?? c?.newValue;
  const list = Array.isArray(raw) ? raw : raw != null && typeof raw === "object" ? [raw] : [];
  return list.map((r) => String(r?.id ?? r ?? "").trim()).filter(Boolean);
}

function auditEntryAddsAnyRole(entry, roleIdSet) {
  const set = roleIdSet instanceof Set ? roleIdSet : new Set(Array.isArray(roleIdSet) ? roleIdSet : []);
  if (!set.size) return false;
  for (const c of auditLogChangesArray(entry)) {
    for (const rid of changeNewRoleIds(c)) {
      if (set.has(rid)) return true;
    }
  }
  return false;
}

async function collectRecentRoleAddsFromAudit(guild, roleIds, lookbackMs = DEFAULT_RECOVERY_LOOKBACK_MS) {
  const gid = String(guild?.id || "");
  if (!gid || !guild?.fetchAuditLogs) return [];
  const idSet = new Set((Array.isArray(roleIds) ? roleIds : []).map((x) => String(x || "").trim()).filter(Boolean));
  if (!idSet.size) return [];
  const minTs = Date.now() - Math.max(60_000, Number(lookbackMs || 0));
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 100 }).catch(() => null);
  const entries = logs?.entries ? Array.from(logs.entries.values()) : [];
  const rows = [];
  for (const entry of entries) {
    const createdMs = Number(entry?.createdTimestamp || 0);
    if (!createdMs || createdMs < minTs) continue;
    const targetId = String(entry?.target?.id || entry?.targetId || "");
    if (!targetId || !auditEntryAddsAnyRole(entry, idSet)) continue;
    for (const c of auditLogChangesArray(entry)) {
      for (const rid of changeNewRoleIds(c)) {
        if (!idSet.has(rid)) continue;
        rows.push({ userId: targetId, roleId: rid, createdMs, executorId: String(entry?.executor?.id || "") });
      }
    }
  }
  rows.sort((a, b) => Number(b.createdMs || 0) - Number(a.createdMs || 0));
  return rows;
}

function messageTextBlob(message) {
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  const parts = [String(message?.content || "")];
  for (const e of embeds) {
    parts.push(String(e?.title || ""), String(e?.description || ""), String(e?.author?.name || ""), String(e?.footer?.text || ""));
  }
  return parts.join("\n");
}

async function countBotSupportersEmbedsForUser(channel, userId, botId, sinceMs, predicate) {
  if (!channel?.messages?.fetch || !userId) return 0;
  const needle = `<@${String(userId)}>`;
  const minTs = Math.max(0, Number(sinceMs || 0) - 5000);
  let count = 0;
  let before;
  let scanned = 0;
  while (scanned < MAX_SUPPORTERS_CHANNEL_SCAN) {
    const batchSize = Math.min(100, MAX_SUPPORTERS_CHANNEL_SCAN - scanned);
    const fetchOpts = { limit: batchSize };
    if (before) fetchOpts.before = before;
    const batch = await channel.messages.fetch(fetchOpts).catch(() => null);
    if (!batch?.size) break;
    let oldestTs = Infinity;
    for (const m of batch.values()) {
      scanned += 1;
      const ts = Number(m.createdTimestamp || 0);
      if (ts) oldestTs = Math.min(oldestTs, ts);
      if (ts && ts < minTs) continue;
      if (botId && String(m.author?.id || "") !== botId) continue;
      const blob = messageTextBlob(m);
      if (!blob.includes(needle)) continue;
      if (typeof predicate === "function" && !predicate(blob, m)) continue;
      count += 1;
    }
    if (Number.isFinite(oldestTs) && oldestTs < minTs) break;
    const oldest = batch.last();
    if (!oldest?.id || batch.size < batchSize) break;
    before = oldest.id;
  }
  return count;
}

async function botSupportersEmbedExistsForUser(channel, userId, botId, sinceMs, predicate) {
  const n = await countBotSupportersEmbedsForUser(channel, userId, botId, sinceMs, predicate);
  return n > 0;
}

module.exports = {
  DEFAULT_RECOVERY_LOOKBACK_MS,
  EMBED_DEDUPE_LOOKBACK_MS,
  recoverySleep,
  isRecoveryPrimaryShard,
  collectRecentRoleAddsFromAudit,
  countBotSupportersEmbedsForUser,
  botSupportersEmbedExistsForUser,
  messageTextBlob,
};