/** Boost: recupero degli annunci mancati (per utente e all'avvio). */
const { PermissionsBitField, AuditLogEvent } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ensureBoostSlotsSynced } = require("../../Utils/Community/boostSlotAnnounceTracker") as typeof import("../../Utils/Community/boostSlotAnnounceTracker");
const { resolveNativeBoostMessageUserId, boostAnnounceLooksLikeBoost, textMentionsUserId, getBoostSystemMessageTypes, parseNativeBoostSlotCount, resolveBoostNativeScanChannelsAsync } = require("./boostAnnounceState") as typeof import("./boostAnnounceState");
const { sleep } = require("./memberUpdateLogs") as typeof import("./memberUpdateLogs");
const { addPerkRoleIfPossible } = require("./memberPerks") as typeof import("./memberPerks");
const { boostCountCache, recoverMissingBoostEmbedsForUser } = require("./boostAnnounce") as typeof import("./boostAnnounce");

/* perfP2: full members.fetch solo se cache incompleta */
async function fetchGuildMembersIfCacheThin(guild?) {
  if (!guild?.members) return null;
  const memberCount = Math.max(0, Number(guild.memberCount) || 0);
  const cacheRatio = memberCount > 0 ? guild.members.cache.size / memberCount : 1;
  if (cacheRatio >= 0.85) return guild.members.cache;
  return guild.members.fetch().catch(() => null);
}

function isPrimaryShard(client?) {
  return !client?.shard || client.shard.ids?.[0] === 0;
}

async function recoverLastGlobalNativeBoostEmbedsOnStartup(client?, opts: Record<string, any> = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const boostAnnounceChannel =
    guild.channels.cache.get(boostChannelId) ||
    (await getGuildChannelCached(guild, boostChannelId).catch(() => null));
  if (!boostAnnounceChannel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const messageTarget = Math.max(1, Math.min(10, Number(opts.messageLimit ?? opts.limit ?? 2)));
  const lookbackMs = Math.max(
    60 * 60 * 1000,
    Math.min(14 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs ?? 7 * 24 * 60 * 60 * 1000)),
  );
  const fetchLimit = Math.max(30, Math.min(100, Number(opts.fetchPerChannel ?? 100)));
  const channels = await resolveBoostNativeScanChannelsAsync(guild, boostAnnounceChannel);
  const minTs = Date.now() - lookbackMs;
  const collected = [];
  for (const ch of channels) {
    const recent = await ch.messages.fetch({ limit: fetchLimit }).catch(() => null);
    if (!recent) continue;
    for (const m of recent.values()) {
      const ts = Number(m.createdTimestamp || 0);
      if (!ts || ts < minTs) continue;
      if (parseNativeBoostSlotCount(m) <= 0) continue;
      if (!resolveNativeBoostMessageUserId(m, guild)) continue;
      collected.push(m);
    }
  }
  const byId = new Map();
  for (const m of collected) {
    byId.set(String(m.id), m);
  }
  const unique = [...byId.values()].sort((a?, b?) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0));
  const top = unique.slice(0, messageTarget);
  let embedsSent = 0;
  for (const m of top) {
    const uid = resolveNativeBoostMessageUserId(m, guild);
    if (!uid) continue;
    const r = await recoverMissingBoostEmbedsForUser(guild, uid, { nativeLookbackMs: lookbackMs }).catch(() => ({
      ok: false,
      sent: 0,
    }));
    embedsSent += Math.max(0, Number(r?.sent || 0));
    await sleep(700);
  }
  return { ok: true, boostsExamined: top.length, embedsSent };
}

async function recoverRecentBoostEmbedsOnStartup(client?, opts: Record<string, any> = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const boostAnnounceChannel = guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(guild, boostChannelId));
  if (!boostAnnounceChannel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const limit = Math.max(1, Math.min(5, Number(opts.limit || 2)));
  const lookbackMs = Math.max(5 * 60 * 1000, Math.min(24 * 60 * 60 * 1000, Number(opts.lookbackMs || 2 * 60 * 60 * 1000)));
  const now = Date.now();
  const fallbackMemberScan = opts?.fallbackMemberScan !== false;
  const fallbackChannelScan = opts?.fallbackChannelScan !== false;
  const debugEnabled =
    opts?.debug === true || String(process.env.BOOST_RECOVERY_DEBUG || "").trim() === "1";

  const me = guild.members?.me || null;
  const perms = me && boostAnnounceChannel?.permissionsFor ? boostAnnounceChannel.permissionsFor(me) : null;
  const canViewChannel = Boolean(perms?.has?.(PermissionsBitField.Flags.ViewChannel));
  const canReadHistory = Boolean(perms?.has?.(PermissionsBitField.Flags.ReadMessageHistory));
  const canSend = Boolean(perms?.has?.(PermissionsBitField.Flags.SendMessages));

  let candidates = [];
  const canReadAudit = Boolean(
    guild.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog),
  );
  let auditCandidates = 0;
  let memberCandidates = 0;
  let channelCandidates = 0;
  let channelFetchOk = null;
  let memberFetchOk = null;
  let candidateCounts = null;
  if (canReadAudit) {
    const audits = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 50 }).catch(() => null);
    const entries = audits?.entries ? Array.from(audits.entries.values()) : [];
    for (const entry of entries) {
      const createdMs = Number((entry as any)?.createdTimestamp || 0);
      if (!createdMs || now - createdMs > lookbackMs) continue;
      const changes = Array.isArray((entry as any)?.changes) ? (entry as any).changes : [];
      const hasPremiumSinceChange = changes.some((c?) => String(c?.key || "").toLowerCase() === "premium_since");
      if (!hasPremiumSinceChange) continue;
      const targetId = String((entry as any)?.target?.id || "");
      if (!targetId) continue;
      candidates.push({ targetId, createdMs });
    }
    auditCandidates = candidates.length;
  }

  if (!candidates.length && fallbackMemberScan) {
    const members = await fetchGuildMembersIfCacheThin(guild);
    memberFetchOk = Boolean(members);
    const rows = members ? Array.from(members.values()) : [];
    const minTs = now - lookbackMs;
    const fromMembers = [];
    for (const member of rows) {
      const ts = Number((member as any)?.premiumSinceTimestamp || 0);
      if (!ts || ts < minTs) continue;
      fromMembers.push({ targetId: String((member as any).id), createdMs: ts });
    }
    candidates = fromMembers;
    memberCandidates = candidates.length;
  }

  if (!candidates.length && fallbackChannelScan) {
    const recentBoostMessages = await boostAnnounceChannel.messages.fetch({ limit: 80 }).catch(() => null);
    channelFetchOk = Boolean(recentBoostMessages);
    const recent = recentBoostMessages ? Array.from(recentBoostMessages.values()) : [];
    const minTs = now - lookbackMs;
    const typeCounts: Record<string, any> = {};
    const samples = [];
    const fromChannel = [];
    for (const m of recent) {
      if (!(m as any)?.author?.id) continue;
      const createdMs = Number((m as any).createdTimestamp || 0);
      if (!createdMs || createdMs < minTs) continue;
      const t = Number((m as any).type);
      typeCounts[String(Number.isFinite(t) ? t : "NaN")] = Number(typeCounts[String(t)] || 0) + 1;
      if (samples.length < 6) {
        samples.push({
          id: String((m as any).id || ""),
          type: Number.isFinite(t) ? t : null,
          system: Boolean((m as any).system),
          authorId: String((m as any).author?.id || ""),
          contentLen: Number(String((m as any).content || "").length),
          hasEmbeds: Array.isArray((m as any).embeds) && (m as any).embeds.length > 0,
          createdTimestamp: createdMs,
        });
      }
      const slotCount = parseNativeBoostSlotCount(m);
      if (slotCount <= 0) continue;
      const targetId = resolveNativeBoostMessageUserId(m, guild);
      if (!targetId) continue;
      fromChannel.push({ targetId, createdMs, slotCount });
    }
    candidates = fromChannel;
    channelCandidates = candidates.length;
    if (candidates.length) {
      candidateCounts = candidates.reduce((acc?, c?) => {
        const id = String(c?.targetId || "");
        if (!id) return acc;
        acc[id] = Number(acc[id] || 0) + Math.max(1, Number(c?.slotCount || 1));
        return acc;
      }, {});
    }
    if (debugEnabled) {
      global.logger?.info?.("[BOOST RECOVERY DEBUG] channel scan:", {
        boostTypes: Array.from(getBoostSystemMessageTypes().values()),
        typeCounts,
        samples,
      });
    }
  }

  const counts = candidateCounts || candidates.reduce((acc?, c?) => {
    const id = String(c?.targetId || "");
    if (!id) return acc;
    acc[id] = Number(acc[id] || 0) + Math.max(1, Number(c?.slotCount || 1));
    return acc;
  }, {});
  const orderedUserIds = Object.entries(counts)
    .sort((a?, b?) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, limit)
    .map(([id]) => id);

  if (!orderedUserIds.length) {
    const debug = { canReadAudit, auditCandidates, memberFetchOk, memberCandidates, channelFetchOk, channelCandidates, canViewChannel, canReadHistory, canSend, lookbackMs, limit };
    if (debugEnabled) global.logger?.info?.("[BOOST RECOVERY DEBUG] no candidates:", debug);
    return { ok: true, recovered: 0, debug };
  }

  const recentMessages = await boostAnnounceChannel.messages.fetch({ limit: 80 }).catch(() => null);
  const recent = recentMessages ? Array.from(recentMessages.values()) : [];
  const botIdForBoostRecovery = String(client.user?.id || "");
  const countAlreadyAnnounced = (userId?) => {
    let n = 0;
    for (const m of recent) {
      if (!m) continue;
      if (String((m as any).author?.id || "") !== botIdForBoostRecovery) continue;
      const embeds = Array.isArray((m as any).embeds) ? (m as any).embeds : [];
      const embedTexts = embeds.map((e?) =>
        [e?.title || "", e?.description || "", e?.footer?.text || ""].join("\n"),
      );
      const text = [(m as any).content || "", ...embedTexts].join("\n");
      if (!textMentionsUserId(text, userId)) continue;
      if (!boostAnnounceLooksLikeBoost(text)) continue;
      n += 1;
    }
    return n;
  };

  const freshGuild = await guild.fetch().catch(() => null);
  const currentCount = Number(freshGuild?.premiumSubscriptionCount || guild.premiumSubscriptionCount || 0);
  boostCountCache.set(guild.id, currentCount);

  let recovered = 0;
  for (const targetId of orderedUserIds) {
    const want = Math.max(1, Number(counts[String(targetId)] || 1));
    const already = countAlreadyAnnounced(targetId);
    let missing = Math.max(0, want - already);

    const member = await getGuildMemberCached(guild, targetId, { preferFresh: true }).catch(() => null);
    const user = member?.user || (await client.users.fetch(String(targetId)).catch(() => null));
    if (!user) continue;
    if (member && !Number(member.premiumSinceTimestamp || 0)) continue;

    await ensureBoostSlotsSynced(guild.id, targetId);

    if (missing <= 0) continue;

    if (member) await addPerkRoleIfPossible(member).catch(() => { });
    const recovery = await recoverMissingBoostEmbedsForUser(guild, targetId, {
      nativeLookbackMs: lookbackMs,
      knownNativeSlots: want,
      expectedSlots: want,
      startedAt: Number(member?.premiumSinceTimestamp || 0) || undefined,
      allowSecondRecovery: want >= 2,
    }).catch(() => ({ ok: false, sent: 0 }));
    const sent = Math.max(0, Number(recovery?.sent || 0));
    recovered += sent;
    if (sent <= 0) continue;
    await sleep(900);
  }

  const debug = debugEnabled ? { canReadAudit, auditCandidates, memberFetchOk, memberCandidates, channelFetchOk, channelCandidates, canViewChannel, canReadHistory, canSend, lookbackMs, limit } : undefined;
  if (debugEnabled) global.logger?.info?.("[BOOST RECOVERY DEBUG] done:", { recovered, debug });
  return { ok: true, recovered, debug };
}

export = { fetchGuildMembersIfCacheThin, isPrimaryShard, recoverLastGlobalNativeBoostEmbedsOnStartup, recoverRecentBoostEmbedsOnStartup };
